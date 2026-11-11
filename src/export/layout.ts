/** Pure layout for the white-background display sheet. */
export interface SheetLayout {
  cols: number;
  rows: number;
  tile: number;
  pad: number;
  width: number;
  height: number;
}

/** Chrome/Safari refuse canvases beyond these; toBlob then silently returns null. */
export const MAX_CANVAS_SIDE = 16384;
export const MAX_CANVAS_AREA = 120_000_000;

/**
 * Same grid as v16 for up to 16 items (≤3 → one row, ≤8 → 3 columns, else 4).
 * Fix (B10): bigger batches get more columns, and the tile shrinks so the canvas
 * always stays inside browser limits instead of failing silently.
 */
export function sheetLayout(n: number, baseTile = 550, basePad = 70): SheetLayout {
  const count = Math.max(1, n);
  let cols = count <= 3 ? count : count <= 8 ? 3 : count <= 16 ? 4 : Math.min(12, Math.ceil(Math.sqrt(count * 1.2)));
  cols = Math.max(1, cols);
  const rows = Math.ceil(count / cols);
  let tile = baseTile;
  let pad = basePad;
  const fits = (t: number, p: number) => {
    const w = p * 2 + cols * t;
    const h = p * 2 + rows * t;
    return w <= MAX_CANVAS_SIDE && h <= MAX_CANVAS_SIDE && w * h <= MAX_CANVAS_AREA;
  };
  while (!fits(tile, pad) && tile > 40) {
    tile = Math.floor(tile * 0.9);
    pad = Math.max(16, Math.round((basePad * tile) / baseTile));
  }
  return { cols, rows, tile, pad, width: pad * 2 + cols * tile, height: pad * 2 + rows * tile };
}

export function tilePosition(layout: SheetLayout, i: number): { x: number; y: number } {
  return { x: layout.pad + (i % layout.cols) * layout.tile, y: layout.pad + Math.floor(i / layout.cols) * layout.tile };
}

/** Make a name safe for a download and for zip entries; keeps CJK. */
export function safeFileName(name: string): string {
  const cleaned = name
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '');
  return (cleaned || '图片').slice(0, 80);
}

/** Unique names for a set of exports (zip entries must not collide). */
export function uniqueNames(names: string[], suffix: string): string[] {
  const seen = new Map<string, number>();
  return names.map((n) => {
    const base = safeFileName(n);
    const k = base.toLowerCase();
    const c = seen.get(k) ?? 0;
    seen.set(k, c + 1);
    return c === 0 ? `${base}${suffix}` : `${base} (${c + 1})${suffix}`;
  });
}
