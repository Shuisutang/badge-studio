/**
 * Pure geometry helpers for the 3D preview (no three.js import, unit-tested).
 * World units: the printed face is 1 wide, centred on the origin.
 */
export const TIN_SIDE_DEPTH = 0.05;

/** Signed distance to a rounded rectangle of half-size (hx, hy) and corner r. Negative inside. */
export function roundedRectSdf(px: number, py: number, hx: number, hy: number, r: number): number {
  const qx = Math.abs(px) - hx + r;
  const qy = Math.abs(py) - hy + r;
  const ox = Math.max(qx, 0);
  const oy = Math.max(qy, 0);
  return Math.hypot(ox, oy) + Math.min(Math.max(qx, qy), 0) - r;
}

/** Closest point on the rounded-rect outline (used to snap grid vertices onto the silhouette). */
export function projectToRoundedRect(px: number, py: number, hx: number, hy: number, r: number): [number, number] {
  const sx = Math.sign(px) || 1;
  const sy = Math.sign(py) || 1;
  const ax = Math.abs(px);
  const ay = Math.abs(py);
  const cx = hx - r;
  const cy = hy - r;
  if (ax > cx && ay > cy) {
    const dx = ax - cx;
    const dy = ay - cy;
    const l = Math.hypot(dx, dy) || 1;
    return [sx * (cx + (dx / l) * r), sy * (cy + (dy / l) * r)];
  }
  // straight edges: move along the axis that is outside
  if (ax - hx > ay - hy) return [sx * hx, py];
  return [px, sy * hy];
}

export interface TinShape {
  /** half width/height of the face */
  hx: number;
  hy: number;
  /** corner radius */
  r: number;
  /** width of the rolled rim */
  roll: number;
  /** rim height at the plateau */
  rimH: number;
  /** extra dome height at the centre */
  domeH: number;
}

/**
 * Height of the tin-badge front surface: a quarter-round roll-over at the rim
 * rising to a plateau, plus a gentle dome. 0 on the outline.
 */
export function tinHeight(px: number, py: number, s: TinShape): number {
  const d = roundedRectSdf(px, py, s.hx, s.hy, s.r);
  if (d >= 0) return 0;
  const t = Math.min(1, -d / s.roll);
  const rim = Math.sqrt(1 - (1 - t) * (1 - t));
  const nx = px / s.hx;
  const ny = py / s.hy;
  const dome = Math.max(0, 1 - (nx * nx + ny * ny) / 2);
  return rim * s.rimH + s.domeH * dome * t;
}

/** Map a face-local point (−hx…hx) to texture UV for a face rect inside the 960 design canvas. */
export function faceUv(px: number, py: number, hx: number, hy: number, face: { x: number; y: number; w: number; h: number }, design = 960, inset = 1.5): [number, number] {
  const fx = (px / hx + 1) / 2;
  const fy = (1 - py / hy) / 2;
  const k = (face.w - 2 * inset) / face.w;
  const ux = (face.x + face.w * (0.5 + (fx - 0.5) * k)) / design;
  const uy = (face.y + face.h * (0.5 + (fy - 0.5) * k)) / design;
  return [ux, 1 - uy];
}

/**
 * Unfold the shell onto one continuous print sheet. The front seam shares the
 * face UV; walking toward the back continues OUTSIDE the trim into real bleed.
 * UVs never reverse into the front image, which would repeat text at the fold.
 */
export function tinWallUv(px: number, py: number, pz: number, shape: Pick<TinShape, 'hx' | 'hy' | 'r'>, depth: number, face: { x: number; y: number; w: number; h: number }, design = 960): [number, number] {
  const cx = Math.max(-shape.hx + shape.r, Math.min(shape.hx - shape.r, px));
  const cy = Math.max(-shape.hy + shape.r, Math.min(shape.hy - shape.r, py));
  const dx = px - cx;
  const dy = py - cy;
  const length = Math.hypot(dx, dy) || 1;
  const fold = Math.max(0, Math.min(depth, depth / 2 - pz));
  return faceUv(px + dx / length * fold, py + dy / length * fold, shape.hx, shape.hy, face, design);
}
