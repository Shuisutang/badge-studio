export type RGB = [number, number, number];

export type BadgeStyle = 'rounded' | 'square' | 'acrylic';
export type OverlayMode = 'auto' | 'custom' | 'white' | 'black';
export type FitMode = 'cover' | 'contain';
export type PreviewBg = 'checkers' | 'white' | 'dark';
export type MarkMode = 'text' | 'logo';
export type MarkColorMode = 'white' | 'black' | 'custom';

/** Settings that belong to one artwork. Switching images never touches another item's values. */
export interface ItemSettings {
  style: BadgeStyle;
  /** -30 … 30 degrees. Kept for every style but only applied to the rounded badge. */
  rotation: number;
  /** 65 … 110 (%) size of the centre artwork panel. */
  artSize: number;
  acrylicHole: boolean;
  overlayMode: OverlayMode;
  /** #RRGGBB used when overlayMode === 'custom'. */
  overlayCustom: string;
  fit: FitMode;
  /** 75 … 180 (%) */
  zoom: number;
  /** -100 … 100, fraction of the available pan range in that axis. */
  offsetX: number;
  offsetY: number;
  /** Included in the display sheet and the zip. */
  exported: boolean;
}

/** Product-wide look settings shared by every badge (as in the v12 handoff). */
export interface GlobalSettings {
  radius: number;
  ring: number;
  outerZoom: number;
  overlayAlpha: number;
  gloss: number;
  threeDEnabled: boolean;
  bevel: number;
  depth: number;
  shadow: number;
  copyrightEnabled: boolean;
  markMode: MarkMode;
  markText: string;
  markSize: number;
  markColorMode: MarkColorMode;
  markColor: string;
  markLogoWidth: number;
  markOpacity: number;
  markRight: number;
  markBottom: number;
  bg: PreviewBg;
  resolution: number;
}

export interface ColorSamples {
  /** alpha-weighted mean of the whole image */
  sample: RGB;
  /** alpha-weighted mean of the centre */
  center: RGB;
  /** dominant chromatic hue bucket, or the centre mean when the image is mostly neutral */
  dominant: RGB;
}

/** Anything drawImage accepts, with its pixel size. */
export interface Drawable {
  source: CanvasImageSource;
  width: number;
  height: number;
}

export interface BadgeItem {
  id: string;
  name: string;
  isDemo: boolean;
  /** Original decoded size, after EXIF orientation. */
  naturalWidth: number;
  naturalHeight: number;
  /** Original file; full resolution is decoded from it only when exporting. */
  blob: Blob | null;
  /** ≤ PREVIEW_SHORT_SIDE proxy used for preview, sheet and colour sampling. */
  preview: Drawable;
  /** Small proxy for gallery tiles. */
  thumb: Drawable;
  colors: ColorSamples;
  settings: ItemSettings;
  /** Bumped on every change, used to invalidate cached tiles. */
  version: number;
}
