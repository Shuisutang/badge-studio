import { describe, expect, it } from 'vitest';
import { RECENT_KEY, RECENT_MAX, extractPalette, loadRecent, normalizeHex, parseCssColor, pushRecent, sampleAt } from '../../src/color/palette';

function img(w: number, h: number, fill: (x: number, y: number) => [number, number, number, number]): Uint8ClampedArray {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) d.set(fill(x, y), (y * w + x) * 4);
  return d;
}
const mem = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
};

describe('normalizeHex / parseCssColor', () => {
  it('accepts 3/6 digits with or without #, any case', () => {
    expect(normalizeHex('#abc')).toBe('#AABBCC');
    expect(normalizeHex('12ab9f')).toBe('#12AB9F');
    expect(normalizeHex(' #C9D8EA ')).toBe('#C9D8EA');
  });
  it('rejects anything else', () => {
    for (const v of ['', '#12', '#1234567', 'red', '#ggg000']) expect(normalizeHex(v)).toBeNull();
  });
  it('parses EyeDropper rgb() output', () => {
    expect(parseCssColor('rgb(18, 52, 86)')).toBe('#123456');
    expect(parseCssColor('#123456')).toBe('#123456');
    expect(parseCssColor('nope')).toBeNull();
  });
});

describe('extractPalette', () => {
  it('returns the main colours, most common first, deduplicated', () => {
    // 60% red, 30% blue, 10% white; plus near-duplicate reds
    const d = img(20, 20, (x) => (x < 12 ? [215 + (x % 2) * 6, 65, 88, 255] : x < 18 ? [54, 103, 220, 255] : [250, 250, 250, 255]));
    const p = extractPalette(d, 6);
    expect(p).toHaveLength(3);
    expect(p[0]).toMatch(/^#D[78A-F]/); // red first
    expect(p[1]).toBe('#3667DC');
    expect(p[2]).toBe('#FAFAFA');
  });
  it('ignores transparent pixels and caps the count', () => {
    expect(extractPalette(img(8, 8, () => [255, 0, 0, 0]))).toEqual([]);
    const rainbow = img(36, 4, (x) => {
      const h = (x * 10) % 360;
      const c = (n: number) => Math.round(255 * Math.max(0, Math.min(1, Math.abs(((h / 60 + n) % 6) - 3) - 1)));
      return [c(0), c(4), c(2), 255];
    });
    expect(extractPalette(rainbow, 5).length).toBeLessThanOrEqual(5);
  });
});

describe('sampleAt', () => {
  const d = img(10, 10, (x) => (x < 5 ? [255, 0, 0, 255] : [0, 0, 255, 0]));
  it('averages the neighbourhood', () => {
    expect(sampleAt(d, 10, 10, 1, 5, 1)).toBe('#FF0000');
  });
  it('returns null over transparency and outside', () => {
    expect(sampleAt(d, 10, 10, 8, 5, 1)).toBeNull();
    expect(sampleAt(d, 10, 10, -20, -20, 1)).toBeNull();
  });
});

describe('recent colours', () => {
  it('dedupes, moves to front, caps and persists', () => {
    const s = mem();
    pushRecent(s, '#111111');
    pushRecent(s, '#222222');
    expect(pushRecent(s, '111111')).toEqual(['#111111', '#222222']);
    for (let i = 0; i < 12; i++) pushRecent(s, '#' + String(i).padStart(2, '0').repeat(3));
    expect(loadRecent(s)).toHaveLength(RECENT_MAX);
    expect(loadRecent(s)[0]).toBe('#111111'); // i = 11 was pushed last
    expect(loadRecent(s)[1]).toBe('#101010');
  });
  it('survives corrupt or missing storage', () => {
    const s = mem();
    s.setItem(RECENT_KEY, '{not json');
    expect(loadRecent(s)).toEqual([]);
    s.setItem(RECENT_KEY, JSON.stringify(['#abc', 42, 'zzz', '#AABBCC']));
    expect(loadRecent(s)).toEqual(['#AABBCC']);
    expect(loadRecent(null)).toEqual([]);
    expect(pushRecent(null, '#123456')).toEqual(['#123456']); // in-memory only
    const throwing = { getItem: () => null, setItem: () => { throw new Error('quota'); } };
    expect(pushRecent(throwing, '#123456')).toEqual(['#123456']);
  });
});
