import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, AuthenticationError, requireRequestActor } from "@/lib/auth-session";
import { readJson, validationError } from "@/lib/http";
import { onboardingApiError } from "@/lib/onboarding-api";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const slugify = (value: string) => value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const categorySchema = z.object({ type: z.literal("category"), name: z.string().trim().min(2).max(120), parentId: z.string().min(1).nullable().optional(), description: z.string().trim().max(1000).optional(), imageUrl: z.string().url().max(2000).optional(), isActive: z.boolean().default(true) });
const productSchema = z.object({ type: z.literal("product"), name: z.string().trim().min(2).max(180), sku: z.string().trim().min(2).max(80), categoryId: z.string().min(1), price: z.number().nonnegative(), description: z.string().trim().max(10_000).optional(), shortDescription: z.string().trim().max(400).optional(), imageUrl: z.string().url().max(2000), material: z.string().trim().max(160).optional(), sizes: z.array(z.string().trim().min(1).max(80)).max(30).default([]), sizeDescription: z.string().trim().max(240).optional(), features: z.array(z.string().trim().min(1).max(200)).max(30).default([]), customizable: z.boolean().default(false), published: z.boolean().default(false), allow2D: z.boolean().default(true), allow3D: z.boolean().default(true), quantityMin: z.number().int().min(1).max(1000).default(1), quantityMax: z.number().int().min(1).max(1000).default(100), productionDaysMin: z.number().int().min(0).max(365).default(0), productionDaysMax: z.number().int().min(0).max(365).default(0) }).refine((value) => value.productionDaysMax >= value.productionDaysMin && value.quantityMax >= value.quantityMin, { message: "Maximum values must be at least the corresponding minimum." });
const schema = z.discriminatedUnion("type", [categorySchema, productSchema]);

async function requireCatalogAdmin(request: Request) {
  const actor = await requireRequestActor(request, "catalog.manage");
  if (!actor.roles.includes("admin")) throw new AuthenticationError(403, "FORBIDDEN", "Super Admin access is required.");
  return actor;
}

export async function GET(request: Request) {
  try {
    await requireCatalogAdmin(request);
    const prisma = getPrisma();
    const [categories, products] = await Promise.all([prisma.category.findMany({ orderBy: { sortOrder: "asc" } }), prisma.product.findMany({ include: { category: true, variants: { include: { inventory: true } } }, orderBy: { updatedAt: "desc" } })]);
    return NextResponse.json({ data: { categories, products: products.map((product) => ({ id: product.id, name: product.name, category: product.category.name, sku: product.baseSku, price: product.basePricePaise / 100, stock: product.variants.reduce((total, variant) => total + (variant.inventory?.quantityOnHand ?? 0), 0), status: product.status === "ACTIVE" ? "Active" : product.status === "ARCHIVED" ? "Archived" : "Draft", personalized: product.customizable, art: "labels" })) } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return onboardingApiError(error); }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await requireCatalogAdmin(request);
    const parsed = schema.safeParse(await readJson(request));
    if (!parsed.success) return validationError(parsed.error);
    const prisma = getPrisma();
    if (parsed.data.type === "category") {
      const slug = slugify(parsed.data.name);
      const category = await prisma.category.create({ data: { name: parsed.data.name, slug, parentId: parsed.data.parentId ?? null, description: parsed.data.description, imageUrl: parsed.data.imageUrl, isActive: parsed.data.isActive, sortOrder: await prisma.category.count() } });
      return NextResponse.json({ data: category }, { status: 201 });
    }
    const input = parsed.data;
    const slug = `${slugify(input.name)}-${Date.now().toString(36)}`;
    const status = input.published ? "ACTIVE" : "DRAFT";
    const product = await prisma.product.create({ data: { categoryId: input.categoryId, name: input.name, slug, baseSku: input.sku, status, shortDescription: input.shortDescription ?? input.description ?? null, description: input.description ?? null, basePricePaise: Math.round(input.price * 100), customizable: input.customizable, material: input.material ?? null, dimensions: { display: input.sizeDescription || input.sizes.join(", ") || "Not specified" }, packSize: 1, productionDaysMin: input.productionDaysMin, productionDaysMax: input.productionDaysMax, tags: [], metadata: { artwork: "labels", sizes: input.sizes, features: input.features, colors: [], themes: [], configurator: { allow2D: input.allow2D, allow3D: input.allow3D, quantityMin: input.quantityMin, quantityMax: input.quantityMax, printAreas: [{ id: "primary", label: "Primary print area" }] } }, publishedAt: input.published ? new Date() : null, images: { create: { url: input.imageUrl, altText: input.name, sortOrder: 0 } }, variants: { create: { sku: input.sku, name: input.sizes[0] ?? "Standard", optionValues: { size: input.sizes[0] ?? null, material: input.material ?? null, color: null, packSize: 1 }, pricePaise: Math.round(input.price * 100), inventoryPolicy: "MADE_TO_ORDER", isActive: true, sortOrder: 0 } } } });
    return NextResponse.json({ data: product }, { status: 201 });
  } catch (error) { return onboardingApiError(error); }
}
