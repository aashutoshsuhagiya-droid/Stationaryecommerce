export type CurrencyCode = "INR";

export type StockStatus =
  | "in_stock"
  | "low_stock"
  | "made_to_order"
  | "out_of_stock";

export type ProductBadge = "Bestseller" | "New" | "Premium" | "Bulk value";

export interface Category {
  id: string;
  parentId?: string | null;
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
  type: "text" | "select" | "color" | "template" | "image" | "number";
  required: boolean;
  placeholder?: string;
  helpText?: string;
  /** A catalog-defined initial value. It is always revalidated on the server. */
  defaultValue?: string;
  /** Display-only unit for a numeric or specification value, such as mm or GSM. */
  unit?: string;
  /** Disabled fields are retained in the catalog but never exposed or priced. */
  enabled?: boolean;
  /** Lets an administrator retain an internal field without showing it to customers. */
  customerVisible?: boolean;
  /** Shows a field only when the controlling field has the selected value. */
  visibleWhen?: {
    fieldId: string;
    equals: string;
  };
  minLength?: number;
  maxLength?: number;
  minValue?: number;
  maxValue?: number;
  step?: number;
  allowedPattern?: string;
  options?: CustomizationOption[];
  priceDelta?: number;
}

export interface Product {
  id: string;
  slug: string;
  sku: string;
  name: string;
  categorySlug: string;
  category: string;
  /** Includes the legacy primary category and any additive cross-listings. */
  categoryIds?: string[];
  categorySlugs?: string[];
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
  /** Optional catalog product type selected by a Super Admin. */
  productType?: string;
  features: string[];
  careInstructions?: string;
  productionDays: { min: number; max: number };
  variants: ProductVariant[];
  customizationFields: CustomizationField[];
  templateIds: string[];
  /** Undefined means the legacy demo catalog; an empty array means no linked live templates. */
  templateLinks?: ProductTemplateLink[];
  configurator?: {
    allow2D: boolean;
    allow3D: boolean;
    quantityMin: number;
    quantityMax: number;
    quantityTiers?: Array<{
      minimum: number;
      priceDelta: number;
      label?: string;
    }>;
    setupCharge?: number;
    structuredDescription?: {
      intro?: string;
      bestFor?: string[];
      featureBullets?: string[];
    };
    printAreas: Array<{
      id: string;
      label: string;
      widthMm?: number;
      heightMm?: number;
      safeInsetMm?: number;
    }>;
    artworkUpload?: {
      enabled: boolean;
      acceptedMimeTypes: string[];
      maximumBytes: number;
    };
    /** Optional product-specific artwork constraints. Missing policies use legacy-safe defaults. */
    artworkPolicy?: ProductArtworkPolicy;
    /** Locked customer-preview imagery keyed by printable surface ID. */
    baseImages?: Record<string, string>;
    previewTemplate?: string;
    productModel?: string;
    configurationVersion?: string;
    visualizationTemplate?: ProductVisualizationTemplate;
  };
}

export interface ProductVisualizationSurface {
  surfaceId: string;
  label: string;
  role: "front" | "back" | "left" | "right" | "top" | "bottom" | "wrap" | "gusset" | "inside" | "other";
  sourceBounds?: { x: number; y: number; width: number; height: number };
  textureUrl?: string;
}

/** A published, immutable visualization template exposed to the storefront. */
export interface ProductVisualizationTemplate {
  id: string;
  version: number;
  name: string;
  productType: string;
  geometryKind: "box" | "cylinder" | "plane" | "bag" | "pouch" | "label" | "custom";
  dimensionsMm: Record<string, number>;
  surfaces: ProductVisualizationSurface[];
  sourceAsset?: {
    id: string;
    width: number;
    height: number;
    mimeType: ArtworkImageMimeType;
  };
  manufacturingValidated: boolean;
}

export interface PersonalizationTemplateSurface {
  id: string;
  label: string;
  baseImageUrl?: string;
  widthPx?: number;
  heightPx?: number;
  dpi?: number;
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
  /**
   * Complete production-critical data from a live PersonalizationTemplate row.
   * Legacy in-memory templates intentionally omit this field.
   */
  production?: {
    previewConfig: SnapshotJsonValue;
    productionConfig: SnapshotJsonValue;
    widthPx: number;
    heightPx: number;
    dpi: number;
    defaultSurfaceId?: string;
    surfaces: PersonalizationTemplateSurface[];
  };
}

export type SnapshotJsonValue =
  | null
  | boolean
  | number
  | string
  | SnapshotJsonValue[]
  | { [key: string]: SnapshotJsonValue };

/** Immutable template specification copied into OrderPersonalization.templateSnapshot. */
export interface OrderTemplateSnapshot {
  schemaVersion: 1;
  templateId: string;
  slug: string;
  name: string;
  theme: string;
  description: string;
  thumbnail: string;
  artwork: string;
  premiumPricePaise: number;
  rightsStatement: string;
  preview: PersonalizationTemplate["preview"];
  previewConfig: SnapshotJsonValue;
  productionConfig: SnapshotJsonValue | null;
  productionOutput: {
    widthPx: number | null;
    heightPx: number | null;
    dpi: number | null;
  };
  defaultSurfaceId?: string;
  surfaces: PersonalizationTemplateSurface[];
}

/** A template explicitly linked to a product in the live catalog. */
export interface ProductTemplateLink {
  template: PersonalizationTemplate;
  sortOrder: number;
  isDefault: boolean;
}

export interface PersonalizationValues {
  templateId?: string;
  fields: Record<string, string>;
  previewVersion: number;
  configurationId?: string;
  dimensionPresetId?: string;
  dimensionLabel?: string;
  displayUnit?: "mm" | "cm" | "in";
  artwork?: ArtworkDocumentSnapshot;
  presentation?: {
    name: string;
    detail?: string;
    templateLabel: string;
    fontLabel: string;
    textColor: string;
    backgroundColor: string;
    packLabel: string;
    materialLabel: string;
  };
  quote?: {
    id: string;
    pricingVersion: string;
    calculatedAt: string;
    unitPricePaise: number;
  };
  /** Server-derived visual configuration retained with the immutable order snapshot. */
  visualization?: {
    schemaVersion: 1;
    previewMode: "3d";
    model: string;
    configurationVersion: string;
    dimensionPresetId: string;
    dimensionsMm: Record<string, number> | null;
    material: string;
    surfaceIds: string[];
    templateId?: string;
    templateVersion?: number;
    sourceAssetId?: string;
    surfaceMappings?: Array<{
      surfaceId: string;
      role: ProductVisualizationSurface["role"];
    }>;
  };
}

export type ArtworkFontFamily = "sans" | "serif" | "rounded";
export type ArtworkTextAlignment = "left" | "center" | "right";
export type ArtworkImageMimeType = "image/jpeg" | "image/png" | "image/webp";

export interface ArtworkGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

export interface ArtworkBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ArtworkEditPermissions {
  move: boolean;
  resize: boolean;
  rotate: boolean;
  color: boolean;
  font: boolean;
}

export interface ArtworkGeometryPolicy {
  default: ArtworkGeometry;
  minimumWidth: number;
  maximumWidth: number;
  minimumHeight: number;
  maximumHeight: number;
  minimumRotation: number;
  maximumRotation: number;
}

export interface ArtworkTextPolicy {
  enabled: boolean;
  maximumElements: number;
  permissions: ArtworkEditPermissions;
  geometry: ArtworkGeometryPolicy;
  defaultColor: string;
  allowedColors: string[];
  defaultFontFamily: ArtworkFontFamily;
  allowedFontFamilies: ArtworkFontFamily[];
  /** Optional for compatibility with policies saved before typography controls existed. */
  defaultFontSize?: number;
  minimumFontSize?: number;
  maximumFontSize?: number;
  defaultTextAlign?: ArtworkTextAlignment;
  allowedTextAlignments?: ArtworkTextAlignment[];
  defaultTextLayers?: Array<{
    label: string;
    sampleText: string;
    geometry: ArtworkGeometry;
    color: string;
    fontSize: number;
    fontFamily: ArtworkFontFamily;
    fontWeight: number;
    rotation: number;
    maxLength?: number;
  }>;
}

export interface ArtworkImagePolicy {
  enabled: boolean;
  required: boolean;
  maximumElements: number;
  permissions: ArtworkEditPermissions;
  geometry: ArtworkGeometryPolicy;
  allowedMimeTypes: ArtworkImageMimeType[];
  maximumBytes: number;
  minimumSourceWidth: number;
  maximumSourceWidth: number;
  minimumSourceHeight: number;
  maximumSourceHeight: number;
  /** Empty means any positive source aspect ratio. */
  allowedAspectRatios: number[];
  aspectRatioTolerance: number;
  allowTransparency: boolean;
  allowCrop: boolean;
  approvalRequired: boolean;
  /** Policy metadata for a future pricing rule; this validator never changes prices. */
  chargePerImagePaise: number;
  defaultImageLayers?: Array<{
    label: string;
    geometry: ArtworkGeometry;
  }>;
}

export interface ArtworkSurfacePolicy {
  id: string;
  label: string;
  coordinateSpace: { width: number; height: number };
  printableBounds: ArtworkBounds;
  text: ArtworkTextPolicy;
  image: ArtworkImagePolicy;
}

export interface ProductArtworkPolicy {
  maximumElements: number;
  surfaces: ArtworkSurfacePolicy[];
}

export interface ArtworkImageAssetReference {
  id: string;
  /** Required on checkout input; removed from persisted order snapshots after the asset is claimed. */
  claimToken?: string;
  mimeType: ArtworkImageMimeType;
  sizeBytes: number;
  width: number;
  height: number;
  hasTransparency?: boolean;
  sha256?: string;
}

export type ArtworkLayerSnapshot =
  | {
      id: string;
      type: "text";
      name: string;
      x: number;
      y: number;
      width: number;
      height: number;
      rotation: number;
      opacity: number;
      text: string;
      color: string;
      fontSize: number;
      fontFamily: ArtworkFontFamily;
      /** Missing in legacy snapshots means centered text. */
      textAlign?: ArtworkTextAlignment;
    }
  | {
      id: string;
      type: "image";
      name: string;
      x: number;
      y: number;
      width: number;
      height: number;
      rotation: number;
      opacity: number;
      /** Local preview. Persisted order snapshots may omit it once an asset is claimed. */
      src?: string;
      asset?: ArtworkImageAssetReference;
      sourceWidth: number;
      sourceHeight: number;
      imageFit?: "contain" | "cover" | "stretch";
      aspectLocked?: boolean;
    };

export interface ArtworkDocumentSnapshot {
  version: 1;
  activeSurfaceId: string;
  surfaces: Array<{
    id: string;
    label: string;
    layers: ArtworkLayerSnapshot[];
  }>;
  updatedAt: string;
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
  notes?: string;
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
