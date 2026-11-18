/**
 * Colour helpers for the 叠色 picker: a small dominant palette from an image
 * thumbnail, hex parsing, and the "recently used" list kept in localStorage.
 * All pure so they can be unit-tested without a DOM.
 */
import { rgbToHex } from './color';
import type { RGB } from '../model/types';

/** Accepts "#abc", "abc", "#aabbcc" or "aabbcc" (any case); returns "#AABBCC" or null. */
export function normalizeHex(input: string): string | null {
  const v = String(input ?? '').trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(v)) return ('#' + v.split('').map((c) => c + c).join('')).toUpperCase();
  if (/^[0-9a-f]{6}$/i.test(v)) return ('#' + v).toUpperCase();
  return null;
}

/** Parses "#RRGGBB" or "rgb(r, g, b)" (what EyeDropper implementations return). */
export function parseCssColor(input: string): string | null {
  const hex = normalizeHex(input);
  if (hex) return hex;
  const m = /^rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})/i.exec(String(input ?? '').trim());
  return m ? rgbToHex([Number(m[1]), Number(m[2]), Number(m[3])]) : null;
}

const dist = (a: RGB, b: RGB) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/**
 * Dominant colours of an RGBA buffer (e.g. a 64×64 thumbnail), most common first.
 * Pixels are grouped by hue (12 bins) × lightness (3 bins), neutrals by lightness
 * (4 bins); each group's average colour is a candidate, and candidates closer
 * than `minDistance` to an already chosen colour are skipped so the swatches differ.
 */
export function extractPalette(data: Uint8ClampedArray | Uint8Array, count = 6, minDistance = 44, minShare = 0.012): string[] {
  const groups = new Map<number, { r: number; g: number; b: number; w: number }>();
  let total = 0;
  for (let i = 0; i + 3 < data.length; i += 4) {
    const a = data[i + 3]! / 255;
    if (a < 0.5) continue;
    const R = data[i]!, G = data[i + 1]!, B = data[i + 2]!;
    const mx = Math.max(R, G, B), mn = Math.min(R, G, B), d = mx - mn;
    const light = (mx + mn) / 510;
    let key: number;
    if (d < 22 || d / Math.max(mx, 1) < 0.14) key = 100 + Math.min(3, Math.floor(light * 4));
    else {
      let h = mx === R ? ((G - B) / d) % 6 : mx === G ? (B - R) / d + 2 : (R - G) / d + 4;
      h = (h * 60 + 360) % 360;
      key = Math.floor(((h + 15) % 360) / 30) * 3 + Math.min(2, Math.floor(light * 3));
    }
    const g = groups.get(key) ?? { r: 0, g: 0, b: 0, w: 0 };
    g.r += R * a; g.g += G * a; g.b += B * a; g.w += a;
    groups.set(key, g);
    total += a;
  }
  const cands = [...groups.values()]
    .filter((g) => g.w >= Math.max(1, total * minShare))
    .sort((x, y) => y.w - x.w)
    .map((g) => [g.r / g.w, g.g / g.w, g.b / g.w] as RGB);
  const out: RGB[] = [];
  for (const c of cands) {
    if (out.length >= count) break;
    if (out.every((o) => dist(o, c) >= minDistance)) out.push(c);
  }
  return out.map(rgbToHex);
}

export const RECENT_KEY = 'badge-studio.recentColors';
export const RECENT_MAX = 8;

type KV = Pick<Storage, 'getItem' | 'setItem'>;

export function loadRecent(storage: KV | null | undefined): string[] {
  try {
    const raw = JSON.parse(storage?.getItem(RECENT_KEY) ?? '[]');
    if (!Array.isArray(raw)) return [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const v of raw) {
      const h = typeof v === 'string' ? normalizeHex(v) : null;
      if (h && !seen.has(h)) { seen.add(h); out.push(h); }
      if (out.length >= RECENT_MAX) break;
    }
    return out;
  } catch {
    return [];
  }
}

/** Moves `hex` to the front of the list (deduplicated, capped) and saves it. */
export function pushRecent(storage: KV | null | undefined, hex: string): string[] {
  const h = normalizeHex(hex);
  const list = loadRecent(storage);
  if (!h) return list;
  const next = [h, ...list.filter((x) => x !== h)].slice(0, RECENT_MAX);
  try { storage?.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* private mode / quota: keep in memory only */ }
  return next;
}

/**
 * Alpha-weighted average around (x, y) in an RGBA buffer of w×h, radius `r`
 * (so a 1px slip of the finger doesn't land on an anti-aliased edge). Returns
 * null on mostly transparent pixels (nothing to pick there).
 */
export function sampleAt(data: Uint8ClampedArray | Uint8Array, w: number, h: number, x: number, y: number, r = 1): string | null {
  const cx = Math.round(x), cy = Math.round(y);
  let R = 0, G = 0, B = 0, A = 0, n = 0;
  for (let j = cy - r; j <= cy + r; j++) {
    for (let i = cx - r; i <= cx + r; i++) {
      if (i < 0 || j < 0 || i >= w || j >= h) continue;
      const k = (j * w + i) * 4;
      const a = data[k + 3]! / 255;
      R += data[k]! * a; G += data[k + 1]! * a; B += data[k + 2]! * a; A += a; n++;
    }
  }
  if (!n || A / n < 0.5) return null;
  return rgbToHex([R / A, G / A, B / A]);
}
