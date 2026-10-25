import "./load-env";

import { Prisma, PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

import { categories, designTemplates, products } from "../src/lib/data";
import { APPROVED_VENDOR_PERMISSIONS, VENDOR_APPLICANT_PERMISSIONS } from "../src/lib/vendor-permissions";

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) throw new Error("DATABASE_URL is required to seed the database.");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const asJson = (value: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

const permissionSeeds = [
  ["dashboard.read", "View operational dashboard metrics"],
  ["catalog.manage", "Create and update products, categories and variants"],
  ["templates.manage", "Manage personalization and production templates"],
  ["orders.read", "View orders and saved personalization"],
  ["orders.manage", "Update order and fulfillment state"],
  ["payments.manage", "Reconcile payments and eligible refunds"],
  ["customers.manage", "Manage customer records and support cases"],
  ["promotions.manage", "Manage coupons and promotional content"],
  ["settings.manage", "Manage store settings and integrations"],
  ["audit.read", "View administrative audit records"],
  ["vendors.manage", "Review vendors, service areas and operational eligibility"],
  ["vendors.review", "Inspect vendor applications and request corrections"],
  ["vendors.approve", "Approve, reject, suspend and reactivate vendors"],
  ["vendors.documents.read", "Read private vendor onboarding documents"],
  ["assignments.read", "Inspect marketplace assignment state and events"],
  ["assignments.manage", "Intervene in marketplace assignment and reassignment"],
  ["vendor.profile.manage", "Manage the authenticated vendor business profile"],
  ["vendor.offers.read", "View offers belonging to the authenticated vendor"],
  ["vendor.offers.respond", "Accept or decline offers belonging to the authenticated vendor"],
  ["vendor.orders.manage", "Update fulfilment for orders assigned to the authenticated vendor"],
  ["vendor.application.read", "Read the authenticated applicant's onboarding status"],
  ["vendor.application.update", "Correct the authenticated applicant's onboarding application"],
  ["vendor.documents.manage", "Upload and read the authenticated applicant's onboarding documents"],
] as const;

const roleSeeds = [
  {
    key: "admin",
    name: "Administrator",
    description: "Full store administration",
    permissions: permissionSeeds.map(([key]) => key),
  },
  {
    key: "production",
    name: "Production staff",
    description: "Artwork, production and fulfillment workflow",
    permissions: ["dashboard.read", "templates.manage", "orders.read", "orders.manage"],
  },
  {
    key: "support",
    name: "Customer support",
    description: "Customer, order and support resolution access",
    permissions: ["dashboard.read", "orders.read", "customers.manage"],
  },
  {
    key: "vendor_applicant",
    name: "Vendor applicant",
    description: "Restricted onboarding access before approval",
    permissions: [...VENDOR_APPLICANT_PERMISSIONS],
  },
  {
    key: "vendor",
    name: "Printing vendor",
    description: "Vendor-scoped profile, offer and assigned-order operations",
    permissions: [...APPROVED_VENDOR_PERMISSIONS],
  },
] as const;

const faqSeeds = [
  {
    id: "faq-customization",
    question: "How does personalization work?",
    answer:
      "Choose an eligible product, enter the requested details, select a design and review the preview before adding it to your cart.",
    category: "Customization",
    sortOrder: 1,
  },
  {
    id: "faq-preview",
    question: "Will the preview match the finished artwork?",
    answer:
      "The same saved personalization data should drive both preview and production output. Final color can vary slightly by material and screen settings; publish exact tolerances in the product specification.",
    category: "Customization",
    sortOrder: 2,
  },
  {
    id: "faq-production",
    question: "When will a personalized order be produced?",
    answer:
      "Production timing is shown on each product and starts only after payment and any required artwork approval. Configure live timings before launch.",
    category: "Orders",
    sortOrder: 3,
  },
  {
    id: "faq-returns",
    question: "Can a personalized item be returned?",
    answer:
      "Personalized items generally have different return conditions. Publish the merchant-approved policy and provide support for damaged, defective or incorrectly produced items.",
    category: "Returns",
    sortOrder: 4,
  },
];

async function seedAuthorization() {
  const permissionIds = new Map<string, string>();
  for (const [key, description] of permissionSeeds) {
    const permission = await prisma.permission.upsert({
      where: { key },
      update: { description },
      create: { key, description },
    });
    permissionIds.set(key, permission.id);
  }

  for (const roleSeed of roleSeeds) {
    const role = await prisma.role.upsert({
      where: { key: roleSeed.key },
      update: {
        name: roleSeed.name,
        description: roleSeed.description,
        system: true,
      },
      create: {
        key: roleSeed.key,
        name: roleSeed.name,
        description: roleSeed.description,
        system: true,
      },
    });

    const expectedPermissionIds = roleSeed.permissions.map((permissionKey) => {
      const permissionId = permissionIds.get(permissionKey);
      if (!permissionId) throw new Error(`Missing seeded permission ${permissionKey}`);
      return permissionId;
    });

    await prisma.rolePermission.deleteMany({
      where: {
        roleId: role.id,
        permissionId: { notIn: expectedPermissionIds },
      },
    });

    for (const permissionId of expectedPermissionIds) {
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId } },
        update: {},
        create: { roleId: role.id, permissionId },
      });
    }
  }
}

async function seedCatalog() {
  const categoryIds = new Map<string, string>();
  const productIds = new Map<string, string>();

  for (const category of categories) {
    const seededCategory = await prisma.category.upsert({
      where: { slug: category.slug },
      update: {
        name: category.name,
        description: category.description,
        imageUrl: category.image,
        sortOrder: category.sortOrder,
        isActive: true,
        seoTitle: `${category.name} | Naamly`,
        seoDescription: category.description,
      },
      create: {
        id: category.id,
        name: category.name,
        slug: category.slug,
        description: category.description,
        imageUrl: category.image,
        sortOrder: category.sortOrder,
        isActive: true,
        seoTitle: `${category.name} | Naamly`,
        seoDescription: category.description,
      },
    });
    categoryIds.set(category.id, seededCategory.id);
  }

  for (const product of products) {
    const category = categories.find((candidate) => candidate.slug === product.categorySlug);
    if (!category) throw new Error(`Missing category for ${product.slug}`);
    const categoryId = categoryIds.get(category.id);
    if (!categoryId) throw new Error(`Category was not seeded for ${product.slug}`);

    const seededProduct = await prisma.product.upsert({
      where: { slug: product.slug },
      update: {
        categoryId,
        name: product.name,
        baseSku: product.sku,
        status: "ACTIVE",
        shortDescription: product.shortDescription,
        description: product.description,
        basePricePaise: Math.round(product.price * 100),
        compareAtPricePaise: product.compareAtPrice
          ? Math.round(product.compareAtPrice * 100)
          : null,
        customizable: product.customizable,
        material: product.material,
        dimensions: asJson({ display: product.dimensions }),
        packSize: product.packSize,
        productionDaysMin: product.productionDays.min,
        productionDaysMax: product.productionDays.max,
        tags: product.tags,
        metadata: asJson({
          artwork: product.artwork,
          featured: product.featured,
          newArrival: product.newArrival,
          badge: product.badge ?? null,
          colors: product.colors ?? [],
          sizes: product.sizes ?? [],
          themes: product.themes ?? [],
          features: product.features,
          careInstructions: product.careInstructions ?? null,
        }),
        publishedAt: new Date("2026-10-01T00:00:00.000Z"),
      },
      create: {
        id: product.id,
        categoryId,
        name: product.name,
        slug: product.slug,
        baseSku: product.sku,
        status: "ACTIVE",
        shortDescription: product.shortDescription,
        description: product.description,
        basePricePaise: Math.round(product.price * 100),
        compareAtPricePaise: product.compareAtPrice
          ? Math.round(product.compareAtPrice * 100)
          : null,
        customizable: product.customizable,
        material: product.material,
        dimensions: asJson({ display: product.dimensions }),
        packSize: product.packSize,
        productionDaysMin: product.productionDays.min,
        productionDaysMax: product.productionDays.max,
        tags: product.tags,
        metadata: asJson({
          artwork: product.artwork,
          featured: product.featured,
          newArrival: product.newArrival,
          badge: product.badge ?? null,
          colors: product.colors ?? [],
          sizes: product.sizes ?? [],
          themes: product.themes ?? [],
          features: product.features,
          careInstructions: product.careInstructions ?? null,
        }),
        publishedAt: new Date("2026-10-01T00:00:00.000Z"),
      },
    });
    productIds.set(product.id, seededProduct.id);

    for (const [index, image] of product.images.entries()) {
      await prisma.productImage.upsert({
        where: { productId_sortOrder: { productId: seededProduct.id, sortOrder: index } },
        update: {
          url: image.src,
          altText: image.alt,
          width: image.width,
          height: image.height,
        },
        create: {
          id: image.id,
          productId: seededProduct.id,
          url: image.src,
          altText: image.alt,
          width: image.width,
          height: image.height,
          sortOrder: index,
        },
      });
    }

    for (const [index, variant] of product.variants.entries()) {
      const seededVariant = await prisma.productVariant.upsert({
        where: { sku: variant.sku },
        update: {
          productId: seededProduct.id,
          name: variant.name,
          optionValues: asJson({
            size: variant.size ?? null,
            color: variant.color ?? null,
            material: variant.material ?? null,
            packSize: variant.packSize ?? null,
          }),
          pricePaise: Math.round(variant.price * 100),
          compareAtPricePaise: variant.compareAtPrice
            ? Math.round(variant.compareAtPrice * 100)
            : null,
          inventoryPolicy:
            variant.stockStatus === "made_to_order" ? "MADE_TO_ORDER" : "DENY",
          isActive: variant.stockStatus !== "out_of_stock",
          sortOrder: index,
        },
        create: {
          id: variant.id,
          productId: seededProduct.id,
          sku: variant.sku,
          name: variant.name,
          optionValues: asJson({
            size: variant.size ?? null,
            color: variant.color ?? null,
            material: variant.material ?? null,
            packSize: variant.packSize ?? null,
          }),
          pricePaise: Math.round(variant.price * 100),
          compareAtPricePaise: variant.compareAtPrice
            ? Math.round(variant.compareAtPrice * 100)
            : null,
          inventoryPolicy:
            variant.stockStatus === "made_to_order" ? "MADE_TO_ORDER" : "DENY",
          isActive: variant.stockStatus !== "out_of_stock",
          sortOrder: index,
        },
      });

      const quantityOnHand =
        variant.stockStatus === "in_stock"
          ? 25
          : variant.stockStatus === "low_stock"
            ? 4
            : 0;
      await prisma.inventory.upsert({
        where: { variantId: seededVariant.id },
        // Seed reruns must not overwrite stock changed by real reservations, sales or receipts.
        update: { reorderPoint: 5 },
        create: { variantId: seededVariant.id, quantityOnHand, reorderPoint: 5 },
      });
    }

    for (const [index, field] of product.customizationFields.entries()) {
      await prisma.productPersonalizationField.upsert({
        where: { productId_key: { productId: seededProduct.id, key: field.id } },
        update: {
          label: field.label,
          inputType: field.type,
          isRequired: field.required,
          minLength: field.minLength ?? null,
          maxLength: field.maxLength ?? null,
          validation: field.allowedPattern
            ? asJson({ allowedPattern: field.allowedPattern })
            : Prisma.DbNull,
          optionConfig: field.options ? asJson({ options: field.options }) : Prisma.DbNull,
          sortOrder: index,
        },
        create: {
          productId: seededProduct.id,
          key: field.id,
          label: field.label,
          inputType: field.type,
          isRequired: field.required,
          minLength: field.minLength ?? null,
          maxLength: field.maxLength ?? null,
          validation: field.allowedPattern
            ? asJson({ allowedPattern: field.allowedPattern })
            : Prisma.DbNull,
          optionConfig: field.options ? asJson({ options: field.options }) : Prisma.DbNull,
          sortOrder: index,
        },
      });
    }
  }

  for (const template of designTemplates) {
    const seededTemplate = await prisma.personalizationTemplate.upsert({
      where: { slug: template.slug },
      update: {
        name: template.name,
        theme: template.theme,
        status: template.active ? "ACTIVE" : "ARCHIVED",
        description: template.description,
        thumbnailUrl: template.thumbnail,
        previewConfig: asJson(template.preview),
        productionConfig: asJson({
          renderer: "svg-v1",
          safeArea: template.preview.safeArea,
          fontScaling: { minPx: 24, maxPx: 72, overflow: "shrink-to-fit" },
        }),
        productionWidthPx: 1772,
        productionHeightPx: 591,
        productionDpi: 300,
        premiumPricePaise: Math.round(template.premiumPrice * 100),
        rightsReference: template.rightsStatement,
      },
      create: {
        id: template.id,
        name: template.name,
        slug: template.slug,
        theme: template.theme,
        status: template.active ? "ACTIVE" : "ARCHIVED",
        description: template.description,
        thumbnailUrl: template.thumbnail,
        previewConfig: asJson(template.preview),
        productionConfig: asJson({
          renderer: "svg-v1",
          safeArea: template.preview.safeArea,
          fontScaling: { minPx: 24, maxPx: 72, overflow: "shrink-to-fit" },
        }),
        productionWidthPx: 1772,
        productionHeightPx: 591,
        productionDpi: 300,
        premiumPricePaise: Math.round(template.premiumPrice * 100),
        rightsReference: template.rightsStatement,
      },
    });

    for (const sourceProductId of template.compatibleProductIds) {
      const productId = productIds.get(sourceProductId);
      const sourceProduct = products.find((candidate) => candidate.id === sourceProductId);
      if (!productId || !sourceProduct) {
        throw new Error(`Missing compatible product ${sourceProductId} for ${template.slug}`);
      }
      const sortOrder = sourceProduct.templateIds.indexOf(template.id);
      if (sortOrder < 0) {
        throw new Error(
          `Template compatibility is inconsistent for ${sourceProduct.slug} and ${template.slug}`,
        );
      }
      const isDefault = sortOrder === 0;

      await prisma.productTemplate.upsert({
        where: {
          productId_templateId: { productId, templateId: seededTemplate.id },
        },
        update: { sortOrder, isDefault },
        create: { productId, templateId: seededTemplate.id, sortOrder, isDefault },
      });
    }
  }
}

async function seedContentAndSettings() {
  await prisma.announcement.upsert({
    where: { id: "announcement-primary" },
    update: {
      message: "Personalized products made just for you | Explore our collection",
      href: "/products",
      isActive: true,
      sortOrder: 1,
    },
    create: {
      id: "announcement-primary",
      message: "Personalized products made just for you | Explore our collection",
      href: "/products",
      isActive: true,
      sortOrder: 1,
    },
  });

  const settings = [
    {
      key: "store.currency",
      value: { code: "INR", minorUnit: 2 },
      description: "Store currency and minor unit",
    },
    {
      key: "shipping.standard",
      value: { enabled: true, chargePaise: 7900, label: "Standard shipping" },
      description: "Demonstration shipping method; merchant must confirm before launch",
    },
    {
      key: "checkout.cod",
      value: { enabled: false },
      description: "Cash on delivery is disabled until explicitly configured",
    },
    {
      key: "reviews.display",
      value: { approvedOnly: true, verifiedBadgeRequiresOrderItem: true },
      description: "Truthful review display rules",
    },
  ];
  for (const setting of settings) {
    await prisma.storeSetting.upsert({
      where: { key: setting.key },
      update: { value: asJson(setting.value), description: setting.description },
      create: {
        key: setting.key,
        value: asJson(setting.value),
        description: setting.description,
      },
    });
  }

  for (const faq of faqSeeds) {
    await prisma.faq.upsert({
      where: { id: faq.id },
      update: { ...faq, isActive: true },
      create: { ...faq, isActive: true },
    });
  }
}

async function main() {
  await seedAuthorization();
  await seedCatalog();
  await seedContentAndSettings();
  console.info(
    `Seeded ${categories.length} categories, ${products.length} products and ${designTemplates.length} templates.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
