import type { BadgeStyle, FitMode } from '../model/types';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface FitParams {
  fit: FitMode;
  /** % */
  zoom: number;
  /** -100 … 100 */
  offsetX: number;
  offsetY: number;
}

/**
 * Where to draw an image of iw×ih inside the box.
 *
 * Offsets are a fraction of the real pan range: at ±100 the image edge lines up
 * with the box edge, so a cover-fit image never exposes an empty gap (v16 used a
 * fixed ±35% of the box, which left holes on square art and could not reach the
 * top of tall art).
 */
export function fitRect(iw: number, ih: number, box: Rect, p: FitParams, zoomMul = 1): Rect | null {
  if (!(iw > 0 && ih > 0 && box.w > 0 && box.h > 0)) return null;
  const base = p.fit === 'contain' ? Math.min(box.w / iw, box.h / ih) : Math.max(box.w / iw, box.h / ih);
  const scale = base * (p.zoom / 100) * zoomMul;
  const w = iw * scale;
  const h = ih * scale;
  const slackX = Math.abs(w - box.w) / 2;
  const slackY = Math.abs(h - box.h) / 2;
  const x = box.x + (box.w - w) / 2 + (p.offsetX / 100) * slackX;
  const y = box.y + (box.h - h) / 2 + (p.offsetY / 100) * slackY;
  return { x, y, w, h };
}

/** Whether the pan sliders do anything for this image (used to show a hint). */
export function panRange(iw: number, ih: number, box: Rect, p: FitParams): { x: number; y: number } {
  const r = fitRect(iw, ih, box, { ...p, offsetX: 0, offsetY: 0 });
  if (!r) return { x: 0, y: 0 };
  return { x: Math.abs(r.w - box.w) / 2, y: Math.abs(r.h - box.h) / 2 };
}

export interface PanelGeometry {
  deg: number;
  panelW: number;
  panelH: number;
  cx: number;
  cy: number;
  corner: number;
}

/**
 * The centre artwork panel. Only the rounded badge rotates; when tilted at ≤100%
 * size it auto-shrinks so the four corners stay inside the product face.
 */
export function artPanelGeometry(
  style: BadgeStyle,
  rotation: number,
  artSize: number,
  box: Rect,
  r: number,
  outerLimit?: number,
): PanelGeometry {
  const deg = style === 'rounded' ? rotation || 0 : 0;
  const size = artSize / 100;
  const absAngle = (Math.abs(deg) * Math.PI) / 180;
  const bboxFactor = Math.abs(Math.cos(absAngle)) + Math.abs(Math.sin(absAngle));
  const limit = outerLimit || box.w;
  const autoFit = deg !== 0 && size <= 1 ? Math.min(1, (limit - 22) / (box.w * bboxFactor)) : 1;
  return {
    deg,
    panelW: box.w * size * autoFit,
    panelH: box.h * size * autoFit,
    cx: box.x + box.w / 2,
    cy: box.y + box.h / 2,
    corner: deg !== 0 ? 1 : r,
  };
}

/** Badge face geometry in the 960×960 design space. Kept identical to v16. */
export const DESIGN = 960;
export const BADGE_FACE: Rect = { x: 118, y: 102, w: 724, h: 724 };
export const ACRYLIC_FACE: Rect = { x: 128, y: 112, w: 704, h: 704 };
export const ACRYLIC_HOLE = { dx: 58, dy: 58, r: 32 };
/** Acrylic main art at 主图尺寸 100% covers ≈74% of the plate width (as on official 曲绘亚克力); the rest is the dimmed frame band. */
export const ACRYLIC_ART_BASE = 0.79;

/** Centre of the acrylic hole in output pixels for a canvas of `dim`. */
export function acrylicHoleCenter(dim: number): { x: number; y: number; r: number } {
  const s = dim / DESIGN;
  return {
    x: (ACRYLIC_FACE.x + ACRYLIC_HOLE.dx) * s,
    y: (ACRYLIC_FACE.y + ACRYLIC_FACE.h - ACRYLIC_HOLE.dy) * s,
    r: ACRYLIC_HOLE.r * s,
  };
}
