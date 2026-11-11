import { SAMPLE_SIZE, extractColors } from '../color/color';
import type { ColorSamples, Drawable } from '../model/types';
import { EXPORT_SHORT_SIDE, PREVIEW_SHORT_SIDE, THUMB_SHORT_SIDE, targetSize } from './sizing';

export interface DecodedImage {
  naturalWidth: number;
  naturalHeight: number;
  preview: Drawable;
  thumb: Drawable;
  colors: ColorSamples;
}

/**
 * Decode once at full size (createImageBitmap honours EXIF orientation and decodes
 * off the main thread), then keep only downscaled proxies. The original Blob is
 * re-decoded at export time, so a 6000px photo no longer pins ~144MB of RAM.
 */
async function decode(blob: Blob, shortSide?: number): Promise<ImageBitmap> {
  if (!shortSide) return createImageBitmap(blob, { imageOrientation: 'from-image' });
  const probe = await createImageBitmap(blob, { imageOrientation: 'from-image' });
  const t = targetSize(probe.width, probe.height, shortSide);
  if (!t.scaled) return probe;
  try {
    return await createImageBitmap(probe, { resizeWidth: t.width, resizeHeight: t.height, resizeQuality: 'high' });
  } finally {
    probe.close();
  }
}

function downscale(src: ImageBitmap, shortSide: number): Promise<ImageBitmap> {
  const t = targetSize(src.width, src.height, shortSide);
  if (!t.scaled) return createImageBitmap(src);
  return createImageBitmap(src, { resizeWidth: t.width, resizeHeight: t.height, resizeQuality: 'high' });
}

export function sampleColors(src: Drawable): ColorSamples {
  const c = document.createElement('canvas');
  c.width = c.height = SAMPLE_SIZE;
  const x = c.getContext('2d', { willReadFrequently: true });
  if (!x) return extractColors(new Uint8ClampedArray(0));
  x.drawImage(src.source, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
  return extractColors(x.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data);
}

const asDrawable = (b: ImageBitmap): Drawable => ({ source: b, width: b.width, height: b.height });

export async function decodeForEditing(blob: Blob): Promise<DecodedImage> {
  const full = await createImageBitmap(blob, { imageOrientation: 'from-image' });
  try {
    const naturalWidth = full.width;
    const naturalHeight = full.height;
    const preview = await downscale(full, PREVIEW_SHORT_SIDE);
    const thumb = await downscale(preview, THUMB_SHORT_SIDE);
    const p = asDrawable(preview);
    return { naturalWidth, naturalHeight, preview: p, thumb: asDrawable(thumb), colors: sampleColors(p) };
  } finally {
    full.close();
  }
}

/** Full-quality source for export; caller must close() it. */
export async function decodeForExport(blob: Blob): Promise<ImageBitmap> {
  return decode(blob, EXPORT_SHORT_SIDE);
}

export async function decodeLogo(blob: Blob): Promise<Drawable> {
  return asDrawable(await decode(blob, 1024));
}
