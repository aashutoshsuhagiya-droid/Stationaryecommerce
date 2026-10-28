import { z } from "zod";
import { AuthenticationError, requireRequestActor } from "@/lib/auth-session";
import { ArtworkUploadError } from "@/lib/artwork-upload";
import { apiError, RequestTooLargeError, validationError } from "@/lib/http";
import { DatabaseConfigurationError } from "@/lib/prisma";
import { VisualizationStudioError } from "@/lib/visualization-studio-domain";

export async function requireVisualizationStudioAdmin(request: Request) {
  const actor = await requireRequestActor(request, "catalog.manage");
  if (!actor.roles.includes("admin")) {
    throw new AuthenticationError(403, "FORBIDDEN", "Administrator access is required.");
  }
  return actor;
}

export function visualizationStudioApiError(error: unknown) {
  if (error instanceof z.ZodError) return validationError(error);
  if (error instanceof VisualizationStudioError) return apiError(error.status, error.code, error.message);
  if (error instanceof ArtworkUploadError) return apiError(error.status, error.code, error.message);
  if (error instanceof AuthenticationError) return apiError(error.status, error.code, error.message);
  if (error instanceof RequestTooLargeError) {
    return apiError(413, "REQUEST_TOO_LARGE", `The request body may not exceed ${error.maximumBytes} bytes.`);
  }
  if (error instanceof DatabaseConfigurationError) {
    return apiError(503, "VISUALIZATION_STORAGE_UNAVAILABLE", "Visualization storage is not configured.");
  }
  if (error instanceof SyntaxError) return apiError(400, "INVALID_JSON", "The request body must be valid JSON.");
  if (error && typeof error === "object" && "code" in error) {
    const code = String((error as { code?: unknown }).code ?? "");
    if (code === "P2002" || code === "P2034") {
      return apiError(409, "VISUALIZATION_CONFLICT", "The visualization changed concurrently. Refresh and try again.");
    }
  }
  console.error("Unexpected visualization studio error", error);
  return apiError(500, "VISUALIZATION_STUDIO_FAILED", "The visualization studio request could not be completed.");
}
