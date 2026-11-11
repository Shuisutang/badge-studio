import { DEFAULT_GLOBALS } from './defaults';
import type { GlobalSettings } from './types';

/** Look presets: only the material/lighting knobs. Shadow & highlight shapes live in render/lighting.ts. */
export type LookKey = 'radius' | 'ring' | 'outerZoom' | 'overlayAlpha' | 'gloss' | 'threeDEnabled' | 'bevel' | 'depth' | 'shadow';
export type LookPreset = { id: string; name: string; hint: string; values: Pick<GlobalSettings, LookKey> };

const base = (): Pick<GlobalSettings, LookKey> => ({
  radius: DEFAULT_GLOBALS.radius,
  ring: DEFAULT_GLOBALS.ring,
  outerZoom: DEFAULT_GLOBALS.outerZoom,
  overlayAlpha: DEFAULT_GLOBALS.overlayAlpha,
  gloss: DEFAULT_GLOBALS.gloss,
  threeDEnabled: DEFAULT_GLOBALS.threeDEnabled,
  bevel: DEFAULT_GLOBALS.bevel,
  depth: DEFAULT_GLOBALS.depth,
  shadow: DEFAULT_GLOBALS.shadow,
});

export const LOOK_PRESETS: LookPreset[] = [
  { id: 'standard', name: '标准', hint: '默认的柔雾塑封', values: base() },
  { id: 'glossy', name: '亮面', hint: '高光更明显', values: { ...base(), gloss: 24, bevel: 50, shadow: 46 } },
  { id: 'matte', name: '哑光', hint: '几乎无反光', values: { ...base(), gloss: 0, bevel: 14, shadow: 30 } },
  { id: 'flat', name: '平面', hint: '无立体与阴影，适合排版', values: { ...base(), gloss: 0, threeDEnabled: false } },
];

export function matchPreset(g: GlobalSettings): string | null {
  for (const p of LOOK_PRESETS) {
    if ((Object.keys(p.values) as LookKey[]).every((k) => g[k] === p.values[k])) return p.id;
  }
  return null;
}
