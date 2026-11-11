/**
 * Badge renderers. Ported from the v16 single file; the drawing order and all
 * constants are unchanged so the confirmed look stays pixel-identical. Every
 * deliberate change is marked "Fix".
 *
 * Confirmed direction (v12 handoff): no white inner frame; the outer ring is the
 * same artwork with a colour overlay; soft frosted volume with a short bright top
 * highlight and a soft grey-blue bottom shadow; never a black base, metal shell
 * or hard shadow.
 */
import { css, overlayTint } from '../color/color';
import type { ColorSamples, Drawable, GlobalSettings, ItemSettings } from '../model/types';
import { ACRYLIC_FACE, ACRYLIC_HOLE, BADGE_FACE, DESIGN, artPanelGeometry, fitRect, type Rect } from './geometry';
import { roundedSubpath, rr } from './paths';

export interface RenderInput {
  src: Drawable;
  settings: ItemSettings;
  colors: ColorSamples;
  globals: GlobalSettings;
  /** Copyright logo image, if one is loaded. */
  mark: Drawable | null;
}

type Ctx = CanvasRenderingContext2D;

function drawImageFit(ctx: Ctx, input: RenderInput, x: number, y: number, w: number, h: number, zoomMul: number, layer: 'outer' | 'inner'): void {
  const { src, settings } = input;
  // Fix (B3): the outer printed layer always covers the face. "contain" only
  // applies to the centre panel; v16 punched transparent holes into the face.
  // Fix: the outer layer never zooms below 100% for the same reason.
  const p =
    layer === 'outer'
      ? { fit: 'cover' as const, zoom: Math.max(100, settings.zoom), offsetX: settings.offsetX, offsetY: settings.offsetY }
      : settings;
  const r = fitRect(src.width, src.height, { x, y, w, h }, p, zoomMul);
  if (!r) return;
  ctx.drawImage(src.source, r.x, r.y, r.w, r.h);
}

const MARK_FONT = (sz: number) => `600 ${sz}px "Arial", "Noto Sans SC", "Microsoft YaHei", sans-serif`;

function drawCopyright(ctx: Ctx, input: RenderInput, x: number, y: number, w: number, h: number, r: number): void {
  const g = input.globals;
  if (!g.copyrightEnabled || g.markOpacity <= 0) return;
  ctx.save();
  rr(ctx, x, y, w, h, r);
  ctx.clip();
  ctx.globalAlpha = g.markOpacity / 100;
  const rightX = x + w - g.markRight;
  const bottomY = y + h - g.markBottom;
  if (g.markMode === 'logo' && input.mark) {
    const { width: iw, height: ih } = input.mark;
    if (iw > 0 && ih > 0) {
      const ww = g.markLogoWidth;
      const hh = (ww * ih) / iw;
      ctx.drawImage(input.mark.source, rightX - ww, bottomY - hh, ww, hh);
    }
  } else if (g.markMode === 'text') {
    const raw = String(g.markText || '').replace(/[\r\n\t]+/g, ' ').trim();
    if (raw) {
      let sz = g.markSize;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'alphabetic';
      ctx.font = MARK_FONT(sz);
      // Fix (B9): the room left of the anchor depends on the right margin.
      const maxW = Math.max(60, rightX - (x + 24));
      const measured = ctx.measureText(raw).width;
      if (measured > maxW) {
        sz = Math.max(9, (sz * maxW) / measured);
        ctx.font = MARK_FONT(sz);
      }
      const col = g.markColorMode === 'white' ? '#ffffff' : g.markColorMode === 'black' ? '#111111' : g.markColor;
      ctx.fillStyle = col;
      ctx.shadowColor = g.markColorMode === 'black' ? 'rgba(255,255,255,.22)' : 'rgba(0,0,0,.25)';
      ctx.shadowBlur = 2;
      ctx.shadowOffsetY = 0.5;
      ctx.fillText(raw, rightX, bottomY);
    }
  }
  ctx.restore();
}

function panelSubpath(ctx: Ctx, s: ItemSettings, box: Rect, r: number, outerLimit: number): void {
  const g = artPanelGeometry(s.style, s.rotation, s.artSize, box, r, outerLimit);
  ctx.save();
  ctx.translate(g.cx, g.cy);
  ctx.rotate((g.deg * Math.PI) / 180);
  roundedSubpath(ctx, -g.panelW / 2, -g.panelH / 2, g.panelW, g.panelH, g.corner);
  ctx.restore();
}

/** The centre artwork. Only this panel rotates; the printed background stays level. */
function drawArtPanel(ctx: Ctx, input: RenderInput, box: Rect, r: number, opts: { noShade?: boolean; outerLimit: number }): void {
  const s = input.settings;
  const { deg, panelW, panelH, cx, cy, corner } = artPanelGeometry(s.style, s.rotation, s.artSize, box, r, opts.outerLimit);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((deg * Math.PI) / 180);
  const px = -panelW / 2;
  const py = -panelH / 2;
  if (deg !== 0) {
    ctx.save();
    ctx.shadowColor = 'rgba(16,25,44,.23)';
    ctx.shadowBlur = 9;
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 5;
    ctx.fillStyle = 'rgba(17,27,43,.12)';
    rr(ctx, px, py, panelW, panelH, corner);
    ctx.fill();
    ctx.restore();
  }
  ctx.save();
  rr(ctx, px, py, panelW, panelH, corner);
  ctx.clip();
  drawImageFit(ctx, input, px, py, panelW, panelH, 1, 'inner');
  if (!opts.noShade) {
    const innerShade = ctx.createLinearGradient(0, py, 0, py + panelH);
    innerShade.addColorStop(0, 'rgba(255,255,255,.018)');
    innerShade.addColorStop(0.82, 'rgba(0,0,0,0)');
    innerShade.addColorStop(1, 'rgba(0,0,0,.035)');
    ctx.fillStyle = innerShade;
    ctx.fillRect(px, py, panelW, panelH);
  }
  ctx.restore();
  ctx.restore();
}

/** Flat, transparent acrylic plate with a light-catching rim; no metal, no dark slab. */
function drawAcrylic(ctx: Ctx, input: RenderInput, dim: number): void {
  const g = input.globals;
  const s = input.settings;
  const scale = dim / DESIGN;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.clearRect(0, 0, DESIGN, DESIGN);
  ctx.save();
  const { x, y, w, h } = ACRYLIC_FACE;
  const r = 4;
  const tint = overlayTint(s, input.colors);
  const alpha = g.overlayAlpha / 100;
  const sh = g.threeDEnabled ? g.shadow / 100 : 0;
  const gloss = g.gloss / 100;
  const rim = 19;
  const b = g.threeDEnabled ? g.bevel / 100 : 0;
  const thickness = g.threeDEnabled ? Math.max(4, g.depth * 0.48) : 0;

  if (sh > 0) {
    ctx.save();
    ctx.translate(x + w / 2, y + h + thickness + 8);
    ctx.scale(1, 0.13);
    const shadow = ctx.createRadialGradient(0, 0, 1, 0, 0, w * 0.5);
    shadow.addColorStop(0, `rgba(42,56,72,${0.05 + 0.09 * sh})`);
    shadow.addColorStop(0.56, `rgba(42,56,72,${0.025 + 0.035 * sh})`);
    shadow.addColorStop(1, 'rgba(42,56,72,0)');
    ctx.fillStyle = shadow;
    ctx.beginPath();
    ctx.arc(0, 0, w * 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  if (thickness > 0) {
    ctx.save();
    ctx.shadowColor = 'rgba(75,102,130,.13)';
    ctx.shadowBlur = 9;
    ctx.fillStyle = 'rgba(135,165,190,.18)';
    rr(ctx, x + 2, y + thickness, w, h, r);
    ctx.fill();
    ctx.restore();
  }

  ctx.save();
  rr(ctx, x, y, w, h, r);
  ctx.clip();
  const clear = ctx.createLinearGradient(x, y, x + w, y + h);
  clear.addColorStop(0, 'rgba(242,252,255,.73)');
  clear.addColorStop(0.43, 'rgba(222,242,250,.32)');
  clear.addColorStop(1, 'rgba(181,219,244,.47)');
  ctx.fillStyle = clear;
  ctx.fillRect(x, y, w, h);

  // Printed border: the same artwork with a subtle per-image colour glaze.
  ctx.save();
  rr(ctx, x + 5, y + 5, w - 10, h - 10, 1);
  ctx.clip();
  drawImageFit(ctx, input, x + 5, y + 5, w - 10, h - 10, g.outerZoom / 100, 'outer');
  ctx.fillStyle = css(tint, Math.min(0.88, alpha * 0.58 + 0.26));
  ctx.fillRect(x + 5, y + 5, w - 10, h - 10);
  ctx.restore();

  // Inner image printed cleanly, no white mat.
  ctx.save();
  rr(ctx, x + rim, y + rim, w - rim * 2, h - rim * 2, 1);
  ctx.clip();
  drawArtPanel(ctx, input, { x: x + rim, y: y + rim, w: w - rim * 2, h: h - rim * 2 }, 0, { noShade: true, outerLimit: w - 8 });
  ctx.restore();

  ctx.strokeStyle = `rgba(250,255,255,${0.53 + 0.3 * b})`;
  ctx.lineWidth = 5;
  rr(ctx, x + 4, y + 4, w - 8, h - 8, 2);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(100,154,183,.40)';
  ctx.lineWidth = 2;
  rr(ctx, x + 2, y + 2, w - 4, h - 4, 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x + 36, y + 9);
  ctx.lineTo(x + w - 40, y + 9);
  ctx.strokeStyle = 'rgba(255,255,255,.85)';
  ctx.lineWidth = 4.6;
  ctx.lineCap = 'round';
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x + 8, y + 32);
  ctx.lineTo(x + 8, y + h - 35);
  ctx.strokeStyle = 'rgba(255,255,255,.37)';
  ctx.lineWidth = 3;
  ctx.stroke();

  if (gloss > 0) {
    const shine = ctx.createLinearGradient(x, y, x + w * 0.57, y + h * 0.56);
    shine.addColorStop(0, `rgba(255,255,255,${0.36 * gloss})`);
    shine.addColorStop(0.3, `rgba(255,255,255,${0.07 * gloss})`);
    shine.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = shine;
    ctx.fillRect(x, y, w, h);
  }
  ctx.restore();

  drawCopyright(ctx, input, x, y, w, h, r);

  if (s.acrylicHole) {
    // A real transparent drill hole (alpha 0), not an opaque white sticker.
    const hx = x + ACRYLIC_HOLE.dx;
    const hy = y + h - ACRYLIC_HOLE.dy;
    const hr = ACRYLIC_HOLE.r;
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(hx, hy, hr, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.beginPath();
    ctx.arc(hx, hy, hr + 1.8, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(75,125,155,.70)';
    ctx.lineWidth = 2.4;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(hx - 1, hy - 1, hr - 2.6, 0.97 * Math.PI, 1.75 * Math.PI);
    ctx.strokeStyle = 'rgba(255,255,255,.88)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

/** Rounded or square badge with soft frosted volume. */
function drawBadge(ctx: Ctx, input: RenderInput, dim: number): void {
  const g = input.globals;
  const s = input.settings;
  const scale = dim / DESIGN;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.clearRect(0, 0, DESIGN, DESIGN);
  ctx.save();
  const { x, y, w, h } = BADGE_FACE;
  const square = s.style === 'square';
  const r = square ? 2 : g.radius;
  const ring = g.ring;
  const inner: Rect = { x: x + ring, y: y + ring, w: w - 2 * ring, h: h - 2 * ring };
  const innerR = square ? 1 : Math.max(6, r - ring * 0.85);
  const tint = overlayTint(s, input.colors);
  const has3d = g.threeDEnabled;
  const depth = has3d ? g.depth : 0;
  const b = has3d ? g.bevel / 100 : 0;
  const sh = has3d ? g.shadow / 100 : 0;

  // Elliptical, translucent contact shadow fading to alpha 0: no slab, no dark line.
  if (sh > 0) {
    const cx = x + w * 0.5;
    const cy = y + h + 3 + depth * 0.2;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1, 0.115 + 0.045 * sh);
    const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, w * 0.48);
    glow.addColorStop(0, `rgba(42,55,72,${0.055 + 0.12 * sh})`);
    glow.addColorStop(0.38, `rgba(42,55,72,${0.04 + 0.07 * sh})`);
    glow.addColorStop(0.72, `rgba(42,55,72,${0.012 + 0.028 * sh})`);
    glow.addColorStop(1, 'rgba(42,55,72,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, w * 0.48, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  const rotated = s.style === 'rounded' && Math.abs(s.rotation || 0) > 0.01;

  // Base printed layer always fills the whole badge face.
  ctx.save();
  rr(ctx, x, y, w, h, r);
  ctx.clip();
  // Fix (B4): print on white stock, so transparent PNGs don't turn the badge
  // face see-through. Opaque artwork covers this completely (no visual change).
  ctx.fillStyle = '#fff';
  ctx.fillRect(x, y, w, h);
  drawImageFit(ctx, input, x, y, w, h, g.outerZoom / 100, 'outer');
  const wash = ctx.createLinearGradient(x, y, x, y + h);
  wash.addColorStop(0, 'rgba(255,255,255,.05)');
  wash.addColorStop(0.35, 'rgba(255,255,255,.015)');
  wash.addColorStop(1, 'rgba(255,255,255,.02)');
  ctx.fillStyle = wash;
  ctx.fillRect(x, y, w, h);
  ctx.restore();

  // Outer-ring tint; the clear area rotates with a tilted centre panel.
  if (g.overlayAlpha > 0) {
    ctx.save();
    ctx.beginPath();
    roundedSubpath(ctx, x, y, w, h, r);
    if (rotated) panelSubpath(ctx, s, inner, innerR, w);
    else roundedSubpath(ctx, inner.x, inner.y, inner.w, inner.h, innerR);
    ctx.clip('evenodd');
    ctx.fillStyle = css(tint, g.overlayAlpha / 100);
    ctx.fillRect(x, y, w, h);
    const rg = ctx.createLinearGradient(x, y, x + w, y + h);
    rg.addColorStop(0, 'rgba(255,255,255,.09)');
    rg.addColorStop(0.52, 'rgba(255,255,255,0)');
    rg.addColorStop(1, 'rgba(0,0,0,.045)');
    ctx.fillStyle = rg;
    ctx.fillRect(x, y, w, h);
    ctx.restore();
  }

  ctx.save();
  rr(ctx, x, y, w, h, r);
  ctx.clip();
  drawArtPanel(ctx, input, inner, innerR, { outerLimit: w });
  ctx.restore();

  if (has3d && b > 0) {
    ctx.save();
    rr(ctx, x, y, w, h, r);
    ctx.clip();

    // Narrow top specular strip.
    ctx.save();
    ctx.filter = 'blur(0.6px)';
    ctx.beginPath();
    ctx.moveTo(x + r * 0.64, y + 8);
    ctx.lineTo(x + w - r * 0.66, y + 8);
    ctx.strokeStyle = `rgba(255,255,255,${0.42 + 0.3 * b})`;
    ctx.lineWidth = 4.2;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.restore();

    const topBand = ctx.createLinearGradient(0, y + 8, 0, y + 44);
    topBand.addColorStop(0, `rgba(255,255,255,${0.2 + 0.18 * b})`);
    topBand.addColorStop(0.5, `rgba(255,255,255,${0.08 + 0.07 * b})`);
    topBand.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = topBand;
    ctx.fillRect(x + 20, y + 8, w - 40, 38);

    const left = ctx.createLinearGradient(x, 0, x + 74, 0);
    left.addColorStop(0, `rgba(255,255,255,${0.22 + 0.16 * b})`);
    left.addColorStop(0.5, `rgba(255,255,255,${0.09 + 0.07 * b})`);
    left.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = left;
    ctx.fillRect(x, y, 74, h);
    const right = ctx.createLinearGradient(x + w - 90, 0, x + w, 0);
    right.addColorStop(0, 'rgba(18,28,42,0)');
    right.addColorStop(0.7, `rgba(25,36,52,${0.05 + 0.06 * b})`);
    right.addColorStop(1, `rgba(18,26,40,${0.16 + 0.14 * b})`);
    ctx.fillStyle = right;
    ctx.fillRect(x + w - 90, y, 90, h);

    const bottomInner = ctx.createLinearGradient(0, y + h - 118, 0, y + h);
    bottomInner.addColorStop(0, 'rgba(14,20,31,0)');
    bottomInner.addColorStop(1, `rgba(42,62,78,${0.055 + 0.055 * b})`);
    ctx.fillStyle = bottomInner;
    ctx.fillRect(x, y + h - 118, w, 118);

    const dome = ctx.createRadialGradient(x + w * 0.24, y + h * 0.1, 44, x + w * 0.42, y + h * 0.34, w * 0.96);
    dome.addColorStop(0, `rgba(255,255,255,${0.16 + 0.11 * b})`);
    dome.addColorStop(0.45, `rgba(255,255,255,${0.045 + 0.02 * b})`);
    dome.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = dome;
    ctx.fillRect(x, y, w, h);

    ctx.restore();

    rr(ctx, x + 3, y + 3, w - 6, h - 6, Math.max(0, r - 3));
    ctx.strokeStyle = `rgba(255,255,255,${0.28 + 0.34 * b})`;
    ctx.lineWidth = 2.6;
    ctx.stroke();
    ctx.save();
    ctx.beginPath();
    ctx.rect(x - 20, y + h - 64, w + 40, 95);
    ctx.clip();
    ctx.filter = 'blur(5px)';
    rr(ctx, x + 3, y + 3, w - 6, h - 6, Math.max(0, r - 3));
    ctx.strokeStyle = `rgba(81,106,129,${0.055 + 0.07 * b})`;
    ctx.lineWidth = 6;
    ctx.stroke();
    ctx.restore();
    rr(ctx, x + 1, y + 1, w - 2, h - 2, Math.max(0, r - 1));
    ctx.strokeStyle = `rgba(104,129,148,${0.075 + 0.065 * b})`;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  if (g.gloss > 0) {
    ctx.save();
    rr(ctx, x, y, w, h, r);
    ctx.clip();
    ctx.globalAlpha = g.gloss / 100;
    const gl = ctx.createRadialGradient(x + 170, y + 90, 25, x + 260, y + 240, 570);
    gl.addColorStop(0, 'rgba(255,255,255,.34)');
    gl.addColorStop(0.35, 'rgba(255,255,255,.07)');
    gl.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gl;
    ctx.fillRect(x, y, w, h);
    ctx.restore();
  }

  drawCopyright(ctx, input, x, y, w, h, r);
  ctx.restore();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

/**
 * Single entry point for preview, gallery tiles, PNG export and the display
 * sheet, so none of them can drift apart.
 */
export function renderBadge(ctx: Ctx, input: RenderInput, dim: number): void {
  if (input.settings.style === 'acrylic') drawAcrylic(ctx, input, dim);
  else drawBadge(ctx, input, dim);
}
