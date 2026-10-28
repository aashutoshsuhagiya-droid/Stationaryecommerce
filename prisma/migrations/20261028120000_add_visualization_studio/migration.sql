-- Versioned, administrator-owned product visualization templates.
CREATE TYPE "VisualizationTemplateStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');
CREATE TYPE "VisualizationJobStatus" AS ENUM ('QUEUED', 'PROCESSING', 'NEEDS_CONFIRMATION', 'SUCCEEDED', 'FAILED', 'CANCELLED');
CREATE TYPE "VisualizationAnalysisMode" AS ENUM ('MANUAL', 'EXTERNAL');
CREATE TYPE "VisualizationAssetKind" AS ENUM (
  'SOURCE_IMAGE',
  'PROCESSED_IMAGE',
  'PREVIEW_IMAGE',
  'TEXTURE',
  'MODEL_GLTF',
  'MODEL_GLB',
  'OTHER_GENERATED'
);
CREATE TYPE "VisualizationAssetStorage" AS ENUM ('DATABASE', 'PRIVATE_REFERENCE');

CREATE TABLE "VisualizationTemplate" (
  "id" TEXT NOT NULL,
  "familyKey" VARCHAR(120) NOT NULL,
  "version" INTEGER NOT NULL,
  "productId" TEXT,
  "sourceJobId" TEXT,
  "createdById" TEXT NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "slug" VARCHAR(180) NOT NULL,
  "description" TEXT,
  "productType" VARCHAR(120) NOT NULL,
  "status" "VisualizationTemplateStatus" NOT NULL DEFAULT 'DRAFT',
  "geometry" JSONB NOT NULL,
  "dimensions" JSONB NOT NULL,
  "surfaceMappings" JSONB NOT NULL,
  "materialSettings" JSONB,
  "previewCapabilities" JSONB,
  "manufacturingMetadata" JSONB,
  "publishedAt" TIMESTAMP(3),
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "VisualizationTemplate_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "VisualizationTemplate_version_check" CHECK ("version" >= 1)
);

CREATE TABLE "VisualizationAsset" (
  "id" TEXT NOT NULL,
  "productId" TEXT,
  "jobId" TEXT,
  "templateId" TEXT,
  "ownerUserId" TEXT NOT NULL,
  "kind" "VisualizationAssetKind" NOT NULL,
  "storage" "VisualizationAssetStorage" NOT NULL DEFAULT 'DATABASE',
  "originalName" VARCHAR(200),
  "mimeType" VARCHAR(120) NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "width" INTEGER,
  "height" INTEGER,
  "sha256" CHAR(64),
  "content" BYTEA,
  "privateRef" VARCHAR(2000),
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "VisualizationAsset_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "VisualizationAsset_size_check" CHECK ("sizeBytes" >= 0 AND "sizeBytes" <= 104857600),
  CONSTRAINT "VisualizationAsset_dimensions_check" CHECK (
    ("width" IS NULL OR ("width" > 0 AND "width" <= 50000))
    AND ("height" IS NULL OR ("height" > 0 AND "height" <= 50000))
  ),
  CONSTRAINT "VisualizationAsset_storage_check" CHECK (
    (
      "storage" = 'DATABASE'
      AND "content" IS NOT NULL
      AND "privateRef" IS NULL
    )
    OR
    (
      "storage" = 'PRIVATE_REFERENCE'
      AND "content" IS NULL
      AND "privateRef" IS NOT NULL
    )
  )
);

CREATE TABLE "VisualizationProcessingJob" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "sourceAssetId" TEXT NOT NULL,
  "templateId" TEXT,
  "requestedById" TEXT NOT NULL,
  "status" "VisualizationJobStatus" NOT NULL DEFAULT 'QUEUED',
  "analysisMode" "VisualizationAnalysisMode" NOT NULL DEFAULT 'MANUAL',
  "attempt" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 3,
  "providerName" VARCHAR(120),
  "providerRequestId" VARCHAR(160),
  "analysisResult" JSONB,
  "confirmation" JSONB,
  "errorCode" VARCHAR(100),
  "errorMessage" VARCHAR(500),
  "nextAttemptAt" TIMESTAMP(3),
  "lastAttemptAt" TIMESTAMP(3),
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "VisualizationProcessingJob_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "VisualizationProcessingJob_attempts_check" CHECK (
    "maxAttempts" BETWEEN 1 AND 5
    AND "attempt" BETWEEN 0 AND "maxAttempts"
  )
);

CREATE UNIQUE INDEX "VisualizationTemplate_familyKey_version_key"
  ON "VisualizationTemplate"("familyKey", "version");
CREATE INDEX "VisualizationTemplate_productId_status_updatedAt_idx"
  ON "VisualizationTemplate"("productId", "status", "updatedAt");
CREATE INDEX "VisualizationTemplate_status_updatedAt_idx"
  ON "VisualizationTemplate"("status", "updatedAt");
CREATE INDEX "VisualizationTemplate_sourceJobId_idx"
  ON "VisualizationTemplate"("sourceJobId");
CREATE INDEX "VisualizationTemplate_createdById_createdAt_idx"
  ON "VisualizationTemplate"("createdById", "createdAt");

CREATE INDEX "VisualizationAsset_productId_kind_createdAt_idx"
  ON "VisualizationAsset"("productId", "kind", "createdAt");
CREATE INDEX "VisualizationAsset_jobId_kind_idx"
  ON "VisualizationAsset"("jobId", "kind");
CREATE INDEX "VisualizationAsset_templateId_kind_idx"
  ON "VisualizationAsset"("templateId", "kind");
CREATE INDEX "VisualizationAsset_ownerUserId_createdAt_idx"
  ON "VisualizationAsset"("ownerUserId", "createdAt");
CREATE INDEX "VisualizationAsset_sha256_idx"
  ON "VisualizationAsset"("sha256");

CREATE INDEX "VisualizationProcessingJob_status_nextAttemptAt_createdAt_idx"
  ON "VisualizationProcessingJob"("status", "nextAttemptAt", "createdAt");
CREATE INDEX "VisualizationProcessingJob_productId_createdAt_idx"
  ON "VisualizationProcessingJob"("productId", "createdAt");
CREATE INDEX "VisualizationProcessingJob_requestedById_createdAt_idx"
  ON "VisualizationProcessingJob"("requestedById", "createdAt");
CREATE INDEX "VisualizationProcessingJob_sourceAssetId_idx"
  ON "VisualizationProcessingJob"("sourceAssetId");
CREATE INDEX "VisualizationProcessingJob_templateId_idx"
  ON "VisualizationProcessingJob"("templateId");

ALTER TABLE "VisualizationTemplate"
  ADD CONSTRAINT "VisualizationTemplate_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "VisualizationTemplate"
  ADD CONSTRAINT "VisualizationTemplate_sourceJobId_fkey"
  FOREIGN KEY ("sourceJobId") REFERENCES "VisualizationProcessingJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "VisualizationTemplate"
  ADD CONSTRAINT "VisualizationTemplate_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "VisualizationAsset"
  ADD CONSTRAINT "VisualizationAsset_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "VisualizationAsset"
  ADD CONSTRAINT "VisualizationAsset_jobId_fkey"
  FOREIGN KEY ("jobId") REFERENCES "VisualizationProcessingJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "VisualizationAsset"
  ADD CONSTRAINT "VisualizationAsset_templateId_fkey"
  FOREIGN KEY ("templateId") REFERENCES "VisualizationTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "VisualizationAsset"
  ADD CONSTRAINT "VisualizationAsset_ownerUserId_fkey"
  FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "VisualizationProcessingJob"
  ADD CONSTRAINT "VisualizationProcessingJob_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VisualizationProcessingJob"
  ADD CONSTRAINT "VisualizationProcessingJob_sourceAssetId_fkey"
  FOREIGN KEY ("sourceAssetId") REFERENCES "VisualizationAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VisualizationProcessingJob"
  ADD CONSTRAINT "VisualizationProcessingJob_templateId_fkey"
  FOREIGN KEY ("templateId") REFERENCES "VisualizationTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "VisualizationProcessingJob"
  ADD CONSTRAINT "VisualizationProcessingJob_requestedById_fkey"
  FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
