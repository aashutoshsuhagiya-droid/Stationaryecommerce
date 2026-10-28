import "server-only";

import type { Prisma } from "@/generated/prisma/client";

import { prepareAuthSession } from "./auth-session";
import { normalizeServiceCity } from "./marketplace-assignment";
import { hashPassword } from "./password";
import { getPrisma } from "./prisma";
import { vendorProductCategoryScope } from "./product-category-links";
import {
  canApplyVendorApplicationAction,
  vendorApplicationTransitionTargets,
  type VendorApplicationStatus,
} from "./vendor-onboarding-domain";
import type {
  AdminVendorDecisionInput,
  AdminVendorDocumentReviewInput,
  VendorRegistrationInput,
} from "./vendor-onboarding-validation";
import type { z } from "zod";
import { vendorApplicationUpdateSchema } from "./vendor-onboarding-validation";

export const VENDOR_TERMS_VERSION = "2026-10-23";
export const VENDOR_PRIVACY_VERSION = "2026-10-23";
const MAX_APPLICATION_DOCUMENTS = 20;
const MAX_APPLICATION_DOCUMENT_BYTES = 40 * 1024 * 1024;

export class VendorOnboardingError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
    this.name = "VendorOnboardingError";
  }
}

export interface PreparedVendorDocument {
  type: "BUSINESS_REGISTRATION" | "GST_CERTIFICATE" | "SHOP_LICENSE" | "IDENTITY_PROOF" | "ADDRESS_PROOF" | "OTHER";
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  content: Uint8Array<ArrayBuffer>;
}

const applicationPublicSelect = {
  id: true,
  status: true,
  version: true,
  ownerName: true,
  businessName: true,
  businessEmail: true,
  businessPhone: true,
  addressLine1: true,
  addressLine2: true,
  city: true,
  state: true,
  postalCode: true,
  servicePostalCodes: true,
  serviceCategoryIds: true,
  printingServices: true,
  equipment: true,
  businessRegistrationNumber: true,
  gstin: true,
  submittedAt: true,
  reviewStartedAt: true,
  reviewedAt: true,
  applicantMessage: true,
  createdAt: true,
  updatedAt: true,
  documents: {
    select: {
      id: true,
      type: true,
      reviewStatus: true,
      originalName: true,
      mimeType: true,
      sizeBytes: true,
      reviewNotes: true,
      reviewedAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" as const },
  },
  events: {
    select: {
      id: true,
      fromStatus: true,
      toStatus: true,
      action: true,
      applicantMessage: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" as const },
  },
  profile: {
    select: {
      id: true,
      normalizedCity: true,
      serviceCategoryIds: true,
      operationalStatus: true,
      availabilityStatus: true,
      acceptingOrders: true,
      approvedAt: true,
    },
  },
} satisfies Prisma.VendorApplicationSelect;

function splitName(name: string) {
  const parts = name.trim().split(/\s+/);
  return { firstName: parts.shift(), lastName: parts.join(" ") || undefined };
}

function isUniqueError(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

export async function registerVendorApplication(
  input: VendorRegistrationInput,
  documents: PreparedVendorDocument[],
) {
  const prisma = getPrisma();
  const now = new Date();
  const challenge = await prisma.phoneVerificationChallenge.findUnique({ where: { id: input.otpChallengeId } });
  if (
    !challenge ||
    challenge.phone !== input.application.mobile ||
    !challenge.verifiedAt ||
    challenge.consumedAt ||
    challenge.expiresAt <= now
  ) {
    throw new VendorOnboardingError(409, "PHONE_VERIFICATION_REQUIRED", "Verify this mobile number before submitting the application.");
  }

  const categoryCount = await prisma.category.count({
    where: { id: { in: input.application.serviceCategoryIds }, isActive: true },
  });
  if (categoryCount !== input.application.serviceCategoryIds.length) {
    throw new VendorOnboardingError(400, "INVALID_SERVICE_CATEGORY", "One or more selected service categories are unavailable.");
  }

  const passwordHash = await hashPassword(input.password);
  const name = splitName(input.application.ownerName);
  try {
    return await prisma.$transaction(async (tx) => {
      const applicantRole = await tx.role.findUnique({ where: { key: "vendor_applicant" }, select: { id: true } });
      if (!applicantRole) throw new VendorOnboardingError(503, "AUTHORIZATION_NOT_SEEDED", "Vendor onboarding roles are not configured.");

      const consumed = await tx.phoneVerificationChallenge.updateMany({
        where: { id: challenge.id, verifiedAt: { not: null }, consumedAt: null, expiresAt: { gt: now } },
        data: { consumedAt: now },
      });
      if (consumed.count !== 1) throw new VendorOnboardingError(409, "PHONE_VERIFICATION_USED", "This mobile verification has already been used.");

      const user = await tx.user.create({
        data: {
          email: input.application.email,
          phone: input.application.mobile,
          passwordHash,
          firstName: name.firstName,
          lastName: name.lastName,
          phoneVerifiedAt: challenge.verifiedAt,
          roles: { create: { roleId: applicantRole.id } },
        },
      });
      const session = prepareAuthSession(user.id);
      await tx.authSession.create({ data: session.record });
      const application = await tx.vendorApplication.create({
        data: {
          userId: user.id,
          status: "SUBMITTED",
          ownerName: input.application.ownerName,
          businessName: input.application.businessName,
          businessEmail: input.application.email,
          businessPhone: input.application.mobile,
          addressLine1: input.application.addressLine1,
          addressLine2: input.application.addressLine2,
          city: input.application.city,
          normalizedCity: normalizeServiceCity(input.application.city),
          state: input.application.state,
          postalCode: input.application.postalCode,
          latitude: input.application.latitude,
          longitude: input.application.longitude,
          servicePostalCodes: input.application.servicePostalCodes,
          serviceCategoryIds: input.application.serviceCategoryIds,
          printingServices: input.application.printingServices,
          equipment: input.application.equipment,
          businessRegistrationNumber: input.application.businessRegistrationNumber,
          gstin: input.application.gstin,
          termsVersion: VENDOR_TERMS_VERSION,
          privacyVersion: VENDOR_PRIVACY_VERSION,
          termsAcceptedAt: now,
          submittedAt: now,
          events: {
            create: {
              actorId: user.id,
              toStatus: "SUBMITTED",
              action: "APPLICATION_SUBMITTED",
              applicantMessage: "Your printing partner application was submitted for review.",
            },
          },
          documents: {
            create: documents.map((document) => ({
              ...document,
              uploadedBy: { connect: { id: user.id } },
            })),
          },
        },
        select: applicationPublicSelect,
      });
      await tx.vendorProfile.create({
        data: {
          userId: user.id,
          applicationId: application.id,
          businessName: input.application.businessName,
          ownerName: input.application.ownerName,
          businessPhone: input.application.mobile,
          addressLine1: input.application.addressLine1,
          addressLine2: input.application.addressLine2,
          city: input.application.city,
          normalizedCity: normalizeServiceCity(input.application.city),
          state: input.application.state,
          postalCode: input.application.postalCode,
          servicePostalCodes: input.application.servicePostalCodes,
          serviceCategoryIds: input.application.serviceCategoryIds,
          verificationStatus: "PENDING",
          operationalStatus: "INACTIVE",
          availabilityStatus: "OFFLINE",
          acceptingOrders: false,
        },
      });
      await tx.notification.create({
        data: {
          userId: user.id,
          channel: "IN_APP",
          templateKey: "vendor_application_submitted",
          recipient: user.email,
          payload: { applicationId: application.id, status: application.status },
        },
      });
      return {
        userId: user.id,
        session: { token: session.token, expiresAt: session.expiresAt },
        application: await tx.vendorApplication.findUniqueOrThrow({
          where: { id: application.id },
          select: applicationPublicSelect,
        }),
      };
    });
  } catch (error) {
    if (error instanceof VendorOnboardingError) throw error;
    if (isUniqueError(error)) {
      throw new VendorOnboardingError(409, "VENDOR_ACCOUNT_EXISTS", "An account already exists for this email address or mobile number.");
    }
    throw error;
  }
}

export function getVendorApplicationForUser(userId: string) {
  return getPrisma().vendorApplication.findUnique({
    where: { userId },
    select: applicationPublicSelect,
  });
}

type VendorApplicationUpdate = z.infer<typeof vendorApplicationUpdateSchema>;

export async function updateVendorApplication(userId: string, values: VendorApplicationUpdate) {
  const prisma = getPrisma();
  const existing = await prisma.vendorApplication.findUnique({ where: { userId } });
  if (!existing) throw new VendorOnboardingError(404, "VENDOR_APPLICATION_NOT_FOUND", "Vendor application not found.");
  if (existing.status !== "ACTION_REQUIRED") {
    throw new VendorOnboardingError(409, "APPLICATION_NOT_EDITABLE", "The application can be edited only when additional information is requested.");
  }
  const nextPostalCode = values.postalCode ?? existing.postalCode;
  const nextServicePostalCodes = values.servicePostalCodes ?? existing.servicePostalCodes;
  if (!nextServicePostalCodes.includes(nextPostalCode)) {
    throw new VendorOnboardingError(400, "INVALID_SERVICE_AREA", "The shop PIN code must be included in the service area.");
  }
  const nextLatitude = values.latitude ?? (existing.latitude === null ? undefined : Number(existing.latitude));
  const nextLongitude = values.longitude ?? (existing.longitude === null ? undefined : Number(existing.longitude));
  if ((nextLatitude === undefined) !== (nextLongitude === undefined)) {
    throw new VendorOnboardingError(400, "INVALID_LOCATION", "Provide both latitude and longitude for a map location.");
  }
  if (values.serviceCategoryIds) {
    const count = await prisma.category.count({ where: { id: { in: values.serviceCategoryIds }, isActive: true } });
    if (count !== values.serviceCategoryIds.length) {
      throw new VendorOnboardingError(400, "INVALID_SERVICE_CATEGORY", "One or more selected service categories are unavailable.");
    }
  }
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "VendorApplication" WHERE "id" = ${existing.id} FOR UPDATE`;
    const lockedApplication = await tx.vendorApplication.findUnique({ where: { id: existing.id } });
    if (!lockedApplication || lockedApplication.status !== "ACTION_REQUIRED") {
      throw new VendorOnboardingError(409, "APPLICATION_NOT_EDITABLE", "The application changed and is no longer editable.");
    }
    const updated = await tx.vendorApplication.update({
      where: { id: existing.id },
      data: {
        ...values,
        ...(values.city ? { normalizedCity: normalizeServiceCity(values.city) } : {}),
        status: "SUBMITTED",
        version: { increment: 1 },
        submittedAt: now,
        applicantMessage: null,
      },
      select: applicationPublicSelect,
    });
    await tx.vendorProfile.update({
      where: { applicationId: existing.id },
      data: {
        ...(values.ownerName !== undefined ? { ownerName: values.ownerName } : {}),
        ...(values.businessName !== undefined ? { businessName: values.businessName } : {}),
        ...(values.addressLine1 !== undefined ? { addressLine1: values.addressLine1 } : {}),
        ...(values.addressLine2 !== undefined ? { addressLine2: values.addressLine2 } : {}),
        ...(values.city !== undefined ? {
          city: values.city,
          normalizedCity: normalizeServiceCity(values.city),
        } : {}),
        ...(values.state !== undefined ? { state: values.state } : {}),
        ...(values.postalCode !== undefined ? { postalCode: values.postalCode } : {}),
        ...(values.servicePostalCodes !== undefined ? { servicePostalCodes: values.servicePostalCodes } : {}),
        ...(values.serviceCategoryIds !== undefined ? { serviceCategoryIds: values.serviceCategoryIds } : {}),
      },
    });
    await tx.vendorApplicationEvent.create({
      data: {
        applicationId: existing.id,
        actorId: userId,
        fromStatus: lockedApplication.status,
        toStatus: "SUBMITTED",
        action: "APPLICATION_RESUBMITTED",
        applicantMessage: "Updated information was submitted for review.",
        internalNotes: JSON.stringify({
          previous: {
            ownerName: lockedApplication.ownerName,
            businessName: lockedApplication.businessName,
            addressLine1: lockedApplication.addressLine1,
            addressLine2: lockedApplication.addressLine2,
            city: lockedApplication.city,
            state: lockedApplication.state,
            postalCode: lockedApplication.postalCode,
            servicePostalCodes: lockedApplication.servicePostalCodes,
            serviceCategoryIds: lockedApplication.serviceCategoryIds,
            printingServices: lockedApplication.printingServices,
            equipment: lockedApplication.equipment,
            businessRegistrationNumber: lockedApplication.businessRegistrationNumber,
            gstin: lockedApplication.gstin,
          },
          submitted: values,
        }),
      },
    });
    await tx.notification.create({
      data: {
        userId,
        channel: "IN_APP",
        templateKey: "vendor_application_resubmitted",
        recipient: existing.businessEmail,
        payload: { applicationId: existing.id, status: "SUBMITTED" },
      },
    });
    return updated;
  });
}

export async function addVendorDocuments(userId: string, documents: PreparedVendorDocument[]) {
  if (!documents.length) throw new VendorOnboardingError(400, "DOCUMENT_REQUIRED", "Select at least one document.");
  const prisma = getPrisma();
  const application = await prisma.vendorApplication.findUnique({ where: { userId }, select: { id: true } });
  if (!application) throw new VendorOnboardingError(404, "VENDOR_APPLICATION_NOT_FOUND", "Vendor application not found.");
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "VendorApplication" WHERE "id" = ${application.id} FOR UPDATE`;
    const lockedApplication = await tx.vendorApplication.findUnique({
      where: { id: application.id },
      select: { status: true },
    });
    if (!lockedApplication || !["ACTION_REQUIRED", "SUBMITTED", "UNDER_REVIEW"].includes(lockedApplication.status)) {
      throw new VendorOnboardingError(409, "DOCUMENT_UPLOAD_NOT_ALLOWED", "Documents cannot be added in the current application state.");
    }
    const existingDocuments = await tx.vendorDocument.aggregate({
      where: { applicationId: application.id },
      _count: { _all: true },
      _sum: { sizeBytes: true },
    });
    const nextCount = existingDocuments._count._all + documents.length;
    const nextBytes = (existingDocuments._sum.sizeBytes ?? 0) + documents.reduce((sum, document) => sum + document.sizeBytes, 0);
    if (nextCount > MAX_APPLICATION_DOCUMENTS || nextBytes > MAX_APPLICATION_DOCUMENT_BYTES) {
      throw new VendorOnboardingError(413, "APPLICATION_DOCUMENT_LIMIT", "This application has reached its supporting-document limit.");
    }
    await tx.vendorDocument.createMany({
      data: documents.map((document) => ({ ...document, applicationId: application.id, uploadedById: userId })),
    });
    await tx.vendorApplicationEvent.create({
      data: {
        applicationId: application.id,
        actorId: userId,
        fromStatus: lockedApplication.status,
        toStatus: lockedApplication.status,
        action: "DOCUMENTS_UPLOADED",
        applicantMessage: `${documents.length} supporting ${documents.length === 1 ? "document was" : "documents were"} uploaded.`,
        internalNotes: JSON.stringify({
          documents: documents.map(({ type, originalName, mimeType, sizeBytes, sha256 }) => ({ type, originalName, mimeType, sizeBytes, sha256 })),
        }),
      },
    });
  });
  return getVendorApplicationForUser(userId);
}

export async function getVendorDocument(input: { documentId: string; actorUserId: string; admin: boolean }) {
  const document = await getPrisma().vendorDocument.findUnique({
    where: { id: input.documentId },
    include: { application: { select: { userId: true } } },
  });
  if (!document || (!input.admin && document.application.userId !== input.actorUserId)) {
    throw new VendorOnboardingError(404, "VENDOR_DOCUMENT_NOT_FOUND", "Vendor document not found.");
  }
  return document;
}

export async function reviewVendorDocument(input: {
  documentId: string;
  actorId: string;
  requestId?: string;
  review: AdminVendorDocumentReviewInput;
}) {
  const prisma = getPrisma();
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const documentIdentity = await tx.vendorDocument.findUnique({
      where: { id: input.documentId },
      select: { applicationId: true },
    });
    if (!documentIdentity) throw new VendorOnboardingError(404, "VENDOR_DOCUMENT_NOT_FOUND", "Vendor document not found.");
    await tx.$queryRaw`SELECT "id" FROM "VendorApplication" WHERE "id" = ${documentIdentity.applicationId} FOR UPDATE`;
    const existing = await tx.vendorDocument.findUnique({
      where: { id: input.documentId },
      include: { application: { select: { id: true, status: true, userId: true, businessEmail: true } } },
    });
    if (!existing) throw new VendorOnboardingError(404, "VENDOR_DOCUMENT_NOT_FOUND", "Vendor document not found.");
    if (!["SUBMITTED", "UNDER_REVIEW", "ACTION_REQUIRED"].includes(existing.application.status)) {
      throw new VendorOnboardingError(409, "DOCUMENT_REVIEW_CLOSED", "Documents cannot be reviewed after the application is closed.");
    }

    const document = await tx.vendorDocument.update({
      where: { id: existing.id },
      data: {
        reviewStatus: input.review.reviewStatus,
        reviewNotes: input.review.reviewNotes,
        reviewedById: input.actorId,
        reviewedAt: now,
      },
      select: {
        id: true,
        type: true,
        reviewStatus: true,
        originalName: true,
        mimeType: true,
        sizeBytes: true,
        reviewNotes: true,
        reviewedAt: true,
        updatedAt: true,
      },
    });
    await tx.vendorApplicationEvent.create({
      data: {
        applicationId: existing.application.id,
        actorId: input.actorId,
        fromStatus: existing.application.status,
        toStatus: existing.application.status,
        action: `DOCUMENT_${input.review.reviewStatus}`,
        internalNotes: JSON.stringify({
          documentId: existing.id,
          type: existing.type,
          originalName: existing.originalName,
          reviewStatus: input.review.reviewStatus,
          reviewNotes: input.review.reviewNotes ?? null,
        }),
        requestId: input.requestId,
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: input.actorId,
        action: `vendor.document.${input.review.reviewStatus.toLowerCase()}`,
        entityType: "VendorDocument",
        entityId: existing.id,
        before: { reviewStatus: existing.reviewStatus, reviewNotes: existing.reviewNotes },
        after: { reviewStatus: document.reviewStatus, reviewNotes: document.reviewNotes },
        requestId: input.requestId,
      },
    });
    if (input.review.reviewStatus === "REJECTED") {
      await tx.notification.create({
        data: {
          userId: existing.application.userId,
          channel: "IN_APP",
          templateKey: "vendor_document_rejected",
          recipient: existing.application.businessEmail,
          payload: {
            applicationId: existing.application.id,
            documentId: existing.id,
            message: input.review.reviewNotes ?? "A document needs attention.",
          },
        },
      });
    }
    return document;
  });
}

export async function listVendorApplications(input: { query?: string; status?: string }) {
  const query = input.query?.trim().slice(0, 120);
  const validStatuses = new Set(["DRAFT", "SUBMITTED", "UNDER_REVIEW", "ACTION_REQUIRED", "APPROVED", "REJECTED", "WITHDRAWN"]);
  if (input.status && input.status !== "ALL" && !validStatuses.has(input.status)) {
    throw new VendorOnboardingError(400, "INVALID_APPLICATION_STATUS", "The requested application status is invalid.");
  }
  const prisma = getPrisma();
  const applications = await prisma.vendorApplication.findMany({
    where: {
      ...(input.status && input.status !== "ALL" ? { status: input.status as Prisma.EnumVendorApplicationStatusFilter } : {}),
      ...(query ? {
        OR: [
          { businessName: { contains: query, mode: "insensitive" as const } },
          { ownerName: { contains: query, mode: "insensitive" as const } },
          { businessEmail: { contains: query, mode: "insensitive" as const } },
          { city: { contains: query, mode: "insensitive" as const } },
        ],
      } : {}),
    },
    select: {
      ...applicationPublicSelect,
      internalReviewNotes: true,
      reviewer: { select: { id: true, firstName: true, lastName: true, email: true } },
      events: {
        select: {
          id: true,
          fromStatus: true,
          toStatus: true,
          action: true,
          applicantMessage: true,
          internalNotes: true,
          createdAt: true,
          actor: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
        orderBy: { createdAt: "desc" },
      },
    },
    orderBy: [{ submittedAt: "desc" }, { createdAt: "desc" }],
  });
  const categoryIds = [...new Set(applications.flatMap((application) => application.serviceCategoryIds))];
  const categories = categoryIds.length
    ? await prisma.category.findMany({
      where: { id: { in: categoryIds } },
      select: { id: true, name: true },
    })
    : [];
  const categoryNames = new Map(categories.map((category) => [category.id, category.name]));
  return applications.map((application) => ({
    ...application,
    serviceCategories: application.serviceCategoryIds.map((id) => ({
      id,
      name: categoryNames.get(id) ?? id,
    })),
  }));
}

function assertDecisionAllowed(status: string, action: AdminVendorDecisionInput["action"]) {
  if (!canApplyVendorApplicationAction(status as VendorApplicationStatus, action)) {
    throw new VendorOnboardingError(409, "INVALID_APPLICATION_TRANSITION", `The ${action.toLowerCase().replaceAll("_", " ")} action is not valid from ${status}.`);
  }
}

export async function decideVendorApplication(input: {
  applicationId: string;
  actorId: string;
  requestId?: string;
  decision: AdminVendorDecisionInput;
}) {
  const prisma = getPrisma();
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "VendorApplication" WHERE "id" = ${input.applicationId} FOR UPDATE`;
    const application = await tx.vendorApplication.findUnique({
      where: { id: input.applicationId },
      include: {
        user: true,
        profile: true,
        documents: {
          select: { id: true, type: true, reviewStatus: true, createdAt: true },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        },
      },
    });
    if (!application) throw new VendorOnboardingError(404, "VENDOR_APPLICATION_NOT_FOUND", "Vendor application not found.");
    if (application.version !== input.decision.expectedVersion) {
      throw new VendorOnboardingError(409, "STALE_APPLICATION_VERSION", "This application changed. Refresh before reviewing it again.");
    }
    assertDecisionAllowed(application.status, input.decision.action);

    if (input.decision.action === "REACTIVATE" && application.profile?.operationalStatus !== "SUSPENDED") {
      throw new VendorOnboardingError(409, "VENDOR_NOT_SUSPENDED", "Only a suspended vendor can be reactivated.");
    }
    if (input.decision.action === "SUSPEND" && application.profile?.operationalStatus !== "ACTIVE") {
      throw new VendorOnboardingError(409, "VENDOR_NOT_ACTIVE", "Only an active vendor can be suspended.");
    }

    const targetStatus = vendorApplicationTransitionTargets[input.decision.action];
    const updated = await tx.vendorApplication.updateMany({
      where: { id: application.id, version: input.decision.expectedVersion },
      data: {
        status: targetStatus,
        version: { increment: 1 },
        reviewerId: input.actorId,
        applicantMessage: input.decision.applicantMessage,
        internalReviewNotes: input.decision.internalNotes,
        ...(input.decision.action === "START_REVIEW" ? { reviewStartedAt: now } : {}),
        ...(["APPROVE", "REJECT"].includes(input.decision.action) ? { reviewedAt: now } : {}),
      },
    });
    if (updated.count !== 1) throw new VendorOnboardingError(409, "STALE_APPLICATION_VERSION", "This application changed during review.");

    if (input.decision.action === "APPROVE") {
      if (!application.user.phoneVerifiedAt) {
        throw new VendorOnboardingError(409, "PHONE_NOT_VERIFIED", "The applicant mobile number is not verified.");
      }
      const latestDocumentByType = new Map<string, (typeof application.documents)[number]>();
      for (const document of application.documents) {
        latestDocumentByType.set(document.type, document);
      }
      if ([...latestDocumentByType.values()].some((document) => document.reviewStatus !== "APPROVED")) {
        throw new VendorOnboardingError(409, "DOCUMENT_REVIEW_REQUIRED", "Approve the latest document of every uploaded type before approving this application.");
      }
      const roles = await tx.role.findMany({ where: { key: { in: ["vendor", "vendor_applicant"] } }, select: { id: true, key: true } });
      const vendorRole = roles.find((role) => role.key === "vendor");
      const applicantRole = roles.find((role) => role.key === "vendor_applicant");
      if (!vendorRole) throw new VendorOnboardingError(503, "AUTHORIZATION_NOT_SEEDED", "The vendor role is not configured.");

      const profile = await tx.vendorProfile.upsert({
        where: { applicationId: application.id },
        update: {
          businessName: application.businessName,
          ownerName: application.ownerName,
          businessPhone: application.businessPhone,
          addressLine1: application.addressLine1,
          addressLine2: application.addressLine2,
          city: application.city,
          normalizedCity: application.normalizedCity,
          state: application.state,
          postalCode: application.postalCode,
          servicePostalCodes: application.servicePostalCodes,
          serviceCategoryIds: application.serviceCategoryIds,
          verificationStatus: "APPROVED",
          operationalStatus: "ACTIVE",
          availabilityStatus: "OFFLINE",
          acceptingOrders: false,
          suspendedAt: null,
          approvedAt: application.profile?.approvedAt ?? now,
        },
        create: {
          userId: application.userId,
          applicationId: application.id,
          businessName: application.businessName,
          ownerName: application.ownerName,
          businessPhone: application.businessPhone,
          addressLine1: application.addressLine1,
          addressLine2: application.addressLine2,
          city: application.city,
          normalizedCity: application.normalizedCity,
          state: application.state,
          postalCode: application.postalCode,
          servicePostalCodes: application.servicePostalCodes,
          serviceCategoryIds: application.serviceCategoryIds,
          verificationStatus: "APPROVED",
          operationalStatus: "ACTIVE",
          availabilityStatus: "OFFLINE",
          acceptingOrders: false,
          approvedAt: now,
        },
      });
      const products = await tx.product.findMany({
        where: {
          ...vendorProductCategoryScope(application.serviceCategoryIds),
          status: "ACTIVE",
        },
        select: { id: true },
      });
      if (products.length) {
        await tx.vendorCapability.createMany({
          data: products.map((product) => ({ vendorId: profile.id, productId: product.id })),
          skipDuplicates: true,
        });
      }
      await tx.userRole.upsert({
        where: { userId_roleId: { userId: application.userId, roleId: vendorRole.id } },
        update: {},
        create: { userId: application.userId, roleId: vendorRole.id },
      });
      if (applicantRole) {
        await tx.userRole.deleteMany({ where: { userId: application.userId, roleId: applicantRole.id } });
      }
    }

    if (input.decision.action === "REJECT") {
      await tx.vendorProfile.update({
        where: { applicationId: application.id },
        data: {
          verificationStatus: "REJECTED",
          operationalStatus: "INACTIVE",
          availabilityStatus: "OFFLINE",
          acceptingOrders: false,
          rejectedAt: now,
        },
      });
    }

    if (input.decision.action === "SUSPEND" || input.decision.action === "REACTIVATE") {
      await tx.vendorProfile.update({
        where: { applicationId: application.id },
        data: input.decision.action === "SUSPEND"
          ? { operationalStatus: "SUSPENDED", availabilityStatus: "OFFLINE", acceptingOrders: false, suspendedAt: now }
          : { operationalStatus: "ACTIVE", availabilityStatus: "OFFLINE", acceptingOrders: false, suspendedAt: null },
      });
    }

    await tx.vendorApplicationEvent.create({
      data: {
        applicationId: application.id,
        actorId: input.actorId,
        fromStatus: application.status,
        toStatus: targetStatus,
        action: input.decision.action,
        applicantMessage: input.decision.applicantMessage,
        internalNotes: input.decision.internalNotes,
        requestId: input.requestId,
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: input.actorId,
        action: `vendor.application.${input.decision.action.toLowerCase()}`,
        entityType: "VendorApplication",
        entityId: application.id,
        before: { status: application.status, version: application.version },
        after: { status: targetStatus, version: application.version + 1 },
        requestId: input.requestId,
      },
    });
    await tx.notification.create({
      data: {
        userId: application.userId,
        channel: "IN_APP",
        templateKey: `vendor_application_${input.decision.action.toLowerCase()}`,
        recipient: application.businessEmail,
        payload: {
          applicationId: application.id,
          status: targetStatus,
          message: input.decision.applicantMessage ?? null,
        },
      },
    });

    return tx.vendorApplication.findUniqueOrThrow({ where: { id: application.id }, select: applicationPublicSelect });
  });
}
