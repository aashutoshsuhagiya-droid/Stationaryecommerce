import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";

import { getPrisma } from "./prisma";

export const SESSION_COOKIE = "naamly_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14;

export class AuthenticationError extends Error {
  constructor(
    readonly status: 401 | 403,
    readonly code: "AUTHENTICATION_REQUIRED" | "FORBIDDEN",
    message: string,
  ) {
    super(message);
    this.name = "AuthenticationError";
  }
}

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export function prepareAuthSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  return {
    token,
    expiresAt,
    record: { userId, tokenHash: hashToken(token), expiresAt },
  };
}

export async function createAuthSession(userId: string) {
  const { token, expiresAt, record } = prepareAuthSession(userId);
  await getPrisma().authSession.create({
    data: record,
  });
  return { token, expiresAt };
}

export function sessionCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  };
}

function readCookieHeader(request: Request, name: string) {
  const cookie = request.headers.get("cookie");
  if (!cookie) return undefined;
  for (const entry of cookie.split(";")) {
    const [key, ...value] = entry.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
}

async function actorForToken(token?: string) {
  if (!token) return null;
  const session = await getPrisma().authSession.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      id: true,
      expiresAt: true,
      revokedAt: true,
      user: {
        select: {
          id: true,
          email: true,
          status: true,
          roles: {
            select: {
              role: {
                select: {
                  key: true,
                  permissions: { select: { permission: { select: { key: true } } } },
                },
              },
            },
          },
          vendorApplication: { select: { id: true, status: true } },
          vendorProfile: { select: { id: true, operationalStatus: true, verificationStatus: true } },
        },
      },
    },
  });
  if (!session || session.revokedAt || session.expiresAt <= new Date() || session.user.status !== "ACTIVE") return null;

  const roles = session.user.roles.map(({ role }) => role.key);
  const permissions = [...new Set(session.user.roles.flatMap(({ role }) => role.permissions.map(({ permission }) => permission.key)))];
  return {
    sessionId: session.id,
    userId: session.user.id,
    email: session.user.email,
    roles,
    permissions,
    vendorApplication: session.user.vendorApplication,
    vendorProfile: session.user.vendorProfile,
  };
}

export type AuthActor = NonNullable<Awaited<ReturnType<typeof actorForToken>>>;

export function getRequestActor(request: Request) {
  return actorForToken(readCookieHeader(request, SESSION_COOKIE));
}

export async function getPageActor() {
  return actorForToken((await cookies()).get(SESSION_COOKIE)?.value);
}

export async function requireRequestActor(request: Request, permission?: string) {
  const actor = await getRequestActor(request);
  if (!actor) throw new AuthenticationError(401, "AUTHENTICATION_REQUIRED", "Sign in to continue.");
  if (permission && !actor.permissions.includes(permission)) {
    throw new AuthenticationError(403, "FORBIDDEN", "You are not authorized to perform this action.");
  }
  return actor;
}

export async function revokeRequestSession(request: Request) {
  const token = readCookieHeader(request, SESSION_COOKIE);
  if (!token) return;
  await getPrisma().authSession.updateMany({
    where: { tokenHash: hashToken(token), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const expected = new URL(request.url).origin;
  if (!origin || origin !== expected) {
    throw new AuthenticationError(403, "FORBIDDEN", "The request origin could not be verified.");
  }
}
