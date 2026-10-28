import { createHash, randomUUID } from "node:crypto";

import { CommerceError } from "./commerce-error";
import { resolveProductArtworkPolicy, validateArtworkDocumentPolicy } from "./artwork-policy";
import { isConfigurationFieldVisible } from "./configuration-field-visibility";
import { getProductById, products } from "./data";
import { resolveProductTemplate, resolveProductTemplateLinks } from "./product-template-resolution";
import type { CurrencyCode, Product } from "./types";
import type { CatalogQuoteInput, OrderItemInput } from "./validation";

export interface CatalogPriceAdjustment {
  type: "template_premium" | "field_price_delta" | "option_price_delta" | "artwork_image" | "quantity_tier" | "setup_charge";
  scope: "unit" | "line";
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
      fields: product.customizationFields.map((field) => ({
        id: field.id,
        priceDelta: field.priceDelta ?? 0,
        defaultValue: field.defaultValue,
        enabled: field.enabled !== false,
        customerVisible: field.customerVisible !== false,
        visibleWhen: field.visibleWhen,
        options: field.options?.map((option) => ({ value: option.value, priceDelta: option.priceDelta ?? 0 })) ?? [],
      })),
      quantityTiers: product.configurator?.quantityTiers ?? [],
      setupCharge: product.configurator?.setupCharge ?? 0,
      artworkPolicy: product.configurator?.artworkPolicy,
    })),
    templates: products.flatMap((product) => resolveProductTemplateLinks(product).map(({ template, isDefault, sortOrder }) => ({ productId: product.id, id: template.id, active: template.active, premiumPrice: template.premiumPrice, isDefault, sortOrder }))),
  };
  return `catalog-${createHash("sha256").update(JSON.stringify(rateSource)).digest("hex").slice(0, 16)}`;
}

function validateCustomization(product: Product, input: OrderItemInput) {
  const customization = input.customization;
  const artworkPolicy = resolveProductArtworkPolicy(product);
  if (!product.customizable && customization) {
    throw new CommerceError(
      422,
      "CUSTOMIZATION_NOT_SUPPORTED",
      `${product.name} does not accept personalization.`,
      { productId: product.id },
    );
  }

  if (customization?.artwork) {
    const artworkIssues = validateArtworkDocumentPolicy(
      customization.artwork,
      artworkPolicy,
    );
    const firstIssue = artworkIssues[0];
    if (firstIssue) {
      const isSurfaceIssue = firstIssue.code === "SURFACE_NOT_ALLOWED" || firstIssue.code === "ACTIVE_SURFACE_NOT_ALLOWED";
      const isBlockedUpload = firstIssue.code === "LAYER_TYPE_NOT_ALLOWED" && customization.artwork.surfaces
        .some((surface) => surface.layers.some((layer) => layer.id === firstIssue.layerId && layer.type === "image"));
      throw new CommerceError(
        422,
        isSurfaceIssue
          ? "ARTWORK_SURFACE_INVALID"
          : isBlockedUpload
            ? "ARTWORK_UPLOAD_NOT_SUPPORTED"
            : `ARTWORK_${firstIssue.code}`,
        firstIssue.message,
        { productId: product.id, issues: artworkIssues },
      );
    }
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

  const configurationFields = product.customizationFields.filter(
    (field) => field.type !== "template",
  );
  const submittedFieldValues = customization?.fields ?? {};
  const fieldValues = Object.fromEntries(
    configurationFields.map((field) => [
      field.id,
      submittedFieldValues[field.id] ?? field.defaultValue ?? "",
    ]),
  );
  const supportedFieldIds = new Set(
    configurationFields
      .filter((field) => isConfigurationFieldVisible(field, fieldValues))
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

  const requiredFields = configurationFields.filter(
    (field) => field.required && isConfigurationFieldVisible(field, fieldValues),
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
  if (customization?.artwork) {
    const surfacePolicies = new Map(artworkPolicy.surfaces.map((surface) => [surface.id, surface]));
    for (const surface of customization.artwork.surfaces) {
      const surfacePolicy = surfacePolicies.get(surface.id);
      const imageCount = surface.layers.filter((layer) => layer.type === "image").length;
      const chargePerImagePaise = surfacePolicy?.image.chargePerImagePaise ?? 0;
      if (!Number.isSafeInteger(chargePerImagePaise) || chargePerImagePaise < 0) {
        throw new CommerceError(500, "CATALOG_CONFIGURATION_INVALID", "This product has an invalid artwork image charge.", {
          productId: product.id,
          surfaceId: surface.id,
        });
      }
      if (imageCount > 0 && chargePerImagePaise > 0) {
        adjustments.push({
          type: "artwork_image",
          scope: "line",
          referenceId: `artwork-image:${surface.id}`,
          label: `${surfacePolicy?.label ?? surface.label} artwork image${imageCount === 1 ? "" : "s"}`,
          amountPaise: chargePerImagePaise * imageCount,
        });
      }
    }
  }
  if (customization?.templateId) {
    const template = resolveProductTemplate(product, customization.templateId);
    if (!template) {
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
        scope: "unit",
        referenceId: template.id,
        label: template.name,
        amountPaise,
      });
    }
  }

  for (const field of configurationFields) {
    if (!isConfigurationFieldVisible(field, fieldValues)) continue;
    const rawValue = fieldValues[field.id] ?? "";
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

    if (field.type === "number") {
      const numericValue = Number(value);
      if (!Number.isFinite(numericValue)) {
        throw new CommerceError(422, "CUSTOMIZATION_NUMBER_INVALID", `${field.label} must be a valid number.`, {
          productId: product.id,
          fieldId: field.id,
        });
      }
      if (field.minValue !== undefined && numericValue < field.minValue) {
        throw new CommerceError(422, "CUSTOMIZATION_NUMBER_TOO_SMALL", `${field.label} must be at least ${field.minValue}.`, {
          productId: product.id,
          fieldId: field.id,
          minValue: field.minValue,
        });
      }
      if (field.maxValue !== undefined && numericValue > field.maxValue) {
        throw new CommerceError(422, "CUSTOMIZATION_NUMBER_TOO_LARGE", `${field.label} must be at most ${field.maxValue}.`, {
          productId: product.id,
          fieldId: field.id,
          maxValue: field.maxValue,
        });
      }
      if (field.step && field.minValue !== undefined) {
        const increments = (numericValue - field.minValue) / field.step;
        if (Math.abs(increments - Math.round(increments)) > 1e-8) {
          throw new CommerceError(422, "CUSTOMIZATION_NUMBER_STEP_INVALID", `${field.label} must use increments of ${field.step}.`, {
            productId: product.id,
            fieldId: field.id,
            step: field.step,
          });
        }
      }
    }
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
    const selectedOption = field.options?.find((option) => option.value === value);
    if (field.options?.length && !selectedOption) {
      throw new CommerceError(
        422,
        "CUSTOMIZATION_OPTION_INVALID",
        `${field.label} is not an available option.`,
        { productId: product.id, fieldId: field.id },
      );
    }
    const fieldAdjustmentPaise = toPaise(field.priceDelta ?? 0);
    if (fieldAdjustmentPaise !== 0) {
      adjustments.push({
        type: "field_price_delta",
        scope: "unit",
        referenceId: field.id,
        label: field.label,
        amountPaise: fieldAdjustmentPaise,
      });
    }
    const optionAdjustmentPaise = toPaise(selectedOption?.priceDelta ?? 0);
    if (selectedOption && optionAdjustmentPaise !== 0) {
      adjustments.push({
        type: "option_price_delta",
        scope: "unit",
        referenceId: `${field.id}:${selectedOption.value}`,
        label: `${field.label}: ${selectedOption.label}`,
        amountPaise: optionAdjustmentPaise,
      });
    }
  }

  return adjustments;
}

export function priceProductItem(product: Product, input: OrderItemInput): AuthoritativePriceLine {
  if (product.id !== input.productId) {
    throw new CommerceError(422, "PRODUCT_MISMATCH", "The selected product does not match the pricing request.", {
      productId: input.productId,
    });
  }
  const minimumQuantity = product.configurator?.quantityMin ?? 1;
  const maximumQuantity = Math.max(minimumQuantity, product.configurator?.quantityMax ?? 100);
  if (input.quantity < minimumQuantity || input.quantity > maximumQuantity) {
    throw new CommerceError(
      422,
      "QUANTITY_OUT_OF_RANGE",
      `${product.name} must be ordered in quantities from ${minimumQuantity} to ${maximumQuantity}.`,
      { productId: product.id, minimumQuantity, maximumQuantity, quantity: input.quantity },
    );
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
  const quantityTier = product.configurator?.quantityTiers
    ?.filter((tier) => input.quantity >= tier.minimum)
    .sort((left, right) => right.minimum - left.minimum)[0];
  if (quantityTier) {
    const amountPaise = toPaise(quantityTier.priceDelta);
    if (amountPaise !== 0) {
      adjustments.push({
        type: "quantity_tier",
        scope: "unit",
        referenceId: `quantity-${quantityTier.minimum}`,
        label: quantityTier.label || `${quantityTier.minimum}+ units`,
        amountPaise,
      });
    }
  }
  const setupCharge = product.configurator?.setupCharge ?? 0;
  if (!Number.isFinite(setupCharge) || setupCharge < 0) {
    throw new CommerceError(500, "CATALOG_CONFIGURATION_INVALID", "This product has an invalid setup charge.", { productId: product.id });
  }
  const setupChargePaise = toPaise(setupCharge);
  if (setupChargePaise > 0) {
    adjustments.push({
      type: "setup_charge",
      scope: "line",
      referenceId: "setup-charge",
      label: "Setup charge",
      amountPaise: setupChargePaise,
    });
  }
  const baseUnitPricePaise = toPaise(variant.price);
  const unitPricePaise = adjustments.filter((adjustment) => adjustment.scope === "unit").reduce(
    (total, adjustment) => total + adjustment.amountPaise,
    baseUnitPricePaise,
  );
  if (unitPricePaise < 0) {
    throw new CommerceError(422, "CONFIGURATION_PRICE_INVALID", "Configured option pricing cannot make this product price negative.", {
      productId: product.id,
      variantId: variant.id,
    });
  }

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
    lineTotalPaise: unitPricePaise * input.quantity + adjustments.filter((adjustment) => adjustment.scope === "line").reduce((total, adjustment) => total + adjustment.amountPaise, 0),
    productSnapshot: {
      name: product.name,
      sku: variant.sku,
      variantName: variant.name,
      material: variant.material ?? product.material,
      dimensions: product.dimensions,
    },
  };
}

export function priceCatalogItem(input: OrderItemInput): AuthoritativePriceLine {
  const product = getProductById(input.productId);
  if (!product) {
    throw new CommerceError(404, "PRODUCT_NOT_FOUND", "One of the selected products no longer exists.", {
      productId: input.productId,
    });
  }
  return priceProductItem(product, input);
}

export function createQuoteFromPricedItems(items: AuthoritativePriceLine[], pricingVersion: string): CatalogQuote {
  return {
    quoteId: randomUUID(),
    pricingVersion,
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

export function createCatalogQuote(input: CatalogQuoteInput): CatalogQuote {
  return createQuoteFromPricedItems(input.items.map(priceCatalogItem), getCatalogPricingVersion());
}
