import { createHash, randomUUID } from "node:crypto";

import { CommerceError } from "./commerce-error";
import { designTemplates, getProductById, products } from "./data";
import type { CurrencyCode, Product } from "./types";
import type { CatalogQuoteInput, OrderItemInput } from "./validation";

export interface CatalogPriceAdjustment {
  type: "template_premium";
  referenceId: string;
  label: string;
  amountPaise: number;
}

export interface AuthoritativePriceLine {
  productId: string;
  variantId: string;
  productName: string;
  productSlug: string;
  sku: string;
  image: string;
  quantity: number;
  baseUnitPricePaise: number;
  adjustments: CatalogPriceAdjustment[];
  unitPricePaise: number;
  lineTotalPaise: number;
  productSnapshot: {
    name: string;
    sku: string;
    variantName: string;
    material: string;
    dimensions: string;
  };
}

export interface CatalogQuote {
  quoteId: string;
  pricingVersion: string;
  currency: CurrencyCode;
  items: AuthoritativePriceLine[];
  subtotalPaise: number;
  discountPaise: 0;
  shippingPaise: null;
  taxPaise: null;
  totalPaise: null;
  calculatedAt: string;
  requiresCheckoutRevalidation: true;
}

const toPaise = (rupees: number) => Math.round(rupees * 100);

export function getCatalogPricingVersion() {
  const rateSource = {
    products: products.map((product) => ({
      id: product.id,
      variants: product.variants.map((variant) => ({ id: variant.id, price: variant.price })),
    })),
    templates: designTemplates.map((template) => ({
      id: template.id,
      active: template.active,
      premiumPrice: template.premiumPrice,
      compatibleProductIds: template.compatibleProductIds,
    })),
  };
  return `catalog-${createHash("sha256").update(JSON.stringify(rateSource)).digest("hex").slice(0, 16)}`;
}

function validateCustomization(product: Product, input: OrderItemInput) {
  const customization = input.customization;
  if (!product.customizable && customization) {
    throw new CommerceError(
      422,
      "CUSTOMIZATION_NOT_SUPPORTED",
      `${product.name} does not accept personalization.`,
      { productId: product.id },
    );
  }

  const previewImageCount = customization?.artwork?.surfaces.reduce(
    (total, surface) => total + surface.layers.filter((layer) => layer.type === "image").length,
    0,
  ) ?? 0;
  if (previewImageCount > 0) {
    throw new CommerceError(
      422,
      "ARTWORK_UPLOAD_NOT_SUPPORTED",
      "Uploaded preview images cannot be attached to an order until secure artwork storage is configured.",
      { productId: product.id, imageCount: previewImageCount },
    );
  }

  const personalizedName = customization?.fields.name?.trim();
  const nameLayers = customization?.artwork?.surfaces
    .flatMap((surface) => surface.layers)
    .filter((layer) => layer.id === "personalization-name") ?? [];
  if (personalizedName && customization?.artwork) {
    const savedArtworkName = nameLayers.length === 1 && nameLayers[0].type === "text"
      ? nameLayers[0].text.trim()
      : undefined;
    if (savedArtworkName !== personalizedName) {
      throw new CommerceError(
        422,
        "ARTWORK_PERSONALIZATION_MISMATCH",
        "The saved artwork name does not match the validated personalization.",
        { productId: product.id, fieldId: "name" },
      );
    }
  }
  const expectedArtworkFont = customization?.fields.font === "clean"
    ? "sans"
    : customization?.fields.font;
  if (
    expectedArtworkFont &&
    nameLayers.length === 1 &&
    nameLayers[0].type === "text" &&
    nameLayers[0].fontFamily !== expectedArtworkFont
  ) {
    throw new CommerceError(
      422,
      "ARTWORK_FONT_MISMATCH",
      "The saved artwork font does not match the validated personalization.",
      { productId: product.id, fieldId: "font" },
    );
  }
  if (
    personalizedName &&
    customization?.presentation &&
    customization.presentation.name.trim() !== personalizedName
  ) {
    throw new CommerceError(
      422,
      "PRESENTATION_PERSONALIZATION_MISMATCH",
      "The order summary name does not match the validated personalization.",
      { productId: product.id, fieldId: "name" },
    );
  }

  const supportedFieldIds = new Set(
    product.customizationFields
      .filter((field) => field.type !== "template")
      .map((field) => field.id),
  );
  const unsupportedFieldIds = Object.keys(customization?.fields ?? {}).filter(
    (fieldId) => !supportedFieldIds.has(fieldId),
  );
  if (unsupportedFieldIds.length > 0) {
    throw new CommerceError(
      422,
      "CUSTOMIZATION_FIELDS_INVALID",
      "The customization contains fields that are not available for this product.",
      { productId: product.id, fieldIds: unsupportedFieldIds },
    );
  }

  const requiredFields = product.customizationFields.filter(
    (field) => field.required && field.type !== "template",
  );
  if (requiredFields.length > 0 && !customization) {
    throw new CommerceError(
      422,
      "CUSTOMIZATION_REQUIRED",
      `Personalization is required for ${product.name}.`,
      { productId: product.id },
    );
  }

  const requiresTemplate = product.customizationFields.some(
    (field) => field.required && field.type === "template",
  );
  if (requiresTemplate && !customization?.templateId) {
    throw new CommerceError(
      422,
      "TEMPLATE_REQUIRED",
      `Choose a design for ${product.name}.`,
      { productId: product.id },
    );
  }

  const adjustments: CatalogPriceAdjustment[] = [];
  if (customization?.templateId) {
    const template = designTemplates.find((candidate) => candidate.id === customization.templateId);
    if (
      !template ||
      !template.active ||
      !product.templateIds.includes(template.id) ||
      !template.compatibleProductIds.includes(product.id)
    ) {
      throw new CommerceError(
        422,
        "INVALID_TEMPLATE",
        "The selected design is not available for this product.",
        { productId: product.id, templateId: customization.templateId },
      );
    }
    const amountPaise = toPaise(template.premiumPrice);
    if (amountPaise > 0) {
      adjustments.push({
        type: "template_premium",
        referenceId: template.id,
        label: template.name,
        amountPaise,
      });
    }
  }

  for (const field of product.customizationFields) {
    if (field.type === "template") continue;
    const rawValue = customization?.fields[field.id] ?? "";
    const value = rawValue.trim();

    if (field.required && !value) {
      throw new CommerceError(
        422,
        "CUSTOMIZATION_FIELD_REQUIRED",
        `${field.label} is required for ${product.name}.`,
        { productId: product.id, fieldId: field.id },
      );
    }
    if (!value) continue;

    if (field.minLength && value.length < field.minLength) {
      throw new CommerceError(422, "CUSTOMIZATION_TOO_SHORT", `${field.label} is too short.`, {
        productId: product.id,
        fieldId: field.id,
        minLength: field.minLength,
      });
    }
    if (field.maxLength && value.length > field.maxLength) {
      throw new CommerceError(422, "CUSTOMIZATION_TOO_LONG", `${field.label} is too long.`, {
        productId: product.id,
        fieldId: field.id,
        maxLength: field.maxLength,
      });
    }
    if (field.allowedPattern && !new RegExp(field.allowedPattern, "u").test(value)) {
      throw new CommerceError(
        422,
        "CUSTOMIZATION_UNSUPPORTED_CHARACTERS",
        `${field.label} contains unsupported characters.`,
        { productId: product.id, fieldId: field.id },
      );
    }
    if (field.options?.length && !field.options.some((option) => option.value === value)) {
      throw new CommerceError(
        422,
        "CUSTOMIZATION_OPTION_INVALID",
        `${field.label} is not an available option.`,
        { productId: product.id, fieldId: field.id },
      );
    }
  }

  return adjustments;
}

export function priceCatalogItem(input: OrderItemInput): AuthoritativePriceLine {
  const product = getProductById(input.productId);
  if (!product) {
    throw new CommerceError(404, "PRODUCT_NOT_FOUND", "One of the selected products no longer exists.", {
      productId: input.productId,
    });
  }

  const variant = product.variants.find((candidate) => candidate.id === input.variantId);
  if (!variant) {
    throw new CommerceError(422, "VARIANT_NOT_FOUND", "The selected product option is unavailable.", {
      productId: product.id,
      variantId: input.variantId,
    });
  }
  if (variant.stockStatus === "out_of_stock") {
    throw new CommerceError(409, "OUT_OF_STOCK", `${variant.name} is currently unavailable.`, {
      productId: product.id,
      variantId: variant.id,
    });
  }

  const adjustments = validateCustomization(product, input);
  const baseUnitPricePaise = toPaise(variant.price);
  const unitPricePaise = adjustments.reduce(
    (total, adjustment) => total + adjustment.amountPaise,
    baseUnitPricePaise,
  );

  return {
    productId: product.id,
    variantId: variant.id,
    productName: product.name,
    productSlug: product.slug,
    sku: variant.sku,
    image: product.image,
    quantity: input.quantity,
    baseUnitPricePaise,
    adjustments,
    unitPricePaise,
    lineTotalPaise: unitPricePaise * input.quantity,
    productSnapshot: {
      name: product.name,
      sku: variant.sku,
      variantName: variant.name,
      material: variant.material ?? product.material,
      dimensions: product.dimensions,
    },
  };
}

export function createCatalogQuote(input: CatalogQuoteInput): CatalogQuote {
  const items = input.items.map(priceCatalogItem);
  return {
    quoteId: randomUUID(),
    pricingVersion: getCatalogPricingVersion(),
    currency: "INR",
    items,
    subtotalPaise: items.reduce((total, item) => total + item.lineTotalPaise, 0),
    discountPaise: 0,
    shippingPaise: null,
    taxPaise: null,
    totalPaise: null,
    calculatedAt: new Date().toISOString(),
    requiresCheckoutRevalidation: true,
  };
}
