import { describe, expect, it } from 'vitest';
import { faceUv, projectToRoundedRect, roundedRectSdf, tinHeight, tinWallUv } from '../../src/three/geometry3d';
import { BADGE_FACE } from '../../src/render/geometry';

describe('3D geometry helpers', () => {
  it('sdf is negative inside, zero on the edge, positive outside', () => {
    expect(roundedRectSdf(0, 0, 0.5, 0.5, 0.1)).toBeCloseTo(-0.5);
    expect(roundedRectSdf(0.5, 0, 0.5, 0.5, 0.1)).toBeCloseTo(0);
    expect(roundedRectSdf(0.5, 0.5, 0.5, 0.5, 0.1)).toBeGreaterThan(0);
  });
  it('projection lands on the outline', () => {
    for (const [x, y] of [[0.6, 0.6], [0.7, 0.1], [-0.2, -0.9], [0.49, 0.499]] as const) {
      const [px, py] = projectToRoundedRect(x, y, 0.5, 0.5, 0.1);
      expect(Math.abs(roundedRectSdf(px, py, 0.5, 0.5, 0.1))).toBeLessThan(1e-9);
    }
  });
  it('tin surface: 0 at the rim, highest in the middle, symmetric', () => {
    const s = { hx: 0.5, hy: 0.5, r: 0.1, roll: 0.05, rimH: 0.03, domeH: 0.02 };
    expect(tinHeight(0.5, 0, s)).toBe(0);
    expect(tinHeight(0, 0, s)).toBeCloseTo(0.05);
    expect(tinHeight(0.2, 0.1, s)).toBeCloseTo(tinHeight(-0.2, -0.1, s));
    expect(tinHeight(0.48, 0, s)).toBeLessThan(tinHeight(0.4, 0, s));
  });
  it('face UVs map the face corners into the design canvas', () => {
    const [u0, v0] = faceUv(-0.5, 0.5, 0.5, 0.5, BADGE_FACE, 960, 0);
    expect(u0).toBeCloseTo(BADGE_FACE.x / 960);
    expect(v0).toBeCloseTo(1 - BADGE_FACE.y / 960);
    const [u1, v1] = faceUv(0.5, -0.5, 0.5, 0.5, BADGE_FACE, 960, 0);
    expect(u1).toBeCloseTo((BADGE_FACE.x + BADGE_FACE.w) / 960);
    expect(v1).toBeCloseTo(1 - (BADGE_FACE.y + BADGE_FACE.h) / 960);
  });
  it('wrap UVs join the face seam and use a real strip of print across the depth', () => {
    const shape = { hx: 0.5, hy: 0.5, r: 0.1 };
    for (const [x, y] of [[0.5, 0.2], [-0.5, 0.2], [0.2, 0.5], [0.2, -0.5], [0.47, 0.47]] as const) {
      expect(tinWallUv(x, y, 0.025, shape, 0.05, BADGE_FACE)).toEqual(faceUv(x, y, 0.5, 0.5, BADGE_FACE));
    }
    const front = tinWallUv(0.5, 0.2, 0.025, shape, 0.05, BADGE_FACE);
    const back = tinWallUv(0.5, 0.2, -0.025, shape, 0.05, BADGE_FACE);
    expect(back[0]).toBeLessThan(front[0]);
    expect(back[1]).toBe(front[1]);
    expect(back).toEqual(faceUv(0.45, 0.2, 0.5, 0.5, BADGE_FACE));
  });
});
