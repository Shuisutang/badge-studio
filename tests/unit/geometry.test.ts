import { describe, expect, it } from 'vitest';
import { acrylicHoleCenter, artPanelGeometry, fitRect, panRange } from '../../src/render/geometry';

const box = { x: 100, y: 100, w: 600, h: 600 };
const P = { fit: 'cover' as const, zoom: 100, offsetX: 0, offsetY: 0 };

describe('fitRect', () => {
  it('covers and centres by default', () => {
    expect(fitRect(1000, 3000, box, P)).toEqual({ x: 100, y: 100 - 600, w: 600, h: 1800 });
  });
  it('±100 aligns the image edge with the box edge: no gap, top reachable (B2)', () => {
    const top = fitRect(1000, 3000, box, { ...P, offsetY: 100 })!;
    expect(top.y).toBe(box.y);
    const bottom = fitRect(1000, 3000, box, { ...P, offsetY: -100 })!;
    expect(bottom.y + bottom.h).toBe(box.y + box.h);
  });
  it('a square image at 100% cannot be panned into a gap', () => {
    const r = fitRect(800, 800, box, { ...P, offsetX: 100, offsetY: -100 })!;
    expect(r).toEqual({ x: 100, y: 100, w: 600, h: 600 });
    expect(panRange(800, 800, box, P)).toEqual({ x: 0, y: 0 });
    expect(panRange(800, 800, box, { ...P, zoom: 150 }).x).toBe(150);
  });
  it('contain fits inside and pans within the empty space', () => {
    const r = fitRect(3000, 1000, box, { ...P, fit: 'contain' })!;
    expect(r.w).toBe(600);
    expect(r.h).toBe(200);
    const up = fitRect(3000, 1000, box, { ...P, fit: 'contain', offsetY: -100 })!;
    expect(up.y).toBe(box.y);
  });
  it('rejects degenerate sizes', () => {
    expect(fitRect(0, 10, box, P)).toBeNull();
  });
});

describe('artPanelGeometry', () => {
  it('is untouched at 0° / 100%', () => {
    const g = artPanelGeometry('rounded', 0, 100, box, 40);
    expect(g).toMatchObject({ deg: 0, panelW: 600, panelH: 600, corner: 40 });
  });
  it('auto-shrinks a tilted panel so corners stay inside', () => {
    const g = artPanelGeometry('rounded', -12, 100, box, 40, 724);
    expect(g.panelW).toBeLessThan(600);
    expect(g.corner).toBe(1);
  });
  it('lets the user oversize on purpose (>100%)', () => {
    expect(artPanelGeometry('rounded', 20, 110, box, 40).panelW).toBeCloseTo(660);
  });
  it('never rotates square or acrylic', () => {
    expect(artPanelGeometry('square', 20, 100, box, 1).deg).toBe(0);
    expect(artPanelGeometry('acrylic', -30, 100, box, 0).deg).toBe(0);
  });
  it('hole centre matches the official-proportion probe', () => {
    const h = acrylicHoleCenter(960);
    expect([h.x, h.y]).toEqual([174, 770]);
  });
});
