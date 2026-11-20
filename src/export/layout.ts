/** Pure layout for the white-background display sheet. */
export interface SheetLayout {
  cols: number;
  rows: number;
  tile: number;
  pad: number;
  width: number;
  height: number;
  /** number of badges placed (the last row may be shorter, centred) */
  count?: number;
}

/** Chrome/Safari refuse canvases beyond these; toBlob then silently returns null. */
export const MAX_CANVAS_SIDE = 16384;
export const MAX_CANVAS_AREA = 120_000_000;

/** Largest column count the 列数 control offers (bigger batches still auto-fit). */
export const SHEET_MAX_COLS = 12;
/** Preferred sheet shape (columns : rows) for the automatic layout. */
const TARGET_ASPECT = 4 / 3;

/**
 * Most balanced grid for `n` badges: close to a 4:3 landscape sheet, few empty
 * cells, and never a lonely last row (9 → 3×3 instead of 4+4+1, 7 → 4+3,
 * 10 → 5+5, 11 → 4+4+3). Each candidate column count is scored by its shape
 * error plus a penalty per empty cell (relative to a row) and a large penalty
 * when the last row is less than half full.
 */
export function autoColumns(n: number): number {
  const count = Math.max(1, Math.floor(n));
  let best = 1;
  let bestScore = Infinity;
  for (let cols = 1; cols <= count; cols++) {
    const rows = Math.ceil(count / cols);
    const last = count - (rows - 1) * cols;
    const empty = cols * rows - count;
    const lonely = rows > 1 && last < cols / 2;
    const score = Math.abs(Math.log(cols / rows / TARGET_ASPECT)) + (1.5 * empty) / cols + (lonely ? 2 : 0);
    if (score < bestScore - 1e-9) {
      bestScore = score;
      best = cols;
    }
  }
  return best;
}

/**
 * Sheet grid. `cols` = 0 (or anything invalid) means 自动; a chosen column count
 * is clamped to 1 … min(n, SHEET_MAX_COLS). Fix (B10): the tile shrinks so the
 * canvas always stays inside browser limits instead of failing silently.
 */
export function sheetLayout(n: number, baseTile = 550, basePad = 70, cols = 0): SheetLayout {
  const count = Math.max(1, Math.floor(n) || 1);
  const want = Math.floor(Number(cols)) || 0;
  const c = want > 0 ? Math.max(1, Math.min(count, SHEET_MAX_COLS, want)) : autoColumns(count);
  const rows = Math.ceil(count / c);
  let tile = baseTile;
  let pad = basePad;
  const fits = (t: number, p: number) => {
    const w = p * 2 + c * t;
    const h = p * 2 + rows * t;
    return w <= MAX_CANVAS_SIDE && h <= MAX_CANVAS_SIDE && w * h <= MAX_CANVAS_AREA;
  };
  while (!fits(tile, pad) && tile > 40) {
    tile = Math.floor(tile * 0.9);
    pad = Math.max(16, Math.round((basePad * tile) / baseTile));
  }
  return { cols: c, rows, tile, pad, width: pad * 2 + c * tile, height: pad * 2 + rows * tile, count };
}

/** Row-major position; an incomplete last row is centred. */
export function tilePosition(layout: SheetLayout, i: number): { x: number; y: number } {
  const row = Math.floor(i / layout.cols);
  const col = i % layout.cols;
  const total = layout.count ?? layout.cols * layout.rows;
  const inRow = Math.min(layout.cols, total - row * layout.cols);
  const offset = ((layout.cols - inRow) * layout.tile) / 2;
  return { x: layout.pad + offset + col * layout.tile, y: layout.pad + row * layout.tile };
}

/** Badges per row, e.g. [4, 3] for 7 in 4 columns. */
export function rowCounts(layout: SheetLayout): number[] {
  const total = layout.count ?? layout.cols * layout.rows;
  return Array.from({ length: layout.rows }, (_, r) => Math.min(layout.cols, total - r * layout.cols));
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
