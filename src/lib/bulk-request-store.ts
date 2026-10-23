import type { BulkRequestInput } from "./bulk-request-validation";

export type StoredBulkRequest = Omit<
  BulkRequestInput,
  "customSizeRequested" | "requestedDimensions" | "quantity"
> & {
  customSizeRequested: boolean;
  requestedDimensions: string;
  quantity: number;
  id: string;
  reference: string;
  productName: string;
  productSku: string;
  status: "received";
  createdAt: string;
};

type StoredBulkRequestMetadata = Pick<
  StoredBulkRequest,
  "id" | "reference" | "productName" | "productSku" | "status" | "createdAt"
>;

type DemoGlobal = typeof globalThis & {
  __naamlyBulkRequests?: Map<string, StoredBulkRequest>;
};

const demoGlobal = globalThis as DemoGlobal;
const demoRequests = demoGlobal.__naamlyBulkRequests ?? new Map<string, StoredBulkRequest>();
demoGlobal.__naamlyBulkRequests = demoRequests;

export function storeBulkRequest(
  request: BulkRequestInput,
  metadata: StoredBulkRequestMetadata,
) {
  const storedRequest: StoredBulkRequest = {
    ...request,
    customSizeRequested: request.customSizeRequested,
    requestedDimensions: request.requestedDimensions,
    quantity: request.quantity,
    ...metadata,
  };
  demoRequests.set(storedRequest.reference, storedRequest);
  return storedRequest;
}

export function getStoredBulkRequest(reference: string) {
  return demoRequests.get(reference);
}
