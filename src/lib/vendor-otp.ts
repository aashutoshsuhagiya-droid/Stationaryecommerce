import "server-only";

import { createHmac, randomInt, randomUUID, timingSafeEqual } from "node:crypto";

import { getPrisma } from "./prisma";

const OTP_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

export class OtpError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
    this.name = "OtpError";
  }
}

function otpSecret() {
  const value = process.env.VENDOR_OTP_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!value || (process.env.NODE_ENV === "production" && value.length < 32)) {
    throw new OtpError(503, "OTP_NOT_CONFIGURED", "Mobile verification is not configured.");
  }
  return value;
}

function codeHash(challengeId: string, phone: string, code: string) {
  return createHmac("sha256", otpSecret()).update(`${challengeId}:${phone}:${code}`).digest("hex");
}

export async function requestVendorOtp(phone: string) {
  const prisma = getPrisma();
  const challengeId = randomUUID();
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${phone}, 0))`;
    const recentCount = await tx.phoneVerificationChallenge.count({
      where: { phone, createdAt: { gt: new Date(Date.now() - 60 * 60 * 1000) } },
    });
    if (recentCount >= 5) throw new OtpError(429, "OTP_REQUEST_LIMIT", "Too many verification codes were requested for this mobile number.");
    await tx.phoneVerificationChallenge.create({
      data: { id: challengeId, phone, codeHash: codeHash(challengeId, phone, code), expiresAt },
    });
  });

  const providerUrl = process.env.VENDOR_OTP_PROVIDER_URL?.trim();
  if (providerUrl) {
    const response = await fetch(providerUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.VENDOR_OTP_PROVIDER_TOKEN ? { Authorization: `Bearer ${process.env.VENDOR_OTP_PROVIDER_TOKEN}` } : {}),
      },
      body: JSON.stringify({ phone: `+91${phone}`, code, purpose: "vendor_registration" }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) throw new OtpError(502, "OTP_DELIVERY_FAILED", "The verification code could not be delivered.");
  } else if (process.env.NODE_ENV === "production") {
    throw new OtpError(503, "OTP_PROVIDER_NOT_CONFIGURED", "Mobile verification delivery is not configured.");
  }

  return {
    challengeId,
    expiresAt,
    ...(process.env.NODE_ENV !== "production" ? { developmentCode: code } : {}),
  };
}

export async function verifyVendorOtp(input: { challengeId: string; phone: string; code: string }) {
  const prisma = getPrisma();
  const challenge = await prisma.phoneVerificationChallenge.findUnique({ where: { id: input.challengeId } });
  if (!challenge || challenge.phone !== input.phone || challenge.consumedAt) {
    throw new OtpError(404, "OTP_CHALLENGE_NOT_FOUND", "The verification request was not found.");
  }
  const now = new Date();
  if (challenge.expiresAt <= now) throw new OtpError(409, "OTP_EXPIRED", "The verification code has expired.");
  if (challenge.attempts >= MAX_ATTEMPTS) throw new OtpError(429, "OTP_ATTEMPTS_EXCEEDED", "Too many incorrect verification attempts.");

  const claimedAttempt = await prisma.phoneVerificationChallenge.updateMany({
    where: {
      id: challenge.id,
      phone: input.phone,
      attempts: { lt: MAX_ATTEMPTS },
      expiresAt: { gt: now },
      consumedAt: null,
    },
    data: { attempts: { increment: 1 } },
  });
  if (claimedAttempt.count !== 1) {
    throw new OtpError(429, "OTP_ATTEMPTS_EXCEEDED", "Too many verification attempts.");
  }

  const actual = Buffer.from(codeHash(input.challengeId, input.phone, input.code), "hex");
  const expected = Buffer.from(challenge.codeHash, "hex");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new OtpError(400, "OTP_INVALID", "The verification code is incorrect.");
  }
  await prisma.phoneVerificationChallenge.update({
    where: { id: challenge.id },
    data: { verifiedAt: challenge.verifiedAt ?? now },
  });
  return { challengeId: challenge.id, verified: true };
}
