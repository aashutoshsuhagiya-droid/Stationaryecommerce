"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  buildPackagingDieline,
  type PackagingDieline,
  type PackagingDielineKind,
  type PackagingDielinePanel,
} from "@/lib/packaging-dieline";
import { formatPackagingMeasurement, type PackagingSizeMm } from "@/lib/packaging-quote";
import styles from "./packaging-dieline.module.css";

export interface PackagingDielineViewProps {
  kind: PackagingDielineKind;
  sizeMm: PackagingSizeMm;
  unit: "mm" | "cm" | "in";
  productName: string;
  /** Optional image (data URL or same-origin URL) shown inside the Front panel. */
  frontArtworkUrl?: string;
}

type Unit = PackagingDielineViewProps["unit"];
type Side = "top" | "bottom" | "left" | "right";

interface Box {
  width: number;
  height: number;
}

interface PlacedDimension {
  key: string;
  side: Side;
  /** Span along the side, mm. */
  start: number;
  end: number;
  /** Where the measured edge sits across the side (y for top/bottom, x for left/right), mm. */
  origin: number;
  lane: number;
  text: string;
}

interface PlacedLabel {
  panel: PackagingDielinePanel;
  fontPx: number;
  rotated: boolean;
  secondary: boolean;
}

const KIND_NAMES: Record<PackagingDielineKind, string> = {
  "tuck-end-carton": "reverse tuck end carton",
  "mailer-box": "roll-end tuck-front mailer box",
  "rigid-lid-box": "rigid box lid and base wraps",
  "pyramid-box": "triangular pyramid box",
  "paper-bag": "paper carry bag",
  "stand-up-pouch": "stand-up pouch",
  "mailer-envelope": "mailer envelope",
  "pillow-box": "pillow box",
  tray: "tray",
  "flat-sheet": "flat sheet",
};

const SECONDARY_LABELS = new Set(["Glue", "Dust flap", "Tuck", "Turn-in", "End flap", "Inner side", "Turnover", "Lid front", "Lid side"]);

/** Fallback drawing area before the container is measured (and during server render). */
const DEFAULT_BOX: Box = { width: 480, height: 380 };
const LABEL_SIZES_PX = [11, 10, 9, 8];
const DIM_FONT_PX = 10.5;
const SHEET_MARGIN_PX = 8;
/** Distance from the sheet edge to the first dimension line, and between stacked dimension lines. */
const DIM_GAP_PX = 10;
const DIM_LANE_PX = 22;
const CHAR_WIDTH_EM = 0.6;

const textWidthPx = (text: string, fontPx: number) => text.length * fontPx * CHAR_WIDTH_EM;

/** 45° hatch inside one square pattern tile (no patternTransform, which some renderers mishandle). */
function hatchPath(tile: number) {
  const t = svgNumber(tile);
  const q = svgNumber(tile / 4);
  return `M0 ${t}L${t} 0M${-q} ${q}L${q} ${-q}M${t - q} ${t + q}L${t + q} ${t - q}`;
}
const svgNumber = (value: number) => Number(value.toFixed(3));

function axisValue(label: string, sizeMm: PackagingSizeMm) {
  const value = label === "L" ? sizeMm.length : label === "W" ? sizeMm.width : label === "H" ? sizeMm.height : 0;
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/** Sides, spans and texts of the dimension annotations; lanes are assigned later at a known scale. */
function describeDimensions(dieline: PackagingDieline, sizeMm: PackagingSizeMm, unit: Unit): PlacedDimension[] {
  return dieline.dimensions.map((dimension, index) => {
    const horizontal = Math.abs(dimension.x2 - dimension.x1) >= Math.abs(dimension.y2 - dimension.y1);
    const measured = Math.hypot(dimension.x2 - dimension.x1, dimension.y2 - dimension.y1);
    const value = axisValue(dimension.label, sizeMm) || measured;
    const text = `${dimension.label} ${formatPackagingMeasurement(value, unit)} ${unit}`;
    if (horizontal) {
      const origin = (dimension.y1 + dimension.y2) / 2;
      return {
        key: `${dimension.label}-${index}`,
        side: origin < dieline.heightMm / 2 ? "top" : "bottom",
        start: Math.min(dimension.x1, dimension.x2),
        end: Math.max(dimension.x1, dimension.x2),
        origin,
        lane: 0,
        text,
      };
    }
    const origin = (dimension.x1 + dimension.x2) / 2;
    return {
      key: `${dimension.label}-${index}`,
      side: origin < dieline.widthMm / 2 ? "left" : "right",
      start: Math.min(dimension.y1, dimension.y2),
      end: Math.max(dimension.y1, dimension.y2),
      origin,
      lane: 0,
      text,
    };
  });
}

/** Stacks dimensions on the same side into lanes so neither their spans nor their texts collide. */
function assignLanes(dimensions: PlacedDimension[], scale: number) {
  const lanes = new Map<Side, number[]>();
  const ordered = [...dimensions].sort((left, right) => left.start - right.start);
  for (const dimension of ordered) {
    const center = (dimension.start + dimension.end) / 2;
    const occupied = Math.max(dimension.end - dimension.start, (textWidthPx(dimension.text, DIM_FONT_PX) + 10) / scale);
    const from = center - occupied / 2;
    const to = center + occupied / 2;
    const ends = lanes.get(dimension.side) ?? [];
    let lane = ends.findIndex((end) => end <= from + 1e-6);
    if (lane < 0) lane = ends.length;
    ends[lane] = to;
    lanes.set(dimension.side, ends);
    dimension.lane = lane;
  }
  const count = (side: Side) => lanes.get(side)?.length ?? 0;
  return { top: count("top"), bottom: count("bottom"), left: count("left"), right: count("right") };
}

function sidePaddingPx(lanes: number) {
  if (!lanes) return SHEET_MARGIN_PX;
  return SHEET_MARGIN_PX + DIM_GAP_PX + (lanes - 1) * DIM_LANE_PX + 4 + DIM_FONT_PX;
}

interface Layout {
  scale: number;
  viewBox: string;
  dimensions: PlacedDimension[];
}

function layoutDieline(dieline: PackagingDieline, sizeMm: PackagingSizeMm, unit: Unit, box: Box): Layout {
  const sheetWidth = Math.max(dieline.widthMm, 1e-3);
  const sheetHeight = Math.max(dieline.heightMm, 1e-3);
  const dimensions = describeDimensions(dieline, sizeMm, unit);
  const initial = new Set(dimensions.map((dimension) => dimension.side));
  let lanes = {
    top: initial.has("top") ? 1 : 0,
    bottom: initial.has("bottom") ? 1 : 0,
    left: initial.has("left") ? 1 : 0,
    right: initial.has("right") ? 1 : 0,
  };
  let scale = 1;
  // Padding depends on lane count, lane count on text size in mm, which depends on scale: settle in two passes.
  for (let pass = 0; pass < 2; pass += 1) {
    const horizontal = sidePaddingPx(lanes.left) + sidePaddingPx(lanes.right);
    const vertical = sidePaddingPx(lanes.top) + sidePaddingPx(lanes.bottom);
    scale = Math.max(1e-3, Math.min((box.width - horizontal) / sheetWidth, (box.height - vertical) / sheetHeight));
    lanes = assignLanes(dimensions, scale);
  }
  const padLeft = sidePaddingPx(lanes.left) / scale;
  const padRight = sidePaddingPx(lanes.right) / scale;
  const padTop = sidePaddingPx(lanes.top) / scale;
  const padBottom = sidePaddingPx(lanes.bottom) / scale;
  // Match the container's aspect ratio so the drawing fills it and 1 px is exactly 1/scale mm.
  const viewWidth = box.width / scale;
  const viewHeight = box.height / scale;
  const contentWidth = sheetWidth + padLeft + padRight;
  const contentHeight = sheetHeight + padTop + padBottom;
  const viewX = -padLeft - (viewWidth - contentWidth) / 2;
  const viewY = -padTop - (viewHeight - contentHeight) / 2;
  return {
    scale,
    viewBox: [viewX, viewY, viewWidth, viewHeight].map(svgNumber).join(" "),
    dimensions,
  };
}

/** Largest label size that fits the panel, horizontally or (for tall narrow panels) rotated. */
function placeLabels(dieline: PackagingDieline, scale: number, skipFront: boolean): PlacedLabel[] {
  const placed: PlacedLabel[] = [];
  for (const panel of dieline.panels) {
    if (skipFront && panel.id === "front") continue;
    const widthPx = panel.width * scale;
    const heightPx = panel.height * scale;
    const secondary = SECONDARY_LABELS.has(panel.label);
    for (const fontPx of secondary ? LABEL_SIZES_PX.slice(1) : LABEL_SIZES_PX) {
      const text = textWidthPx(panel.label, fontPx) + 6;
      const line = fontPx * 1.3;
      if (text <= widthPx && line <= heightPx) {
        placed.push({ panel, fontPx, rotated: false, secondary });
        break;
      }
      if (text <= heightPx && line <= widthPx && heightPx > widthPx) {
        placed.push({ panel, fontPx, rotated: true, secondary });
        break;
      }
    }
  }
  return placed;
}

function useMeasuredBox() {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<Box>(DEFAULT_BOX);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = (width: number, height: number) => {
      if (!(width > 0 && height > 0)) return;
      setBox((current) =>
        Math.abs(current.width - width) < 0.5 && Math.abs(current.height - height) < 0.5
          ? current
          : { width: Math.round(width), height: Math.round(height) },
      );
    };
    const rect = element.getBoundingClientRect();
    update(rect.width, rect.height);
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) update(entry.contentRect.width, entry.contentRect.height);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return { ref, box };
}

export function PackagingDielineView({ kind, sizeMm, unit, productName, frontArtworkUrl }: PackagingDielineViewProps) {
  const { ref, box } = useMeasuredBox();
  const rawId = useId();
  const id = `dieline-${rawId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const { length, width, height } = sizeMm;
  const dieline = useMemo(() => buildPackagingDieline(kind, { length, width, height }), [kind, length, width, height]);
  const layout = useMemo(() => layoutDieline(dieline, { length, width, height }, unit, box), [dieline, length, width, height, unit, box]);
  const front = frontArtworkUrl ? dieline.panels.find((panel) => panel.id === "front") : undefined;
  const labels = useMemo(() => placeLabels(dieline, layout.scale, Boolean(front)), [dieline, layout.scale, front]);

  const px = (value: number) => svgNumber(value / layout.scale);
  const hasGlue = dieline.glue.length > 0;
  const guideLabel = kind === "flat-sheet" ? "Safe area" : "Fold line";
  const sheetSize = `${formatPackagingMeasurement(dieline.widthMm, unit)} × ${formatPackagingMeasurement(dieline.heightMm, unit)} ${unit}`;
  const dimensionSummary = layout.dimensions.map((dimension) => dimension.text).join(", ");
  const description =
    `Flat die-cut layout of the ${KIND_NAMES[kind]}, sheet ${sheetSize}. ` +
    `Solid lines are cuts, dashed lines are ${kind === "flat-sheet" ? "the safe-area guide" : "folds"}` +
    `${hasGlue ? ", hatched areas take glue" : ""}.` +
    `${dimensionSummary ? ` Dimensions: ${dimensionSummary}.` : ""}`;

  return (
    <div className={styles.root}>
      <div ref={ref} className={styles.canvas}>
        <svg
          className={styles.svg}
          viewBox={layout.viewBox}
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-labelledby={`${id}-title ${id}-desc`}
          xmlns="http://www.w3.org/2000/svg"
        >
          <title id={`${id}-title`}>{`${productName} dieline`}</title>
          <desc id={`${id}-desc`}>{description}</desc>
          <defs>
            <pattern id={`${id}-hatch`} patternUnits="userSpaceOnUse" width={px(7)} height={px(7)}>
              <rect width={px(7)} height={px(7)} fill="#fde7b0" />
              <path d={hatchPath(px(7))} stroke="#e59a0b" strokeWidth={px(1.4)} strokeLinecap="square" />
            </pattern>
            <clipPath id={`${id}-sheet`}>
              {dieline.cuts.map((path, index) => (
                <path key={index} d={path} />
              ))}
            </clipPath>
            {front ? (
              <clipPath id={`${id}-front`}>
                <rect x={front.x} y={front.y} width={front.width} height={front.height} />
              </clipPath>
            ) : null}
          </defs>

          <g className={styles.sheet}>
            {dieline.cuts.map((path, index) => (
              <path key={index} d={path} />
            ))}
          </g>

          {hasGlue ? (
            <g clipPath={`url(#${id}-sheet)`}>
              {dieline.glue.map((path, index) => (
                <path key={index} d={path} fill={`url(#${id}-hatch)`} stroke="#e59a0b" strokeWidth={px(0.6)} strokeOpacity={0.6} />
              ))}
            </g>
          ) : null}

          {front && frontArtworkUrl ? (
            <image
              href={frontArtworkUrl}
              x={front.x}
              y={front.y}
              width={front.width}
              height={front.height}
              preserveAspectRatio="xMidYMid meet"
              clipPath={`url(#${id}-front)`}
            />
          ) : null}

          <g className={styles.fold} strokeWidth={px(1.15)} strokeDasharray={`${px(5)} ${px(3.5)}`}>
            {dieline.folds.map((path, index) => (
              <path key={index} d={path} />
            ))}
          </g>

          <g className={styles.cut} strokeWidth={px(1.5)}>
            {dieline.cuts.map((path, index) => (
              <path key={index} d={path} />
            ))}
          </g>

          <g aria-hidden="true">
            {labels.map(({ panel, fontPx, rotated, secondary }) => {
              const cx = svgNumber(panel.x + panel.width / 2);
              const cy = svgNumber(panel.y + panel.height / 2);
              return (
                <text
                  key={panel.id}
                  className={secondary ? `${styles.label} ${styles.labelSecondary}` : styles.label}
                  x={cx}
                  y={cy}
                  fontSize={px(fontPx)}
                  strokeWidth={px(3)}
                  textAnchor="middle"
                  dominantBaseline="central"
                  transform={rotated ? `rotate(-90 ${cx} ${cy})` : undefined}
                >
                  {panel.label}
                </text>
              );
            })}
          </g>

          <g aria-hidden="true">
            {layout.dimensions.map((dimension) => (
              <DimensionAnnotation key={dimension.key} dimension={dimension} dieline={dieline} px={px} scale={layout.scale} />
            ))}
          </g>
        </svg>
      </div>
      <ul className={styles.legend} aria-label="Dieline legend">
        <li className={styles.legendItem}>
          <svg className={styles.swatch} viewBox="0 0 22 10" aria-hidden="true">
            <line x1="1" y1="5" x2="21" y2="5" stroke="#1f2937" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          Cut line
        </li>
        <li className={styles.legendItem}>
          <svg className={styles.swatch} viewBox="0 0 22 10" aria-hidden="true">
            <line x1="1" y1="5" x2="21" y2="5" stroke="#2563eb" strokeWidth="1.3" strokeDasharray="4 3" />
          </svg>
          {guideLabel}
        </li>
        {hasGlue ? (
          <li className={styles.legendItem}>
            <svg className={styles.swatch} viewBox="0 0 22 10" aria-hidden="true">
              <defs>
                <pattern id={`${id}-legend-hatch`} patternUnits="userSpaceOnUse" width="5" height="5">
                  <rect width="5" height="5" fill="#fde7b0" />
                  <path d={hatchPath(5)} stroke="#e59a0b" strokeWidth="1.1" strokeLinecap="square" />
                </pattern>
              </defs>
              <rect x="1" y="1" width="20" height="8" rx="1.5" fill={`url(#${id}-legend-hatch)`} stroke="#e59a0b" strokeWidth="0.8" />
            </svg>
            Glue area
          </li>
        ) : null}
        <li className={styles.sheetSize}>Sheet {sheetSize}</li>
      </ul>
    </div>
  );
}

function DimensionAnnotation({
  dimension,
  dieline,
  px,
  scale,
}: {
  dimension: PlacedDimension;
  dieline: PackagingDieline;
  px: (value: number) => number;
  scale: number;
}) {
  const { side, start, end, origin, lane, text } = dimension;
  const offset = (DIM_GAP_PX + lane * DIM_LANE_PX) / scale;
  const horizontal = side === "top" || side === "bottom";
  const outward = side === "top" || side === "left" ? -1 : 1;
  const edge = side === "top" ? 0 : side === "bottom" ? dieline.heightMm : side === "left" ? 0 : dieline.widthMm;
  // The line sits outside the sheet; extension lines run from the measured edge out past it.
  const at = edge + outward * offset;
  const from = origin + outward * px(2);
  const past = at + outward * px(3);
  const spanPx = (end - start) * scale;
  const arrow = spanPx >= 18 ? px(5) : 0;
  const wing = px(2.6);
  const mid = (start + end) / 2;
  const point = (along: number, across: number) => (horizontal ? `${svgNumber(along)},${svgNumber(across)}` : `${svgNumber(across)},${svgNumber(along)}`);
  const arrowHead = (tip: number, direction: 1 | -1) =>
    [point(tip, at), point(tip - direction * arrow, at - wing), point(tip - direction * arrow, at + wing)].join(" ");
  const textOffset = outward < 0 ? px(4) : px(4 + DIM_FONT_PX * 0.75);
  const textAcross = at + outward * textOffset;
  const textX = horizontal ? svgNumber(mid) : svgNumber(textAcross);
  const textY = horizontal ? svgNumber(textAcross) : svgNumber(mid);
  return (
    <g>
      <g className={styles.extensionLine} strokeWidth={px(0.8)}>
        {horizontal ? (
          <>
            <line x1={start} y1={from} x2={start} y2={past} />
            <line x1={end} y1={from} x2={end} y2={past} />
          </>
        ) : (
          <>
            <line x1={from} y1={start} x2={past} y2={start} />
            <line x1={from} y1={end} x2={past} y2={end} />
          </>
        )}
      </g>
      <line
        className={styles.dimLine}
        strokeWidth={px(1)}
        x1={horizontal ? start : at}
        y1={horizontal ? at : start}
        x2={horizontal ? end : at}
        y2={horizontal ? at : end}
      />
      {arrow ? (
        <>
          <polygon className={styles.dimArrow} points={arrowHead(start, -1)} />
          <polygon className={styles.dimArrow} points={arrowHead(end, 1)} />
        </>
      ) : (
        <g className={styles.dimLine} strokeWidth={px(1)}>
          {[start, end].map((tick, index) =>
            horizontal ? (
              <line key={index} x1={tick} y1={at - wing} x2={tick} y2={at + wing} />
            ) : (
              <line key={index} x1={at - wing} y1={tick} x2={at + wing} y2={tick} />
            ),
          )}
        </g>
      )}
      <text
        className={styles.dimText}
        x={textX}
        y={textY}
        fontSize={px(DIM_FONT_PX)}
        textAnchor="middle"
        transform={horizontal ? undefined : `rotate(-90 ${textX} ${textY})`}
      >
        {text}
      </text>
    </g>
  );
}

export default PackagingDielineView;
