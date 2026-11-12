import { describe, expect, it } from 'vitest';
import { MAX_CANVAS_AREA, MAX_CANVAS_SIDE, safeFileName, sheetLayout, uniqueNames } from '../../src/export/layout';
import { baseName, isLowRes, looksLikeImage, targetSize } from '../../src/image/sizing';
import { DEFAULT_GLOBALS, DEFAULT_ITEM, sanitizeGlobals, sanitizeItemSettings } from '../../src/model/defaults';

describe('sheetLayout', () => {
  it('matches v16 for small batches', () => {
    expect(sheetLayout(1)).toMatchObject({ cols: 1, rows: 1, tile: 550, width: 690, height: 690 });
    expect(sheetLayout(3)).toMatchObject({ cols: 3, rows: 1 });
    expect(sheetLayout(5)).toMatchObject({ cols: 3, rows: 2 });
    expect(sheetLayout(12)).toMatchObject({ cols: 4, rows: 3, tile: 550 });
  });
  it('stays inside browser canvas limits for huge batches (B10)', () => {
    for (const n of [50, 240, 300, 1000]) {
      const L = sheetLayout(n);
      expect(L.cols * L.rows).toBeGreaterThanOrEqual(n);
      expect(L.width).toBeLessThanOrEqual(MAX_CANVAS_SIDE);
      expect(L.height).toBeLessThanOrEqual(MAX_CANVAS_SIDE);
      expect(L.width * L.height).toBeLessThanOrEqual(MAX_CANVAS_AREA);
    }
  });
});

describe('file names', () => {
  it('strips path-unsafe characters but keeps CJK', () => {
    expect(safeFileName('a/b:c*?.png')).toBe('a_b_c_.png');
    expect(safeFileName('  初音  ミク ')).toBe('初音 ミク');
    expect(safeFileName('...')).toBe('图片');
  });
  it('de-duplicates zip entries', () => {
    expect(uniqueNames(['a', 'A', 'b', 'a'], '.png')).toEqual(['a.png', 'A (2).png', 'b.png', 'a (3).png']);
  });
  it('baseName drops the extension', () => {
    expect(baseName('photo.final.JPG')).toBe('photo.final');
    expect(baseName('.png')).toBe('图片');
  });
});

describe('targetSize', () => {
  it('never upscales', () => {
    expect(targetSize(64, 64, 1400)).toEqual({ width: 64, height: 64, scaled: false });
  });
  it('downsizes the short side', () => {
    expect(targetSize(6000, 6000, 1400)).toMatchObject({ width: 1400, height: 1400, scaled: true });
    expect(targetSize(1000, 3000, 1400)).toMatchObject({ scaled: false });
  });
  it('caps extreme panoramas by long side and area', () => {
    const t = targetSize(40000, 2000, 4096);
    expect(t.width).toBeLessThanOrEqual(8192);
    expect(t.width * t.height).toBeLessThanOrEqual(4096 * 4096);
  });
  it('flags low-res sources', () => {
    expect(isLowRes(64, 64, 1200)).toBe(true);
    expect(isLowRes(1200, 1200, 2000)).toBe(false);
  });
  it('recognises images with an empty MIME type', () => {
    expect(looksLikeImage({ type: '', name: 'x.WEBP' })).toBe(true);
    expect(looksLikeImage({ type: 'application/pdf', name: 'x.pdf' })).toBe(false);
  });
});

describe('sanitize (restored / imported data)', () => {
  it('keeps old copyright placement and validates corner selection', () => {
    expect(sanitizeGlobals({ markRight: 72, markBottom: 26 })).toMatchObject({ markPosition: 'bottom-right', markRight: 72, markBottom: 26 });
    for (const markPosition of ['top-left', 'top-right', 'bottom-left', 'bottom-right'])
      expect(sanitizeGlobals({ markPosition }).markPosition).toBe(markPosition);
    expect(sanitizeGlobals({ markPosition: 'outside' }).markPosition).toBe('bottom-right');
  });
  it('restores older acrylic settings and bounds the new appearance controls', () => {
    expect(sanitizeItemSettings({ style: 'acrylic' })).toMatchObject({
      acrylicOutlineWidth: DEFAULT_ITEM.acrylicOutlineWidth,
      acrylicOutlineColor: DEFAULT_ITEM.acrylicOutlineColor,
      acrylicOutlineOpacity: DEFAULT_ITEM.acrylicOutlineOpacity,
      acrylicBackgroundBrightness: DEFAULT_ITEM.acrylicBackgroundBrightness,
    });
    expect(sanitizeItemSettings({ acrylicOutlineWidth: -5, acrylicOutlineColor: 'red', acrylicOutlineOpacity: 130, acrylicBackgroundBrightness: -200 })).toMatchObject({
      acrylicOutlineWidth: 0, acrylicOutlineColor: DEFAULT_ITEM.acrylicOutlineColor,
      acrylicOutlineOpacity: 100, acrylicBackgroundBrightness: -80,
    });
  });
  it('fills defaults and clamps', () => {
    expect(sanitizeItemSettings(null)).toEqual(DEFAULT_ITEM);
    const s = sanitizeItemSettings({ style: 'metal', rotation: 99, artSize: '80', overlayCustom: 'red', zoom: NaN });
    expect(s).toMatchObject({ style: 'rounded', rotation: 30, artSize: 80, overlayCustom: DEFAULT_ITEM.overlayCustom, zoom: 100 });
    expect(sanitizeGlobals({ resolution: 999, bg: 'dark', markText: 'x'.repeat(200) })).toMatchObject({
      resolution: DEFAULT_GLOBALS.resolution,
      bg: 'dark',
    });
    expect(sanitizeGlobals({ markText: 'x'.repeat(200) }).markText).toHaveLength(90);
  });
});
