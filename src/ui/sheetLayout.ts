/**
 * 拼图布局: 自动 or a chosen column count for the 展示拼图, with a live
 * miniature of the sheet (same layout function and tile order as the export).
 */
import { overlayTint, css } from '../color/color';
import { SHEET_MAX_COLS, rowCounts, sheetLayout, tilePosition } from '../export/layout';
import type { Store } from '../model/store';
import { renderBadge } from '../render/render';
import { $ } from './dom';

const PREVIEW_MAX_W = 300;
const PREVIEW_MAX_H = 190;
/** Above this many tiles the miniature draws colour blocks instead of badges. */
const DETAILED_LIMIT = 48;

export class SheetLayoutControl {
  private frame = 0;
  private readonly canvas = $<HTMLCanvasElement>('sheetPreview');

  constructor(private store: Store) {
    $('sheetAuto').addEventListener('click', () => store.updateGlobals({ sheetCols: 0 }));
    const step = (d: number) => {
      const n = Math.max(1, store.exportItems.length);
      const cur = sheetLayout(n, 550, 70, store.globals.sheetCols).cols;
      const next = Math.max(1, Math.min(SHEET_MAX_COLS, Math.min(n, cur + d)));
      store.updateGlobals({ sheetCols: next });
    };
    $('sheetColsDown').addEventListener('click', () => step(-1));
    $('sheetColsUp').addEventListener('click', () => step(1));
  }

  schedule(): void {
    if (!this.frame) this.frame = requestAnimationFrame(() => this.paint());
  }

  /** Synchronous repaint (tests). */
  paint(): void {
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = 0;
    const items = this.store.exportItems;
    const g = this.store.globals;
    const n = items.length;
    const L = sheetLayout(Math.max(1, n), 550, 70, g.sheetCols);
    const auto = g.sheetCols === 0;
    const auto_ = $('sheetAuto');
    auto_.classList.toggle('active', auto);
    auto_.setAttribute('aria-pressed', String(auto));
    $('sheetColsV').textContent = `${L.cols} 列`;
    ($('sheetColsDown') as HTMLButtonElement).disabled = !n || L.cols <= 1;
    ($('sheetColsUp') as HTMLButtonElement).disabled = !n || L.cols >= Math.min(n, SHEET_MAX_COLS);
    $('sheetLayoutInfo').textContent = n
      ? `${n} 张 · ${rowCounts(L).join(' + ')}${auto ? '（自动）' : ''} · ${L.width}×${L.height}`
      : '拼图列表是空的';
    const c = this.canvas;
    const k = Math.min(PREVIEW_MAX_W / L.width, PREVIEW_MAX_H / L.height);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(L.width * k));
    const h = Math.max(1, Math.round(L.height * k));
    c.style.width = `${w}px`;
    c.style.height = `${h}px`;
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);
    c.dataset.cols = String(L.cols);
    c.dataset.rows = String(L.rows);
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const s = k * dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    const tilePx = Math.max(1, Math.round(L.tile * s));
    const detailed = n <= DETAILED_LIMIT && tilePx >= 16;
    const small = document.createElement('canvas');
    small.width = small.height = tilePx;
    const sctx = small.getContext('2d')!;
    items.forEach((it, i) => {
      const p = tilePosition(L, i);
      const x = p.x * s;
      const y = p.y * s;
      if (detailed) {
        renderBadge(sctx, { src: it.thumb, settings: it.settings, colors: it.colors, globals: g, mark: this.store.mark }, tilePx);
        ctx.drawImage(small, x, y);
      } else {
        ctx.fillStyle = css(overlayTint(it.settings, it.colors));
        const m = L.tile * s * 0.14;
        ctx.fillRect(x + m, y + m, L.tile * s - 2 * m, L.tile * s - 2 * m);
      }
    });
    small.width = small.height = 0;
  }
}
