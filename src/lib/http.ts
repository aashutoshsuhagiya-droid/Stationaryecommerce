import { NextResponse } from "next/server";
import type { ZodError } from "zod";

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export class RequestTooLargeError extends Error {
  constructor(public readonly maximumBytes: number) {
    super(`The request body exceeds the ${maximumBytes}-byte limit.`);
    this.name = "RequestTooLargeError";
  }
}

export const maximumDefaultJsonBytes = 256 * 1024;

export function apiError(
  status: number,
  code: string,
  message: string,
  details?: unknown,
) {
  const body: ApiErrorBody = {
    error: {
      code,
      message,
      ...(typeof details === "undefined" ? {} : { details }),
    },
  };
  return NextResponse.json(body, { status });
}

export function validationError(error: ZodError) {
  return apiError(
    400,
    "VALIDATION_ERROR",
    "Please review the submitted information.",
    error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
      code: issue.code,
    })),
  );
}

export function hasJsonContentType(request: Request) {
  const mediaType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  return mediaType === "application/json";
}

export async function readLimitedJson(
  request: Request,
  maximumBytes: number,
): Promise<unknown> {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1) {
    throw new RangeError("The JSON body limit must be a positive integer.");
  }

  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null) {
    const parsedLength = Number(declaredLength);
    if (Number.isFinite(parsedLength) && parsedLength > maximumBytes) {
      throw new RequestTooLargeError(maximumBytes);
    }
  }

  if (!request.body) throw new SyntaxError("The request body must be valid JSON.");

  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let totalBytes = 0;
  let body = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maximumBytes) {
        try {
          await reader.cancel();
        } catch {
          // The size violation remains authoritative if cancellation also fails.
        }
        throw new RequestTooLargeError(maximumBytes);
      }
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
    return JSON.parse(body) as unknown;
  } catch (error) {
    if (error instanceof RequestTooLargeError) throw error;
    throw new SyntaxError("The request body must be valid UTF-8 JSON.");
  } finally {
    reader.releaseLock();
  }
}

export async function readJson(
  request: Request,
  maximumBytes = maximumDefaultJsonBytes,
): Promise<unknown> {
  return readLimitedJson(request, maximumBytes);
}
