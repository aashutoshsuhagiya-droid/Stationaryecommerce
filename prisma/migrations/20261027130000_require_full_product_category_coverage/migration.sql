-- Recheck the product's primary manufacturing category at the atomic
-- offer-acceptance boundary. ProductCategory cross-links are discovery-only
-- and do not grant or remove a vendor's production eligibility.
-- BEGIN MARKETPLACE_RUNTIME_SQL
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
AS $function$
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
           WHERE capability."vendorId" = selected_offer.vendor_id
             AND capability."productId" = demand."productId"
             AND capability."isActive" = true
             AND (capability."maxOrderQuantity" IS NULL OR demand.total_quantity <= capability."maxOrderQuantity")
         )
          OR EXISTS (
            SELECT 1
            FROM "Product" product
            WHERE product."id" = demand."productId"
              AND NOT (product."categoryId" = ANY (selected_offer.service_category_ids))
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
$function$;

REVOKE ALL ON FUNCTION "acceptVendorOrderOffer"(TEXT, TEXT) FROM PUBLIC;
-- END MARKETPLACE_RUNTIME_SQL
