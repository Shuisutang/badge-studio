import './styles.css';
import { automaticTint, rgbToHex } from './color/color';
import { download, exportSheet, exportSingle, exportZip, ZIP_NAME } from './export/export';
import { decodeForEditing, decodeLogo } from './image/load';
import { baseName, isLowRes, looksLikeImage } from './image/sizing';
import { DEFAULT_GLOBALS } from './model/defaults';
import { makeItemSettings, newId, Store, type Change } from './model/store';
import type { BadgeItem, ItemSettings } from './model/types';
import * as autosave from './persist/autosave';
import { renderBadge } from './render/render';
import { Controls } from './ui/controls';
import { demoArtwork } from './ui/demo';
import { $, setBusy, toast } from './ui/dom';
import { Gallery } from './ui/gallery';

const store = new Store();
const controls = new Controls(store);
const gallery = new Gallery(store, removeItem);
const previewCanvas = $<HTMLCanvasElement>('preview');
const previewCtx = previewCanvas.getContext('2d')!;

// ---------- preview ----------
let previewFrame = 0;
function schedulePreview(): void {
  if (!previewFrame) previewFrame = requestAnimationFrame(paintPreview);
}
function paintPreview(): void {
  previewFrame = 0;
  const it = store.selected;
  if (!it) {
    previewCtx.clearRect(0, 0, 960, 960);
    return;
  }
  renderBadge(previewCtx, { src: it.preview, settings: it.settings, colors: it.colors, globals: store.globals, mark: store.mark }, 960);
}
/** For tests and debugging: paint synchronously. */
function paintNow(): void {
  if (previewFrame) cancelAnimationFrame(previewFrame);
  paintPreview();
}

function syncHeader(): void {
  const it = store.selected;
  const n = store.items.length;
  $('selection').textContent = it
    ? `${it.name} · ${store.selectedIndex + 1} / ${n}${it.isDemo ? ' · 上传自己的图片开始制作' : ` · 原图 ${it.naturalWidth}×${it.naturalHeight}`}`
    : '还没有图片 · 点击左侧上传';
  const low = $('lowRes');
  const res = store.globals.resolution;
  const isLow = !!it && !it.isDemo && isLowRes(it.naturalWidth, it.naturalHeight, res);
  low.hidden = !isLow;
  if (isLow) low.textContent = `⚠ 原图较小，导出 ${res}px 可能偏糊`;
  for (const id of ['download', 'sheet', 'zipAll', 'moveLeft', 'moveRight', 'clearAll', 'prevItem', 'nextItem'])
    ($(id) as HTMLButtonElement).disabled = !it;
  ($('prevItem') as HTMLButtonElement).disabled = n < 2;
  ($('nextItem') as HTMLButtonElement).disabled = n < 2;
  ($('moveLeft') as HTMLButtonElement).disabled = !it || store.selectedIndex <= 0;
  ($('moveRight') as HTMLButtonElement).disabled = !it || store.selectedIndex >= n - 1;
}

store.subscribe((c: Change) => {
  switch (c.kind) {
    case 'item':
      if (c.id === store.selected?.id) {
        if (!c.live) controls.syncItem();
        schedulePreview();
      }
      if (!c.live) gallery.schedule();
      break;
    case 'globals':
      gallery.setBackground(store.globals.bg);
      controls.syncGlobals();
      if (store.selected) controls.syncItem();
      schedulePreview();
      if (!c.live) {
        gallery.bumpGlobals();
        gallery.schedule();
      }
      syncHeader();
      break;
    case 'mark':
      gallery.bumpMark();
      gallery.schedule();
      controls.syncGlobals();
      schedulePreview();
      break;
    case 'list':
      gallery.sync();
      controls.syncItem();
      schedulePreview();
      syncHeader();
      break;
    case 'selection':
      gallery.syncSelection();
      controls.syncItem();
      schedulePreview();
      syncHeader();
      break;
  }
  if (!('live' in c && c.live)) scheduleSave();
});

// ---------- loading ----------
function newItem(name: string, blob: Blob | null, decoded: Awaited<ReturnType<typeof decodeForEditing>>, settings?: ItemSettings, id?: string): BadgeItem {
  return {
    id: id ?? newId(),
    name,
    isDemo: false,
    naturalWidth: decoded.naturalWidth,
    naturalHeight: decoded.naturalHeight,
    blob,
    preview: decoded.preview,
    thumb: decoded.thumb,
    colors: decoded.colors,
    settings: settings ?? makeItemSettings({ overlayCustom: rgbToHex(automaticTint(decoded.colors)) }),
    version: 0,
  };
}

let loading = false;
async function loadFiles(list: Iterable<File>): Promise<void> {
  const files = Array.from(list);
  const images = files.filter(looksLikeImage);
  const skipped = files.length - images.length;
  if (!images.length) {
    if (skipped) toast('没有可用的图片文件（支持 JPG / PNG / WebP / GIF）');
    return;
  }
  if (loading) {
    toast('上一批还在读取，请稍等');
    return;
  }
  loading = true;
  const failed: string[] = [];
  const loaded: BadgeItem[] = [];
  let firstBatch = true;
  const flush = () => {
    if (!loaded.length) return;
    store.add(loaded.splice(0), firstBatch);
    firstBatch = false;
  };
  try {
    for (let i = 0; i < images.length; i++) {
      const f = images[i]!;
      setBusy(`正在读取 ${i + 1} / ${images.length}…`);
      try {
        const decoded = await decodeForEditing(f);
        loaded.push(newItem(baseName(f.name), f, decoded));
      } catch {
        failed.push(f.name);
      }
      // Add in batches so a big drop shows progress instead of a frozen page.
      if (loaded.length >= 8) flush();
    }
    flush();
  } finally {
    setBusy(null);
    loading = false;
  }
  const msgs: string[] = [];
  if (failed.length) msgs.push(`${failed.length} 个文件无法读取：${failed.slice(0, 3).join('、')}${failed.length > 3 ? ' 等' : ''}`);
  if (skipped) msgs.push(`跳过 ${skipped} 个非图片文件`);
  if (msgs.length) toast(msgs.join('；'), 5000);
}

function removeItem(id: string): void {
  store.remove(id);
}

$<HTMLInputElement>('files').addEventListener('change', (e) => {
  const input = e.target as HTMLInputElement;
  if (input.files) void loadFiles(input.files).finally(() => (input.value = ''));
});

// Fix (B8): handle drops anywhere on the page. v16 only listened on the upload
// box, so dropping elsewhere made the browser open the file and lose all work.
const overlay = $('dropOverlay');
let dragDepth = 0;
const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');
window.addEventListener('dragenter', (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  dragDepth++;
  overlay.hidden = false;
  $('drop').classList.add('dragging');
});
window.addEventListener('dragover', (e) => {
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = hasFiles(e) ? 'copy' : 'none';
});
window.addEventListener('dragleave', () => {
  dragDepth = Math.max(0, dragDepth - 1);
  if (!dragDepth) {
    overlay.hidden = true;
    $('drop').classList.remove('dragging');
  }
});
window.addEventListener('drop', (e) => {
  e.preventDefault();
  dragDepth = 0;
  overlay.hidden = true;
  $('drop').classList.remove('dragging');
  if (e.dataTransfer?.files.length) void loadFiles(e.dataTransfer.files);
});
// Edge Super Drag guard (v16): internal drags never start.
document.addEventListener('dragstart', (e) => e.preventDefault(), true);

document.addEventListener('paste', (e) => {
  const t = e.target as HTMLElement;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
  const files = Array.from(e.clipboardData?.files ?? []).filter(looksLikeImage);
  if (files.length) {
    e.preventDefault();
    void loadFiles(files.map((f, i) => (f.name && f.name !== 'image.png' ? f : new File([f], `粘贴图片-${Date.now()}-${i + 1}.png`, { type: f.type }))));
  }
});

// ---------- copyright logo ----------
$<HTMLInputElement>('markLogo').addEventListener('change', async (e) => {
  const input = e.target as HTMLInputElement;
  const f = input.files?.[0];
  input.value = '';
  if (!f) return;
  if (!/^image\/(png|webp|jpeg)$/.test(f.type)) {
    toast('版权图标请使用 PNG / WebP / JPG');
    return;
  }
  try {
    const d = await decodeLogo(f);
    store.setMark(d, f.name, f);
    store.updateGlobals({ markMode: 'logo', copyrightEnabled: true });
  } catch {
    toast('无法读取版权图标：' + f.name);
  }
});
$('clearMarkLogo').addEventListener('click', () => store.setMark(null));

// ---------- actions ----------
async function busy<T>(label: string, fn: () => Promise<T>): Promise<T | undefined> {
  setBusy(label);
  try {
    return await fn();
  } catch (err) {
    toast('导出失败：' + (err instanceof Error ? err.message : String(err)), 5000);
    return undefined;
  } finally {
    setBusy(null);
  }
}
$('download').addEventListener('click', () => {
  const it = store.selected;
  if (it) void busy(`正在导出 ${store.globals.resolution}px…`, () => exportSingle(it, store.globals, store.mark));
});
$('sheet').addEventListener('click', () => {
  if (store.items.length) void busy('正在生成展示拼图…', () => exportSheet(store.items, store.globals, store.mark));
});
$('zipAll').addEventListener('click', () => {
  const items = store.items.slice();
  if (!items.length) return;
  void busy('正在打包…', async () => {
    const blob = await exportZip(items, store.globals, store.mark, (d, t) => setBusy(`正在打包 ${Math.min(d + 1, t)} / ${t}…`));
    download(blob, ZIP_NAME);
  });
});
$('applyAll').addEventListener('click', () => {
  const it = store.selected;
  if (!it) return;
  const n = store.applyStyleToAll(it.id);
  toast(n ? `已应用到其他 ${n} 张（叠色和位置保持各自的）` : '只有一张图片');
});
$('prevItem').addEventListener('click', () => store.selectOffset(-1));
$('nextItem').addEventListener('click', () => store.selectOffset(1));
$('moveLeft').addEventListener('click', () => store.selected && store.move(store.selected.id, -1));
$('moveRight').addEventListener('click', () => store.selected && store.move(store.selected.id, 1));
$('clearAll').addEventListener('click', () => {
  const real = store.items.filter((i) => !i.isDemo).length;
  if (real && !confirm(`清空全部 ${real} 张图片？本机自动保存的内容也会一起删除。`)) return;
  store.clear();
  addDemo();
});

// ---------- autosave ----------
let saveTimer = 0;
let restoring = true;
function scheduleSave(): void {
  if (restoring) return;
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(saveNow, 600);
}
async function saveNow(): Promise<void> {
  const real = store.items.filter((i) => !i.isDemo && i.blob);
  const blobs = new Map(real.map((i) => [i.id, i.blob!] as const));
  try {
    await autosave.save(
      real.map((i, order) => ({ id: i.id, name: i.name, order, settings: i.settings })),
      blobs,
      { globals: store.globals, selectedId: store.selected?.id ?? null, markBlob: store.markBlob, markName: store.markName },
    );
    $('saveState').textContent = real.length ? `已自动保存 ${real.length} 张（仅本机）` : '自动保存在本机';
  } catch {
    $('saveState').textContent = '本机自动保存不可用';
  }
}

function addDemo(): void {
  const { drawable, colors } = demoArtwork();
  store.add(
    [
      {
        id: newId(),
        name: '示例插画',
        isDemo: true,
        naturalWidth: 860,
        naturalHeight: 860,
        blob: null,
        preview: drawable,
        thumb: drawable,
        colors,
        settings: makeItemSettings({ overlayCustom: rgbToHex(automaticTint(colors)) }),
        version: 0,
      },
    ],
    true,
  );
}

async function restore(): Promise<void> {
  try {
    const { items, meta } = await autosave.load();
    if (meta) store.updateGlobals(meta.globals);
    if (meta?.markBlob) {
      try {
        store.setMark(await decodeLogo(meta.markBlob), meta.markName, meta.markBlob);
      } catch {
        /* ignore a broken logo */
      }
    }
    if (items.length) {
      const restored: BadgeItem[] = [];
      for (let i = 0; i < items.length; i++) {
        setBusy(`正在恢复上次的作品 ${i + 1} / ${items.length}…`);
        const s = items[i]!;
        try {
          restored.push(newItem(s.name, s.blob, await decodeForEditing(s.blob), s.settings, s.id));
        } catch {
          /* skip unreadable */
        }
      }
      if (restored.length) {
        store.hydrate(restored, meta?.globals ?? { ...DEFAULT_GLOBALS }, meta?.selectedId ?? null);
        toast(`已恢复上次的 ${restored.length} 张图片`);
        return;
      }
    }
  } catch {
    $('saveState').textContent = '本机自动保存不可用';
  } finally {
    setBusy(null);
  }
  if (!store.items.length) addDemo();
}

// Narrow screens: start with the long panels folded.
if (matchMedia('(max-width: 760px)').matches) for (const id of ['p-look', 'p-mark']) $<HTMLDetailsElement>(id).open = false;

controls.syncGlobals();
syncHeader();
void restore().finally(() => {
  restoring = false;
  document.documentElement.dataset.ready = '1';
});

// Test hook (no secrets; only used by the e2e suite).
declare global {
  interface Window {
    __badge?: { store: Store; paintNow: () => void; saveNow: () => Promise<void> };
  }
}
window.__badge = { store, paintNow, saveNow };
