/** Pure sizing helpers for decode/downscale decisions. */

/** Proxy used for the live preview, the sheet and colour sampling. */
export const PREVIEW_SHORT_SIDE = 1400;
/** Proxy used for gallery thumbnails. */
export const THUMB_SHORT_SIDE = 480;
/** Upper bound for the export decode (3000px export × 180% zoom fits). */
export const EXPORT_SHORT_SIDE = 4096;
/** Hard cap on any side and on total pixels, to stay clear of browser canvas limits. */
export const MAX_SIDE = 8192;
export const MAX_PIXELS = 4096 * 4096;

/**
 * Size to decode an image of w×h at so its short side is ≤ `shortSide`, neither side
 * exceeds MAX_SIDE and the area stays ≤ MAX_PIXELS. Never upscales.
 */
export function targetSize(w: number, h: number, shortSide: number): { width: number; height: number; scaled: boolean } {
  if (!(w > 0 && h > 0)) return { width: 0, height: 0, scaled: false };
  let s = Math.min(1, shortSide / Math.min(w, h), MAX_SIDE / Math.max(w, h), Math.sqrt(MAX_PIXELS / (w * h)));
  if (s >= 1) return { width: w, height: h, scaled: false };
  s = Math.max(s, 1 / Math.max(w, h));
  return { width: Math.max(1, Math.round(w * s)), height: Math.max(1, Math.round(h * s)), scaled: true };
}

/**
 * Smallest source short side that still looks sharp in an export of `resolution` px.
 * The centre panel is ~66% of the canvas and covers the short side.
 */
export function recommendedShortSide(resolution: number): number {
  return Math.round(resolution * 0.5);
}

export function isLowRes(w: number, h: number, resolution: number): boolean {
  return Math.min(w, h) < recommendedShortSide(resolution);
}

const IMAGE_EXT = /\.(png|jpe?g|webp|gif|avif|bmp)$/i;
/** Some drag sources and OSes hand over files with an empty MIME type. */
export function looksLikeImage(file: { type: string; name: string }): boolean {
  if (file.type) return file.type.startsWith('image/');
  return IMAGE_EXT.test(file.name);
}

export function baseName(fileName: string): string {
  const n = fileName.replace(/\.[^/.]+$/, '').trim();
  return n || '图片';
}
