"use client";

import type {
  ArtworkEditPermissions,
  ArtworkGeometry,
  ArtworkGeometryPolicy,
  ArtworkImageMimeType,
  ArtworkSurfacePolicy,
  ArtworkTextAlignment,
  ProductArtworkPolicy,
} from "@/lib/types";
import { ARTWORK_TEXT_ALIGNMENTS, resolveArtworkTextTypography } from "@/lib/artwork-text-policy";
import styles from "./admin.module.css";

interface ProductArtworkPolicyEditorProps {
  value: ProductArtworkPolicy;
  onChange: (value: ProductArtworkPolicy) => void;
}

const permissionLabels: Array<[keyof ArtworkEditPermissions, string]> = [
  ["move", "Move"],
  ["resize", "Resize"],
  ["rotate", "Rotate"],
  ["color", "Change colour"],
  ["font", "Change font"],
];

const mimeLabels: Array<[ArtworkImageMimeType, string]> = [
  ["image/png", "PNG"],
  ["image/jpeg", "JPG"],
  ["image/webp", "WEBP"],
];

function finiteNumber(value: string, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = "1",
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: string;
}) {
  return (
    <label className={styles.fieldGroup}>
      <span className={styles.fieldLabel}>{label}</span>
      <input
        className={styles.input}
        max={max}
        min={min}
        step={step}
        type="number"
        value={value}
        onChange={(event) => onChange(finiteNumber(event.target.value, value))}
      />
    </label>
  );
}

function PermissionFields({
  value,
  onChange,
  image,
}: {
  value: ArtworkEditPermissions;
  onChange: (value: ArtworkEditPermissions) => void;
  image?: boolean;
}) {
  return (
    <div className={styles.checkboxGrid}>
      {permissionLabels.filter(([key]) => !image || (key !== "color" && key !== "font")).map(([key, label]) => (
        <label key={key}>
          <input
            checked={value[key]}
            type="checkbox"
            onChange={(event) => onChange({ ...value, [key]: event.target.checked })}
          />
          {label}
        </label>
      ))}
    </div>
  );
}

function GeometryFields({
  value,
  onChange,
}: {
  value: ArtworkGeometry;
  onChange: (value: ArtworkGeometry) => void;
}) {
  return (
    <div className={styles.fieldGrid}>
      {(["x", "y", "width", "height", "rotation"] as const).map((key) => (
        <NumberField
          key={key}
          label={`Default ${key}`}
          value={value[key]}
          step="0.1"
          onChange={(next) => onChange({ ...value, [key]: next })}
        />
      ))}
    </div>
  );
}

function GeometryPolicyFields({
  label,
  value,
  onChange,
}: {
  label: string;
  value: ArtworkGeometryPolicy;
  onChange: (value: ArtworkGeometryPolicy) => void;
}) {
  return (
    <>
      <p className={styles.configHint}>Default {label.toLowerCase()} placement (editor coordinates)</p>
      <GeometryFields
        value={value.default}
        onChange={(defaultGeometry) => onChange({ ...value, default: defaultGeometry })}
      />
      <p className={styles.configHint}>Allowed {label.toLowerCase()} size and rotation</p>
      <div className={styles.fieldGrid}>
        <NumberField label="Minimum placed width" min={0.1} max={100000} step="0.1" value={value.minimumWidth} onChange={(minimumWidth) => onChange({ ...value, minimumWidth })} />
        <NumberField label="Maximum placed width" min={0.1} max={100000} step="0.1" value={value.maximumWidth} onChange={(maximumWidth) => onChange({ ...value, maximumWidth })} />
        <NumberField label="Minimum placed height" min={0.1} max={100000} step="0.1" value={value.minimumHeight} onChange={(minimumHeight) => onChange({ ...value, minimumHeight })} />
        <NumberField label="Maximum placed height" min={0.1} max={100000} step="0.1" value={value.maximumHeight} onChange={(maximumHeight) => onChange({ ...value, maximumHeight })} />
        <NumberField label="Minimum rotation (degrees)" min={-360} max={360} step="0.1" value={value.minimumRotation} onChange={(minimumRotation) => onChange({ ...value, minimumRotation })} />
        <NumberField label="Maximum rotation (degrees)" min={-360} max={360} step="0.1" value={value.maximumRotation} onChange={(maximumRotation) => onChange({ ...value, maximumRotation })} />
      </div>
    </>
  );
}

export function ProductArtworkPolicyEditor({ value, onChange }: ProductArtworkPolicyEditorProps) {
  function updateSurface(index: number, update: (surface: ArtworkSurfacePolicy) => ArtworkSurfacePolicy) {
    onChange({
      ...value,
      surfaces: value.surfaces.map((surface, surfaceIndex) => surfaceIndex === index ? update(surface) : surface),
    });
  }

  return (
    <div className={styles.configList}>
      <div className={styles.fieldGrid}>
        <NumberField
          label="Maximum elements per design"
          min={1}
          max={100}
          value={value.maximumElements}
          onChange={(maximumElements) => onChange({ ...value, maximumElements })}
        />
      </div>

      {value.surfaces.map((surface, index) => {
        const update = (next: ArtworkSurfacePolicy) => updateSurface(index, () => next);
        const typography = resolveArtworkTextTypography(surface.text);
        return (
          <div className={styles.configCard} key={surface.id}>
            <div className={styles.configCardHead}>
              <div>
                <strong>{surface.label}</strong>
                <small>{surface.coordinateSpace.width} × {surface.coordinateSpace.height} editor coordinates</small>
              </div>
            </div>

            <div
              aria-label={`${surface.label} placement preview`}
              className={styles.policyPreview}
              style={{ aspectRatio: `${surface.coordinateSpace.width} / ${surface.coordinateSpace.height}` }}
            >
              <span
                className={styles.policyPrintableBounds}
                style={{
                  left: `${surface.printableBounds.x / surface.coordinateSpace.width * 100}%`,
                  top: `${surface.printableBounds.y / surface.coordinateSpace.height * 100}%`,
                  width: `${surface.printableBounds.width / surface.coordinateSpace.width * 100}%`,
                  height: `${surface.printableBounds.height / surface.coordinateSpace.height * 100}%`,
                }}
              />
              {surface.text.enabled && <span
                className={styles.policyTextPlacement}
                style={{
                  left: `${surface.text.geometry.default.x / surface.coordinateSpace.width * 100}%`,
                  top: `${surface.text.geometry.default.y / surface.coordinateSpace.height * 100}%`,
                  width: `${surface.text.geometry.default.width / surface.coordinateSpace.width * 100}%`,
                  height: `${surface.text.geometry.default.height / surface.coordinateSpace.height * 100}%`,
                  transform: `rotate(${surface.text.geometry.default.rotation}deg)`,
                  color: surface.text.defaultColor,
                }}
              >Name</span>}
              {surface.image.enabled && <span
                className={styles.policyImagePlacement}
                style={{
                  left: `${surface.image.geometry.default.x / surface.coordinateSpace.width * 100}%`,
                  top: `${surface.image.geometry.default.y / surface.coordinateSpace.height * 100}%`,
                  width: `${surface.image.geometry.default.width / surface.coordinateSpace.width * 100}%`,
                  height: `${surface.image.geometry.default.height / surface.coordinateSpace.height * 100}%`,
                  transform: `rotate(${surface.image.geometry.default.rotation}deg)`,
                }}
              >Image</span>}
            </div>

            <p className={styles.configHint}>Printable bounds</p>
            <div className={styles.fieldGrid}>
              {(["x", "y", "width", "height"] as const).map((key) => (
                <NumberField
                  key={key}
                  label={key.toUpperCase()}
                  value={surface.printableBounds[key]}
                  step="0.1"
                  onChange={(next) => update({ ...surface, printableBounds: { ...surface.printableBounds, [key]: next } })}
                />
              ))}
            </div>

            <div className={styles.configCard}>
              <div className={styles.configCardHead}>
                <strong>Text controls</strong>
                <label>
                  <input
                    checked={surface.text.enabled}
                    type="checkbox"
                    onChange={(event) => update({ ...surface, text: { ...surface.text, enabled: event.target.checked } })}
                  /> Enabled
                </label>
              </div>
              <div className={styles.fieldGrid}>
                <NumberField
                  label="Maximum text elements"
                  min={surface.text.enabled ? 1 : 0}
                  max={100}
                  value={surface.text.maximumElements}
                  onChange={(maximumElements) => update({ ...surface, text: { ...surface.text, maximumElements } })}
                />
                <label className={styles.fieldGroup}>
                  <span className={styles.fieldLabel}>Default colour</span>
                  <input
                    className={styles.input}
                    type="color"
                    value={surface.text.defaultColor}
                    onChange={(event) => update({ ...surface, text: { ...surface.text, defaultColor: event.target.value } })}
                  />
                </label>
                <label className={styles.fieldGroup}>
                  <span className={styles.fieldLabel}>Allowed colours</span>
                  <input
                    className={styles.input}
                    placeholder="#17324d, #ffffff (blank allows any)"
                    value={surface.text.allowedColors.join(", ")}
                    onChange={(event) => update({ ...surface, text: { ...surface.text, allowedColors: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) } })}
                  />
                </label>
                <label className={styles.fieldGroup}>
                  <span className={styles.fieldLabel}>Default font</span>
                  <select
                    className={styles.select}
                    value={surface.text.defaultFontFamily}
                    onChange={(event) => update({ ...surface, text: { ...surface.text, defaultFontFamily: event.target.value as "rounded" | "sans" | "serif" } })}
                  >
                    <option value="rounded">Rounded</option>
                    <option value="sans">Sans</option>
                    <option value="serif">Serif</option>
                  </select>
                </label>
                <NumberField
                  label="Default font size"
                  min={typography.minimumFontSize}
                  max={typography.maximumFontSize}
                  step="0.1"
                  value={typography.defaultFontSize}
                  onChange={(defaultFontSize) => update({ ...surface, text: { ...surface.text, defaultFontSize } })}
                />
                <NumberField
                  label="Minimum font size"
                  min={1}
                  max={1000}
                  step="0.1"
                  value={typography.minimumFontSize}
                  onChange={(minimumFontSize) => update({ ...surface, text: { ...surface.text, minimumFontSize } })}
                />
                <NumberField
                  label="Maximum font size"
                  min={1}
                  max={1000}
                  step="0.1"
                  value={typography.maximumFontSize}
                  onChange={(maximumFontSize) => update({ ...surface, text: { ...surface.text, maximumFontSize } })}
                />
                <label className={styles.fieldGroup}>
                  <span className={styles.fieldLabel}>Default alignment</span>
                  <select
                    className={styles.select}
                    value={typography.defaultTextAlign}
                    onChange={(event) => {
                      const defaultTextAlign = event.target.value as ArtworkTextAlignment;
                      update({
                        ...surface,
                        text: {
                          ...surface.text,
                          defaultTextAlign,
                          allowedTextAlignments: typography.allowedTextAlignments.includes(defaultTextAlign)
                            ? typography.allowedTextAlignments
                            : [...typography.allowedTextAlignments, defaultTextAlign],
                        },
                      });
                    }}
                  >
                    {ARTWORK_TEXT_ALIGNMENTS.map((alignment) => <option key={alignment} value={alignment}>{alignment[0].toUpperCase() + alignment.slice(1)}</option>)}
                  </select>
                </label>
              </div>
              <p className={styles.configHint}>Available fonts and alignments</p>
              <div className={styles.checkboxGrid}>
                {([
                  ["rounded", "Rounded"],
                  ["sans", "Sans"],
                  ["serif", "Serif"],
                ] as const).map(([font, label]) => (
                  <label key={font}>
                    <input
                      checked={surface.text.allowedFontFamilies.includes(font)}
                      type="checkbox"
                      onChange={(event) => {
                        const next = event.target.checked
                          ? [...new Set([...surface.text.allowedFontFamilies, font])]
                          : surface.text.allowedFontFamilies.filter((item) => item !== font);
                        if (!next.length) return;
                        update({
                          ...surface,
                          text: {
                            ...surface.text,
                            allowedFontFamilies: next,
                            defaultFontFamily: next.includes(surface.text.defaultFontFamily)
                              ? surface.text.defaultFontFamily
                              : next[0],
                          },
                        });
                      }}
                    />
                    {label}
                  </label>
                ))}
                {ARTWORK_TEXT_ALIGNMENTS.map((alignment) => (
                  <label key={alignment}>
                    <input
                      checked={typography.allowedTextAlignments.includes(alignment)}
                      type="checkbox"
                      onChange={(event) => {
                        const next = event.target.checked
                          ? [...new Set([...typography.allowedTextAlignments, alignment])]
                          : typography.allowedTextAlignments.filter((item) => item !== alignment);
                        if (!next.length) return;
                        update({
                          ...surface,
                          text: {
                            ...surface.text,
                            allowedTextAlignments: next,
                            defaultTextAlign: next.includes(typography.defaultTextAlign)
                              ? typography.defaultTextAlign
                              : next[0],
                          },
                        });
                      }}
                    />
                    {alignment[0].toUpperCase() + alignment.slice(1)} align
                  </label>
                ))}
              </div>
              <PermissionFields
                value={surface.text.permissions}
                onChange={(permissions) => update({ ...surface, text: { ...surface.text, permissions } })}
              />
              <GeometryPolicyFields
                label="Text"
                value={surface.text.geometry}
                onChange={(geometry) => update({ ...surface, text: { ...surface.text, geometry } })}
              />
            </div>

            <div className={styles.configCard}>
              <div className={styles.configCardHead}>
                <strong>Image upload controls</strong>
                <label>
                  <input
                    checked={surface.image.enabled}
                    type="checkbox"
                    onChange={(event) => update({ ...surface, image: { ...surface.image, enabled: event.target.checked, required: event.target.checked && surface.image.required } })}
                  /> Enabled
                </label>
              </div>
              <div className={styles.fieldGrid}>
                <NumberField label="Maximum images" min={surface.image.enabled ? 1 : 0} max={100} value={surface.image.maximumElements} onChange={(maximumElements) => update({ ...surface, image: { ...surface.image, maximumElements } })} />
                <NumberField label="Maximum MB" min={0} max={20} step="0.1" value={surface.image.maximumBytes / 1_000_000} onChange={(megabytes) => update({ ...surface, image: { ...surface.image, maximumBytes: Math.round(megabytes * 1_000_000) } })} />
                <NumberField label="Minimum width (px)" min={1} max={50000} value={surface.image.minimumSourceWidth} onChange={(minimumSourceWidth) => update({ ...surface, image: { ...surface.image, minimumSourceWidth } })} />
                <NumberField label="Minimum height (px)" min={1} max={50000} value={surface.image.minimumSourceHeight} onChange={(minimumSourceHeight) => update({ ...surface, image: { ...surface.image, minimumSourceHeight } })} />
                <NumberField label="Maximum width (px)" min={1} max={50000} value={surface.image.maximumSourceWidth} onChange={(maximumSourceWidth) => update({ ...surface, image: { ...surface.image, maximumSourceWidth } })} />
                <NumberField label="Maximum height (px)" min={1} max={50000} value={surface.image.maximumSourceHeight} onChange={(maximumSourceHeight) => update({ ...surface, image: { ...surface.image, maximumSourceHeight } })} />
                <label className={styles.fieldGroup}>
                  <span className={styles.fieldLabel}>Allowed ratios</span>
                  <input
                    className={styles.input}
                    placeholder="1, 1.5, 2 (blank allows any)"
                    value={surface.image.allowedAspectRatios.join(", ")}
                    onChange={(event) => update({ ...surface, image: { ...surface.image, allowedAspectRatios: event.target.value.split(",").map(Number).filter((item) => Number.isFinite(item) && item > 0) } })}
                  />
                </label>
                <NumberField label="Ratio tolerance" min={0} max={1} step="0.01" value={surface.image.aspectRatioTolerance} onChange={(aspectRatioTolerance) => update({ ...surface, image: { ...surface.image, aspectRatioTolerance } })} />
                <NumberField label="Charge per image (₹)" min={0} step="0.01" value={surface.image.chargePerImagePaise / 100} onChange={(rupees) => update({ ...surface, image: { ...surface.image, chargePerImagePaise: Math.round(rupees * 100) } })} />
              </div>
              <div className={styles.checkboxGrid}>
                {mimeLabels.map(([mimeType, label]) => (
                  <label key={mimeType}>
                    <input
                      checked={surface.image.allowedMimeTypes.includes(mimeType)}
                      type="checkbox"
                      onChange={(event) => update({
                        ...surface,
                        image: {
                          ...surface.image,
                          allowedMimeTypes: event.target.checked
                            ? [...surface.image.allowedMimeTypes, mimeType]
                            : surface.image.allowedMimeTypes.filter((item) => item !== mimeType),
                        },
                      })}
                    /> {label}
                  </label>
                ))}
                {([
                  ["required", "Customer must upload an image"],
                  ["allowTransparency", "Allow transparency"],
                  ["allowCrop", "Allow crop/fill"],
                  ["approvalRequired", "Require artwork approval"],
                ] as const).map(([key, label]) => (
                  <label key={key}>
                    <input checked={surface.image[key]} disabled={key === "required" && !surface.image.enabled} type="checkbox" onChange={(event) => update({ ...surface, image: { ...surface.image, [key]: event.target.checked } })} /> {label}
                  </label>
                ))}
              </div>
              <PermissionFields image value={surface.image.permissions} onChange={(permissions) => update({ ...surface, image: { ...surface.image, permissions } })} />
              <GeometryPolicyFields label="Image" value={surface.image.geometry} onChange={(geometry) => update({ ...surface, image: { ...surface.image, geometry } })} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
