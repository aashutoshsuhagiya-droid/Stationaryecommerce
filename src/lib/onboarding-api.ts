import { apiError, RequestTooLargeError } from "./http";
import { AuthenticationError } from "./auth-session";
import { CommerceError } from "./commerce-error";
import { DatabaseConfigurationError } from "./prisma";
import { VendorDocumentError } from "./vendor-documents";
import { VendorOnboardingError } from "./vendor-onboarding";
import { OtpError } from "./vendor-otp";
import { AssignmentError } from "./marketplace-assignment";
import { VendorOperationsError } from "./vendor-operations";

export function onboardingApiError(error: unknown) {
  if (error instanceof RequestTooLargeError) {
    return apiError(413, "REQUEST_TOO_LARGE", error.message);
  }
  if (error instanceof CommerceError) {
    return apiError(error.status, error.code, error.message, error.details);
  }
  if (error instanceof AuthenticationError) return apiError(error.status, error.code, error.message);
  if (error instanceof VendorOnboardingError) return apiError(error.status, error.code, error.message);
  if (error instanceof OtpError) return apiError(error.status, error.code, error.message);
  if (error instanceof AssignmentError) return apiError(error.status, error.code, error.message);
  if (error instanceof VendorOperationsError) return apiError(error.status, error.code, error.message);
  if (error instanceof VendorDocumentError) return apiError(error.status, error.code, error.message);
  if (error instanceof DatabaseConfigurationError) {
    return apiError(503, "DATABASE_NOT_CONFIGURED", "Vendor onboarding is unavailable until the database is configured.");
  }
  if (error instanceof SyntaxError) return apiError(400, "INVALID_JSON", error.message);
  console.error("Unexpected vendor onboarding error", error);
  return apiError(500, "VENDOR_ONBOARDING_FAILED", "The request could not be completed safely.");
}
