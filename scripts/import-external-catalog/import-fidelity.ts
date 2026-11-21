/**
 * Fidelity-completion entry point for the external catalog import.
 *
 * The fidelity pass (personalization fields, bulk tiers, stock parity, tax, SEO,
 * EzPac structured copy) lives inside the one idempotent importer; this entry
 * exists so `npm run import:external-catalog:fidelity|dry-run|offline` share the
 * exact same code path and flags as `import:external-catalog`.
 */
import "./import";
