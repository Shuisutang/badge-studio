import { DEFAULT_GLOBALS, DEFAULT_ITEM, SHARED_STYLE_KEYS, sanitizeGlobals, sanitizeItemSettings } from './defaults';
import type { BadgeItem, Drawable, GlobalSettings, ItemSettings } from './types';

export type Change =
  | { kind: 'item'; id: string; live?: boolean }
  | { kind: 'globals'; live?: boolean }
  | { kind: 'list' }
  | { kind: 'selection' }
  | { kind: 'mark' };

type Listener = (c: Change) => void;

let seq = 0;
export const newId = (): string => `${Date.now().toString(36)}-${(seq++).toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

/**
 * Single source of truth. All mutations go through methods so the UI, renderer
 * cache and autosave hear about them. `live` marks in-progress slider drags: the
 * preview repaints but tiles and autosave wait for the final value.
 */
export class Store {
  items: BadgeItem[] = [];
  selectedId: string | null = null;
  globals: GlobalSettings = { ...DEFAULT_GLOBALS };
  mark: Drawable | null = null;
  markName = '';
  markBlob: Blob | null = null;
  private listeners = new Set<Listener>();

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  private emit(c: Change): void {
    for (const fn of this.listeners) fn(c);
  }

  get selected(): BadgeItem | null {
    return this.items.find((i) => i.id === this.selectedId) ?? this.items[0] ?? null;
  }
  get selectedIndex(): number {
    const s = this.selected;
    return s ? this.items.indexOf(s) : -1;
  }

  select(id: string): void {
    if (this.selectedId === id || !this.items.some((i) => i.id === id)) return;
    this.selectedId = id;
    this.emit({ kind: 'selection' });
  }
  selectOffset(delta: number): void {
    const n = this.items.length;
    if (!n) return;
    const i = (this.selectedIndex + delta + n) % n;
    this.select(this.items[i]!.id);
  }

  /** Adds items; drops the demo item the first time real artwork arrives. */
  add(newItems: BadgeItem[], select = true): void {
    if (!newItems.length) return;
    const demo = this.items.filter((i) => i.isDemo);
    if (demo.length && newItems.some((i) => !i.isDemo)) {
      this.items = this.items.filter((i) => !i.isDemo);
      demo.forEach(releaseItem);
    }
    this.items.push(...newItems);
    if (select || !this.selectedId) this.selectedId = newItems[0]!.id;
    this.emit({ kind: 'list' });
  }

  remove(id: string): void {
    const idx = this.items.findIndex((i) => i.id === id);
    if (idx < 0) return;
    const [gone] = this.items.splice(idx, 1);
    if (gone) releaseItem(gone);
    if (this.selectedId === id) this.selectedId = this.items[Math.min(idx, this.items.length - 1)]?.id ?? null;
    this.emit({ kind: 'list' });
  }

  clear(): void {
    this.items.forEach(releaseItem);
    this.items = [];
    this.selectedId = null;
    this.emit({ kind: 'list' });
  }

  move(id: string, delta: number): void {
    const i = this.items.findIndex((x) => x.id === id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= this.items.length) return;
    const [it] = this.items.splice(i, 1);
    this.items.splice(j, 0, it!);
    this.emit({ kind: 'list' });
  }

  updateItem(id: string, patch: Partial<ItemSettings>, live = false): void {
    const it = this.items.find((i) => i.id === id);
    if (!it) return;
    // Clamp every write so no combination of controls can push geometry out of range.
    it.settings = sanitizeItemSettings({ ...it.settings, ...patch });
    it.version++;
    this.emit({ kind: 'item', id, live });
  }

  /** Copy the current item's composition (not its colour or crop offset) to every item. */
  applyStyleToAll(fromId: string): number {
    const src = this.items.find((i) => i.id === fromId);
    if (!src) return 0;
    const patch: Partial<ItemSettings> = {};
    for (const k of SHARED_STYLE_KEYS) (patch as Record<string, unknown>)[k] = src.settings[k];
    let n = 0;
    for (const it of this.items) {
      if (it === src) continue;
      it.settings = { ...it.settings, ...patch };
      it.version++;
      n++;
    }
    this.emit({ kind: 'list' });
    return n;
  }

  /** Include/exclude every item from the sheet and zip. */
  setAllExported(on: boolean): void {
    for (const it of this.items) {
      if (it.settings.exported === on) continue;
      it.settings = { ...it.settings, exported: on };
      it.version++;
    }
    this.emit({ kind: 'list' });
  }

  get exportItems(): BadgeItem[] {
    return this.items.filter((i) => i.settings.exported);
  }

  updateGlobals(patch: Partial<GlobalSettings>, live = false): void {
    this.globals = sanitizeGlobals({ ...this.globals, ...patch });
    this.emit({ kind: 'globals', live });
  }

  setMark(mark: Drawable | null, name = '', blob: Blob | null = null): void {
    if (typeof ImageBitmap !== 'undefined' && this.mark?.source instanceof ImageBitmap) this.mark.source.close();
    this.mark = mark;
    this.markName = name;
    this.markBlob = blob;
    this.emit({ kind: 'mark' });
  }

  /** Replace everything at once (restore from autosave). */
  hydrate(items: BadgeItem[], globals: GlobalSettings, selectedId: string | null): void {
    this.items.forEach(releaseItem);
    this.items = items;
    this.globals = globals;
    this.selectedId = items.some((i) => i.id === selectedId) ? selectedId : (items[0]?.id ?? null);
    this.emit({ kind: 'list' });
    this.emit({ kind: 'globals' });
  }
}

export function makeItemSettings(patch: Partial<ItemSettings> = {}): ItemSettings {
  return { ...DEFAULT_ITEM, ...patch };
}

function releaseItem(it: BadgeItem): void {
  for (const d of [it.preview, it.thumb]) if (typeof ImageBitmap !== 'undefined' && d.source instanceof ImageBitmap) d.source.close();
}
