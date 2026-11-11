import { describe, expect, it } from 'vitest';
import { DEFAULT_GLOBALS } from '../../src/model/defaults';
import { LOOK_PRESETS, matchPreset } from '../../src/model/presets';
import { BADGE_LIGHT } from '../../src/render/lighting';

describe('look presets', () => {
  it('defaults are the "standard" preset', () => {
    expect(matchPreset({ ...DEFAULT_GLOBALS })).toBe('standard');
  });
  it('each preset is recognised after applying it', () => {
    for (const p of LOOK_PRESETS) expect(matchPreset({ ...DEFAULT_GLOBALS, ...p.values })).toBe(p.id);
  });
  it('a manual tweak is "custom"', () => {
    expect(matchPreset({ ...DEFAULT_GLOBALS, gloss: 11 })).toBeNull();
  });
});

describe('lighting module', () => {
  it('keeps the confirmed shadow colour grey-blue, never black', () => {
    const [r, g, b] = BADGE_LIGHT.contactShadow.rgb.split(',').map(Number);
    expect(b).toBeGreaterThan(r!);
    expect(Math.min(r!, g!, b!)).toBeGreaterThan(30);
    for (const [, a, k] of BADGE_LIGHT.contactShadow.stops) expect(a + k).toBeLessThan(0.25);
  });
});

describe('v3 lighting constants', () => {
  it('all shadows stay grey-blue and faint', async () => {
    const { ACRYLIC_LIGHT } = await import('../../src/render/lighting');
    for (const rgb of [BADGE_LIGHT.dropShadow.rgb, ACRYLIC_LIGHT.groundShadow.rgb]) {
      const [r, , b] = rgb.split(',').map(Number);
      expect(b).toBeGreaterThan(r!);
    }
    expect(BADGE_LIGHT.dropShadow.alpha[0] + BADGE_LIGHT.dropShadow.alpha[1]).toBeLessThan(0.3);
  });
});
