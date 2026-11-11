import { describe, expect, it } from 'vitest';
import { automaticTint, extractColors, hexToRgb, overlayTint, rgbToHex } from '../../src/color/color';
import type { RGB } from '../../src/model/types';

const S = 64;
function solid(rgb: RGB, a = 255): Uint8ClampedArray {
  const d = new Uint8ClampedArray(S * S * 4);
  for (let i = 0; i < S * S; i++) d.set([...rgb, a], i * 4);
  return d;
}
function paint(d: Uint8ClampedArray, x0: number, y0: number, w: number, h: number, rgb: RGB): void {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) d.set([...rgb, 255], (y * S + x) * 4);
}

describe('extractColors', () => {
  it('gives red, green and blue art distinct dominant colours', () => {
    const hexes = ([[215, 65, 88], [46, 164, 121], [54, 103, 220]] as RGB[]).map((c) => rgbToHex(extractColors(solid(c)).dominant));
    expect(new Set(hexes).size).toBe(3);
    expect(hexes[0]).toBe('#D74158');
  });

  it('ignores a tiny saturated logo on a grey picture (B6)', () => {
    const d = solid([128, 128, 130]);
    paint(d, 58, 58, 4, 4, [230, 20, 30]);
    const dom = extractColors(d).dominant;
    expect(Math.max(...dom) - Math.min(...dom)).toBeLessThan(5);
  });

  it('still picks an accent that covers a real share of the picture', () => {
    const d = solid([128, 128, 130]);
    paint(d, 0, 0, 64, 16, [40, 90, 220]);
    const dom = extractColors(d).dominant;
    expect(dom[2]).toBeGreaterThan(dom[0] + 100);
  });

  it('skips transparent pixels and falls back when empty', () => {
    const d = solid([0, 0, 0], 0);
    paint(d, 20, 20, 24, 24, [250, 120, 160]);
    expect(rgbToHex(extractColors(d).dominant)).toBe('#FA78A0');
    expect(extractColors(solid([0, 0, 0], 0)).sample).toEqual([125, 120, 141]);
  });
});

describe('tints', () => {
  const colors = { sample: [10, 10, 10] as RGB, center: [10, 10, 10] as RGB, dominant: [200, 100, 50] as RGB };
  it('lifts the dominant colour 13% toward white like v16', () => {
    const t = automaticTint(colors);
    expect(t[0]).toBeCloseTo(200 * 0.87 + 255 * 0.13);
  });
  it('respects the per-image mode', () => {
    expect(overlayTint({ overlayMode: 'white', overlayCustom: '#123456' }, colors)).toEqual([255, 255, 255]);
    expect(overlayTint({ overlayMode: 'black', overlayCustom: '#123456' }, colors)).toEqual([0, 0, 0]);
    expect(overlayTint({ overlayMode: 'custom', overlayCustom: '#123456' }, colors)).toEqual([0x12, 0x34, 0x56]);
  });
  it('hex round-trips and accepts short form', () => {
    expect(rgbToHex(hexToRgb('#a1B2c3'))).toBe('#A1B2C3');
    expect(hexToRgb('#fff')).toEqual([255, 255, 255]);
    expect(rgbToHex([300, -5, 127.6])).toBe('#FF0080');
  });
});
