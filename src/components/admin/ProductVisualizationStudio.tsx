'use client';

import { AlertCircle, Archive, Box, CheckCircle2, CloudUpload, FileImage, LoaderCircle, Plus, RefreshCw, Save, Send, Trash2, X } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';

import type { ArtworkDocument, PrintableSurfaceDefinition } from '../configurator/artwork-types';
import { StatusBadge } from './AdminUI';
import styles from './admin.module.css';

type DimensionUnit = 'mm' | 'cm' | 'in';
type DimensionKey = 'width' | 'height' | 'depth' | 'diameter' | 'gusset' | 'labelWidth' | 'labelHeight';
type DimensionState = { unit: DimensionUnit } & Record<DimensionKey, string>;
type SourceBoundsInput = { x: string; y: string; width: string; height: string };
type MappingRow = { key: string; surfaceId: string; label: string; role: string; sourceBounds?: SourceBoundsInput };
type StudioAsset = { id?: string; originalName?: string; mimeType?: string; downloadUrl?: string };
type StudioJob = {
  id: string;
  productId?: string;
  status: string;
  attempt?: number;
  maxAttempts?: number;
  createdAt?: string;
  updatedAt?: string;
  errorMessage?: string | null;
  asset?: StudioAsset | null;
  sourceAsset?: StudioAsset | null;
  previewUrl?: string | null;
  [key: string]: unknown;
};
type StudioTemplate = {
  id: string;
  name: string;
  status?: string;
  productId?: string;
  productType?: string;
  createdAt?: string;
  [key: string]: unknown;
};
type StudioData = { templates?: unknown; libraryTemplates?: unknown; jobs?: unknown };
type ApiPayload = {
  data?: StudioData & { job?: unknown; template?: unknown; asset?: unknown };
  error?: { message?: string };
};

const acceptedTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const maximumFileBytes = 12 * 1024 * 1024;
const surfaceIdPattern = /^[a-z0-9][a-z0-9_-]*$/i;
const geometryOptions = [
  ['box', 'Box'], ['cylinder', 'Cylinder'], ['plane', 'Flat plane'],
  ['bag', 'Bag'], ['pouch', 'Pouch'], ['label', 'Label'], ['custom', 'Custom'],
] as const;
const faceOptions = ['front', 'back', 'left', 'right', 'top', 'bottom', 'wrap', 'gusset', 'inside', 'other'] as const;
const sourceBoundKeys = ['x', 'y', 'width', 'height'] as const;
const dimensionLabels: Record<DimensionKey, string> = {
  width: 'Width', height: 'Height', depth: 'Depth', diameter: 'Diameter', gusset: 'Gusset',
  labelWidth: 'Label width', labelHeight: 'Label height',
};
const emptyDimensions: DimensionState = {
  unit: 'mm', width: '', height: '', depth: '', diameter: '', gusset: '', labelWidth: '', labelHeight: '',
};
const LazyProduct3DPreview = dynamic(
  () => import('../configurator/Product3DPreview').then((module) => module.Product3DPreview),
  {
    ssr: false,
    loading: () => <div className={styles.studioLoading}><LoaderCircle className={styles.studioSpin} size={16} /> Loading visual preview...</div>,
  },
);

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function numericText(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value)
    ? String(value)
    : typeof value === 'string' && Number.isFinite(Number(value)) ? value : undefined;
}

function analysisValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim().replaceAll('_', ' ') : undefined;
}

function analysisConfidence(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value)
    ? `${Math.round(Math.max(0, Math.min(1, value)) * 100)}% confidence`
    : 'Confidence not provided — manual review required';
}

function validSourceBounds(bounds: SourceBoundsInput | undefined) {
  if (!bounds) return true;
  if (sourceBoundKeys.some((key) => !bounds[key].trim())) return false;
  const values = Object.fromEntries(sourceBoundKeys.map((key) => [key, Number(bounds[key])])) as Record<typeof sourceBoundKeys[number], number>;
  return Object.values(values).every(Number.isFinite)
    && values.x >= 0 && values.y >= 0 && values.width > 0 && values.height > 0
    && values.x <= 1 && values.y <= 1 && values.width <= 1 && values.height <= 1
    && values.x + values.width <= 1 + Number.EPSILON
    && values.y + values.height <= 1 + Number.EPSILON;
}

function dimensionKeysForGeometry(geometryKind: string): readonly DimensionKey[] {
  switch (geometryKind) {
    case 'cylinder': return ['diameter', 'height', 'labelWidth', 'labelHeight'];
    case 'bag': case 'pouch': return ['width', 'height', 'gusset'];
    case 'plane': case 'label': return ['width', 'height'];
    default: return ['width', 'height', 'depth'];
  }
}

function dimensionsPayloadForGeometry(dimensions: DimensionState, geometryKind: string) {
  return {
    unit: dimensions.unit,
    ...Object.fromEntries(dimensionKeysForGeometry(geometryKind).map((key) => [key, Number(dimensions[key])])),
  };
}

function dimensionsInPreviewMillimetres(dimensions: DimensionState, geometryKind: string) {
  const multiplier = dimensions.unit === 'mm' ? 1 : dimensions.unit === 'cm' ? 10 : 25.4;
  const values = Object.fromEntries(
    dimensionKeysForGeometry(geometryKind).map((key) => [key, Number(dimensions[key]) * multiplier]),
  ) as Record<string, number>;
  const diameter = values.diameter ?? values.width ?? 100;
  return {
    ...values,
    width: values.width ?? diameter,
    height: values.height ?? 100,
    depth: values.depth ?? values.gusset ?? diameter,
  };
}

function previewModelForGeometry(geometryKind: string, productType: string) {
  switch (geometryKind) {
    case 'bag': return 'paper-bag';
    case 'pouch': return 'stand-up-pouch';
    case 'cylinder': return 'bottle-label';
    case 'plane': return 'waterproof-sheet';
    case 'label': return 'label-pack';
    case 'box': case 'custom': return productType.trim() || 'rectangular-box';
    default: return 'rectangular-box';
  }
}

function previewSurfacePhysicalSize(role: string, dimensionsMm: Record<string, number>) {
  const { width, height, depth, diameter, labelWidth, labelHeight } = dimensionsMm;
  switch (role) {
    case 'left': case 'right': case 'gusset': return { width: depth, height };
    case 'top': case 'bottom': return { width, height: depth };
    case 'wrap': return { width: labelWidth ?? (diameter ? Math.PI * diameter : 2 * (width + depth)), height: labelHeight ?? height };
    default: return { width, height };
  }
}

function previewSurfaceDefinition(mapping: MappingRow, dimensionsMm: Record<string, number>): PrintableSurfaceDefinition {
  const physical = previewSurfacePhysicalSize(mapping.role, dimensionsMm);
  const scale = 600 / Math.max(physical.width, physical.height, 1);
  return {
    id: mapping.surfaceId.trim(),
    label: `${mapping.role} ${mapping.label.trim()}`,
    width: Math.max(64, Math.round(physical.width * scale)),
    height: Math.max(64, Math.round(physical.height * scale)),
    safeInset: 0,
    physicalWidthMm: physical.width,
    physicalHeightMm: physical.height,
  };
}

function isJob(value: unknown): value is StudioJob {
  const source = record(value);
  return Boolean(text(source.id) && text(source.status));
}

function isTemplate(value: unknown): value is StudioTemplate {
  const source = record(value);
  return Boolean(text(source.id) && text(source.name));
}

function apiMessage(payload: ApiPayload | undefined, fallback: string) {
  return payload?.error?.message?.trim() || fallback;
}

function jobAsset(job: StudioJob | undefined) {
  if (!job) return undefined;
  const candidate = record(job.asset ?? job.sourceAsset);
  if (!Object.keys(candidate).length) return undefined;
  return {
    id: text(candidate.id), originalName: text(candidate.originalName),
    mimeType: text(candidate.mimeType), downloadUrl: text(candidate.downloadUrl),
  } satisfies StudioAsset;
}

function jobError(job: StudioJob) {
  const error = record(job.error);
  return text(job.errorMessage) ?? text(error.message) ?? text(job.failureReason);
}

function configurationFromStudioRecord(source: Record<string, unknown>) {
  const analysis = record(source.analysis);
  const result = record(source.result);
  const candidates = [record(source.confirmation), record(source.configuration), record(analysis.confirmation), record(analysis.configuration), analysis, record(result.configuration), result, source]
    .filter((candidate) => Object.keys(candidate).length);
  const productType = candidates.map((candidate) => (
    text(candidate.productType) ?? text(record(candidate.productType).value)
  )).find(Boolean);
  const geometry = candidates.map((candidate) => record(candidate.geometry)).find((item) => Object.keys(item).length) ?? {};
  const geometryKind = text(geometry.kind) ?? candidates.map((candidate) => text(candidate.geometryKind)).find(Boolean);
  const dimensions = candidates.map((candidate) => record(candidate.dimensions)).find((item) => Object.keys(item).length) ?? {};
  const rawMappings = candidates.map((candidate) => candidate.surfaceMappings ?? candidate.surfaces).find(Array.isArray) as unknown[] | undefined;
  const mappings = rawMappings?.flatMap((entry, index) => {
    const item = record(entry);
    const surfaceId = text(item.surfaceId) ?? text(item.id);
    const sourceBounds = record(item.sourceBounds);
    const boundValues = Object.fromEntries(sourceBoundKeys.map((key) => [key, numericText(sourceBounds[key])])) as Record<typeof sourceBoundKeys[number], string | undefined>;
    const suggestedRole = text(item.role) ?? text(item.face) ?? 'front';
    return surfaceId ? [{
      key: `${surfaceId}-${index}`,
      surfaceId,
      label: text(item.label) ?? surfaceId,
      role: faceOptions.includes(suggestedRole as typeof faceOptions[number]) ? suggestedRole : 'other',
      sourceBounds: sourceBoundKeys.every((key) => boundValues[key] !== undefined)
        ? boundValues as SourceBoundsInput
        : undefined,
    }] : [];
  });
  return {
    productType, geometryKind,
    unit: (['mm', 'cm', 'in'] as string[]).includes(String(dimensions.unit)) ? dimensions.unit as DimensionUnit : undefined,
    width: numericText(dimensions.width), height: numericText(dimensions.height), depth: numericText(dimensions.depth),
    diameter: numericText(dimensions.diameter), gusset: numericText(dimensions.gusset),
    labelWidth: numericText(dimensions.labelWidth), labelHeight: numericText(dimensions.labelHeight), mappings,
  };
}

function statusPresentation(status: string) {
  switch (status.toUpperCase()) {
    case 'QUEUED': return { label: 'Processing (queued)', tone: 'info' as const };
    case 'PROCESSING': return { label: 'Processing', tone: 'violet' as const };
    case 'NEEDS_CONFIRMATION': return { label: 'Needs confirmation', tone: 'warning' as const };
    case 'SUCCEEDED': case 'READY': return { label: 'Ready', tone: 'success' as const };
    case 'FAILED': return { label: 'Failed', tone: 'danger' as const };
    case 'CANCELLED': return { label: 'Cancelled', tone: 'muted' as const };
    default: return { label: status.replaceAll('_', ' ').toLowerCase(), tone: 'muted' as const };
  }
}

function formatDate(value?: string) {
  if (!value) return 'Time unavailable';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Time unavailable';
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(date);
}

function initialMappings(surfaces: Array<{ id: string; label: string }>): MappingRow[] {
  const source = surfaces.length ? surfaces : [{ id: 'primary', label: 'Primary surface' }];
  return source.map((surface, index) => ({
    key: `${surface.id}-${index}`, surfaceId: surface.id, label: surface.label || surface.id,
    role: faceOptions.includes(surface.id as typeof faceOptions[number]) ? surface.id : index === 0 ? 'front' : index === 1 ? 'back' : 'other',
  }));
}

export function ProductVisualizationStudio({ productId, productName, productType: initialProductType, surfaces, hasPrimaryImage = false, onTemplateStatusChange }: {
  productId: string;
  productName: string;
  productType?: string;
  surfaces: Array<{ id: string; label: string }>;
  hasPrimaryImage?: boolean;
  onTemplateStatusChange?: () => void | Promise<void>;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const requestRef = useRef<XMLHttpRequest | null>(null);
  const [templates, setTemplates] = useState<StudioTemplate[]>([]);
  const [libraryTemplates, setLibraryTemplates] = useState<StudioTemplate[]>([]);
  const [selectedLibraryTemplateId, setSelectedLibraryTemplateId] = useState('');
  const [jobs, setJobs] = useState<StudioJob[]>([]);
  const [selectedJobId, setSelectedJobId] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(true);
  const [workingAction, setWorkingAction] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [productType, setProductType] = useState(initialProductType ?? '');
  const [geometryKind, setGeometryKind] = useState<string>('box');
  const [dimensions, setDimensions] = useState<DimensionState>(emptyDimensions);
  const [mappings, setMappings] = useState<MappingRow[]>(() => initialMappings(surfaces));
  const [reviewed, setReviewed] = useState(false);
  const [configurationMatchesConfirmation, setConfigurationMatchesConfirmation] = useState(false);
  const [templateName, setTemplateName] = useState('');

  const loadStudio = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const response = await fetch(`/api/admin/visualization-studio?productId=${encodeURIComponent(productId)}`, { cache: 'no-store', credentials: 'same-origin' });
      const payload = await response.json().catch(() => undefined) as ApiPayload | undefined;
      if (!response.ok || !payload?.data) throw new Error(apiMessage(payload, 'Could not load the visualization studio.'));
      const nextJobs = Array.isArray(payload.data.jobs)
        ? payload.data.jobs.filter(isJob).filter((job) => job.productId === productId)
        : [];
      const nextTemplates = Array.isArray(payload.data.templates)
        ? payload.data.templates.filter(isTemplate).filter((template) => !template.productId || template.productId === productId)
        : [];
      const nextLibraryTemplates = Array.isArray(payload.data.libraryTemplates)
        ? payload.data.libraryTemplates.filter(isTemplate).filter((template) => template.productId !== productId)
        : [];
      setJobs(nextJobs);
      setTemplates(nextTemplates);
      setLibraryTemplates(nextLibraryTemplates);
      setSelectedLibraryTemplateId((current) => nextLibraryTemplates.some((template) => template.id === current)
        ? current
        : nextLibraryTemplates[0]?.id ?? '');
      setSelectedJobId((current) => nextJobs.some((job) => job.id === current) ? current : nextJobs[0]?.id ?? '');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load the visualization studio.');
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [productId]);

  useEffect(() => { void loadStudio(); }, [loadStudio]);
  useEffect(() => {
    if (!jobs.some((job) => ['QUEUED', 'PROCESSING'].includes(job.status.toUpperCase()))) return;
    const timer = window.setTimeout(() => { void loadStudio(true); }, 2_500);
    return () => window.clearTimeout(timer);
  }, [jobs, loadStudio]);
  useEffect(() => () => requestRef.current?.abort(), []);
  useEffect(() => {
    if (!selectedFile) { setPreviewUrl(''); return; }
    const url = URL.createObjectURL(selectedFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [selectedFile]);
  const selectedJob = useMemo(() => jobs.find((job) => job.id === selectedJobId), [jobs, selectedJobId]);
  const persistedAsset = jobAsset(selectedJob);
  const persistedPreviewUrl = text(selectedJob?.previewUrl) ?? persistedAsset?.downloadUrl
    ?? (persistedAsset?.id ? `/api/admin/visualization-studio/assets/${encodeURIComponent(persistedAsset.id)}` : '');
  const activePreviewUrl = previewUrl || persistedPreviewUrl;
  const activeDimensionKeys = dimensionKeysForGeometry(geometryKind);
  const dimensionsValid = activeDimensionKeys.map((key) => dimensions[key])
    .every((value) => Number.isFinite(Number(value)) && Number(value) > 0 && Number(value) <= 100_000);
  const mappingsValid = mappings.length > 0
    && mappings.length <= 24
    && mappings.every((mapping, index) => surfaceIdPattern.test(mapping.surfaceId.trim())
      && mapping.surfaceId.trim().length <= 80 && mapping.label.trim().length > 0 && mapping.label.trim().length <= 120
      && faceOptions.includes(mapping.role as typeof faceOptions[number]) && validSourceBounds(mapping.sourceBounds)
      && (index === 0 || Boolean(mapping.sourceBounds)))
    && new Set(mappings.map((mapping) => mapping.surfaceId.trim().toLowerCase())).size === mappings.length;
  const configurationValid = Boolean(productType.trim() && productType.trim().length <= 120
    && geometryOptions.some(([value]) => value === geometryKind) && dimensionsValid && mappingsValid);
  const selectedStatus = selectedJob?.status.toUpperCase();
  const selectedAnalysis = record(selectedJob?.analysis);
  const analysisClassification = record(selectedAnalysis.classification);
  const analysisProductType = record(selectedAnalysis.productType);
  const analysisOrientation = record(selectedAnalysis.orientation);
  const analysisWarnings = Array.isArray(selectedAnalysis.warnings)
    ? selectedAnalysis.warnings.flatMap((warning) => text(warning) ?? [])
    : [];
  const readyForTemplate = configurationMatchesConfirmation && (selectedStatus === 'SUCCEEDED' || selectedStatus === 'READY');
  const studioPreview = useMemo(() => {
    if (!activePreviewUrl || !configurationValid) return undefined;
    const dimensionsMm = dimensionsInPreviewMillimetres(dimensions, geometryKind);
    const previewSurfaces = mappings.map((mapping) => previewSurfaceDefinition(mapping, dimensionsMm));
    const document: ArtworkDocument = {
      version: 1,
      activeSurfaceId: previewSurfaces[0].id,
      surfaces: previewSurfaces.map((surface, index) => {
        const mapping = mappings[index];
        const bounds = mapping.sourceBounds
          ? Object.fromEntries(sourceBoundKeys.map((key) => [key, Number(mapping.sourceBounds![key])])) as Record<typeof sourceBoundKeys[number], number>
          : { x: 0, y: 0, width: 1, height: 1 };
        const layerWidth = surface.width / Math.max(bounds.width, Number.EPSILON);
        const layerHeight = surface.height / Math.max(bounds.height, Number.EPSILON);
        return {
          id: surface.id,
          label: mapping.label.trim(),
          layers: [{
            id: `studio-source-${mapping.key}`,
            type: 'image',
            name: `${mapping.label.trim()} source panel`,
            x: -bounds.x * layerWidth,
            y: -bounds.y * layerHeight,
            width: layerWidth,
            height: layerHeight,
            rotation: 0,
            opacity: 1,
            src: activePreviewUrl,
            imageFit: 'stretch',
            aspectLocked: false,
          }],
        };
      }),
      updatedAt: new Date().toISOString(),
    };
    return {
      dimensionsMm,
      document,
      model: previewModelForGeometry(geometryKind, productType),
      surfaces: previewSurfaces,
    };
  }, [activePreviewUrl, configurationValid, dimensions, geometryKind, mappings, productType]);

  function chooseFile(file: File | undefined) {
    setError(''); setMessage('');
    if (!file) return;
    if (!acceptedTypes.has(file.type)) {
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setError('Choose a JPG, PNG or WEBP image.');
      return;
    }
    if (file.size < 1) {
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setError('The selected image is empty.');
      return;
    }
    if (file.size > maximumFileBytes) {
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setError('Choose an image no larger than 12 MB.');
      return;
    }
    setSelectedFile(file);
    setUploadProgress(0);
  }

  function removeSelection() {
    setSelectedFile(null); setUploadProgress(0);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function updateMapping(key: string, changes: Partial<MappingRow>) {
    setReviewed(false); setConfigurationMatchesConfirmation(false);
    setMappings((current) => current.map((mapping) => mapping.key === key ? { ...mapping, ...changes } : mapping));
  }

  function setSourceBoundsEnabled(key: string, enabled: boolean) {
    setReviewed(false); setConfigurationMatchesConfirmation(false);
    setMappings((current) => current.map((mapping) => mapping.key === key
      ? { ...mapping, sourceBounds: enabled ? mapping.sourceBounds ?? { x: '0', y: '0', width: '1', height: '1' } : undefined }
      : mapping));
  }

  function updateSourceBound(key: string, field: typeof sourceBoundKeys[number], value: string) {
    setReviewed(false); setConfigurationMatchesConfirmation(false);
    setMappings((current) => current.map((mapping) => mapping.key === key && mapping.sourceBounds
      ? { ...mapping, sourceBounds: { ...mapping.sourceBounds, [field]: value } }
      : mapping));
  }

  function addMapping() {
    const index = mappings.length + 1;
    setReviewed(false); setConfigurationMatchesConfirmation(false);
    setMappings((current) => [...current, { key: `manual-${Date.now()}-${index}`, surfaceId: `surface-${index}`, label: `Surface ${index}`, role: 'other' }]);
  }

  function applyJobConfiguration(job: StudioJob) {
    const configuration = configurationFromStudioRecord(job);
    if (configuration.productType) setProductType(configuration.productType);
    if (configuration.geometryKind) setGeometryKind(configuration.geometryKind);
    setDimensions((current) => ({
      unit: configuration.unit ?? current.unit,
      width: configuration.width ?? current.width,
      height: configuration.height ?? current.height,
      depth: configuration.depth ?? current.depth,
      diameter: configuration.diameter ?? current.diameter,
      gusset: configuration.gusset ?? current.gusset,
      labelWidth: configuration.labelWidth ?? current.labelWidth,
      labelHeight: configuration.labelHeight ?? current.labelHeight,
    }));
    if (configuration.mappings?.length) setMappings(configuration.mappings);
    setSelectedJobId(job.id); setReviewed(false); setConfigurationMatchesConfirmation(true); setError('');
    setMessage('Job selected. Review every field before confirming it.');
  }

  function applyReusableTemplate() {
    const template = libraryTemplates.find((candidate) => candidate.id === selectedLibraryTemplateId);
    if (!template) return;
    const configuration = configurationFromStudioRecord(template);
    if (configuration.productType) setProductType(configuration.productType);
    if (configuration.geometryKind) setGeometryKind(configuration.geometryKind);
    setDimensions((current) => ({
      unit: configuration.unit ?? current.unit,
      width: configuration.width ?? current.width,
      height: configuration.height ?? current.height,
      depth: configuration.depth ?? current.depth,
      diameter: configuration.diameter ?? current.diameter,
      gusset: configuration.gusset ?? current.gusset,
      labelWidth: configuration.labelWidth ?? current.labelWidth,
      labelHeight: configuration.labelHeight ?? current.labelHeight,
    }));
    if (configuration.mappings?.length) setMappings(configuration.mappings);
    setSelectedJobId(''); setReviewed(false); setConfigurationMatchesConfirmation(false); setError('');
    setMessage(`Loaded the ${template.name} setup. Upload and confirm artwork for this product before saving.`);
  }

  const dimensionsPayload = () => dimensionsPayloadForGeometry(dimensions, geometryKind);
  const mappingPayload = () => mappings.map((mapping) => ({
    surfaceId: mapping.surfaceId.trim(),
    label: mapping.label.trim(),
    role: mapping.role,
    ...(mapping.sourceBounds ? {
      sourceBounds: Object.fromEntries(sourceBoundKeys.map((key) => [key, Number(mapping.sourceBounds![key])])),
    } : {}),
  }));

  async function uploadImage() {
    if (!selectedFile || !configurationValid || workingAction) return;
    setWorkingAction('upload'); setUploadProgress(0); setError(''); setMessage('');
    const form = new FormData();
    form.set('productId', productId);
    form.set('productType', productType.trim());
    form.set('geometryKind', geometryKind);
    form.set('dimensionsJson', JSON.stringify(dimensionsPayload()));
    form.set('file', selectedFile);
    try {
      const payload = await new Promise<ApiPayload>((resolve, reject) => {
        const request = new XMLHttpRequest();
        requestRef.current = request;
        request.open('POST', '/api/admin/visualization-studio');
        request.withCredentials = true;
        request.setRequestHeader('Accept', 'application/json');
        request.upload.onprogress = (event) => {
          if (event.lengthComputable) setUploadProgress(Math.round(event.loaded / event.total * 100));
        };
        request.onerror = () => reject(new Error('The image upload could not be completed.'));
        request.onabort = () => reject(new Error('The image upload was cancelled.'));
        request.onload = () => {
          let body: ApiPayload | undefined;
          try { body = JSON.parse(request.responseText) as ApiPayload; } catch { body = undefined; }
          if (request.status < 200 || request.status >= 300 || !body?.data?.job || !isJob(body.data.job)) {
            reject(new Error(apiMessage(body, 'The image upload could not be started.')));
            return;
          }
          resolve(body);
        };
        request.send(form);
      });
      const job = payload.data?.job;
      if (!isJob(job)) throw new Error('The upload response did not include a valid job.');
      setJobs((current) => [job, ...current.filter((item) => item.id !== job.id)]);
      setSelectedJobId(job.id); setConfigurationMatchesConfirmation(false); setUploadProgress(100);
      setMessage('Image received. The job status will update here as processing continues.');
      void loadStudio(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The image upload could not be started.');
    } finally {
      requestRef.current = null;
      setWorkingAction('');
    }
  }

  async function reuseProductImage() {
    if (!hasPrimaryImage || workingAction) return;
    setWorkingAction("reuse-product-image"); setError(""); setMessage("");
    try {
      const response = await fetch("/api/admin/visualization-studio/from-product-image", {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId }),
      });
      const payload = await response.json().catch(() => undefined) as ApiPayload | undefined;
      const job = payload?.data?.job;
      if (!response.ok || !isJob(job)) throw new Error(apiMessage(payload, "The product image could not be reused."));
      setJobs((current) => [job, ...current.filter((item) => item.id !== job.id)]);
      setSelectedJobId(job.id); setConfigurationMatchesConfirmation(false);
      setMessage("Product image reused. The job status will update here as processing continues.");
      void loadStudio(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The product image could not be reused.");
    } finally { setWorkingAction(""); }
  }

  async function patchStudio(body: Record<string, unknown>, actionKey: string) {
    setWorkingAction(actionKey); setError(''); setMessage('');
    try {
      const response = await fetch('/api/admin/visualization-studio', {
        method: 'PATCH', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => undefined) as ApiPayload | undefined;
      if (!response.ok || !payload?.data) throw new Error(apiMessage(payload, 'The studio action could not be completed.'));
      if (isJob(payload.data.job)) {
        const job = payload.data.job;
        setJobs((current) => [job, ...current.filter((item) => item.id !== job.id)]);
        setSelectedJobId(job.id);
      }
      if (isTemplate(payload.data.template)) {
        const template = payload.data.template;
        setTemplates((current) => [template, ...current.filter((item) => item.id !== template.id)]);
      }
      return payload;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The studio action could not be completed.');
      return undefined;
    } finally { setWorkingAction(''); }
  }

  async function retryJob(job: StudioJob) {
    const payload = await patchStudio({ action: 'retry', jobId: job.id }, `retry-${job.id}`);
    if (payload) setMessage('Retry requested. The job status will update here.');
  }

  async function confirmAnalysis() {
    if (!selectedJob || selectedStatus !== 'NEEDS_CONFIRMATION' || !reviewed || !configurationValid) return;
    const payload = await patchStudio({
      action: 'confirm-analysis', jobId: selectedJob.id,
      confirmation: { productType: productType.trim(), geometry: { kind: geometryKind }, dimensions: dimensionsPayload(), surfaceMappings: mappingPayload() },
    }, `confirm-${selectedJob.id}`);
    if (payload) {
      setReviewed(false); setConfigurationMatchesConfirmation(true);
      setMessage('Configuration confirmed. Save it as a reusable template when the job is ready.');
      void loadStudio(true);
    }
  }

  async function saveTemplate() {
    if (!selectedJob || !readyForTemplate || !configurationValid || !templateName.trim()) return;
    const payload = await patchStudio({
      action: 'save-template', sourceJobId: selectedJob.id,
      template: { name: templateName.trim(), productId, productType: productType.trim(), geometry: { kind: geometryKind }, dimensions: dimensionsPayload(), surfaces: mappingPayload() },
    }, `save-template-${selectedJob.id}`);
    if (payload) { setTemplateName(''); setMessage('Reusable template saved as a draft.'); void loadStudio(true); }
  }

  async function changeTemplateStatus(template: StudioTemplate, action: 'publish-template' | 'archive-template') {
    const payload = await patchStudio({ action, templateId: template.id }, `${action}-${template.id}`);
    if (!payload) return;
    setMessage(action === 'publish-template' ? 'Template published.' : 'Template archived.');
    try {
      await onTemplateStatusChange?.();
    } catch {
      setError('The template status changed, but the product preview state could not be refreshed. Reload the catalog to see its latest state.');
    }
  }

  return (
    <section className={styles.visualizationStudio} aria-labelledby='visualization-studio-title'>
      <div className={styles.studioHeading}>
        <div className={styles.studioHeadingIcon}><Box aria-hidden='true' size={18} /></div>
        <div><span>Image-to-3D studio</span><h4 id='visualization-studio-title'>Build a reusable visualization</h4><p>Upload a clear product image, verify its shape and dimensions, then map printable surfaces before saving a template for {productName}.</p></div>
      </div>
      {error && <div className={`${styles.studioNotice} ${styles.studioNoticeError}`} role='alert'><AlertCircle aria-hidden='true' size={15} /><span>{error}</span><button aria-label='Dismiss error' onClick={() => setError('')} type='button'><X size={13} /></button></div>}
      {message && <div className={styles.studioNotice} role='status'><CheckCircle2 aria-hidden='true' size={15} /><span>{message}</span><button aria-label='Dismiss message' onClick={() => setMessage('')} type='button'><X size={13} /></button></div>}

      <div className={styles.studioPanel}>
        <div className={styles.studioPanelHeading}>
          <div><strong>1. Source image</strong><small>JPG, PNG or WEBP</small></div>
          {selectedFile && <button className={styles.buttonGhost} onClick={removeSelection} type='button'><Trash2 size={12} /> Remove</button>}
        </div>
        <div
          className={`${styles.studioDropzone} ${dragging ? styles.studioDropzoneActive : ''}`}
          onDragEnter={(event: DragEvent<HTMLDivElement>) => { event.preventDefault(); setDragging(true); }}
          onDragLeave={(event: DragEvent<HTMLDivElement>) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }}
          onDragOver={(event: DragEvent<HTMLDivElement>) => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; }}
          onDrop={(event: DragEvent<HTMLDivElement>) => { event.preventDefault(); setDragging(false); chooseFile(event.dataTransfer.files[0]); }}
        >
          {(previewUrl || persistedPreviewUrl) ? (
            <div className={styles.studioPreview}>
              {/* Blob URLs and authenticated private assets cannot use the optimized image pipeline. */}
              <img alt={selectedFile?.name ?? persistedAsset?.originalName ?? `${productName} source`} src={previewUrl || persistedPreviewUrl} />
            </div>
          ) : <div className={styles.studioDropIcon}><FileImage aria-hidden='true' size={25} /></div>}
          <div className={styles.studioDropCopy}>
            <strong>{selectedFile ? selectedFile.name : 'Drop a product image here'}</strong>
            <span>{selectedFile ? `${Math.max(1, Math.ceil(selectedFile.size / 1024))} KB selected` : 'Use a well-lit image with the full product visible.'}</span>
          </div>
          <input accept='image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp' className={styles.studioFileInput} onChange={(event) => chooseFile(event.target.files?.[0])} ref={fileInputRef} type='file' />
          <button className={styles.buttonSecondary} onClick={() => fileInputRef.current?.click()} type='button'><CloudUpload size={13} /> {selectedFile ? 'Replace image' : 'Browse images'}</button>
          <button className={styles.buttonSecondary} disabled={!hasPrimaryImage || Boolean(workingAction)} onClick={() => void reuseProductImage()} title={hasPrimaryImage ? "Reuse this product's uploaded photo" : "Upload a primary product photo first"} type='button'>
            <RefreshCw size={13} /> {workingAction === "reuse-product-image" ? "Reusing…" : "Reuse this product's uploaded photo"}
          </button>
        </div>
        {workingAction === 'upload' && (
          <div className={styles.studioProgress} role='progressbar' aria-label='Image upload progress' aria-valuemax={100} aria-valuemin={0} aria-valuenow={uploadProgress}>
            <div><span>Uploading image</span><strong>{uploadProgress}%</strong></div>
            <span><i style={{ width: `${uploadProgress}%` }} /></span>
          </div>
        )}
      </div>

      <div className={styles.studioPanel}>
        <div className={styles.studioPanelHeading}><div><strong>2. Product geometry</strong><small>Enter known production dimensions</small></div></div>
        <div className={styles.fieldGrid}>
          <label className={styles.fieldGroup}><span className={styles.fieldLabel}>Product type</span><input className={styles.input} maxLength={120} onChange={(event) => { setProductType(event.target.value); setReviewed(false); setConfigurationMatchesConfirmation(false); }} placeholder='e.g. soap box' value={productType} /></label>
          <label className={styles.fieldGroup}><span className={styles.fieldLabel}>Product shape</span><select className={styles.select} onChange={(event) => { setGeometryKind(event.target.value); setReviewed(false); setConfigurationMatchesConfirmation(false); }} value={geometryKind}>{geometryOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        </div>
        <div className={styles.studioDimensionGrid}>
          <label className={styles.fieldGroup}><span className={styles.fieldLabel}>Unit</span><select className={styles.select} onChange={(event) => { setDimensions((current) => ({ ...current, unit: event.target.value as DimensionUnit })); setReviewed(false); setConfigurationMatchesConfirmation(false); }} value={dimensions.unit}><option value='mm'>mm</option><option value='cm'>cm</option><option value='in'>in</option></select></label>
          {activeDimensionKeys.map((key) => <label className={styles.fieldGroup} key={key}><span className={styles.fieldLabel}>{dimensionLabels[key]}</span><input className={styles.input} max='100000' min='0.01' onChange={(event) => { setDimensions((current) => ({ ...current, [key]: event.target.value })); setReviewed(false); setConfigurationMatchesConfirmation(false); }} placeholder='0' step='0.01' type='number' value={dimensions[key]} /></label>)}
        </div>
        {!dimensionsValid && <p className={styles.studioFieldError}>{activeDimensionKeys.map((key) => dimensionLabels[key].toLowerCase()).join(', ')} must each be between 0 and 100,000.</p>}
      </div>

      <div className={styles.studioPanel}>
        <div className={styles.studioPanelHeading}>
          <div><strong>3. Surface mapping</strong><small>Connect each printable surface to a model face</small></div>
          <button className={styles.buttonSecondary} disabled={mappings.length >= 24} onClick={addMapping} type='button'><Plus size={12} /> Add</button>
        </div>
        <div className={styles.studioMappingList}>
          {mappings.map((mapping) => (
            <div className={styles.studioMappingRow} key={mapping.key}>
              <label><span>Surface ID</span><input className={styles.input} maxLength={80} onChange={(event) => updateMapping(mapping.key, { surfaceId: event.target.value })} value={mapping.surfaceId} /></label>
              <label><span>Label</span><input className={styles.input} maxLength={120} onChange={(event) => updateMapping(mapping.key, { label: event.target.value })} value={mapping.label} /></label>
              <label><span>Model face</span><select className={styles.select} onChange={(event) => updateMapping(mapping.key, { role: event.target.value })} value={mapping.role}>{faceOptions.map((face) => <option key={face} value={face}>{face.replaceAll('-', ' ')}</option>)}</select></label>
              <button aria-label={`Remove ${mapping.label || mapping.surfaceId} mapping`} className={styles.iconButton} disabled={mappings.length === 1} onClick={() => { setMappings((current) => current.filter((item) => item.key !== mapping.key)); setReviewed(false); setConfigurationMatchesConfirmation(false); }} type='button'><Trash2 size={13} /></button>
              <div className={styles.studioMappingBounds}>
                <label className={styles.studioBoundsToggle}>
                  <input checked={Boolean(mapping.sourceBounds)} onChange={(event) => setSourceBoundsEnabled(mapping.key, event.target.checked)} type='checkbox' />
                  <span>Set source panel bounds</span>
                </label>
                {mapping.sourceBounds && sourceBoundKeys.map((key) => (
                  <label key={key}>
                    <span>{key === 'x' || key === 'y' ? key.toUpperCase() : key}</span>
                    <input
                      className={styles.input}
                      inputMode='decimal'
                      max='1'
                      min={key === 'width' || key === 'height' ? '0.0001' : '0'}
                      onChange={(event) => updateSourceBound(mapping.key, key, event.target.value)}
                      step='0.01'
                      type='number'
                      value={mapping.sourceBounds?.[key] ?? ''}
                    />
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
        {!mappingsValid && <p className={styles.studioFieldError}>Use 1–24 unique surface IDs containing only letters, numbers, underscores or hyphens, with a label and model face for each. Every additional surface needs panel bounds between 0 and 1 that stay inside the source image.</p>}
      </div>

      <div className={styles.studioPanel}>
        <div className={styles.studioPanelHeading}>
          <div><strong>Visual preview only</strong><small>Current source panels and dimensions; not a production proof</small></div>
        </div>
        {studioPreview ? (
          <div className={styles.studioVisualPreview}>
            <LazyProduct3DPreview
              accent='#0f766e'
              background='#f6f3ec'
              dimensionsMm={studioPreview.dimensionsMm}
              document={studioPreview.document}
              materialName='Preview material'
              productName={`${productName} visual draft`}
              productType={productType}
              structuralDesign={studioPreview.model}
              surfaces={studioPreview.surfaces}
            />
          </div>
        ) : (
          <p className={styles.configHint}>Choose a supported image and complete valid geometry, dimensions and surface mappings to inspect the visual preview.</p>
        )}
      </div>

      <button className={styles.buttonPrimary} disabled={!selectedFile || !configurationValid || Boolean(workingAction)} onClick={() => void uploadImage()} type='button'>
        {workingAction === 'upload' ? <LoaderCircle className={styles.studioSpin} size={14} /> : <CloudUpload size={14} />}
        {workingAction === 'upload' ? 'Uploading…' : 'Upload and start processing'}
      </button>

      <div className={styles.studioPanel}>
        <div className={styles.studioPanelHeading}>
          <div><strong>4. Jobs and confirmation</strong><small>Select a job to inspect its available configuration</small></div>
          <button aria-label='Refresh studio jobs' className={styles.iconButton} disabled={loading} onClick={() => void loadStudio()} type='button'><RefreshCw className={loading ? styles.studioSpin : ''} size={13} /></button>
        </div>
        {loading && !jobs.length ? <div className={styles.studioLoading}><LoaderCircle className={styles.studioSpin} size={16} /> Loading jobs…</div> : null}
        {!loading && !jobs.length ? <p className={styles.configHint}>No visualization jobs have been created for this product.</p> : null}
        <div className={styles.studioJobList}>
          {jobs.map((job) => {
            const presentation = statusPresentation(job.status);
            const retryable = job.status.toUpperCase() === 'FAILED'
              && (typeof job.attempt !== 'number' || typeof job.maxAttempts !== 'number' || job.attempt < job.maxAttempts);
            return (
              <article className={`${styles.studioJobCard} ${selectedJobId === job.id ? styles.studioJobSelected : ''}`} key={job.id}>
                <button className={styles.studioJobSelect} onClick={() => applyJobConfiguration(job)} type='button'>
                  <span><strong>{jobAsset(job)?.originalName ?? `Job ${job.id.slice(-6)}`}</strong><small>{formatDate(job.updatedAt ?? job.createdAt)}</small></span>
                  <StatusBadge tone={presentation.tone}>{presentation.label}</StatusBadge>
                </button>
                {jobError(job) && <p>{jobError(job)}</p>}
                {retryable && <button className={styles.buttonSecondary} disabled={Boolean(workingAction)} onClick={() => void retryJob(job)} type='button'>{workingAction === `retry-${job.id}` ? <LoaderCircle className={styles.studioSpin} size={12} /> : <RefreshCw size={12} />} Retry</button>}
              </article>
            );
          })}
        </div>
        {selectedJob && Object.keys(selectedAnalysis).length > 0 && (
          <div className={styles.studioAnalysis}>
            <div><strong>Analysis result</strong><small>{text(selectedAnalysis.source) === 'external' ? 'External analyzer output' : 'Guided manual analysis'}</small></div>
            <dl>
              <div><dt>Classification</dt><dd>{analysisValue(analysisClassification.kind) ?? 'Unknown'} · {analysisConfidence(analysisClassification.confidence)}</dd></div>
              <div><dt>Detected product</dt><dd>{text(analysisProductType.value) ?? 'Needs confirmation'} · {analysisConfidence(analysisProductType.confidence)}</dd></div>
              <div><dt>Orientation</dt><dd>{analysisValue(analysisOrientation.value) ?? 'Unknown'} · {analysisConfidence(analysisOrientation.confidence)}</dd></div>
            </dl>
            {analysisWarnings.length > 0 && <ul>{analysisWarnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>}
            {text(selectedAnalysis.nextAction) && <p><strong>Next action:</strong> {text(selectedAnalysis.nextAction)}</p>}
          </div>
        )}
        {selectedJob && selectedStatus === 'NEEDS_CONFIRMATION' && (
          <div className={styles.studioConfirmation}>
            <label><input checked={reviewed} onChange={(event) => setReviewed(event.target.checked)} type='checkbox' /><span><strong>I reviewed this configuration</strong><small>The shape, dimensions and every surface mapping above match the physical product.</small></span></label>
            <button className={styles.buttonPrimary} disabled={!reviewed || !configurationValid || Boolean(workingAction)} onClick={() => void confirmAnalysis()} type='button'>{workingAction === `confirm-${selectedJob.id}` ? <LoaderCircle className={styles.studioSpin} size={13} /> : <Send size={13} />} Confirm configuration</button>
          </div>
        )}
      </div>

      <div className={styles.studioPanel}>
        <div className={styles.studioPanelHeading}><div><strong>5. Reusable templates</strong><small>Save only from a ready, confirmed job</small></div></div>
        {libraryTemplates.length > 0 && (
          <div className={styles.studioTemplateReuse}>
            <label className={styles.fieldGroup}>
              <span className={styles.fieldLabel}>Start from published setup</span>
              <select className={styles.select} onChange={(event) => setSelectedLibraryTemplateId(event.target.value)} value={selectedLibraryTemplateId}>
                {libraryTemplates.map((template) => <option key={template.id} value={template.id}>{template.name} · {template.productType || 'product'}</option>)}
              </select>
            </label>
            <button className={styles.buttonSecondary} disabled={!selectedLibraryTemplateId || Boolean(workingAction)} onClick={applyReusableTemplate} type='button'>Use setup</button>
          </div>
        )}
        <div className={styles.studioTemplateCreate}>
          <label className={styles.fieldGroup}><span className={styles.fieldLabel}>Template name</span><input className={styles.input} maxLength={160} onChange={(event) => setTemplateName(event.target.value)} placeholder={`${productName} visualization`} value={templateName} /></label>
          <button className={styles.buttonPrimary} disabled={!readyForTemplate || !configurationValid || !templateName.trim() || Boolean(workingAction)} onClick={() => void saveTemplate()} type='button'>{selectedJob && workingAction === `save-template-${selectedJob.id}` ? <LoaderCircle className={styles.studioSpin} size={13} /> : <Save size={13} />} Save template</button>
        </div>
        {!templates.length ? <p className={styles.configHint}>No reusable visualization templates are saved for this product.</p> : null}
        <div className={styles.studioTemplateList}>
          {templates.map((template) => {
            const status = (template.status ?? 'DRAFT').toUpperCase();
            const published = ['PUBLISHED', 'ACTIVE'].includes(status);
            const archived = status === 'ARCHIVED';
            return (
              <article key={template.id}>
                <div><strong>{template.name}</strong><small>{template.productType || 'Product type not recorded'} · {formatDate(template.createdAt)}</small></div>
                <StatusBadge tone={published ? 'success' : archived ? 'muted' : 'warning'}>{status.toLowerCase()}</StatusBadge>
                <div>
                  <button className={styles.buttonSecondary} disabled={published || archived || Boolean(workingAction)} onClick={() => void changeTemplateStatus(template, 'publish-template')} type='button'><Send size={11} /> Publish</button>
                  <button className={styles.buttonGhost} disabled={archived || Boolean(workingAction)} onClick={() => void changeTemplateStatus(template, 'archive-template')} type='button'><Archive size={11} /> Archive</button>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
