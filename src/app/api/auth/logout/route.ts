import { NextResponse } from "next/server";

import { assertSameOrigin, revokeRequestSession, SESSION_COOKIE } from "@/lib/auth-session";
import { onboardingApiError } from "@/lib/onboarding-api";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await revokeRequestSession(request);
    const response = NextResponse.json({ data: { authenticated: false } });
    response.cookies.set(SESSION_COOKIE, "", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 0 });
    return response;
  } catch (error) {
    return onboardingApiError(error);
  }
}
