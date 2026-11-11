/**
 * Shadow and highlight layers — the one place to retune the "merch look".
 *
 * v3 (tuned against CC's photos of official merch, Nov 2026):
 *  - Tin badge (缶バッジ): a broad, soft diagonal sheen from the top-left, a
 *    gently domed face, the printed sheet rolling over the rim (soft inner
 *    darkening, strongest bottom-right, a thin bright lip top-left) and a
 *    faint, wide drop shadow. No hard strips or dark outlines.
 *  - Acrylic plate: clear thick acrylic. The art is printed on the back; the
 *    transparent bevel border shows the art edge stretched/refracted, washed
 *    out and lighter; white + faint rainbow edge reflections; a white frosted
 *    drill hole; a subtle soft shadow.
 *
 * Values marked `[base, k]` scale as base + k * t with the slider t (0…1):
 * `b` = 弧面强度, `sh` = 柔和投影, `gloss` = 表面高光 (0…0.6).
 *
 * Canvas shadow blur/offset ignore the transform, so every shadow goes through
 * `dev()` to stay resolution independent (1200/2000/3000 px look the same).
 */
import type { Rect } from './geometry';
import { roundedSubpath, rr } from './paths';

type Ctx = CanvasRenderingContext2D;
type AB = readonly [number, number];

export const BADGE_LIGHT = {
  /** tight contact shadow right under the face */
  contactShadow: {
    offsetY: 4,
    depthK: 0.25,
    radiusK: 0.47,
    squash: [0.07, 0.03] as AB,
    rgb: '44,58,78',
    /** [offset, alpha base, alpha * sh] */
    stops: [
      [0, 0.05, 0.1],
      [0.5, 0.025, 0.05],
    ] as const,
  },
  /** wide, faint drop shadow of the whole badge shape */
  dropShadow: { rgb: '40,54,76', alpha: [0.05, 0.2] as AB, blur: [14, 30] as AB, offsetY: 6, depthK: 0.5, offsetX: 2 },
  /** broad diagonal sheen from top-left; stops are [t along the diagonal, alpha factor] */
  sheen: { alpha: [0.1, 0.32] as AB, stops: [[0, 0.55], [0.16, 1], [0.3, 0.42], [0.46, 0.08], [0.6, 0]] as const },
  /** soft dome: light centre-top-left, slightly darker bottom-right */
  dome: { fx: 0.3, fy: 0.24, r: 0.78, light: [0.05, 0.1] as AB, shadeRgb: '22,32,50', shade: [0.03, 0.12] as AB },
  /** printed sheet rolling over the rim */
  rollOver: {
    rgb: '20,28,44',
    even: { alpha: [0.14, 0.26] as AB, blur: [6, 12] as AB },
    lower: { alpha: [0.1, 0.25] as AB, blur: [10, 18] as AB, dx: -3, dy: -5 },
    lip: { alpha: [0.35, 0.4] as AB, blur: 2.5, dx: 2.2, dy: 2.6 },
    outline: { rgb: '70,86,108', alpha: [0.08, 0.08] as AB, width: 1 },
  },
  /** 表面高光: a narrower specular streak inside the broad sheen */
  gloss: { alpha: 1.05, stops: [[0.1, 0], [0.22, 0.55], [0.3, 0.85], [0.4, 0.35], [0.54, 0]] as const, soft: 0.3 },
} as const;

/**
 * 直角吧唧 (square tin badge, ref: CC's FESTiVAL PLUS set): a flat face, so the
 * dome/sheen is much weaker, but a crisp reflective metallic rim — bright on
 * the top/left edges, a darker steel line bottom/right — and a soft shadow.
 */
export const SQUARE_LIGHT = {
  /** multipliers on the tin dome/sheen (flat face) */
  domeK: 0.35,
  sheenK: 0.55,
  rollK: 0.6,
  rim: {
    width: 5,
    /** gradient along the diagonal: [t, rgb, alpha] — chrome-like banding */
    stops: [
      [0, '255,255,255', 0.95],
      [0.22, '226,232,240', 0.75],
      [0.45, '160,172,188', 0.55],
      [0.62, '240,244,250', 0.8],
      [0.82, '120,134,152', 0.6],
      [1, '96,110,130', 0.65],
    ] as const,
    alpha: [0.55, 0.45] as AB,
    inner: { rgb: '30,40,58', alpha: 0.18, width: 1.2 },
  },
} as const;

export const ACRYLIC_LIGHT = {
  radius: 9,
  /** width of the clear bevel border in design px */
  border: 22,
  groundShadow: { rgb: '40,56,76', alpha: [0.03, 0.14] as AB, blur: [12, 26] as AB, offsetY: 8, offsetX: 3, squash: 0.12, radiusK: 0.5, contact: [0.03, 0.06] as AB },
  backSheet: { thicknessK: 0.5, minThickness: 4, fill: 'rgba(214,232,240,.42)', edge: 'rgba(255,255,255,.75)', low: 'rgba(96,128,150,.22)' },
  /** clear body tint under everything */
  body: ['rgba(246,252,255,.30)', 'rgba(228,244,250,.14)', 'rgba(200,226,242,.26)'] as const,
  /** the art edge seen through the bevel */
  bevelArt: { zoom: 1.07, alpha: 0.55, wash: 'rgba(255,255,255,.26)', tintK: 0.3 },
  rim: {
    outer: { width: 3.2, top: 0.95, bottom: 0.45 },
    inner: { width: 1.6, alpha: 0.6, shade: 'rgba(40,70,92,.16)' },
    rainbow: { width: 7, alpha: [0.1, 0.18] as AB, hues: ['255,170,210', '255,236,160', '170,245,230', '170,200,255', '220,170,255'] },
  },
  sheen: { alpha: [0.1, 0.22] as AB, stops: [[0, 0.8], [0.14, 1], [0.27, 0.25], [0.42, 0]] as const },
  gloss: { alpha: 1.2, stops: [[0.16, 0], [0.25, 0.55], [0.3, 0.9], [0.36, 0.4], [0.46, 0]] as const },
  hole: { wall: 5, wallColor: 'rgba(255,255,255,.92)', outline: 'rgba(80,110,135,.45)', glint: 'rgba(255,255,255,1)' },
} as const;

const lin = (ab: AB, t: number) => ab[0] + ab[1] * t;
/** design units → device pixels, for shadowBlur / shadowOffset */
const dev = (ctx: Ctx, v: number) => v * Math.hypot(ctx.getTransform().a, ctx.getTransform().b);
const FAR = 20000;

/** Paint only the blurred shadow of a rounded rect (the shape itself is drawn far off-canvas). */
function shapeShadow(ctx: Ctx, f: Rect, r: number, color: string, blur: number, dx: number, dy: number): void {
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = dev(ctx, blur);
  ctx.shadowOffsetX = dev(ctx, FAR + dx);
  ctx.shadowOffsetY = dev(ctx, dy);
  ctx.fillStyle = '#000';
  rr(ctx, f.x - FAR, f.y, f.w, f.h, r);
  ctx.fill();
  ctx.restore();
}

/** Inner shadow inside the current clip: shadow of the area OUTSIDE the shape. */
function innerShadow(ctx: Ctx, f: Rect, r: number, color: string, blur: number, dx: number, dy: number): void {
  ctx.save();
  rr(ctx, f.x, f.y, f.w, f.h, r);
  ctx.clip();
  ctx.shadowColor = color;
  ctx.shadowBlur = dev(ctx, blur);
  ctx.shadowOffsetX = dev(ctx, dx);
  ctx.shadowOffsetY = dev(ctx, dy);
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.rect(f.x - 200, f.y - 200, f.w + 400, f.h + 400);
  roundedSubpath(ctx, f.x, f.y, f.w, f.h, r);
  ctx.fill('evenodd');
  ctx.restore();
}

function diagonal(ctx: Ctx, f: Rect, stops: readonly (readonly [number, number])[], alpha: number, rgb = '255,255,255'): CanvasGradient {
  const g = ctx.createLinearGradient(f.x, f.y, f.x + f.w, f.y + f.h);
  for (const [o, k] of stops) g.addColorStop(o, `rgba(${rgb},${Math.max(0, Math.min(1, k * alpha))})`);
  return g;
}

// ---------------- rounded / square badge ----------------

export function badgeContactShadow(ctx: Ctx, f: Rect, sh: number, depth: number, r = 84): void {
  if (sh <= 0) return;
  const D = BADGE_LIGHT.dropShadow;
  shapeShadow(ctx, f, r, `rgba(${D.rgb},${lin(D.alpha, sh)})`, lin(D.blur, sh), D.offsetX, D.offsetY + depth * D.depthK);
  const L = BADGE_LIGHT.contactShadow;
  ctx.save();
  ctx.translate(f.x + f.w * 0.5, f.y + f.h + L.offsetY + depth * L.depthK);
  ctx.scale(1, lin(L.squash, sh));
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, f.w * L.radiusK);
  for (const [o, a, k] of L.stops) g.addColorStop(o, `rgba(${L.rgb},${a + k * sh})`);
  g.addColorStop(1, `rgba(${L.rgb},0)`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, f.w * L.radiusK, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Domed tin-badge lighting over the printed face. `b` = bevel 0…1 (> 0). */
export function badgeFaceLighting(ctx: Ctx, f: Rect, r: number, b: number, square = false): void {
  const { x, y, w, h } = f;
  const B = BADGE_LIGHT;
  const Q = SQUARE_LIGHT;
  const domeK = square ? Q.domeK : 1;
  const sheenK = square ? Q.sheenK : 1;
  const rollK = square ? Q.rollK : 1;
  ctx.save();
  rr(ctx, x, y, w, h, r);
  ctx.clip();

  // dome: light top-left, shade bottom-right
  const D = B.dome;
  const light = ctx.createRadialGradient(x + w * D.fx, y + h * D.fy, 0, x + w * D.fx, y + h * D.fy, w * D.r);
  light.addColorStop(0, `rgba(255,255,255,${lin(D.light, b) * domeK})`);
  light.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = light;
  ctx.fillRect(x, y, w, h);
  const shade = ctx.createLinearGradient(x + w * 0.35, y + h * 0.35, x + w, y + h);
  shade.addColorStop(0, `rgba(${D.shadeRgb},0)`);
  shade.addColorStop(1, `rgba(${D.shadeRgb},${lin(D.shade, b) * domeK})`);
  ctx.fillStyle = shade;
  ctx.fillRect(x, y, w, h);

  // broad diagonal sheen
  ctx.fillStyle = diagonal(ctx, f, B.sheen.stops, lin(B.sheen.alpha, b) * sheenK);
  ctx.fillRect(x, y, w, h);
  ctx.restore();

  // rim roll-over
  const R = B.rollOver;
  innerShadow(ctx, f, r, `rgba(${R.rgb},${lin(R.even.alpha, b) * rollK})`, lin(R.even.blur, b), 0, 0);
  innerShadow(ctx, f, r, `rgba(${R.rgb},${lin(R.lower.alpha, b) * rollK})`, lin(R.lower.blur, b), R.lower.dx, R.lower.dy);
  innerShadow(ctx, f, r, `rgba(255,255,255,${lin(R.lip.alpha, b)})`, R.lip.blur, R.lip.dx, R.lip.dy);
  rr(ctx, x + 0.5, y + 0.5, w - 1, h - 1, Math.max(0, r - 0.5));
  ctx.strokeStyle = `rgba(${R.outline.rgb},${lin(R.outline.alpha, b)})`;
  ctx.lineWidth = R.outline.width;
  ctx.stroke();
  if (square) squareMetalRim(ctx, f, r, b);
}

/** Reflective metallic edge of the square tin badge. */
export function squareMetalRim(ctx: Ctx, f: Rect, r: number, b: number): void {
  const M = SQUARE_LIGHT.rim;
  const k = lin(M.alpha, b);
  const g = ctx.createLinearGradient(f.x, f.y, f.x + f.w, f.y + f.h);
  for (const [o, rgb, a] of M.stops) g.addColorStop(o, `rgba(${rgb},${Math.min(1, a * k)})`);
  ctx.save();
  rr(ctx, f.x, f.y, f.w, f.h, r);
  ctx.clip();
  rr(ctx, f.x + M.width / 2, f.y + M.width / 2, f.w - M.width, f.h - M.width, Math.max(0, r - M.width / 2));
  ctx.strokeStyle = g;
  ctx.lineWidth = M.width;
  ctx.stroke();
  rr(ctx, f.x + M.width + 0.6, f.y + M.width + 0.6, f.w - 2 * M.width - 1.2, f.h - 2 * M.width - 1.2, Math.max(0, r - M.width));
  ctx.strokeStyle = `rgba(${M.inner.rgb},${M.inner.alpha * k})`;
  ctx.lineWidth = M.inner.width;
  ctx.stroke();
  ctx.restore();
}

/** Glossy specular streak. `gloss` = 0…0.6 */
export function badgeGloss(ctx: Ctx, f: Rect, r: number, gloss: number): void {
  if (gloss <= 0) return;
  const G = BADGE_LIGHT.gloss;
  ctx.save();
  rr(ctx, f.x, f.y, f.w, f.h, r);
  ctx.clip();
  ctx.fillStyle = diagonal(ctx, f, G.stops, gloss * G.alpha);
  ctx.fillRect(f.x, f.y, f.w, f.h);
  // soft overall lift so a glossy badge also reads brighter
  ctx.fillStyle = diagonal(ctx, f, [[0, 1], [0.5, 0.2], [1, 0]], gloss * G.soft);
  ctx.fillRect(f.x, f.y, f.w, f.h);
  ctx.restore();
}

// ---------------- acrylic ----------------

export function acrylicThickness(threeD: boolean, depth: number): number {
  const S = ACRYLIC_LIGHT.backSheet;
  return threeD ? Math.max(S.minThickness, depth * S.thicknessK) : 0;
}

export function acrylicGroundShadow(ctx: Ctx, f: Rect, sh: number, thickness: number): void {
  if (sh <= 0) return;
  const L = ACRYLIC_LIGHT.groundShadow;
  const r = ACRYLIC_LIGHT.radius;
  shapeShadow(ctx, f, r, `rgba(${L.rgb},${lin(L.alpha, sh)})`, lin(L.blur, sh), L.offsetX, L.offsetY + thickness);
  ctx.save();
  ctx.translate(f.x + f.w / 2, f.y + f.h + thickness + 3);
  ctx.scale(1, L.squash);
  const g = ctx.createRadialGradient(0, 0, 1, 0, 0, f.w * L.radiusK);
  g.addColorStop(0, `rgba(${L.rgb},${lin(L.contact, sh)})`);
  g.addColorStop(1, `rgba(${L.rgb},0)`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, f.w * L.radiusK, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** The visible thickness of the clear plate (seen below/right of the face). */
export function acrylicBackSheet(ctx: Ctx, f: Rect, r: number, thickness: number): void {
  if (thickness <= 0) return;
  const S = ACRYLIC_LIGHT.backSheet;
  ctx.save();
  rr(ctx, f.x + thickness * 0.25, f.y + thickness, f.w, f.h, r);
  ctx.fillStyle = S.fill;
  ctx.fill();
  ctx.strokeStyle = S.low;
  ctx.lineWidth = 1.2;
  ctx.stroke();
  // bright edge where the side meets the face
  ctx.beginPath();
  ctx.moveTo(f.x + r, f.y + f.h + thickness * 0.55);
  ctx.lineTo(f.x + f.w - r, f.y + f.h + thickness * 0.55);
  ctx.strokeStyle = S.edge;
  ctx.lineWidth = 1.4;
  ctx.stroke();
  ctx.restore();
}

/** Clear body fill; call inside the plate clip. */
export function acrylicBody(ctx: Ctx, f: Rect): void {
  const [a, b, c] = ACRYLIC_LIGHT.body;
  const g = ctx.createLinearGradient(f.x, f.y, f.x + f.w, f.y + f.h);
  g.addColorStop(0, a);
  g.addColorStop(0.45, b);
  g.addColorStop(1, c);
  ctx.fillStyle = g;
  ctx.fillRect(f.x, f.y, f.w, f.h);
}

/** Edge reflections, rainbow fringe and surface sheen; call inside the plate clip. */
export function acrylicRimLight(ctx: Ctx, f: Rect, b: number, gloss: number): void {
  const { x, y, w, h } = f;
  const A = ACRYLIC_LIGHT;
  const r = A.radius;
  const bw = A.border;

  // faint rainbow fringe just inside the outer edge (thin-film / dispersion look)
  const RB = A.rim.rainbow;
  const rg = ctx.createLinearGradient(x, y + h, x + w, y);
  RB.hues.forEach((c, i) => rg.addColorStop(i / (RB.hues.length - 1), `rgba(${c},${lin(RB.alpha, b)})`));
  ctx.save();
  ctx.beginPath();
  roundedSubpath(ctx, x, y, w, h, r);
  roundedSubpath(ctx, x + RB.width, y + RB.width, w - 2 * RB.width, h - 2 * RB.width, Math.max(1, r - RB.width));
  ctx.clip('evenodd');
  ctx.fillStyle = rg;
  ctx.fillRect(x, y, w, h);
  ctx.restore();

  // outer edge: bright top-left, softer bottom-right
  const O = A.rim.outer;
  const og = ctx.createLinearGradient(x, y, x + w, y + h);
  og.addColorStop(0, `rgba(255,255,255,${O.top})`);
  og.addColorStop(0.5, `rgba(255,255,255,${(O.top + O.bottom) / 2})`);
  og.addColorStop(1, `rgba(255,255,255,${O.bottom})`);
  rr(ctx, x + O.width / 2, y + O.width / 2, w - O.width, h - O.width, r);
  ctx.strokeStyle = og;
  ctx.lineWidth = O.width;
  ctx.stroke();

  // inner bevel step where the print ends
  const I = A.rim.inner;
  rr(ctx, x + bw + 1, y + bw + 1, w - 2 * bw - 2, h - 2 * bw - 2, 1);
  ctx.strokeStyle = I.shade;
  ctx.lineWidth = 2;
  ctx.stroke();
  rr(ctx, x + bw - 0.5, y + bw - 0.5, w - 2 * bw + 1, h - 2 * bw + 1, 1.5);
  ctx.strokeStyle = `rgba(255,255,255,${I.alpha})`;
  ctx.lineWidth = I.width;
  ctx.stroke();

  // broad sheen on the front surface
  ctx.fillStyle = diagonal(ctx, f, A.sheen.stops, lin(A.sheen.alpha, b));
  ctx.fillRect(x, y, w, h);
  if (gloss > 0) {
    ctx.fillStyle = diagonal(ctx, f, A.gloss.stops, gloss * A.gloss.alpha);
    ctx.fillRect(x, y, w, h);
  }
}

/** A drilled hole: transparent centre, white frosted wall. */
export function acrylicHole(ctx: Ctx, hx: number, hy: number, hr: number): void {
  const H = ACRYLIC_LIGHT.hole;
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath();
  ctx.arc(hx, hy, hr + H.wall, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.beginPath();
  ctx.arc(hx, hy, hr + H.wall / 2, 0, Math.PI * 2);
  ctx.strokeStyle = H.wallColor;
  ctx.lineWidth = H.wall;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(hx, hy, hr + H.wall + 0.6, 0, Math.PI * 2);
  ctx.strokeStyle = H.outline;
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(hx, hy, hr + H.wall * 0.55, 1.05 * Math.PI, 1.55 * Math.PI);
  ctx.strokeStyle = H.glint;
  ctx.lineWidth = 1.6;
  ctx.stroke();
  ctx.restore();
}
