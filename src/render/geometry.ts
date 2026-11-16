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
 * The centre artwork panel. Only the 旋转 (tilted) badge rotates; when tilted at ≤100%
 * size it auto-shrinks so the four corners stay inside the product face.
 * Zoom below 100% shrinks the complete panel; zoom above 100% only crops its image.
 */
export function artPanelGeometry(
  style: BadgeStyle,
  rotation: number,
  artSize: number,
  box: Rect,
  r: number,
  outerLimit?: number,
  zoom = 100,
): PanelGeometry {
  const deg = style === 'tilted' ? rotation || 0 : 0;
  const size = (artSize / 100) * Math.min(1, zoom / 100) * (style === 'tilted' ? TILT_PANEL_K : 1);
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

/**
 * Tin badge proportions tuned against CC's official merch photos (maimai
 * UNIVERSE / PRiSM PLUS / オンゲキ, Nov 2026):
 * - 直角: corners are not razor sharp (≈1.7 % of the width) and the printed
 *   frame is thinner, so the main art covers ≈90 % instead of ≈88 %.
 * - the printed background (底) is the same art blown up further than the
 *   main panel, so its motifs read larger behind the panel.
 * - 旋转: the tilted panel sits a little smaller so its corners keep a margin.
 */
export const SQUARE_CORNER = 12;
export const SQUARE_RING_K = 0.78;
export const TIN_OUTER_K = 1.14;
export const TILT_PANEL_K = 0.96;
/** extra white wash on the printed frame, × 叠色浓度 (official frames read milky) */
export const TIN_RING_LIFT = 0.5;

/** Printed frame width of a tin badge for the chosen style. */
export function tinRing(style: BadgeStyle, ring: number): number {
  return style === 'square' ? ring * SQUARE_RING_K : ring;
}

/** Badge face geometry in the 960×960 design space. Kept identical to v16. */
export const DESIGN = 960;
export const BADGE_FACE: Rect = { x: 118, y: 102, w: 724, h: 724 };
export const ACRYLIC_FACE: Rect = { x: 128, y: 112, w: 704, h: 704 };
export const ACRYLIC_HOLE = { dx: 46, dy: 46, r: 23 };
/** Acrylic main art at 主图尺寸 100% covers ≈80% of the plate width (official ≈77%, per CC); the rest is the dimmed frame band. */
export const ACRYLIC_ART_BASE = 0.853;

/** Centre of the acrylic hole in output pixels for a canvas of `dim`. */
export function acrylicHoleCenter(dim: number): { x: number; y: number; r: number } {
  const s = dim / DESIGN;
  return {
    x: (ACRYLIC_FACE.x + ACRYLIC_HOLE.dx) * s,
    y: (ACRYLIC_FACE.y + ACRYLIC_FACE.h - ACRYLIC_HOLE.dy) * s,
    r: ACRYLIC_HOLE.r * s,
  };
}
