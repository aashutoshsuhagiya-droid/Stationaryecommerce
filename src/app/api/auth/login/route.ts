import { NextResponse } from "next/server";

import { assertSameOrigin, prepareAuthSession, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth-session";
import { apiError, readJson, validationError } from "@/lib/http";
import { onboardingApiError } from "@/lib/onboarding-api";
import { verifyPassword } from "@/lib/password";
import { getPrisma } from "@/lib/prisma";
import { consumeRateLimit, requestIdentifier } from "@/lib/rate-limit";
import { loginSchema } from "@/lib/vendor-onboarding-validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const DUMMY_PASSWORD_HASH = [
  "scrypt",
  "16384",
  "8",
  "1",
  Buffer.alloc(16).toString("base64url"),
  Buffer.alloc(64).toString("base64url"),
].join("$");

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const limit = consumeRateLimit({ namespace: "auth-login", identifier: requestIdentifier(request), limit: 10, windowMs: 15 * 60 * 1000 });
    if (!limit.allowed) return apiError(429, "RATE_LIMITED", "Too many sign-in attempts. Try again later.");
    const body = await readJson(request);
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) return validationError(parsed.error);
    const prisma = getPrisma();
    const user = await prisma.user.findUnique({
      where: { email: parsed.data.email },
      select: { id: true, passwordHash: true, status: true, roles: { select: { role: { select: { key: true } } } } },
    });
    const passwordMatches = await verifyPassword(parsed.data.password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
    if (!user?.passwordHash || user.status !== "ACTIVE" || !passwordMatches) {
      return apiError(401, "INVALID_CREDENTIALS", "The email address or password is incorrect.");
    }
    const session = prepareAuthSession(user.id);
    await prisma.$transaction([
      prisma.authSession.create({ data: session.record }),
      prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }),
    ]);
    const roles = user.roles.map(({ role }) => role.key);
    const redirectTo = roles.includes("admin") ? "/admin" : roles.some((role) => role === "vendor" || role === "vendor_applicant") ? "/vendor" : "/account";
    const response = NextResponse.json({ data: { authenticated: true, redirectTo } }, { headers: { "Cache-Control": "no-store" } });
    response.cookies.set(SESSION_COOKIE, session.token, sessionCookieOptions(session.expiresAt));
    return response;
  } catch (error) {
    return onboardingApiError(error);
  }
}
