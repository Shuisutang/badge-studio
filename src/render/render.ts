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
import {
  ACRYLIC_LIGHT,
  acrylicBackSheet,
  acrylicBody,
  acrylicGroundShadow,
  acrylicHole,
  acrylicRimLight,
  acrylicThickness,
  badgeContactShadow,
  badgeFaceLighting,
  badgeGloss,
} from './lighting';
import { depthAcrylicBackSheet, depthAcrylicGroundShadow, depthAcrylicRim, depthContactShadow, depthFaceLighting } from './lightingDepth';
import { roundedSubpath, rr } from './paths';

export interface RenderInput {
  src: Drawable;
  settings: ItemSettings;
  colors: ColorSamples;
  globals: GlobalSettings;
  /** Copyright logo image, if one is loaded. */
  mark: Drawable | null;
  /**
   * Only the printed layers (no baked lighting, shadow, rim light or hole):
   * the texture for the 3D preview, where real lights do that job.
   */
  printOnly?: boolean;
  /** acrylic only: just the art panel's alpha footprint (for the back white-ink layer in 3D) */
  inkMask?: boolean;
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
function drawArtPanel(ctx: Ctx, input: RenderInput, box: Rect, r: number, opts: { noShade?: boolean; noTiltShadow?: boolean; outerLimit: number }): void {
  const s = input.settings;
  const { deg, panelW, panelH, cx, cy, corner } = artPanelGeometry(s.style, s.rotation, s.artSize, box, r, opts.outerLimit);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((deg * Math.PI) / 180);
  const px = -panelW / 2;
  const py = -panelH / 2;
  if (deg !== 0 && !opts.noTiltShadow) {
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
  const A = ACRYLIC_LIGHT;
  const r = A.radius;
  const tint = overlayTint(s, input.colors);
  const alpha = g.overlayAlpha / 100;
  const sh = g.threeDEnabled ? g.shadow / 100 : 0;
  const gloss = g.gloss / 100;
  const rim = A.border;
  const b = g.threeDEnabled ? g.bevel / 100 : 0;
  const thickness = acrylicThickness(g.threeDEnabled, g.depth);

  if (input.inkMask) {
    // White ink sits exactly under the printed art panel (same size / offset / rotation).
    ctx.save();
    rr(ctx, x + rim, y + rim, w - rim * 2, h - rim * 2, 1);
    ctx.clip();
    drawArtPanel(ctx, input, { x: x + rim, y: y + rim, w: w - rim * 2, h: h - rim * 2 }, 0, { noShade: true, noTiltShadow: true, outerLimit: w - 8 });
    ctx.restore();
    ctx.restore();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    return;
  }
  const print = !!input.printOnly;
  if (!print) {
    // v2 depth (ellipse shadow + back sheet) first, v3 soft shadow + edge on top
    depthAcrylicGroundShadow(ctx, ACRYLIC_FACE, sh, thickness);
    acrylicGroundShadow(ctx, ACRYLIC_FACE, sh, thickness);
    depthAcrylicBackSheet(ctx, ACRYLIC_FACE, r, thickness);
    acrylicBackSheet(ctx, ACRYLIC_FACE, r, thickness);
  }

  ctx.save();
  rr(ctx, x, y, w, h, r);
  ctx.clip();
  if (!print) acrylicBody(ctx, ACRYLIC_FACE);

  // Printed background inside the bevel: the same artwork under the per-image
  // colour glaze (as in v2). It must always cover the whole print area, so a
  // centre panel smaller than 100% sits on tinted art, never on bare acrylic.
  // Fix (v3 regression): v3 drew the art only in the bevel ring and the panel,
  // leaving the gap between them see-through when 主图尺寸 < 100%.
  ctx.save();
  rr(ctx, x + rim, y + rim, w - rim * 2, h - rim * 2, 1);
  ctx.clip();
  drawImageFit(ctx, input, x, y, w, h, g.outerZoom / 100, 'outer');
  ctx.fillStyle = css(tint, Math.min(0.88, alpha * 0.58 + 0.26));
  ctx.fillRect(x, y, w, h);
  ctx.restore();

  // Clear bevel border: the art edge seen through thick acrylic — stretched a
  // little, washed out, with a light per-image colour glaze.
  ctx.save();
  ctx.beginPath();
  roundedSubpath(ctx, x, y, w, h, r);
  roundedSubpath(ctx, x + rim, y + rim, w - rim * 2, h - rim * 2, 1);
  ctx.clip('evenodd');
  ctx.globalAlpha = A.bevelArt.alpha;
  drawImageFit(ctx, input, x, y, w, h, (g.outerZoom / 100) * A.bevelArt.zoom, 'outer');
  ctx.globalAlpha = 1;
  ctx.fillStyle = A.bevelArt.wash;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = css(tint, Math.min(0.6, alpha * A.bevelArt.tintK));
  ctx.fillRect(x, y, w, h);
  ctx.restore();

  // Inner image printed cleanly, no white mat.
  ctx.save();
  rr(ctx, x + rim, y + rim, w - rim * 2, h - rim * 2, 1);
  ctx.clip();
  drawArtPanel(ctx, input, { x: x + rim, y: y + rim, w: w - rim * 2, h: h - rim * 2 }, 0, { noShade: true, outerLimit: w - 8 });
  ctx.restore();

  if (!print) {
    depthAcrylicRim(ctx, ACRYLIC_FACE, b, gloss, r);
    acrylicRimLight(ctx, ACRYLIC_FACE, b, gloss);
  }
  ctx.restore();

  drawCopyright(ctx, input, x, y, w, h, r);

  // A real transparent drill hole (alpha 0) with a white frosted wall.
  if (s.acrylicHole && !print) acrylicHole(ctx, x + ACRYLIC_HOLE.dx, y + h - ACRYLIC_HOLE.dy, ACRYLIC_HOLE.r);
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
  const r = square ? 6 : g.radius;
  const ring = g.ring;
  const inner: Rect = { x: x + ring, y: y + ring, w: w - 2 * ring, h: h - 2 * ring };
  const innerR = square ? 1 : Math.max(6, r - ring * 0.85);
  const tint = overlayTint(s, input.colors);
  const has3d = g.threeDEnabled;
  const depth = has3d ? g.depth : 0;
  const b = has3d ? g.bevel / 100 : 0;
  const sh = has3d ? g.shadow / 100 : 0;

  // Elliptical, translucent contact shadow fading to alpha 0: no slab, no dark line.
  if (!input.printOnly) {
    depthContactShadow(ctx, BADGE_FACE, sh, depth);
    badgeContactShadow(ctx, BADGE_FACE, sh, depth, r);
  }

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

  // Outer-ring tint. The clear window always follows the real centre panel
  // (rotation AND size), and is clipped to the face first.
  // Fix (coupling): v16 used the un-resized inner rect unless rotated, so at
  // size ≠ 100% an untinted halo appeared around the panel; and with a tilted
  // panel > 100% the even-odd path painted tint outside the rounded corners.
  if (g.overlayAlpha > 0) {
    ctx.save();
    rr(ctx, x, y, w, h, r);
    ctx.clip();
    ctx.beginPath();
    roundedSubpath(ctx, x, y, w, h, r);
    panelSubpath(ctx, s, inner, innerR, w);
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

  if (!input.printOnly) {
    if (has3d && b > 0) {
      depthFaceLighting(ctx, BADGE_FACE, r, b);
      badgeFaceLighting(ctx, BADGE_FACE, r, b, square);
    }
    badgeGloss(ctx, BADGE_FACE, r, g.gloss / 100);
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
