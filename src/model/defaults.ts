import type { BadgeStyle, FitMode, GlobalSettings, ItemSettings, MarkColorMode, MarkMode, MarkPosition, OverlayMode, PreviewBg } from './types';

export const DEFAULT_GLOBALS: Readonly<GlobalSettings> = Object.freeze({
  radius: 84,
  ring: 44,
  outerZoom: 104,
  overlayAlpha: 45,
  gloss: 10,
  threeDEnabled: true,
  bevel: 30,
  depth: 11,
  shadow: 38,
  copyrightEnabled: false,
  markMode: 'text',
  markPosition: 'bottom-right',
  markText: '© YOUR BRAND',
  markSize: 19,
  markColorMode: 'white',
  markColor: '#ffffff',
  markLogoWidth: 100,
  markOpacity: 90,
  markRight: 54,
  markBottom: 18,
  bg: 'checkers',
  resolution: 2000,
});

export const DEFAULT_ITEM: Readonly<ItemSettings> = Object.freeze({
  style: 'rounded',
  rotation: 0,
  artSize: 100,
  acrylicHole: true,
  acrylicOutlineWidth: 1.5,
  acrylicOutlineColor: '#627A8A',
  acrylicOutlineOpacity: 24,
  acrylicBackgroundBrightness: 8,
  overlayMode: 'auto',
  overlayCustom: '#C9D8EA',
  fit: 'cover',
  zoom: 100,
  offsetX: 0,
  offsetY: 0,
  exported: true,
});

/** Numeric ranges, shared by the UI sliders and by sanitising restored/imported data. */
export const RANGES = {
  rotation: [-30, 30],
  artSize: [65, 110],
  acrylicOutlineWidth: [0, 10],
  acrylicOutlineOpacity: [0, 100],
  acrylicBackgroundBrightness: [-80, 80],
  zoom: [75, 180],
  offsetX: [-100, 100],
  offsetY: [-100, 100],
  radius: [24, 150],
  ring: [6, 120],
  outerZoom: [90, 140],
  overlayAlpha: [0, 100],
  gloss: [0, 60],
  bevel: [0, 100],
  depth: [0, 28],
  shadow: [0, 100],
  markSize: [10, 38],
  markLogoWidth: [25, 200],
  markOpacity: [0, 100],
  markRight: [8, 170],
  markBottom: [8, 150],
} as const satisfies Record<string, readonly [number, number]>;

export const RESOLUTIONS = [1200, 2000, 3000] as const;

export const STYLE_TITLES: Record<BadgeStyle, string> = {
  rounded: '圆角方吧唧',
  square: '直角方吧唧',
  acrylic: '亚克力方牌',
};

export function clamp(n: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, n));
}

function num(v: unknown, fallback: number, range?: readonly [number, number]): number {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return range ? clamp(n, range[0], range[1]) : n;
}
function oneOf<T extends string>(v: unknown, options: readonly T[], fallback: T): T {
  return options.includes(v as T) ? (v as T) : fallback;
}
const HEX = /^#[0-9a-f]{6}$/i;
function hex(v: unknown, fallback: string): string {
  return typeof v === 'string' && HEX.test(v) ? v.toUpperCase() : fallback;
}

/** Turn untrusted (restored or imported) data into valid item settings. */
export function sanitizeItemSettings(raw: unknown): ItemSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_ITEM;
  return {
    style: oneOf<BadgeStyle>(r.style, ['rounded', 'square', 'acrylic'], d.style),
    rotation: Math.round(num(r.rotation, d.rotation, RANGES.rotation)),
    artSize: Math.round(num(r.artSize, d.artSize, RANGES.artSize)),
    acrylicHole: typeof r.acrylicHole === 'boolean' ? r.acrylicHole : d.acrylicHole,
    acrylicOutlineWidth: num(r.acrylicOutlineWidth, d.acrylicOutlineWidth, RANGES.acrylicOutlineWidth),
    acrylicOutlineColor: hex(r.acrylicOutlineColor, d.acrylicOutlineColor),
    acrylicOutlineOpacity: num(r.acrylicOutlineOpacity, d.acrylicOutlineOpacity, RANGES.acrylicOutlineOpacity),
    acrylicBackgroundBrightness: num(r.acrylicBackgroundBrightness, d.acrylicBackgroundBrightness, RANGES.acrylicBackgroundBrightness),
    overlayMode: oneOf<OverlayMode>(r.overlayMode, ['auto', 'custom', 'white', 'black'], d.overlayMode),
    overlayCustom: hex(r.overlayCustom, d.overlayCustom),
    fit: oneOf<FitMode>(r.fit, ['cover', 'contain'], d.fit),
    zoom: num(r.zoom, d.zoom, RANGES.zoom),
    offsetX: num(r.offsetX, d.offsetX, RANGES.offsetX),
    offsetY: num(r.offsetY, d.offsetY, RANGES.offsetY),
    exported: typeof r.exported === 'boolean' ? r.exported : d.exported,
  };
}

export function sanitizeGlobals(raw: unknown): GlobalSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_GLOBALS;
  return {
    radius: num(r.radius, d.radius, RANGES.radius),
    ring: num(r.ring, d.ring, RANGES.ring),
    outerZoom: num(r.outerZoom, d.outerZoom, RANGES.outerZoom),
    overlayAlpha: num(r.overlayAlpha, d.overlayAlpha, RANGES.overlayAlpha),
    gloss: num(r.gloss, d.gloss, RANGES.gloss),
    threeDEnabled: typeof r.threeDEnabled === 'boolean' ? r.threeDEnabled : d.threeDEnabled,
    bevel: num(r.bevel, d.bevel, RANGES.bevel),
    depth: num(r.depth, d.depth, RANGES.depth),
    shadow: num(r.shadow, d.shadow, RANGES.shadow),
    copyrightEnabled: typeof r.copyrightEnabled === 'boolean' ? r.copyrightEnabled : d.copyrightEnabled,
    markMode: oneOf<MarkMode>(r.markMode, ['text', 'logo'], d.markMode),
    markPosition: oneOf<MarkPosition>(r.markPosition, ['top-left', 'top-right', 'bottom-left', 'bottom-right'], d.markPosition),
    markText: typeof r.markText === 'string' ? r.markText.slice(0, 90) : d.markText,
    markSize: num(r.markSize, d.markSize, RANGES.markSize),
    markColorMode: oneOf<MarkColorMode>(r.markColorMode, ['white', 'black', 'custom'], d.markColorMode),
    markColor: hex(r.markColor, d.markColor),
    markLogoWidth: num(r.markLogoWidth, d.markLogoWidth, RANGES.markLogoWidth),
    markOpacity: num(r.markOpacity, d.markOpacity, RANGES.markOpacity),
    markRight: num(r.markRight, d.markRight, RANGES.markRight),
    markBottom: num(r.markBottom, d.markBottom, RANGES.markBottom),
    bg: oneOf<PreviewBg>(r.bg, ['checkers', 'white', 'dark'], d.bg),
    resolution: (RESOLUTIONS as readonly number[]).includes(Number(r.resolution)) ? Number(r.resolution) : d.resolution,
  };
}

/** Per-image composition fields that "apply to all" copies. Offsets and colour stay per image. */
export const SHARED_STYLE_KEYS = ['style', 'rotation', 'artSize', 'acrylicHole', 'acrylicOutlineWidth', 'acrylicOutlineColor', 'acrylicOutlineOpacity', 'acrylicBackgroundBrightness', 'fit', 'zoom'] as const satisfies readonly (keyof ItemSettings)[];

