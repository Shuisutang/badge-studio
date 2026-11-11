import { clamp } from '../model/defaults';
import type { ColorSamples, ItemSettings, RGB } from '../model/types';

export const SAMPLE_SIZE = 64;

/** Fallback when an image has no opaque pixels at all. */
const EMPTY_SAMPLE: RGB = [125, 120, 141];

/**
 * Pick the colours of an artwork from a SAMPLE_SIZE² RGBA thumbnail.
 *
 * Chromatic pixels are grouped into 18 hue buckets, so different artwork keeps its
 * own hue instead of drifting toward one global grey-blue average.
 *
 * Fix vs v16: the winning bucket must cover a meaningful share of the image
 * (`minShare` of the opaque weight). Before, ~4 pixels of a tiny logo were
 * enough to tint the whole ring of an otherwise grey picture.
 */
export function extractColors(data: Uint8ClampedArray | Uint8Array, size = SAMPLE_SIZE, minShare = 0.04): ColorSamples {
  const s = [0, 0, 0, 0];
  const mid = [0, 0, 0, 0];
  const bins = Array.from({ length: 18 }, () => ({ r: 0, g: 0, b: 0, weight: 0 }));
  const lo = (12 / 64) * size;
  const hi = (52 / 64) * size;
  for (let y = 0; y < size; y++) {
    for (let z = 0; z < size; z++) {
      const j = (y * size + z) * 4;
      const a = (data[j + 3] ?? 0) / 255;
      if (a < 0.12) continue;
      const R = data[j] ?? 0;
      const G = data[j + 1] ?? 0;
      const B = data[j + 2] ?? 0;
      s[0]! += R * a;
      s[1]! += G * a;
      s[2]! += B * a;
      s[3]! += a;
      const center = z > lo && z < hi && y > lo && y < hi;
      if (center) {
        mid[0]! += R * a;
        mid[1]! += G * a;
        mid[2]! += B * a;
        mid[3]! += a;
      }
      const mx = Math.max(R, G, B);
      const mn = Math.min(R, G, B);
      const delta = mx - mn;
      if (delta >= 24 && delta / Math.max(mx, 1) > 0.19) {
        let hue: number;
        if (mx === R) hue = ((G - B) / delta) % 6;
        else if (mx === G) hue = (B - R) / delta + 2;
        else hue = (R - G) / delta + 4;
        const h = (hue * 60 + 360) % 360;
        const slot = Math.floor(((h + 10) % 360) / 20);
        const weight = a * (0.65 + delta / 255) * (center ? 1.12 : 1);
        const bin = bins[slot]!;
        bin.r += R * weight;
        bin.g += G * weight;
        bin.b += B * weight;
        bin.weight += weight;
      }
    }
  }
  const sample: RGB = s[3]! ? [s[0]! / s[3]!, s[1]! / s[3]!, s[2]! / s[3]!] : [...EMPTY_SAMPLE];
  const centerSample: RGB = mid[3]! ? [mid[0]! / mid[3]!, mid[1]! / mid[3]!, mid[2]! / mid[3]!] : sample;
  let dominant = bins[0]!;
  for (const b of bins) if (b.weight > dominant.weight) dominant = b;
  const threshold = Math.max(4, s[3]! * minShare);
  const dom: RGB =
    dominant.weight > threshold
      ? [dominant.r / dominant.weight, dominant.g / dominant.weight, dominant.b / dominant.weight]
      : centerSample;
  return { sample, center: centerSample, dominant: dom };
}

export function lerp(a: RGB, b: RGB, t: number): RGB {
  return [a[0] * (1 - t) + b[0] * t, a[1] * (1 - t) + b[1] * t, a[2] * (1 - t) + b[2] * t];
}

export function rgbToHex(rgb: RGB): string {
  return '#' + rgb.map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('').toUpperCase();
}

export function hexToRgb(hex: string): RGB {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((x) => x + x).join('');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return [Number.isFinite(r) ? r : 0, Number.isFinite(g) ? g : 0, Number.isFinite(b) ? b : 0];
}

/** Canvas colour string; matches v16 byte for byte so renders stay identical. */
export function css(arr: RGB, a = 1): string {
  if (a === 1) return `rgb(${arr[0] | 0},${arr[1] | 0},${arr[2] | 0})`;
  return `rgba(${arr[0] | 0},${arr[1] | 0},${arr[2] | 0},${a})`;
}

/** A small lightness lift keeps the artwork hue and improves differentiation. */
export function automaticTint(colors: ColorSamples): RGB {
  return lerp(colors.dominant, [255, 255, 255], 0.13);
}

export function overlayTint(settings: Pick<ItemSettings, 'overlayMode' | 'overlayCustom'>, colors: ColorSamples): RGB {
  switch (settings.overlayMode) {
    case 'custom':
      return hexToRgb(settings.overlayCustom);
    case 'white':
      return [255, 255, 255];
    case 'black':
      return [0, 0, 0];
    default:
      return automaticTint(colors);
  }
}
