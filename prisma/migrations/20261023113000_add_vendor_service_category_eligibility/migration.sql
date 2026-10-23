-- Forward upgrade for databases that already applied the original marketplace migration.
ALTER TABLE "VendorProfile"
  ADD COLUMN IF NOT EXISTS "serviceCategoryIds" TEXT[];

UPDATE "VendorProfile" AS profile
SET "serviceCategoryIds" = application."serviceCategoryIds"
FROM "VendorApplication" AS application
WHERE application."id" = profile."applicationId"
  AND (
    profile."serviceCategoryIds" IS NULL
    OR cardinality(profile."serviceCategoryIds") = 0
  );

UPDATE "VendorProfile"
SET "serviceCategoryIds" = ARRAY[]::TEXT[]
WHERE "serviceCategoryIds" IS NULL;

ALTER TABLE "VendorProfile"
  ALTER COLUMN "serviceCategoryIds" SET DEFAULT ARRAY[]::TEXT[],
  ALTER COLUMN "serviceCategoryIds" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "VendorProfile_serviceCategoryIds_gin_idx"
  ON "VendorProfile" USING GIN ("serviceCategoryIds");

-- BEGIN MARKETPLACE_RUNTIME_SQL
-- Keep this normalization contract aligned with normalizeServiceCity in
-- src/lib/marketplace-assignment.ts. PostgreSQL's core normalize function
-- avoids requiring the optional unaccent extension.
CREATE OR REPLACE FUNCTION "normalizeMarketplaceCity"(input_city TEXT)
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
STRICT
PARALLEL SAFE
AS $function$
  SELECT trim(
    regexp_replace(
      lower(
        trim(
          regexp_replace(normalize(input_city, NFKD), U&'[\0300-\036f]', '', 'g')
        )
      ),
      '[^a-z0-9]+',
      ' ',
      'g'
    )
  );
$function$;

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
    vendor."normalizedCity" AS normalized_city,
    vendor."servicePostalCodes" AS service_postal_codes,
    vendor."serviceCategoryIds" AS service_category_ids,
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
         AND "normalizeMarketplaceCity"(address."city") = selected_offer.normalized_city
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
           SELECT 1
           FROM "VendorCapability" capability
           INNER JOIN "Product" product ON product."id" = capability."productId"
           WHERE capability."vendorId" = selected_offer.vendor_id
             AND capability."productId" = demand."productId"
             AND capability."isActive" = true
             AND product."categoryId" = ANY (selected_offer.service_category_ids)
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
