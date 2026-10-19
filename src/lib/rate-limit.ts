import { createHash } from "node:crypto";

type RateLimitEntry = {
  count: number;
  expiresAt: number;
};

type RateLimitStore = Map<string, RateLimitEntry>;

declare global {
  // eslint-disable-next-line no-var
  var __naamlyRateLimitStore: RateLimitStore | undefined;
}

const store = globalThis.__naamlyRateLimitStore ?? new Map<string, RateLimitEntry>();
if (process.env.NODE_ENV !== "production") globalThis.__naamlyRateLimitStore = store;

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

function hashedKey(namespace: string, identifier: string) {
  return `${namespace}:${createHash("sha256").update(identifier).digest("hex")}`;
}

export function requestIdentifier(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip")?.trim() || "unidentified-client";
}

export function consumeRateLimit({
  namespace,
  identifier,
  limit,
  windowMs,
  now = Date.now(),
}: {
  namespace: string;
  identifier: string;
  limit: number;
  windowMs: number;
  now?: number;
}): RateLimitResult {
  if (!Number.isSafeInteger(limit) || limit < 1 || !Number.isSafeInteger(windowMs) || windowMs < 1) {
    throw new Error("Rate limit and window must be positive integers.");
  }

  if (store.size > 5_000) {
    for (const [key, entry] of store) {
      if (entry.expiresAt <= now) store.delete(key);
    }
  }

  const key = hashedKey(namespace, identifier);
  const existing = store.get(key);
  const entry = !existing || existing.expiresAt <= now
    ? { count: 0, expiresAt: now + windowMs }
    : existing;
  entry.count += 1;
  store.set(key, entry);

  return {
    allowed: entry.count <= limit,
    remaining: Math.max(0, limit - entry.count),
    retryAfterSeconds: Math.max(1, Math.ceil((entry.expiresAt - now) / 1_000)),
  };
}
