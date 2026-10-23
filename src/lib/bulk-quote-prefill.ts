export type BulkQuoteSearchParam = string | string[] | undefined;

export interface BulkQuoteSearchParams {
  product?: BulkQuoteSearchParam;
  customSize?: BulkQuoteSearchParam;
  quantity?: BulkQuoteSearchParam;
  dimensions?: BulkQuoteSearchParam;
}

export interface BulkQuotePrefill {
  productId?: string;
  customSizeRequested: boolean;
  quantity?: number;
  dimensions?: string;
}

export function buildCustomSizeQuotePath({
  productId,
  quantity,
  dimensions,
}: {
  productId: string;
  quantity: number;
  dimensions?: string;
}) {
  const params = new URLSearchParams({
    product: productId,
    customSize: "true",
    quantity: String(quantity),
  });
  const normalizedDimensions = dimensions?.trim();
  if (normalizedDimensions) params.set("dimensions", normalizedDimensions);
  return `/bulk-orders?${params.toString()}`;
}

function scalarParam(value: BulkQuoteSearchParam) {
  return typeof value === "string" ? value : undefined;
}

function boundedInteger(value: string | undefined, minimum: number, maximum: number) {
  if (!value || !/^\d+$/.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum
    ? parsed
    : undefined;
}

export function parseBulkQuotePrefill(
  query: BulkQuoteSearchParams,
  options: {
    availableProductIds: ReadonlySet<string>;
    minimumQuantity: number;
    maximumQuantity: number;
  },
): BulkQuotePrefill {
  const requestedProductId = scalarParam(query.product);
  const productId = requestedProductId && options.availableProductIds.has(requestedProductId)
    ? requestedProductId
    : undefined;
  const requestedDimensions = scalarParam(query.dimensions)?.trim();
  const dimensions = productId && requestedDimensions && requestedDimensions.length >= 2 && requestedDimensions.length <= 120
    ? requestedDimensions
    : undefined;

  return {
    productId,
    customSizeRequested: scalarParam(query.customSize) === "true",
    quantity: boundedInteger(
      scalarParam(query.quantity),
      options.minimumQuantity,
      options.maximumQuantity,
    ),
    dimensions,
  };
}
