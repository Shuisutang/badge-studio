import { zip } from 'fflate';
import { decodeForExport } from '../image/load';
import type { BadgeItem, Drawable, GlobalSettings } from '../model/types';
import { renderBadge } from '../render/render';
import { safeFileName, sheetLayout, tilePosition, uniqueNames } from './layout';

export const SINGLE_SUFFIX = '_样机.png';
export const SHEET_NAME = '方吧唧与亚克力_商品展示拼图.png';
export const ZIP_NAME = '方吧唧_全部样机.zip';

function canvasToBlob(c: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    c.toBlob((b) => (b ? resolve(b) : reject(new Error('浏览器无法生成这么大的图片'))), 'image/png'),
  );
}

export function download(blob: Blob, name: string): void {
  const u = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = u;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 4000);
}

/** Render one badge at export resolution from a fresh full-quality decode. */
export async function renderItemPng(item: BadgeItem, globals: GlobalSettings, mark: Drawable | null, size: number): Promise<Blob> {
  let bmp: ImageBitmap | null = null;
  try {
    let src: Drawable = item.preview;
    if (item.blob) {
      bmp = await decodeForExport(item.blob);
      src = { source: bmp, width: bmp.width, height: bmp.height };
    }
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    if (!ctx) throw new Error('Canvas 不可用');
    ctx.imageSmoothingQuality = 'high';
    renderBadge(ctx, { src, settings: item.settings, colors: item.colors, globals, mark }, size);
    const blob = await canvasToBlob(c);
    c.width = c.height = 0; // release the backing store promptly
    return blob;
  } finally {
    bmp?.close();
  }
}

export async function exportSingle(item: BadgeItem, globals: GlobalSettings, mark: Drawable | null): Promise<void> {
  const blob = await renderItemPng(item, globals, mark, globals.resolution);
  download(blob, safeFileName(item.name) + SINGLE_SUFFIX);
}

export async function renderSheet(items: BadgeItem[], globals: GlobalSettings, mark: Drawable | null): Promise<Blob> {
  const L = sheetLayout(items.length);
  const c = document.createElement('canvas');
  c.width = L.width;
  c.height = L.height;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('Canvas 不可用');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, L.width, L.height);
  const small = document.createElement('canvas');
  small.width = small.height = L.tile;
  const sctx = small.getContext('2d')!;
  items.forEach((it, i) => {
    const p = tilePosition(L, i);
    renderBadge(sctx, { src: it.preview, settings: it.settings, colors: it.colors, globals, mark }, L.tile);
    ctx.drawImage(small, p.x, p.y);
  });
  const blob = await canvasToBlob(c);
  c.width = c.height = 0;
  return blob;
}

export async function exportSheet(items: BadgeItem[], globals: GlobalSettings, mark: Drawable | null): Promise<void> {
  download(await renderSheet(items, globals, mark), SHEET_NAME);
}

/** All badges at the chosen resolution plus the sheet, in one zip (stored, PNG is already compressed). */
export async function exportZip(
  items: BadgeItem[],
  globals: GlobalSettings,
  mark: Drawable | null,
  onProgress: (done: number, total: number) => void,
): Promise<Blob> {
  const names = uniqueNames(
    items.map((i) => i.name),
    SINGLE_SUFFIX,
  );
  const files: Record<string, [Uint8Array, { level: 0 }]> = {};
  const total = items.length + 1;
  for (let i = 0; i < items.length; i++) {
    onProgress(i, total);
    const blob = await renderItemPng(items[i]!, globals, mark, globals.resolution);
    files[names[i]!] = [new Uint8Array(await blob.arrayBuffer()), { level: 0 }];
    await new Promise((r) => setTimeout(r, 0)); // keep the UI responsive
  }
  onProgress(items.length, total);
  files[SHEET_NAME] = [new Uint8Array(await (await renderSheet(items, globals, mark)).arrayBuffer()), { level: 0 }];
  const data = await new Promise<Uint8Array>((resolve, reject) => zip(files, (err, out) => (err ? reject(err) : resolve(out))));
  onProgress(total, total);
  return new Blob([data as BlobPart], { type: 'application/zip' });
}
