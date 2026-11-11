/**
 * The v2 "立体感" layers (top highlight strip, side light/shade, bevel edge
 * light, lower edge glow, elliptical contact shadow, acrylic rim lines and
 * back sheet), restored after CC's feedback that v3 felt flat. They are drawn
 * FIRST; the v3 layers in lighting.ts (diagonal sheen, rim roll-over, metal
 * rim, drop shadow) sit on top at reduced strength.
 * Values are the confirmed v2 numbers — retune here only on purpose.
 */
import type { Rect } from './geometry';
import { rr } from './paths';

type Ctx = CanvasRenderingContext2D;
type Stop = readonly [offset: number, color: string];

export const DEPTH_BADGE = {
  contactShadow: {
    /** shadow centre: face bottom + offsetY + depth * depthK */
    offsetY: 3,
    depthK: 0.2,
    radiusK: 0.48,
    /** vertical squash: base + k * sh */
    squash: [0.115, 0.045],
    rgb: '42,55,72',
    /** [offset, alpha base, alpha * sh] */
    stops: [
      [0, 0.055, 0.12],
      [0.38, 0.04, 0.07],
      [0.72, 0.012, 0.028],
    ] as const,
  },
  /** short bright strip along the top edge */
  topStrip: { y: 8, blur: 0.6, width: 4.2, insetL: 0.64, insetR: 0.66, alpha: [0.42, 0.3] },
  topBand: { y: 8, height: 38, fadeTo: 44, inset: 20, alpha0: [0.2, 0.18], alphaMid: [0.08, 0.07] },
  leftLight: { width: 74, alpha0: [0.22, 0.16], alphaMid: [0.09, 0.07] },
  rightShade: { width: 90, rgbMid: '25,36,52', rgbEdge: '18,26,40', alphaMid: [0.05, 0.06], alphaEdge: [0.16, 0.14] },
  bottomShade: { height: 118, rgb: '42,62,78', alpha: [0.055, 0.055] },
  dome: { fx: 0.24, fy: 0.1, r0: 44, cx: 0.42, cy: 0.34, r1: 0.96, alpha0: [0.16, 0.11], alphaMid: [0.045, 0.02] },
  edge: {
    light: { inset: 3, width: 2.6, alpha: [0.28, 0.34] },
    lowerGlow: { band: 64, blur: 5, width: 6, rgb: '81,106,129', alpha: [0.055, 0.07] },
    outline: { width: 1, rgb: '104,129,148', alpha: [0.075, 0.065] },
  },
  gloss: { fx: 170, fy: 90, r0: 25, cx: 260, cy: 240, r1: 570, stops: [[0, 'rgba(255,255,255,.34)'], [0.35, 'rgba(255,255,255,.07)'], [1, 'rgba(255,255,255,0)']] as Stop[] },
} as const;

export const DEPTH_ACRYLIC = {
  groundShadow: { gap: 8, squash: 0.13, radiusK: 0.5, rgb: '42,56,72', stops: [[0, 0.05, 0.09], [0.56, 0.025, 0.035]] as const },
  backSheet: { shadow: 'rgba(75,102,130,.13)', blur: 9, fill: 'rgba(135,165,190,.18)', thicknessK: 0.48, minThickness: 4 },
  rim: { outerAlpha: [0.53, 0.3], outerWidth: 5, innerColor: 'rgba(100,154,183,.40)', innerWidth: 2 },
  topLine: { y: 9, insetL: 36, insetR: 40, width: 4.6, color: 'rgba(255,255,255,.85)' },
  leftLine: { x: 8, top: 32, bottom: 35, width: 3, color: 'rgba(255,255,255,.37)' },
  shine: { tx: 0.57, ty: 0.56, alpha0: 0.36, alphaMid: 0.07, mid: 0.3 },
} as const;

const lin = (ab: readonly number[], t: number) => ab[0]! + ab[1]! * t;

// ---------------- rounded / square badge ----------------

export function depthContactShadow(ctx: Ctx, f: Rect, sh: number, depth: number): void {
  if (sh <= 0) return;
  const L = DEPTH_BADGE.contactShadow;
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

/** Soft dome lighting over the printed face. `b` = bevel 0…1 (> 0). */
export function depthFaceLighting(ctx: Ctx, f: Rect, r: number, b: number): void {
  const { x, y, w, h } = f;
  const B = DEPTH_BADGE;
  ctx.save();
  rr(ctx, x, y, w, h, r);
  ctx.clip();

  ctx.save();
  ctx.filter = `blur(${B.topStrip.blur}px)`;
  ctx.beginPath();
  ctx.moveTo(x + r * B.topStrip.insetL, y + B.topStrip.y);
  ctx.lineTo(x + w - r * B.topStrip.insetR, y + B.topStrip.y);
  ctx.strokeStyle = `rgba(255,255,255,${lin(B.topStrip.alpha, b)})`;
  ctx.lineWidth = B.topStrip.width;
  ctx.lineCap = 'round';
  ctx.stroke();
  ctx.restore();

  const T = B.topBand;
  const topBand = ctx.createLinearGradient(0, y + T.y, 0, y + T.fadeTo);
  topBand.addColorStop(0, `rgba(255,255,255,${lin(T.alpha0, b)})`);
  topBand.addColorStop(0.5, `rgba(255,255,255,${lin(T.alphaMid, b)})`);
  topBand.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = topBand;
  ctx.fillRect(x + T.inset, y + T.y, w - 2 * T.inset, T.height);

  const Lf = B.leftLight;
  const left = ctx.createLinearGradient(x, 0, x + Lf.width, 0);
  left.addColorStop(0, `rgba(255,255,255,${lin(Lf.alpha0, b)})`);
  left.addColorStop(0.5, `rgba(255,255,255,${lin(Lf.alphaMid, b)})`);
  left.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = left;
  ctx.fillRect(x, y, Lf.width, h);

  const R = B.rightShade;
  const right = ctx.createLinearGradient(x + w - R.width, 0, x + w, 0);
  right.addColorStop(0, 'rgba(18,28,42,0)');
  right.addColorStop(0.7, `rgba(${R.rgbMid},${lin(R.alphaMid, b)})`);
  right.addColorStop(1, `rgba(${R.rgbEdge},${lin(R.alphaEdge, b)})`);
  ctx.fillStyle = right;
  ctx.fillRect(x + w - R.width, y, R.width, h);

  const Bo = B.bottomShade;
  const bottom = ctx.createLinearGradient(0, y + h - Bo.height, 0, y + h);
  bottom.addColorStop(0, 'rgba(14,20,31,0)');
  bottom.addColorStop(1, `rgba(${Bo.rgb},${lin(Bo.alpha, b)})`);
  ctx.fillStyle = bottom;
  ctx.fillRect(x, y + h - Bo.height, w, Bo.height);

  const D = B.dome;
  const dome = ctx.createRadialGradient(x + w * D.fx, y + h * D.fy, D.r0, x + w * D.cx, y + h * D.cy, w * D.r1);
  dome.addColorStop(0, `rgba(255,255,255,${lin(D.alpha0, b)})`);
  dome.addColorStop(0.45, `rgba(255,255,255,${lin(D.alphaMid, b)})`);
  dome.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = dome;
  ctx.fillRect(x, y, w, h);
  ctx.restore();

  const E = B.edge;
  const i = E.light.inset;
  rr(ctx, x + i, y + i, w - 2 * i, h - 2 * i, Math.max(0, r - i));
  ctx.strokeStyle = `rgba(255,255,255,${lin(E.light.alpha, b)})`;
  ctx.lineWidth = E.light.width;
  ctx.stroke();
  ctx.save();
  ctx.beginPath();
  ctx.rect(x - 20, y + h - E.lowerGlow.band, w + 40, 95);
  ctx.clip();
  ctx.filter = `blur(${E.lowerGlow.blur}px)`;
  rr(ctx, x + i, y + i, w - 2 * i, h - 2 * i, Math.max(0, r - i));
  ctx.strokeStyle = `rgba(${E.lowerGlow.rgb},${lin(E.lowerGlow.alpha, b)})`;
  ctx.lineWidth = E.lowerGlow.width;
  ctx.stroke();
  ctx.restore();
  rr(ctx, x + 1, y + 1, w - 2, h - 2, Math.max(0, r - 1));
  ctx.strokeStyle = `rgba(${E.outline.rgb},${lin(E.outline.alpha, b)})`;
  ctx.lineWidth = E.outline.width;
  ctx.stroke();
}

// ---------------- acrylic ----------------

export function depthAcrylicGroundShadow(ctx: Ctx, f: Rect, sh: number, thickness: number): void {
  if (sh <= 0) return;
  const L = DEPTH_ACRYLIC.groundShadow;
  ctx.save();
  ctx.translate(f.x + f.w / 2, f.y + f.h + thickness + L.gap);
  ctx.scale(1, L.squash);
  const g = ctx.createRadialGradient(0, 0, 1, 0, 0, f.w * L.radiusK);
  for (const [o, a, k] of L.stops) g.addColorStop(o, `rgba(${L.rgb},${a + k * sh})`);
  g.addColorStop(1, `rgba(${L.rgb},0)`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, f.w * L.radiusK, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function depthAcrylicBackSheet(ctx: Ctx, f: Rect, r: number, thickness: number): void {
  if (thickness <= 0) return;
  const S = DEPTH_ACRYLIC.backSheet;
  ctx.save();
  ctx.shadowColor = S.shadow;
  ctx.shadowBlur = S.blur * Math.hypot(ctx.getTransform().a, ctx.getTransform().b);
  ctx.fillStyle = S.fill;
  rr(ctx, f.x + 2, f.y + thickness, f.w, f.h, r);
  ctx.fill();
  ctx.restore();
}

/** Rim and thin light lines; call inside the plate clip. */
export function depthAcrylicRim(ctx: Ctx, f: Rect, b: number, gloss: number, r = 4): void {
  const { x, y, w, h } = f;
  const A = DEPTH_ACRYLIC;
  ctx.strokeStyle = `rgba(250,255,255,${lin(A.rim.outerAlpha, b)})`;
  ctx.lineWidth = A.rim.outerWidth;
  rr(ctx, x + 4, y + 4, w - 8, h - 8, Math.max(2, r - 4));
  ctx.stroke();
  ctx.strokeStyle = A.rim.innerColor;
  ctx.lineWidth = A.rim.innerWidth;
  rr(ctx, x + 2, y + 2, w - 4, h - 4, 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x + A.topLine.insetL, y + A.topLine.y);
  ctx.lineTo(x + w - A.topLine.insetR, y + A.topLine.y);
  ctx.strokeStyle = A.topLine.color;
  ctx.lineWidth = A.topLine.width;
  ctx.lineCap = 'round';
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x + A.leftLine.x, y + A.leftLine.top);
  ctx.lineTo(x + A.leftLine.x, y + h - A.leftLine.bottom);
  ctx.strokeStyle = A.leftLine.color;
  ctx.lineWidth = A.leftLine.width;
  ctx.stroke();
  void gloss;
}
