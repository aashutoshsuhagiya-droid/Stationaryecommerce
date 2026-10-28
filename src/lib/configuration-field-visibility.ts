import type { CustomizationField } from "./types";

/**
 * Keeps product-option visibility identical in the admin-configured storefront
 * and the server-side quote path. Fields default to visible/enabled so older
 * catalog records retain their existing behavior.
 */
export function isConfigurationFieldVisible(
  field: CustomizationField,
  values: Record<string, string>,
) {
  if (field.enabled === false || field.customerVisible === false) return false;
  if (!field.visibleWhen) return true;
  return values[field.visibleWhen.fieldId] === field.visibleWhen.equals;
}

export function visibleConfigurationFields(
  fields: readonly CustomizationField[],
  values: Record<string, string>,
) {
  return fields.filter((field) => isConfigurationFieldVisible(field, values));
}

export function initialConfigurationFieldValue(field: CustomizationField) {
  if (field.defaultValue !== undefined) return field.defaultValue;
  if (field.options?.length) return field.options[0].value;
  if (field.type === "color") return "#111418";
  return "";
}
