-- Additive marketplace foundation. Review and back up the target database before applying.
CREATE TYPE "VendorVerificationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
CREATE TYPE "VendorApplicationStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'ACTION_REQUIRED', 'APPROVED', 'REJECTED', 'WITHDRAWN');
CREATE TYPE "VendorOperationalStatus" AS ENUM ('INACTIVE', 'ACTIVE', 'SUSPENDED', 'CLOSED');
CREATE TYPE "VendorDocumentType" AS ENUM ('BUSINESS_REGISTRATION', 'GST_CERTIFICATE', 'SHOP_LICENSE', 'IDENTITY_PROOF', 'ADDRESS_PROOF', 'OTHER');
CREATE TYPE "VendorDocumentReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
CREATE TYPE "VendorAvailabilityStatus" AS ENUM ('OFFLINE', 'ONLINE', 'PAUSED');
CREATE TYPE "OrderAssignmentStatus" AS ENUM ('PENDING', 'OFFERED', 'ASSIGNED', 'UNASSIGNED', 'EXPIRED', 'CANCELLED');
CREATE TYPE "VendorOfferStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'CLOSED');
CREATE TYPE "AssignmentEventType" AS ENUM (
  'ASSIGNMENT_STARTED',
  'OFFERS_CREATED',
  'OFFER_ACCEPTED',
  'OFFER_DECLINED',
  'OFFER_EXPIRED',
  'COMPETING_OFFERS_CLOSED',
  'NO_ELIGIBLE_VENDOR',
  'ASSIGNMENT_EXPIRED',
  'ASSIGNMENT_CANCELLED',
  'REASSIGNED'
);

CREATE TABLE "AuthSession" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tokenHash" CHAR(64) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PhoneVerificationChallenge" (
  "id" TEXT NOT NULL,
  "phone" VARCHAR(20) NOT NULL,
  "codeHash" CHAR(64) NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "verifiedAt" TIMESTAMP(3),
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PhoneVerificationChallenge_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PhoneVerificationChallenge_attempts_check" CHECK ("attempts" >= 0 AND "attempts" <= 5)
);

CREATE TABLE "VendorApplication" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "status" "VendorApplicationStatus" NOT NULL DEFAULT 'DRAFT',
  "version" INTEGER NOT NULL DEFAULT 1,
  "ownerName" VARCHAR(120) NOT NULL,
  "businessName" VARCHAR(180) NOT NULL,
  "businessEmail" VARCHAR(254) NOT NULL,
  "businessPhone" VARCHAR(20) NOT NULL,
  "addressLine1" VARCHAR(160) NOT NULL,
  "addressLine2" VARCHAR(160),
  "city" VARCHAR(80) NOT NULL,
  "normalizedCity" VARCHAR(80) NOT NULL,
  "state" VARCHAR(80) NOT NULL,
  "postalCode" VARCHAR(10) NOT NULL,
  "latitude" DECIMAL(9,6),
  "longitude" DECIMAL(9,6),
  "servicePostalCodes" TEXT[] NOT NULL,
  "serviceCategoryIds" TEXT[] NOT NULL,
  "printingServices" TEXT[] NOT NULL,
  "equipment" TEXT[] NOT NULL,
  "businessRegistrationNumber" VARCHAR(80),
  "gstin" VARCHAR(15),
  "termsVersion" VARCHAR(40) NOT NULL,
  "privacyVersion" VARCHAR(40) NOT NULL,
  "termsAcceptedAt" TIMESTAMP(3) NOT NULL,
  "submittedAt" TIMESTAMP(3),
  "reviewStartedAt" TIMESTAMP(3),
  "reviewedAt" TIMESTAMP(3),
  "reviewerId" TEXT,
  "applicantMessage" VARCHAR(1000),
  "internalReviewNotes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VendorApplication_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "VendorApplication_version_check" CHECK ("version" > 0),
  CONSTRAINT "VendorApplication_postal_check" CHECK ("postalCode" ~ '^[1-9][0-9]{5}$'),
  CONSTRAINT "VendorApplication_coordinates_check" CHECK (("latitude" IS NULL) = ("longitude" IS NULL))
);

CREATE TABLE "VendorDocument" (
  "id" TEXT NOT NULL,
  "applicationId" TEXT NOT NULL,
  "uploadedById" TEXT NOT NULL,
  "reviewedById" TEXT,
  "type" "VendorDocumentType" NOT NULL,
  "reviewStatus" "VendorDocumentReviewStatus" NOT NULL DEFAULT 'PENDING',
  "originalName" VARCHAR(200) NOT NULL,
  "mimeType" VARCHAR(100) NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "sha256" CHAR(64) NOT NULL,
  "content" BYTEA NOT NULL,
  "reviewNotes" VARCHAR(500),
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VendorDocument_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "VendorDocument_size_check" CHECK ("sizeBytes" > 0 AND "sizeBytes" <= 4194304)
);

CREATE TABLE "VendorApplicationEvent" (
  "id" TEXT NOT NULL,
  "applicationId" TEXT NOT NULL,
  "actorId" TEXT,
  "fromStatus" "VendorApplicationStatus",
  "toStatus" "VendorApplicationStatus" NOT NULL,
  "action" VARCHAR(80) NOT NULL,
  "applicantMessage" VARCHAR(1000),
  "internalNotes" TEXT,
  "requestId" VARCHAR(120),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VendorApplicationEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VendorProfile" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "applicationId" TEXT NOT NULL,
  "businessName" VARCHAR(180) NOT NULL,
  "ownerName" VARCHAR(120) NOT NULL,
  "businessPhone" VARCHAR(20) NOT NULL,
  "addressLine1" VARCHAR(160) NOT NULL,
  "addressLine2" VARCHAR(160),
  "city" VARCHAR(80) NOT NULL,
  "normalizedCity" VARCHAR(80) NOT NULL,
  "state" VARCHAR(80) NOT NULL,
  "postalCode" VARCHAR(10) NOT NULL,
  "servicePostalCodes" TEXT[] NOT NULL,
  "verificationStatus" "VendorVerificationStatus" NOT NULL DEFAULT 'PENDING',
  "operationalStatus" "VendorOperationalStatus" NOT NULL DEFAULT 'INACTIVE',
  "availabilityStatus" "VendorAvailabilityStatus" NOT NULL DEFAULT 'OFFLINE',
  "maxConcurrentOrders" INTEGER NOT NULL DEFAULT 1,
  "activeOrderCount" INTEGER NOT NULL DEFAULT 0,
  "acceptingOrders" BOOLEAN NOT NULL DEFAULT false,
  "verificationNotes" TEXT,
  "approvedAt" TIMESTAMP(3),
  "rejectedAt" TIMESTAMP(3),
  "suspendedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VendorProfile_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "VendorProfile_capacity_check" CHECK (
    "maxConcurrentOrders" > 0 AND "activeOrderCount" >= 0 AND "activeOrderCount" <= "maxConcurrentOrders"
  )
);

CREATE TABLE "VendorCapability" (
  "id" TEXT NOT NULL,
  "vendorId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "maxOrderQuantity" INTEGER,
  "productionDays" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VendorCapability_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "VendorCapability_limits_check" CHECK (
    ("maxOrderQuantity" IS NULL OR "maxOrderQuantity" > 0) AND
    ("productionDays" IS NULL OR "productionDays" >= 0)
  )
);

CREATE TABLE "OrderAssignment" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "status" "OrderAssignmentStatus" NOT NULL DEFAULT 'PENDING',
  "attempt" INTEGER NOT NULL DEFAULT 1,
  "assignedVendorId" TEXT,
  "offerExpiresAt" TIMESTAMP(3),
  "assignedAt" TIMESTAMP(3),
  "failureReason" VARCHAR(300),
  "version" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OrderAssignment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OrderAssignment_attempt_check" CHECK ("attempt" > 0 AND "version" >= 0)
);

CREATE TABLE "VendorOrderOffer" (
  "id" TEXT NOT NULL,
  "assignmentId" TEXT NOT NULL,
  "vendorId" TEXT NOT NULL,
  "status" "VendorOfferStatus" NOT NULL DEFAULT 'PENDING',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "acceptedAt" TIMESTAMP(3),
  "declinedAt" TIMESTAMP(3),
  "closedAt" TIMESTAMP(3),
  "rejectionReason" VARCHAR(300),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VendorOrderOffer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AssignmentEvent" (
  "id" TEXT NOT NULL,
  "assignmentId" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "vendorId" TEXT,
  "type" "AssignmentEventType" NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AssignmentEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VendorProfile_userId_key" ON "VendorProfile"("userId");
CREATE UNIQUE INDEX "VendorProfile_applicationId_key" ON "VendorProfile"("applicationId");
CREATE INDEX "VendorProfile_eligibility_idx" ON "VendorProfile"("verificationStatus", "operationalStatus", "availabilityStatus", "acceptingOrders");
CREATE INDEX "VendorProfile_city_eligibility_idx" ON "VendorProfile"("normalizedCity", "verificationStatus", "availabilityStatus");
CREATE INDEX "VendorProfile_postalCode_idx" ON "VendorProfile"("postalCode");
CREATE UNIQUE INDEX "VendorCapability_vendorId_productId_key" ON "VendorCapability"("vendorId", "productId");
CREATE INDEX "VendorCapability_productId_isActive_idx" ON "VendorCapability"("productId", "isActive");
CREATE INDEX "VendorCapability_vendorId_isActive_idx" ON "VendorCapability"("vendorId", "isActive");
CREATE UNIQUE INDEX "OrderAssignment_orderId_key" ON "OrderAssignment"("orderId");
CREATE INDEX "OrderAssignment_status_offerExpiresAt_idx" ON "OrderAssignment"("status", "offerExpiresAt");
CREATE INDEX "OrderAssignment_vendor_status_idx" ON "OrderAssignment"("assignedVendorId", "status");
CREATE UNIQUE INDEX "VendorOrderOffer_assignmentId_vendorId_key" ON "VendorOrderOffer"("assignmentId", "vendorId");
CREATE INDEX "VendorOrderOffer_vendor_status_expiry_idx" ON "VendorOrderOffer"("vendorId", "status", "expiresAt");
CREATE INDEX "VendorOrderOffer_assignment_status_idx" ON "VendorOrderOffer"("assignmentId", "status");
CREATE INDEX "VendorOrderOffer_status_expiry_idx" ON "VendorOrderOffer"("status", "expiresAt");
CREATE INDEX "AssignmentEvent_assignment_createdAt_idx" ON "AssignmentEvent"("assignmentId", "createdAt");
CREATE INDEX "AssignmentEvent_order_createdAt_idx" ON "AssignmentEvent"("orderId", "createdAt");
CREATE INDEX "AssignmentEvent_vendor_createdAt_idx" ON "AssignmentEvent"("vendorId", "createdAt");
CREATE INDEX "AssignmentEvent_type_createdAt_idx" ON "AssignmentEvent"("type", "createdAt");
CREATE UNIQUE INDEX "AuthSession_tokenHash_key" ON "AuthSession"("tokenHash");
CREATE INDEX "AuthSession_userId_expiresAt_idx" ON "AuthSession"("userId", "expiresAt");
CREATE INDEX "AuthSession_expiresAt_revokedAt_idx" ON "AuthSession"("expiresAt", "revokedAt");
CREATE INDEX "PhoneVerificationChallenge_phone_createdAt_idx" ON "PhoneVerificationChallenge"("phone", "createdAt");
CREATE INDEX "PhoneVerificationChallenge_expiry_idx" ON "PhoneVerificationChallenge"("expiresAt", "consumedAt");
CREATE UNIQUE INDEX "VendorApplication_userId_key" ON "VendorApplication"("userId");
CREATE INDEX "VendorApplication_status_submittedAt_idx" ON "VendorApplication"("status", "submittedAt");
CREATE INDEX "VendorApplication_city_status_idx" ON "VendorApplication"("normalizedCity", "status");
CREATE INDEX "VendorApplication_reviewer_status_idx" ON "VendorApplication"("reviewerId", "status");
CREATE INDEX "VendorDocument_application_type_status_idx" ON "VendorDocument"("applicationId", "type", "reviewStatus");
CREATE INDEX "VendorDocument_sha256_idx" ON "VendorDocument"("sha256");
CREATE INDEX "VendorApplicationEvent_application_createdAt_idx" ON "VendorApplicationEvent"("applicationId", "createdAt");
CREATE INDEX "VendorApplicationEvent_actor_createdAt_idx" ON "VendorApplicationEvent"("actorId", "createdAt");
CREATE INDEX "VendorApplicationEvent_status_createdAt_idx" ON "VendorApplicationEvent"("toStatus", "createdAt");
CREATE INDEX "VendorApplication_servicePostalCodes_gin_idx" ON "VendorApplication" USING GIN ("servicePostalCodes");
CREATE INDEX "VendorProfile_servicePostalCodes_gin_idx" ON "VendorProfile" USING GIN ("servicePostalCodes");

ALTER TABLE "VendorProfile" ADD CONSTRAINT "VendorProfile_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VendorProfile" ADD CONSTRAINT "VendorProfile_applicationId_fkey"
  FOREIGN KEY ("applicationId") REFERENCES "VendorApplication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VendorApplication" ADD CONSTRAINT "VendorApplication_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VendorApplication" ADD CONSTRAINT "VendorApplication_reviewerId_fkey"
  FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "VendorDocument" ADD CONSTRAINT "VendorDocument_applicationId_fkey"
  FOREIGN KEY ("applicationId") REFERENCES "VendorApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VendorDocument" ADD CONSTRAINT "VendorDocument_uploadedById_fkey"
  FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VendorDocument" ADD CONSTRAINT "VendorDocument_reviewedById_fkey"
  FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "VendorApplicationEvent" ADD CONSTRAINT "VendorApplicationEvent_applicationId_fkey"
  FOREIGN KEY ("applicationId") REFERENCES "VendorApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VendorApplicationEvent" ADD CONSTRAINT "VendorApplicationEvent_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "VendorCapability" ADD CONSTRAINT "VendorCapability_vendorId_fkey"
  FOREIGN KEY ("vendorId") REFERENCES "VendorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VendorCapability" ADD CONSTRAINT "VendorCapability_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderAssignment" ADD CONSTRAINT "OrderAssignment_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderAssignment" ADD CONSTRAINT "OrderAssignment_assignedVendorId_fkey"
  FOREIGN KEY ("assignedVendorId") REFERENCES "VendorProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VendorOrderOffer" ADD CONSTRAINT "VendorOrderOffer_assignmentId_fkey"
  FOREIGN KEY ("assignmentId") REFERENCES "OrderAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VendorOrderOffer" ADD CONSTRAINT "VendorOrderOffer_vendorId_fkey"
  FOREIGN KEY ("vendorId") REFERENCES "VendorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AssignmentEvent" ADD CONSTRAINT "AssignmentEvent_assignmentId_fkey"
  FOREIGN KEY ("assignmentId") REFERENCES "OrderAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AssignmentEvent" ADD CONSTRAINT "AssignmentEvent_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AssignmentEvent" ADD CONSTRAINT "AssignmentEvent_vendorId_fkey"
  FOREIGN KEY ("vendorId") REFERENCES "VendorProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- BEGIN MARKETPLACE_RUNTIME_SQL
-- The database is the authority for the first-accept race. Locking the offer,
-- assignment and vendor rows also makes capacity enforcement safe across orders.
CREATE OR REPLACE FUNCTION "acceptVendorOrderOffer"(
  p_offer_id TEXT,
  p_vendor_user_id TEXT
)
RETURNS TABLE (
  "outcome" TEXT,
  "assignmentId" TEXT,
  "orderId" TEXT,
  "vendorId" TEXT
)
LANGUAGE plpgsql
AS $$
DECLARE
  selected_offer RECORD;
  target_order_id TEXT;
  accepted_at TIMESTAMP(3) := clock_timestamp();
BEGIN
  -- Lock the Order first. Terminal order updates also lock Order before their
  -- capacity-release trigger touches VendorProfile, avoiding an inverted lock order.
  SELECT assignment."orderId"
  INTO target_order_id
  FROM "VendorOrderOffer" offer
  INNER JOIN "OrderAssignment" assignment ON assignment."id" = offer."assignmentId"
  INNER JOIN "VendorProfile" vendor ON vendor."id" = offer."vendorId"
  WHERE offer."id" = p_offer_id AND vendor."userId" = p_vendor_user_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'NOT_FOUND'::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT;
    RETURN;
  END IF;

  PERFORM 1 FROM "Order" WHERE "id" = target_order_id FOR UPDATE;

  SELECT
    offer."id" AS offer_id,
    offer."status" AS offer_status,
    offer."expiresAt" AS offer_expires_at,
    assignment."id" AS assignment_id,
    assignment."orderId" AS order_id,
    assignment."status" AS assignment_status,
    assignment."assignedVendorId" AS assigned_vendor_id,
    assignment."offerExpiresAt" AS assignment_expires_at,
    vendor."id" AS vendor_id,
    vendor."verificationStatus" AS verification_status,
    vendor."operationalStatus" AS operational_status,
    vendor."availabilityStatus" AS availability_status,
    vendor."acceptingOrders" AS accepting_orders,
    vendor."activeOrderCount" AS active_order_count,
    vendor."maxConcurrentOrders" AS max_concurrent_orders,
    vendor."servicePostalCodes" AS service_postal_codes,
    app_user."status" AS user_status,
    order_record."paymentStatus" AS payment_status,
    order_record."status" AS order_status
  INTO selected_offer
  FROM "VendorOrderOffer" offer
  INNER JOIN "OrderAssignment" assignment ON assignment."id" = offer."assignmentId"
  INNER JOIN "VendorProfile" vendor ON vendor."id" = offer."vendorId"
  INNER JOIN "User" app_user ON app_user."id" = vendor."userId"
  INNER JOIN "Order" order_record ON order_record."id" = assignment."orderId"
  WHERE offer."id" = p_offer_id
    AND vendor."userId" = p_vendor_user_id
    AND assignment."orderId" = target_order_id
  FOR UPDATE OF offer, assignment, vendor;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'NOT_FOUND'::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT;
    RETURN;
  END IF;

  IF selected_offer.assignment_status = 'ASSIGNED'
     AND selected_offer.assigned_vendor_id = selected_offer.vendor_id
     AND selected_offer.offer_status = 'ACCEPTED' THEN
    RETURN QUERY SELECT
      'REPLAYED'::TEXT,
      selected_offer.assignment_id::TEXT,
      selected_offer.order_id::TEXT,
      selected_offer.vendor_id::TEXT;
    RETURN;
  END IF;

  IF selected_offer.assignment_status = 'ASSIGNED' THEN
    RETURN QUERY SELECT
      'ALREADY_ASSIGNED'::TEXT,
      selected_offer.assignment_id::TEXT,
      selected_offer.order_id::TEXT,
      NULL::TEXT;
    RETURN;
  END IF;

  IF selected_offer.offer_status <> 'PENDING'
     OR selected_offer.offer_expires_at <= accepted_at
     OR selected_offer.assignment_expires_at IS NULL
     OR selected_offer.assignment_expires_at <= accepted_at THEN
    IF selected_offer.offer_status = 'PENDING' THEN
      UPDATE "VendorOrderOffer"
      SET "status" = 'EXPIRED', "closedAt" = accepted_at, "updatedAt" = accepted_at
      WHERE "id" = selected_offer.offer_id;
    END IF;
    RETURN QUERY SELECT
      'OFFER_EXPIRED'::TEXT,
      selected_offer.assignment_id::TEXT,
      selected_offer.order_id::TEXT,
      NULL::TEXT;
    RETURN;
  END IF;

  IF selected_offer.assignment_status <> 'OFFERED'
     OR selected_offer.verification_status <> 'APPROVED'
     OR selected_offer.operational_status <> 'ACTIVE'
     OR selected_offer.user_status <> 'ACTIVE'
     OR selected_offer.payment_status <> 'CAPTURED'
     OR selected_offer.order_status IN ('DELIVERED', 'CANCELLED', 'REFUND_PROCESSING', 'REFUNDED')
     OR selected_offer.availability_status <> 'ONLINE'
     OR NOT selected_offer.accepting_orders
     OR selected_offer.active_order_count >= selected_offer.max_concurrent_orders
     OR NOT EXISTS (
       SELECT 1 FROM "OrderAddress" address
       WHERE address."orderId" = selected_offer.order_id
         AND address."type" = 'SHIPPING'
         AND address."postalCode" = ANY (selected_offer.service_postal_codes)
     )
     OR EXISTS (
       SELECT 1
       FROM (
         SELECT item."productId", SUM(item."quantity")::INTEGER AS total_quantity
         FROM "OrderItem" item
         WHERE item."orderId" = selected_offer.order_id
         GROUP BY item."productId"
       ) demand
       WHERE demand."productId" IS NULL
         OR NOT EXISTS (
           SELECT 1 FROM "VendorCapability" capability
           WHERE capability."vendorId" = selected_offer.vendor_id
             AND capability."productId" = demand."productId"
             AND capability."isActive" = true
             AND (capability."maxOrderQuantity" IS NULL OR demand.total_quantity <= capability."maxOrderQuantity")
         )
     ) THEN
    RETURN QUERY SELECT
      'VENDOR_INELIGIBLE'::TEXT,
      selected_offer.assignment_id::TEXT,
      selected_offer.order_id::TEXT,
      NULL::TEXT;
    RETURN;
  END IF;

  UPDATE "OrderAssignment"
  SET
    "status" = 'ASSIGNED',
    "assignedVendorId" = selected_offer.vendor_id,
    "assignedAt" = accepted_at,
    "version" = "version" + 1,
    "updatedAt" = accepted_at
  WHERE "id" = selected_offer.assignment_id;

  UPDATE "VendorProfile"
  SET "activeOrderCount" = "activeOrderCount" + 1, "updatedAt" = accepted_at
  WHERE "id" = selected_offer.vendor_id;

  UPDATE "VendorOrderOffer"
  SET "status" = 'ACCEPTED', "acceptedAt" = accepted_at, "updatedAt" = accepted_at
  WHERE "id" = selected_offer.offer_id;

  UPDATE "VendorOrderOffer"
  SET "status" = 'CLOSED', "closedAt" = accepted_at, "updatedAt" = accepted_at
  WHERE "assignmentId" = selected_offer.assignment_id
    AND "id" <> selected_offer.offer_id
    AND "status" = 'PENDING';

  INSERT INTO "AssignmentEvent" (
    "id", "assignmentId", "orderId", "vendorId", "type", "metadata", "createdAt"
  ) VALUES (
    gen_random_uuid()::TEXT,
    selected_offer.assignment_id,
    selected_offer.order_id,
    selected_offer.vendor_id,
    'OFFER_ACCEPTED',
    jsonb_build_object('offerId', selected_offer.offer_id),
    accepted_at
  );

  INSERT INTO "AssignmentEvent" (
    "id", "assignmentId", "orderId", "vendorId", "type", "metadata", "createdAt"
  ) VALUES (
    gen_random_uuid()::TEXT,
    selected_offer.assignment_id,
    selected_offer.order_id,
    selected_offer.vendor_id,
    'COMPETING_OFFERS_CLOSED',
    jsonb_build_object('winningOfferId', selected_offer.offer_id),
    accepted_at
  );

  RETURN QUERY SELECT
    'ACCEPTED'::TEXT,
    selected_offer.assignment_id::TEXT,
    selected_offer.order_id::TEXT,
    selected_offer.vendor_id::TEXT;
END;
$$;

REVOKE ALL ON FUNCTION "acceptVendorOrderOffer"(TEXT, TEXT) FROM PUBLIC;

-- Capacity is released regardless of which trusted workflow closes the order.
-- The terminal-state guard makes retries and repeated webhook delivery idempotent.
CREATE OR REPLACE FUNCTION "releaseVendorCapacityOnOrderClosure"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  assigned_vendor_id TEXT;
BEGIN
  IF NEW."status" IN ('DELIVERED', 'CANCELLED', 'REFUNDED')
     AND OLD."status" NOT IN ('DELIVERED', 'CANCELLED', 'REFUNDED') THEN
    SELECT assignment."assignedVendorId"
    INTO assigned_vendor_id
    FROM "OrderAssignment" assignment
    WHERE assignment."orderId" = NEW."id"
      AND assignment."status" = 'ASSIGNED';

    IF assigned_vendor_id IS NOT NULL THEN
      UPDATE "VendorProfile"
      SET
        "activeOrderCount" = GREATEST("activeOrderCount" - 1, 0),
        "updatedAt" = clock_timestamp()
      WHERE "id" = assigned_vendor_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "Order_release_vendor_capacity" ON "Order";
CREATE TRIGGER "Order_release_vendor_capacity"
AFTER UPDATE OF "status" ON "Order"
FOR EACH ROW
EXECUTE FUNCTION "releaseVendorCapacityOnOrderClosure"();
-- END MARKETPLACE_RUNTIME_SQL
