-- Additive category cross-listing. Product.categoryId remains the required
-- legacy/primary category for existing queries and integrations.
CREATE TABLE "ProductCategory" (
  "productId" TEXT NOT NULL,
  "categoryId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ProductCategory_pkey" PRIMARY KEY ("productId", "categoryId"),
  CONSTRAINT "ProductCategory_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ProductCategory_categoryId_fkey"
    FOREIGN KEY ("categoryId") REFERENCES "Category"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "ProductCategory_categoryId_productId_idx"
  ON "ProductCategory"("categoryId", "productId");

-- Every existing product starts with exactly one link to its legacy category.
-- The composite key makes the backfill incapable of duplicating products or links.
INSERT INTO "ProductCategory" ("productId", "categoryId")
SELECT product."id", product."categoryId"
FROM "Product" AS product
ON CONFLICT ("productId", "categoryId") DO NOTHING;
