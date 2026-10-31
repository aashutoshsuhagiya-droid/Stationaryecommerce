import assert from "node:assert/strict";
import test from "node:test";

import { hashPassword, verifyPassword } from "./password";
import { citiesForState, INDIA_STATES } from "./india-cities";
import {
  canApplyVendorApplicationAction,
  vendorApplicationTransitionTargets,
} from "./vendor-onboarding-domain";
import { vendorRegistrationSchema } from "./vendor-onboarding-validation";
import { canApplyVendorOrderAction } from "./vendor-operations-domain";
import { isVendorOperational } from "./vendor-operations-domain";
import { VENDOR_APPLICANT_PERMISSIONS, VENDOR_OPERATIONAL_PERMISSIONS } from "./vendor-permissions";

const validRegistration = {
  application: {
    ownerName: "Asha Patel",
    businessName: "Asha Print Works",
    email: "ASHA@example.com",
    mobile: "+91 98765 43210",
    addressLine1: "12 Market Road",
    city: "Ahmedabad",
    state: "Gujarat",
    postalCode: "380015",
    servicePostalCodes: ["380015", "380009"],
    serviceCategoryIds: ["cat-name-slips"],
    printingServices: ["Digital labels"],
    equipment: ["Digital label press"],
    gstin: "24ABCDE1234F1Z5",
    termsAccepted: true,
  },
  password: "safe-password-2026",
  confirmPassword: "safe-password-2026",
  otpChallengeId: "d72c4e69-20e1-493d-bd2d-495b9270ed0f",
  documentTypes: ["GST_CERTIFICATE"],
};

test("vendor registration validates and normalizes identity fields", () => {
  const parsed = vendorRegistrationSchema.parse(validRegistration);
  assert.equal(parsed.application.email, "asha@example.com");
  assert.equal(parsed.application.mobile, "9876543210");
  assert.deepEqual(parsed.application.servicePostalCodes, ["380015", "380009"]);
});

test("ten-digit mobile numbers beginning with 91 are not mistaken for a country code", () => {
  const parsed = vendorRegistrationSchema.parse({
    ...validRegistration,
    application: { ...validRegistration.application, mobile: "9123456789" },
  });
  assert.equal(parsed.application.mobile, "9123456789");
});

test("vendor registration rejects mismatched passwords and service areas without the shop PIN", () => {
  const parsed = vendorRegistrationSchema.safeParse({
    ...validRegistration,
    confirmPassword: "different-password-2026",
    application: {
      ...validRegistration.application,
      servicePostalCodes: ["380009"],
    },
  });
  assert.equal(parsed.success, false);
  if (!parsed.success) {
    const paths = parsed.error.issues.map((issue) => issue.path.join("."));
    assert.ok(paths.includes("confirmPassword"));
    assert.ok(paths.includes("application.servicePostalCodes"));
  }
});

test("vendor registration requires a city and at least one service category", () => {
  const parsed = vendorRegistrationSchema.safeParse({
    ...validRegistration,
    application: {
      ...validRegistration.application,
      city: " ",
      serviceCategoryIds: [],
    },
  });
  assert.equal(parsed.success, false);
  if (!parsed.success) {
    const paths = parsed.error.issues.map((issue) => issue.path.join("."));
    assert.ok(paths.includes("application.city"));
    assert.ok(paths.includes("application.serviceCategoryIds"));
  }
});

test("vendor registration lists every Indian state and accepts cities beyond its suggestions", () => {
  assert.equal(INDIA_STATES.length, 36);
  assert.ok(INDIA_STATES.includes("Ladakh"));
  assert.ok(INDIA_STATES.includes("Lakshadweep"));
  assert.ok(INDIA_STATES.includes("Dadra and Nagar Haveli and Daman and Diu"));
  assert.deepEqual(citiesForState("Ladakh"), ["Leh", "Kargil"]);

  const parsed = vendorRegistrationSchema.safeParse({
    ...validRegistration,
    application: { ...validRegistration.application, city: "Muvattupuzha", state: "Kerala" },
  });
  assert.equal(parsed.success, true);
});
test("application workflow permits only reviewed status transitions", () => {
  assert.equal(canApplyVendorApplicationAction("SUBMITTED", "START_REVIEW"), true);
  assert.equal(canApplyVendorApplicationAction("UNDER_REVIEW", "APPROVE"), true);
  assert.equal(canApplyVendorApplicationAction("ACTION_REQUIRED", "APPROVE"), false);
  assert.equal(canApplyVendorApplicationAction("REJECTED", "REACTIVATE"), false);
  assert.equal(vendorApplicationTransitionTargets.REQUEST_CHANGES, "ACTION_REQUIRED");
});

test("vendor order fulfilment cannot skip operational stages", () => {
  assert.equal(canApplyVendorOrderAction("PRODUCTION_APPROVED", "START_PRODUCTION"), true);
  assert.equal(canApplyVendorOrderAction("PAYMENT_CONFIRMED", "START_PRODUCTION"), false);
  assert.equal(canApplyVendorOrderAction("IN_PRODUCTION", "MARK_READY_TO_SHIP"), false);
  assert.equal(canApplyVendorOrderAction("QUALITY_CHECK", "MARK_READY_TO_SHIP"), true);
});

test("pending, rejected and suspended vendors have no operational path", () => {
  for (const permission of VENDOR_OPERATIONAL_PERMISSIONS) {
    assert.equal(VENDOR_APPLICANT_PERMISSIONS.includes(permission as never), false);
  }
  assert.equal(isVendorOperational({ verificationStatus: "PENDING", operationalStatus: "INACTIVE" }), false);
  assert.equal(isVendorOperational({ verificationStatus: "REJECTED", operationalStatus: "INACTIVE" }), false);
  assert.equal(isVendorOperational({ verificationStatus: "APPROVED", operationalStatus: "SUSPENDED" }), false);
  assert.equal(isVendorOperational({ verificationStatus: "APPROVED", operationalStatus: "ACTIVE" }), true);
});

test("password hashes are salted and reject the wrong password", async () => {
  const first = await hashPassword("safe-password-2026");
  const second = await hashPassword("safe-password-2026");
  assert.notEqual(first, second);
  assert.equal(await verifyPassword("safe-password-2026", first), true);
  assert.equal(await verifyPassword("not-the-password", first), false);
  assert.equal(await verifyPassword("safe-password-2026", "invalid"), false);
});
