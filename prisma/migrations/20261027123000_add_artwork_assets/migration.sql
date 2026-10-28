-- Private, original customer artwork. Assets are never exposed through a public URL;
-- a high-entropy claim token is stored only as a SHA-256 hash and consumed when the
-- corresponding order item is created.
CREATE TYPE "ArtworkAssetStatus" AS ENUM ('UPLOADED', 'ATTACHED', 'APPROVED', 'REJECTED');

CREATE TABLE "ArtworkAsset" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "orderItemId" TEXT,
  "ownerUserId" TEXT,
  "surfaceId" VARCHAR(80) NOT NULL,
  "claimTokenHash" CHAR(64) NOT NULL,
  "originalName" VARCHAR(200) NOT NULL,
  "mimeType" VARCHAR(100) NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "width" INTEGER NOT NULL,
  "height" INTEGER NOT NULL,
  "hasTransparency" BOOLEAN NOT NULL DEFAULT false,
  "sha256" CHAR(64) NOT NULL,
  "content" BYTEA NOT NULL,
  "status" "ArtworkAssetStatus" NOT NULL DEFAULT 'UPLOADED',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "attachedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ArtworkAsset_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ArtworkAsset_size_check" CHECK ("sizeBytes" > 0 AND "sizeBytes" <= 20971520),
  CONSTRAINT "ArtworkAsset_dimensions_check" CHECK ("width" > 0 AND "width" <= 50000 AND "height" > 0 AND "height" <= 50000)
);

CREATE UNIQUE INDEX "ArtworkAsset_claimTokenHash_key" ON "ArtworkAsset"("claimTokenHash");
CREATE INDEX "ArtworkAsset_productId_surfaceId_status_idx" ON "ArtworkAsset"("productId", "surfaceId", "status");
CREATE INDEX "ArtworkAsset_orderItemId_idx" ON "ArtworkAsset"("orderItemId");
CREATE INDEX "ArtworkAsset_ownerUserId_createdAt_idx" ON "ArtworkAsset"("ownerUserId", "createdAt");
CREATE INDEX "ArtworkAsset_status_expiresAt_idx" ON "ArtworkAsset"("status", "expiresAt");
CREATE INDEX "ArtworkAsset_sha256_idx" ON "ArtworkAsset"("sha256");

ALTER TABLE "ArtworkAsset" ADD CONSTRAINT "ArtworkAsset_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ArtworkAsset" ADD CONSTRAINT "ArtworkAsset_orderItemId_fkey"
  FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ArtworkAsset" ADD CONSTRAINT "ArtworkAsset_ownerUserId_fkey"
  FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
