import { overlayTint, rgbToHex } from '../color/color';
import { STYLE_TITLES } from '../model/defaults';
import type { Store } from '../model/store';
import type { BadgeItem } from '../model/types';
import { isLowRes } from '../image/sizing';
import { renderBadge } from '../render/render';
import { $, el } from './dom';

const TILE_PX = 340;

interface Tile {
  root: HTMLElement;
  include: HTMLInputElement;
  main: HTMLButtonElement;
  art: HTMLElement;
  canvas: HTMLCanvasElement;
  name: HTMLElement;
  dot: HTMLElement;
  hex: HTMLElement;
  style: HTMLElement;
  rendered: string;
}

/**
 * Gallery with cached tile canvases. A tile only repaints when its own item,
 * the shared look, or the logo changed, and repaints are spread over animation
 * frames so a large batch never blocks a slider drag (v16 redrew every tile on
 * every input event).
 */
export class Gallery {
  private tiles = new Map<string, Tile>();
  private grid = $('galleryGrid');
  private globalsVersion = 0;
  private markVersion = 0;
  private frame = 0;

  constructor(
    private store: Store,
    private onRemove: (id: string) => void,
  ) {
    this.grid.addEventListener('keydown', (e) => this.onKey(e));
  }

  bumpGlobals(): void {
    this.globalsVersion++;
  }
  bumpMark(): void {
    this.markVersion++;
  }

  private key(it: BadgeItem): string {
    return `${it.version}|${this.globalsVersion}|${this.markVersion}|${this.store.globals.resolution}`;
  }

  /** Rebuild DOM order/membership; tile canvases are reused. */
  sync(): void {
    const items = this.store.items;
    const alive = new Set(items.map((i) => i.id));
    for (const [id, t] of this.tiles) if (!alive.has(id)) {
      t.root.remove();
      this.tiles.delete(id);
    }
    items.forEach((it, idx) => {
      let t = this.tiles.get(it.id);
      if (!t) {
        t = this.create(it);
        this.tiles.set(it.id, t);
      }
      if (this.grid.children[idx] !== t.root) this.grid.insertBefore(t.root, this.grid.children[idx] ?? null);
      t.name.textContent = it.name;
      t.main.title = `${it.name}（${it.naturalWidth}×${it.naturalHeight}）`;
    });
    $('count').textContent = `${items.length} 个`;
    this.syncSelection();
    this.schedule();
  }

  syncSelection(): void {
    const sel = this.store.selected?.id;
    for (const [id, t] of this.tiles) {
      const on = id === sel;
      t.root.classList.toggle('selected', on);
      t.main.setAttribute('aria-selected', String(on));
      t.main.tabIndex = on ? 0 : -1;
    }
  }

  focusSelected(): void {
    const sel = this.store.selected;
    if (sel) this.tiles.get(sel.id)?.main.focus();
  }

  setBackground(bg: string): void {
    for (const t of this.tiles.values()) t.art.className = 'tile-art ' + bg;
  }

  schedule(): void {
    if (!this.frame) this.frame = requestAnimationFrame(() => this.paint());
  }

  private paint(): void {
    this.frame = 0;
    const start = performance.now();
    // Selected tile first, then the rest in order.
    const sel = this.store.selected;
    const order = sel ? [sel, ...this.store.items.filter((i) => i !== sel)] : this.store.items;
    for (const it of order) {
      const t = this.tiles.get(it.id);
      if (!t) continue;
      const k = this.key(it);
      if (t.rendered === k) continue;
      this.paintTile(t, it);
      t.rendered = k;
      if (performance.now() - start > 10) {
        this.schedule();
        return;
      }
    }
  }

  private paintTile(t: Tile, it: BadgeItem): void {
    const ctx = t.canvas.getContext('2d')!;
    renderBadge(ctx, { src: it.thumb, settings: it.settings, colors: it.colors, globals: this.store.globals, mark: this.store.mark }, TILE_PX);
    const hex = rgbToHex(overlayTint(it.settings, it.colors));
    t.dot.style.backgroundColor = hex;
    t.hex.textContent = hex;
    const rot = it.settings.style === 'rounded' && it.settings.rotation ? ` · ${it.settings.rotation}°` : '';
    const low = !it.isDemo && isLowRes(it.naturalWidth, it.naturalHeight, this.store.globals.resolution);
    t.style.textContent = STYLE_TITLES[it.settings.style] + rot;
    t.include.checked = it.settings.exported;
    t.root.classList.toggle('excluded', !it.settings.exported);
    if (low) t.style.append(el('span', 'lowres-dot', ' · 低清'));
  }

  private create(it: BadgeItem): Tile {
    const root = el('div', 'tile');
    root.dataset.id = it.id;
    const main = el('button', 'tile-main');
    main.type = 'button';
    main.setAttribute('role', 'option');
    const art = el('div', 'tile-art ' + this.store.globals.bg);
    const canvas = el('canvas');
    canvas.width = canvas.height = TILE_PX;
    art.append(canvas);
    const name = el('div', 'filename', it.name);
    const tint = el('div', 'item-tint');
    const dot = el('span', 'item-tint-dot');
    const hex = el('span');
    tint.append(dot, hex);
    const style = el('div', 'item-style-label');
    main.append(art, name, tint, style);
    main.addEventListener('click', () => this.store.select(it.id));
    const rm = el('button', 'tile-remove', '×');
    rm.type = 'button';
    rm.setAttribute('aria-label', `删除 ${it.name}`);
    rm.addEventListener('click', (e) => {
      e.stopPropagation();
      this.onRemove(it.id);
    });
    const incLabel = el('label', 'tile-include');
    const include = el('input');
    include.type = 'checkbox';
    include.checked = it.settings.exported;
    include.setAttribute('aria-label', `${it.name} 加入拼图和 zip`);
    include.addEventListener('change', () => this.store.updateItem(it.id, { exported: include.checked }));
    incLabel.append(include, document.createTextNode('拼图'));
    root.append(main, rm, incLabel);
    return { root, include, main, art, canvas, name, dot, hex, style, rendered: '' };
  }

  private onKey(e: KeyboardEvent): void {
    const s = this.store;
    const tgt = e.target as HTMLElement;
    if (tgt.classList.contains('tile-remove') || tgt.tagName === 'INPUT') return;
    const cols = Math.max(1, getComputedStyle(this.grid).gridTemplateColumns.split(' ').length);
    const map: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -cols, ArrowDown: cols };
    if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight') && s.selected) {
      e.preventDefault();
      s.move(s.selected.id, e.key === 'ArrowLeft' ? -1 : 1);
      requestAnimationFrame(() => this.focusSelected());
      return;
    }
    if (e.key in map) {
      e.preventDefault();
      const i = Math.max(0, Math.min(s.items.length - 1, s.selectedIndex + map[e.key]!));
      const target = s.items[i];
      if (target) s.select(target.id);
      this.focusSelected();
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      const target = e.key === 'Home' ? s.items[0] : s.items[s.items.length - 1];
      if (target) s.select(target.id);
      this.focusSelected();
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      const sel = s.selected;
      if (sel) {
        e.preventDefault();
        this.onRemove(sel.id);
        requestAnimationFrame(() => this.focusSelected());
      }
    }
  }
}
