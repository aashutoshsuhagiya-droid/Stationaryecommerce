export type CurrencyCode = "INR";

export type StockStatus =
  | "in_stock"
  | "low_stock"
  | "made_to_order"
  | "out_of_stock";

export type ProductBadge = "Bestseller" | "New" | "Premium" | "Bulk value";

export interface Category {
  id: string;
  slug: string;
  name: string;
  shortName: string;
  description: string;
  image: string;
  artwork: string;
  accent: string;
  sortOrder: number;
  featured: boolean;
  productCount: number;
}

export interface ProductImage {
  id: string;
  src: string;
  alt: string;
  width: number;
  height: number;
}

export interface ProductVariant {
  id: string;
  sku: string;
  name: string;
  price: number;
  compareAtPrice?: number;
  size?: string;
  color?: string;
  material?: string;
  packSize?: number;
  stockStatus: StockStatus;
}

export interface CustomizationOption {
  id: string;
  label: string;
  value: string;
  priceDelta?: number;
  swatch?: string;
}

export interface CustomizationField {
  id: string;
  label: string;
  type: "text" | "select" | "color" | "template" | "image";
  required: boolean;
  placeholder?: string;
  helpText?: string;
  minLength?: number;
  maxLength?: number;
  allowedPattern?: string;
  options?: CustomizationOption[];
}

export interface Product {
  id: string;
  slug: string;
  sku: string;
  name: string;
  categorySlug: string;
  category: string;
  price: number;
  compareAtPrice?: number;
  rating?: number;
  reviewCount?: number;
  customizable: boolean;
  badge?: ProductBadge;
  description: string;
  shortDescription: string;
  colors?: string[];
  sizes?: string[];
  themes?: string[];
  material: string;
  dimensions: string;
  packSize: number;
  artwork: string;
  image: string;
  images: ProductImage[];
  stockStatus: StockStatus;
  featured: boolean;
  newArrival: boolean;
  tags: string[];
  features: string[];
  careInstructions?: string;
  productionDays: { min: number; max: number };
  variants: ProductVariant[];
  customizationFields: CustomizationField[];
  templateIds: string[];
}

export interface PersonalizationTemplate {
  id: string;
  slug: string;
  name: string;
  theme: string;
  description: string;
  thumbnail: string;
  artwork: string;
  premiumPrice: number;
  active: boolean;
  rightsStatement: string;
  compatibleProductIds: string[];
  preview: {
    background: string;
    foreground: string;
    accent: string;
    fontFamily: string;
    textAlign: "left" | "center" | "right";
    safeArea: { x: number; y: number; width: number; height: number };
  };
}

export interface PersonalizationValues {
  templateId?: string;
  fields: Record<string, string>;
  previewVersion: number;
}

export interface CartItem {
  id: string;
  productId: string;
  variantId: string;
  productName: string;
  productSlug: string;
  sku: string;
  image: string;
  quantity: number;
  unitPricePaise: number;
  customization?: PersonalizationValues;
}

export interface Cart {
  id: string;
  currency: CurrencyCode;
  items: CartItem[];
  couponCode?: string;
  subtotalPaise: number;
  shippingPaise: number;
  taxPaise: number;
  discountPaise: number;
  totalPaise: number;
  updatedAt: string;
}

export type PaymentStatus =
  | "pending"
  | "authorized"
  | "paid"
  | "failed"
  | "refunded";

export type FulfillmentStatus =
  | "order_received"
  | "customization_review"
  | "production_approved"
  | "in_production"
  | "quality_check"
  | "ready_to_ship"
  | "shipped"
  | "delivered"
  | "cancelled"
  | "refund_processing"
  | "refunded";

export interface AddressSnapshot {
  fullName: string;
  mobile: string;
  email: string;
  addressLine1: string;
  addressLine2?: string;
  landmark?: string;
  city: string;
  state: string;
  postalCode: string;
  country: "IN";
}

export interface OrderItemSnapshot extends CartItem {
  lineTotalPaise: number;
  productSnapshot: {
    name: string;
    sku: string;
    variantName: string;
    material: string;
    dimensions: string;
  };
}

export interface Order {
  id: string;
  orderNumber: string;
  currency: CurrencyCode;
  items: OrderItemSnapshot[];
  shippingAddress: AddressSnapshot;
  paymentStatus: PaymentStatus;
  fulfillmentStatus: FulfillmentStatus;
  subtotalPaise: number;
  shippingPaise: number;
  taxPaise: number;
  discountPaise: number;
  totalPaise: number;
  createdAt: string;
  updatedAt: string;
}

export interface AdminMetric {
  id:
    | "total_orders"
    | "revenue"
    | "pending"
    | "in_production"
    | "ready_to_ship"
    | "completed"
    | "cancelled"
    | "low_stock";
  label: string;
  value: number;
  format: "number" | "currency";
  description: string;
}

export interface AdminDashboardSnapshot {
  source: "demo" | "database";
  generatedAt: string;
  currency: CurrencyCode;
  metrics: AdminMetric[];
  recentOrders: Array<
    Pick<
      Order,
      | "orderNumber"
      | "paymentStatus"
      | "fulfillmentStatus"
      | "totalPaise"
      | "createdAt"
    > & { customerName: string }
  >;
}
