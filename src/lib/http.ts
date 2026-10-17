import { NextResponse } from "next/server";
import type { ZodError } from "zod";

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

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

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new SyntaxError("The request body must be valid JSON.");
  }
}
