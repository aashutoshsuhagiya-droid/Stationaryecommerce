import { NextResponse } from "next/server";
import { z } from "zod";

import { capturedCustomOrderStatus } from "@/lib/artwork-review";
import { assertSameOrigin, AuthenticationError, requireRequestActor } from "@/lib/auth-session";
import { CommerceError } from "@/lib/commerce-error";
import { apiError, readJson, RequestTooLargeError, validationError } from "@/lib/http";
import { DatabaseConfigurationError, getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const artworkReviewSchema = z.object({
  orderId: z.string().trim().min(1).max(100),
  orderItemId: z.string().trim().min(1).max(100),
  decision: z.enum(["APPROVE", "REJECT"]),
}).strict();

export async function GET(request: Request) {
  try {
    await requireRequestActor(request, "orders.read");
    const orders = await getPrisma().order.findMany({
      orderBy: { placedAt: "desc" },
      take: 200,
      select: {
        id: true,
        orderNumber: true,
        customerEmail: true,
        status: true,
        paymentStatus: true,
        totalPaise: true,
        placedAt: true,
        addresses: {
          where: { type: "SHIPPING" },
          take: 1,
          select: { fullName: true, city: true, postalCode: true },
        },
        items: {
          select: {
            id: true,
            productNameSnapshot: true,
            quantity: true,
            lineTotalPaise: true,
            personalization: {
              select: { values: true, artworkStatus: true, approvedAt: true, templateSnapshot: true },
            },
            artworkAssets: {
              select: {
                id: true,
                originalName: true,
                mimeType: true,
                sizeBytes: true,
                width: true,
                height: true,
                hasTransparency: true,
                status: true,
              },
            },
          },
        },
      },
    });
    return NextResponse.json({ data: { orders } }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof AuthenticationError) return apiError(error.status, error.code, error.message);
    if (error instanceof DatabaseConfigurationError) return apiError(503, "DATABASE_UNAVAILABLE", "Order storage is not configured.");
    console.error("Unexpected admin order list error", error);
    return apiError(500, "ADMIN_ORDERS_FAILED", "Orders could not be loaded.");
  }
}

export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    await requireRequestActor(request, "orders.manage");
    const parsed = artworkReviewSchema.safeParse(await readJson(request));
    if (!parsed.success) return validationError(parsed.error);
    const { orderId, orderItemId, decision } = parsed.data;
    const reviewedAt = new Date();
    const artworkStatus = decision === "APPROVE" ? "APPROVED" as const : "REJECTED" as const;
    const assetStatus = decision === "APPROVE" ? "APPROVED" as const : "REJECTED" as const;

    const result = await getPrisma().$transaction(async (tx) => {
      const item = await tx.orderItem.findFirst({
        where: { id: orderItemId, orderId },
        select: {
          id: true,
          personalization: { select: { id: true } },
          order: { select: { status: true, paymentStatus: true } },
        },
      });
      if (!item) {
        throw new CommerceError(404, "ORDER_ITEM_NOT_FOUND", "The requested order item was not found.");
      }
      if (!item.personalization) {
        throw new CommerceError(422, "ORDER_ITEM_NOT_PERSONALIZED", "This order item has no personalization to review.");
      }

      const personalization = await tx.orderPersonalization.update({
        where: { orderItemId },
        data: {
          artworkStatus,
          approvedAt: artworkStatus === "APPROVED" ? reviewedAt : null,
        },
        select: { artworkStatus: true, approvedAt: true },
      });
      await tx.artworkAsset.updateMany({
        where: { orderItemId },
        data: { status: assetStatus },
      });

      const orderItems = await tx.orderItem.findMany({
        where: { orderId },
        select: { personalization: { select: { artworkStatus: true } } },
      });
      const personalizationStatuses = orderItems.flatMap((orderItem) =>
        orderItem.personalization ? [orderItem.personalization.artworkStatus] : []);
      const nextOrderStatus = capturedCustomOrderStatus(
        item.order.paymentStatus,
        personalizationStatuses,
      );
      if (nextOrderStatus) {
        await tx.order.update({ where: { id: orderId }, data: { status: nextOrderStatus } });
      }

      return {
        orderId,
        orderItemId,
        artworkStatus: personalization.artworkStatus,
        approvedAt: personalization.approvedAt,
        assetStatus,
        orderStatus: nextOrderStatus ?? item.order.status,
      };
    });

    return NextResponse.json({ data: result }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof RequestTooLargeError) return apiError(413, "REQUEST_TOO_LARGE", error.message);
    if (error instanceof AuthenticationError) return apiError(error.status, error.code, error.message);
    if (error instanceof CommerceError) return apiError(error.status, error.code, error.message, error.details);
    if (error instanceof DatabaseConfigurationError) return apiError(503, "DATABASE_UNAVAILABLE", "Order storage is not configured.");
    if (error instanceof SyntaxError) return apiError(400, "INVALID_JSON", error.message);
    console.error("Unexpected admin artwork review error", error);
    return apiError(500, "ARTWORK_REVIEW_FAILED", "The artwork review could not be saved.");
  }
}
