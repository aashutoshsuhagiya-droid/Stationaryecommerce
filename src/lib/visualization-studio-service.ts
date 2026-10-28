import { getPrisma } from "@/lib/prisma";
import type { PreparedArtworkUpload } from "@/lib/artwork-upload";
import {
  analyzeVisualizationSource,
  getPublicVisualizationAnalyzerState,
  getVisualizationAnalyzerConfiguration,
} from "@/lib/visualization-studio-analyzer";
import {
  canRetryVisualizationJob,
  dimensionsInMillimetres,
  nextVisualizationTemplateVersion,
  visualizationConfirmationSchema,
  visualizationFamilyKey,
  visualizationTemplateInputSchema,
  VisualizationStudioError,
  type VisualizationAnalysisModeInput,
  type VisualizationConfirmation,
  type VisualizationDimensions,
  type VisualizationTemplateInput,
} from "@/lib/visualization-studio-domain";
import {
  activateVisualizationProductMetadata,
  deactivateVisualizationProductMetadata,
  generatedVisualizationAssetKind,
  resolveVisualizationProductModel,
  publicVisualizationAnalysis,
  serializeVisualizationJob,
  serializeVisualizationTemplate,
  visualizationRuntimeDescriptor,
  visualizationTemplateIsActive,
  visualizationIsoDate,
} from "@/lib/visualization-studio-service-policy";

type UntypedPrisma = any;

const studioInclude = {
  product: { select: { id: true, name: true, slug: true, status: true } },
  sourceAsset: {
    select: {
      id: true, kind: true, storage: true, originalName: true, mimeType: true,
      sizeBytes: true, width: true, height: true, createdAt: true,
    },
  },
  assets: {
    select: {
      id: true, kind: true, storage: true, originalName: true, mimeType: true,
      sizeBytes: true, width: true, height: true, createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  },
} as const;

function studioPrisma(): UntypedPrisma {
  // The generated client is refreshed by the normal build/install lifecycle. Keeping this
  // module structural lets an additive migration land without checking generated files in.
  return getPrisma() as UntypedPrisma;
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function resolvedAnalysisMode(mode: VisualizationAnalysisModeInput) {
  if (mode === "manual") return "MANUAL" as const;
  if (mode === "external") return "EXTERNAL" as const;
  return getVisualizationAnalyzerConfiguration().configured ? "EXTERNAL" as const : "MANUAL" as const;
}

export async function listVisualizationStudioState(productId?: string) {
  const prisma = studioPrisma();
  const productWhere = productId ? { id: productId } : undefined;
  const studioWhere = productId ? { productId } : undefined;
  const [products, templates, jobs, libraryTemplates] = await Promise.all([
    prisma.product.findMany({
      where: productWhere,
      select: {
        id: true, name: true, slug: true, status: true, customizable: true,
        material: true, dimensions: true, updatedAt: true,
      },
      orderBy: [{ status: "asc" }, { name: "asc" }],
      take: 500,
    }),
    prisma.visualizationTemplate.findMany({
      where: studioWhere,
      include: { product: { select: { id: true, name: true, slug: true } } },
      orderBy: { updatedAt: "desc" },
      take: 100,
    }),
    prisma.visualizationProcessingJob.findMany({
      where: studioWhere,
      include: studioInclude,
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.visualizationTemplate.findMany({
      where: { status: "PUBLISHED" },
      include: { product: { select: { id: true, name: true, slug: true } } },
      orderBy: [{ publishedAt: "desc" }, { updatedAt: "desc" }],
      take: 100,
    }),
  ]);
  return {
    products: products.map((product: any) => ({
      ...product,
      updatedAt: visualizationIsoDate(product.updatedAt),
    })),
    templates: templates.map(serializeVisualizationTemplate),
    jobs: jobs.map(serializeVisualizationJob),
    libraryTemplates: libraryTemplates.map(serializeVisualizationTemplate),
    analyzer: getPublicVisualizationAnalyzerState(),
  };
}

/**
 * Makes the database-backed queue recoverable after a process restart. Admin
 * reads schedule pending work again, while stale claimed jobs become explicit
 * failures that can use the normal bounded retry flow.
 */
export async function recoverVisualizationQueue(productId?: string) {
  const prisma = studioPrisma();
  const now = new Date();
  const staleBefore = new Date(now.getTime() - 2 * 60 * 1_000);
  await prisma.visualizationProcessingJob.updateMany({
    where: {
      status: "PROCESSING",
      ...(productId ? { productId } : {}),
      OR: [
        { lastAttemptAt: { lt: staleBefore } },
        { lastAttemptAt: null, startedAt: { lt: staleBefore } },
      ],
    },
    data: {
      status: "FAILED",
      errorCode: "VISUALIZATION_PROCESS_INTERRUPTED",
      errorMessage: "Processing was interrupted. Retry the job to continue.",
      completedAt: now,
    },
  });

  const queued = await prisma.visualizationProcessingJob.findMany({
    where: {
      status: "QUEUED",
      ...(productId ? { productId } : {}),
      OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
    },
    select: { id: true, attempt: true, maxAttempts: true },
    orderBy: { createdAt: "asc" },
    take: 20,
  });
  const exhausted = queued.filter((job: any) => job.attempt >= job.maxAttempts).map((job: any) => job.id);
  if (exhausted.length) {
    await prisma.visualizationProcessingJob.updateMany({
      where: { id: { in: exhausted }, status: "QUEUED" },
      data: {
        status: "FAILED",
        errorCode: "VISUALIZATION_RETRY_LIMIT_REACHED",
        errorMessage: "The visualization retry limit was reached.",
        completedAt: now,
      },
    });
  }
  return queued
    .filter((job: any) => job.attempt < job.maxAttempts)
    .slice(0, 10)
    .map((job: any) => job.id as string);
}

export interface StartVisualizationAnalysisInput {
  actorId: string;
  productId: string;
  upload: PreparedArtworkUpload;
  analysisMode: VisualizationAnalysisModeInput;
  productType?: string;
  geometryKind?: "box" | "cylinder" | "plane" | "bag" | "pouch" | "label" | "custom";
  dimensions?: VisualizationDimensions;
}

export async function startVisualizationAnalysis(input: StartVisualizationAnalysisInput) {
  const prisma = studioPrisma();
  const product = await prisma.product.findUnique({
    where: { id: input.productId },
    select: { id: true, name: true },
  });
  if (!product) throw new VisualizationStudioError(404, "PRODUCT_NOT_FOUND", "The selected product no longer exists.");

  const analysisMode = resolvedAnalysisMode(input.analysisMode);
  const metadata = {
    requestedProductType: input.productType,
    requestedGeometryKind: input.geometryKind,
    requestedDimensions: input.dimensions,
  };
  const job = await prisma.$transaction(async (transaction: UntypedPrisma) => {
    const asset = await transaction.visualizationAsset.create({
      data: {
        productId: input.productId,
        ownerUserId: input.actorId,
        kind: "SOURCE_IMAGE",
        storage: "DATABASE",
        originalName: input.upload.originalName,
        mimeType: input.upload.mimeType,
        sizeBytes: input.upload.sizeBytes,
        width: input.upload.width,
        height: input.upload.height,
        sha256: input.upload.sha256,
        content: Buffer.from(input.upload.content),
        metadata,
      },
    });
    const createdJob = await transaction.visualizationProcessingJob.create({
      data: {
        productId: input.productId,
        sourceAssetId: asset.id,
        requestedById: input.actorId,
        analysisMode,
        maxAttempts: 3,
      },
    });
    await transaction.visualizationAsset.update({ where: { id: asset.id }, data: { jobId: createdJob.id } });
    return createdJob;
  });

  return serializeVisualizationJob(await jobWithAssets(prisma, job.id));
}

async function jobWithAssets(prisma: UntypedPrisma, id: string) {
  return prisma.visualizationProcessingJob.findUnique({ where: { id }, include: studioInclude });
}

async function jobForProcessing(prisma: UntypedPrisma, id: string) {
  return prisma.visualizationProcessingJob.findUnique({
    where: { id },
    include: {
      sourceAsset: {
        select: {
          id: true, content: true, originalName: true, mimeType: true, sizeBytes: true,
          width: true, height: true, sha256: true, metadata: true,
        },
      },
    },
  });
}

export async function processVisualizationJob(jobId: string) {
  const prisma = studioPrisma();
  const existing = await jobForProcessing(prisma, jobId);
  if (!existing) throw new VisualizationStudioError(404, "VISUALIZATION_JOB_NOT_FOUND", "The analysis job no longer exists.");
  if (!['QUEUED', 'FAILED'].includes(existing.status) || existing.attempt >= existing.maxAttempts) {
    throw new VisualizationStudioError(409, "VISUALIZATION_JOB_NOT_PROCESSABLE", "The analysis job cannot be processed in its current state.");
  }

  const now = new Date();
  const claimed = await prisma.visualizationProcessingJob.updateMany({
    where: { id: jobId, status: existing.status, attempt: existing.attempt },
    data: {
      status: "PROCESSING",
      attempt: { increment: 1 },
      startedAt: now,
      lastAttemptAt: now,
      completedAt: null,
      nextAttemptAt: null,
      errorCode: null,
      errorMessage: null,
    },
  });
  if (claimed.count !== 1) {
    throw new VisualizationStudioError(409, "VISUALIZATION_JOB_ALREADY_CLAIMED", "The analysis job is already being processed.");
  }

  const source = existing.sourceAsset;
  if (!source?.content) {
    await prisma.visualizationProcessingJob.update({
      where: { id: jobId },
      data: {
        status: "FAILED",
        errorCode: "SOURCE_IMAGE_UNAVAILABLE",
        errorMessage: "The source image is unavailable.",
        completedAt: new Date(),
      },
    });
    return serializeVisualizationJob(await jobWithAssets(prisma, jobId));
  }
  const metadata = recordValue(source.metadata);
  const requestedProductType = typeof metadata.requestedProductType === "string" ? metadata.requestedProductType : undefined;
  const requestedGeometryKind = typeof metadata.requestedGeometryKind === "string"
    ? metadata.requestedGeometryKind as StartVisualizationAnalysisInput["geometryKind"] : undefined;
  const requestedDimensions = metadata.requestedDimensions as VisualizationDimensions | undefined;

  try {
    const result = await analyzeVisualizationSource({
      upload: {
        originalName: source.originalName ?? "source-image",
        mimeType: source.mimeType,
        sizeBytes: source.sizeBytes,
        width: source.width,
        height: source.height,
        hasTransparency: Boolean(metadata.hasTransparency),
        sha256: source.sha256,
        content: new Uint8Array(source.content) as Uint8Array<ArrayBuffer>,
      },
      source: { width: source.width, height: source.height, mimeType: source.mimeType },
      requestedMode: String(existing.analysisMode).toLowerCase() as "manual" | "external",
      productId: existing.productId,
      productType: requestedProductType,
      geometryKind: requestedGeometryKind,
      dimensions: requestedDimensions,
    });

    await prisma.$transaction(async (transaction: UntypedPrisma) => {
      if (result.generatedAssets.length) {
        await transaction.visualizationAsset.createMany({
          data: result.generatedAssets.map((asset) => ({
            productId: existing.productId,
            jobId,
            ownerUserId: existing.requestedById,
            kind: generatedVisualizationAssetKind(asset.kind),
            storage: "PRIVATE_REFERENCE",
            mimeType: asset.mimeType,
            sizeBytes: asset.sizeBytes,
            width: asset.width,
            height: asset.height,
            sha256: asset.sha256,
            privateRef: asset.privateRef,
            metadata: { provider: result.providerName, providerRequestId: result.providerRequestId },
          })),
        });
      }
      await transaction.visualizationProcessingJob.update({
        where: { id: jobId },
        data: {
          status: "NEEDS_CONFIRMATION",
          analysisMode: result.mode,
          providerName: result.providerName,
          providerRequestId: result.providerRequestId,
          analysisResult: publicVisualizationAnalysis(result.analysis),
          confirmation: null,
          errorCode: null,
          errorMessage: null,
        },
      });
    });
  } catch (error) {
    const expected = error instanceof VisualizationStudioError;
    await prisma.visualizationProcessingJob.update({
      where: { id: jobId },
      data: {
        status: "FAILED",
        errorCode: expected ? error.code : "VISUALIZATION_ANALYSIS_FAILED",
        errorMessage: expected ? error.message.slice(0, 500) : "The source image could not be analyzed.",
        completedAt: new Date(),
      },
    });
  }

  return serializeVisualizationJob(await jobWithAssets(prisma, jobId));
}

export async function retryVisualizationAnalysis(
  jobId: string,
  analysisMode?: VisualizationAnalysisModeInput,
) {
  const prisma = studioPrisma();
  const job = await prisma.visualizationProcessingJob.findUnique({ where: { id: jobId } });
  if (!job) throw new VisualizationStudioError(404, "VISUALIZATION_JOB_NOT_FOUND", "The analysis job no longer exists.");
  if (!canRetryVisualizationJob(job)) {
    const code = job.attempt >= job.maxAttempts ? "VISUALIZATION_RETRY_LIMIT_REACHED" : "VISUALIZATION_JOB_NOT_RETRYABLE";
    throw new VisualizationStudioError(409, code, "The analysis job cannot be retried.");
  }
  const update = await prisma.visualizationProcessingJob.updateMany({
    where: { id: jobId, status: "FAILED", attempt: job.attempt },
    data: {
      status: "QUEUED",
      analysisMode: analysisMode ? resolvedAnalysisMode(analysisMode) : job.analysisMode,
      errorCode: null,
      errorMessage: null,
      completedAt: null,
    },
  });
  if (update.count !== 1) throw new VisualizationStudioError(409, "VISUALIZATION_JOB_CHANGED", "The analysis job changed before it could be retried.");
  return serializeVisualizationJob(await jobWithAssets(prisma, jobId));
}

export async function confirmVisualizationAnalysis(jobId: string, confirmationInput: VisualizationConfirmation) {
  const confirmation = visualizationConfirmationSchema.parse(confirmationInput);
  const normalizedConfirmation = {
    ...confirmation,
    dimensions: dimensionsInMillimetres(confirmation.dimensions),
  };
  const prisma = studioPrisma();
  const update = await prisma.visualizationProcessingJob.updateMany({
    where: { id: jobId, status: "NEEDS_CONFIRMATION" },
    data: { status: "SUCCEEDED", confirmation: normalizedConfirmation, completedAt: new Date() },
  });
  if (update.count !== 1) {
    const exists = await prisma.visualizationProcessingJob.findUnique({ where: { id: jobId }, select: { id: true } });
    throw new VisualizationStudioError(
      exists ? 409 : 404,
      exists ? "VISUALIZATION_CONFIRMATION_NOT_ALLOWED" : "VISUALIZATION_JOB_NOT_FOUND",
      exists ? "Only analysis awaiting confirmation can be confirmed." : "The analysis job no longer exists.",
    );
  }
  return serializeVisualizationJob(await jobWithAssets(prisma, jobId));
}

export async function saveVisualizationTemplate(
  actorId: string,
  sourceJobId: string,
  templateInput: VisualizationTemplateInput,
) {
  const input = visualizationTemplateInputSchema.parse(templateInput);
  const prisma = studioPrisma();
  const job = await prisma.visualizationProcessingJob.findUnique({
    where: { id: sourceJobId },
    select: { id: true, productId: true, sourceAssetId: true, templateId: true, status: true, confirmation: true },
  });
  if (!job) throw new VisualizationStudioError(404, "VISUALIZATION_JOB_NOT_FOUND", "The analysis job no longer exists.");
  if (job.status !== "SUCCEEDED" || !job.confirmation) {
    throw new VisualizationStudioError(409, "VISUALIZATION_CONFIRMATION_REQUIRED", "Confirm the analysis before saving a template.");
  }
  if (job.templateId) {
    throw new VisualizationStudioError(409, "VISUALIZATION_TEMPLATE_ALREADY_SAVED", "This confirmed analysis already has a saved template.");
  }
  if (input.productId && input.productId !== job.productId) {
    throw new VisualizationStudioError(409, "VISUALIZATION_PRODUCT_MISMATCH", "The template product must match the analyzed product.");
  }
  const confirmed = visualizationConfirmationSchema.safeParse(job.confirmation);
  if (!confirmed.success) {
    throw new VisualizationStudioError(409, "VISUALIZATION_CONFIRMATION_INVALID", "The confirmed analysis is no longer valid.");
  }

  const familyKey = visualizationFamilyKey(input.familyKey ?? input.name);
  const created = await prisma.$transaction(async (transaction: UntypedPrisma) => {
    const latest = await transaction.visualizationTemplate.findFirst({
      where: { familyKey },
      select: { version: true },
      orderBy: { version: "desc" },
    });
    const version = nextVisualizationTemplateVersion(latest?.version);
    const template = await transaction.visualizationTemplate.create({
      data: {
        familyKey,
        version,
        productId: job.productId,
        sourceJobId,
        createdById: actorId,
        name: input.name,
        slug: `${familyKey}-v${version}`,
        description: input.description,
        productType: confirmed.data.productType,
        geometry: confirmed.data.geometry,
        dimensions: dimensionsInMillimetres(confirmed.data.dimensions),
        surfaceMappings: confirmed.data.surfaceMappings,
        materialSettings: input.materialSettings,
        previewCapabilities: input.previewCapabilities,
        manufacturingMetadata: {
          validated: confirmed.data.manufacturingValidated,
          admin: input.manufacturingMetadata ?? {},
        },
      },
    });
    await transaction.visualizationProcessingJob.update({ where: { id: sourceJobId }, data: { templateId: template.id } });
    const linked = await transaction.visualizationAsset.updateMany({
      where: { id: job.sourceAssetId, jobId: sourceJobId, kind: "SOURCE_IMAGE", storage: "DATABASE" },
      data: { templateId: template.id },
    });
    if (linked.count !== 1) {
      throw new VisualizationStudioError(409, "VISUALIZATION_SOURCE_ASSET_MISSING", "The confirmed source image is unavailable.");
    }
    return template;
  }, { isolationLevel: "Serializable" });
  return serializeVisualizationTemplate(created);
}

export async function changeVisualizationTemplateStatus(templateId: string, action: "publish" | "archive") {
  const prisma = studioPrisma();
  const result = await prisma.$transaction(async (transaction: UntypedPrisma) => {
    const template = await transaction.visualizationTemplate.findUnique({ where: { id: templateId } });
    if (!template) throw new VisualizationStudioError(404, "VISUALIZATION_TEMPLATE_NOT_FOUND", "The template no longer exists.");
    if (action === "publish") {
      if (template.status !== "DRAFT") {
        throw new VisualizationStudioError(409, "VISUALIZATION_TEMPLATE_NOT_PUBLISHABLE", "Only a draft template can be published.");
      }
      if (!template.productId) {
        throw new VisualizationStudioError(409, "VISUALIZATION_TEMPLATE_PRODUCT_REQUIRED", "Link the template to a product before publishing it.");
      }
      const productModel = resolveVisualizationProductModel(template);
      if (!productModel) {
        throw new VisualizationStudioError(
          422,
          "VISUALIZATION_PRODUCT_MODEL_UNRESOLVED",
          "The confirmed product type and geometry do not map to a supported 3D preview model.",
        );
      }
      const product = await transaction.product.findUnique({
        where: { id: template.productId },
        select: { id: true, metadata: true },
      });
      if (!product) {
        throw new VisualizationStudioError(409, "VISUALIZATION_TEMPLATE_PRODUCT_MISSING", "The linked product no longer exists.");
      }
      const sourceAsset = await transaction.visualizationAsset.findFirst({
        where: { templateId: template.id, kind: "SOURCE_IMAGE", storage: "DATABASE" },
        select: { id: true, width: true, height: true, mimeType: true },
      });
      if (!sourceAsset?.width || !sourceAsset.height) {
        throw new VisualizationStudioError(409, "VISUALIZATION_SOURCE_ASSET_MISSING", "The template source image is unavailable.");
      }
      const runtimeVisualization = visualizationRuntimeDescriptor({
        templateId: template.id,
        asset: {
          id: sourceAsset.id,
          width: sourceAsset.width,
          height: sourceAsset.height,
          mimeType: sourceAsset.mimeType,
        },
        surfaces: template.surfaceMappings,
      });
      const changedAt = new Date();
      await transaction.visualizationTemplate.updateMany({
        where: { productId: template.productId, status: "PUBLISHED", id: { not: template.id } },
        data: { status: "ARCHIVED", archivedAt: changedAt },
      });
      const published = await transaction.visualizationTemplate.update({
        where: { id: template.id },
        data: { status: "PUBLISHED", publishedAt: changedAt, archivedAt: null },
      });
      await transaction.product.update({
        where: { id: product.id },
        data: {
          metadata: activateVisualizationProductMetadata(product.metadata, {
            templateId: template.id,
            productModel,
            visualization: runtimeVisualization,
          }),
        },
      });
      return published;
    }
    const archived = template.status === "ARCHIVED" ? template : await transaction.visualizationTemplate.update({
      where: { id: template.id },
      data: { status: "ARCHIVED", archivedAt: new Date() },
    });
    if (template.productId) {
      const product = await transaction.product.findUnique({
        where: { id: template.productId },
        select: { id: true, metadata: true },
      });
      if (product && visualizationTemplateIsActive(product.metadata, template.id)) {
        const replacement = await transaction.visualizationTemplate.findFirst({
          where: { productId: template.productId, status: "PUBLISHED", id: { not: template.id } },
          orderBy: [{ publishedAt: "desc" }, { version: "desc" }],
        });
        const replacementModel = replacement ? resolveVisualizationProductModel(replacement) : null;
        const replacementAsset = replacement && replacementModel
          ? await transaction.visualizationAsset.findFirst({
            where: { templateId: replacement.id, kind: "SOURCE_IMAGE", storage: "DATABASE" },
            select: { id: true, width: true, height: true, mimeType: true },
          })
          : null;
        const canSwitch = replacement && replacementModel && replacementAsset?.width && replacementAsset.height;
        const metadata = canSwitch
          ? activateVisualizationProductMetadata(product.metadata, {
            templateId: replacement.id,
            productModel: replacementModel,
            visualization: visualizationRuntimeDescriptor({
              templateId: replacement.id,
              asset: {
                id: replacementAsset.id,
                width: replacementAsset.width,
                height: replacementAsset.height,
                mimeType: replacementAsset.mimeType,
              },
              surfaces: replacement.surfaceMappings,
            }),
          })
          : deactivateVisualizationProductMetadata(product.metadata, template.id);
        await transaction.product.update({ where: { id: product.id }, data: { metadata } });
      }
    }
    return archived;
  }, { isolationLevel: "Serializable" });
  return serializeVisualizationTemplate(result);
}

export async function getVisualizationAssetForDownload(assetId: string) {
  const asset = await studioPrisma().visualizationAsset.findUnique({
    where: { id: assetId },
    select: { id: true, storage: true, content: true, mimeType: true, originalName: true, sizeBytes: true },
  });
  if (!asset || asset.storage !== "DATABASE" || !asset.content) {
    throw new VisualizationStudioError(404, "VISUALIZATION_ASSET_NOT_FOUND", "The visualization asset is unavailable.");
  }
  return asset;
}
