/**
 * IndexedDB autosave. Everything stays in this browser profile: original image
 * blobs, per-image settings, global settings and the copyright logo. Nothing is
 * sent anywhere.
 */
import { sanitizeGlobals, sanitizeItemSettings } from '../model/defaults';
import type { GlobalSettings, ItemSettings } from '../model/types';

const DB = 'badge-studio';
const VERSION = 1;
const ITEMS = 'items';
const BLOBS = 'blobs';
const META = 'meta';

export interface SavedItem {
  id: string;
  name: string;
  order: number;
  settings: ItemSettings;
}
export interface RestoredItem extends SavedItem {
  blob: Blob;
}
export interface SavedMeta {
  globals: GlobalSettings;
  selectedId: string | null;
  markBlob: Blob | null;
  markName: string;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of [ITEMS, BLOBS, META]) if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

let dbPromise: Promise<IDBDatabase> | null = null;
const db = () => (dbPromise ??= open());

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function keys(d: IDBDatabase, store: string): Promise<Set<string>> {
  return new Promise((resolve, reject) => {
    const req = d.transaction(store).objectStore(store).getAllKeys();
    req.onsuccess = () => resolve(new Set(req.result as string[]));
    req.onerror = () => reject(req.error);
  });
}

/**
 * Write the current state. Image blobs live in their own store and are written
 * once per image, so moving a slider only rewrites a few small records.
 */
export async function save(items: SavedItem[], blobs: Map<string, Blob>, meta: SavedMeta): Promise<void> {
  const d = await db();
  const knownBlobs = await keys(d, BLOBS);
  const knownItems = await keys(d, ITEMS);
  const tx = d.transaction([ITEMS, BLOBS, META], 'readwrite');
  const itemStore = tx.objectStore(ITEMS);
  const blobStore = tx.objectStore(BLOBS);
  const keep = new Set(items.map((i) => i.id));
  for (const id of knownItems) if (!keep.has(id)) itemStore.delete(id);
  for (const id of knownBlobs) if (!keep.has(id)) blobStore.delete(id);
  for (const it of items) {
    const blob = blobs.get(it.id);
    if (!blob) continue;
    if (!knownBlobs.has(it.id)) blobStore.put(blob, it.id);
    itemStore.put(it, it.id);
  }
  tx.objectStore(META).put(meta, 'meta');
  await done(tx);
}

export async function load(): Promise<{ items: RestoredItem[]; meta: SavedMeta | null }> {
  const d = await db();
  const tx = d.transaction([ITEMS, BLOBS, META]);
  const itemsReq = tx.objectStore(ITEMS).getAll();
  const blobKeysReq = tx.objectStore(BLOBS).getAllKeys();
  const blobsReq = tx.objectStore(BLOBS).getAll();
  const metaReq = tx.objectStore(META).get('meta');
  await done(tx);
  const blobMap = new Map<string, Blob>();
  (blobKeysReq.result as string[]).forEach((k, i) => {
    const b = (blobsReq.result as unknown[])[i];
    if (b instanceof Blob) blobMap.set(k, b);
  });
  const items: RestoredItem[] = ((itemsReq.result as SavedItem[]) ?? [])
    .filter((i) => i && typeof i.id === 'string' && blobMap.has(i.id))
    .map((i) => ({
      id: i.id,
      name: String(i.name ?? '图片'),
      order: Number(i.order) || 0,
      settings: sanitizeItemSettings(i.settings),
      blob: blobMap.get(i.id)!,
    }))
    .sort((a, b) => a.order - b.order);
  const m = metaReq.result as Partial<SavedMeta> | undefined;
  const meta: SavedMeta | null = m
    ? {
        globals: sanitizeGlobals(m.globals),
        selectedId: typeof m.selectedId === 'string' ? m.selectedId : null,
        markBlob: m.markBlob instanceof Blob ? m.markBlob : null,
        markName: typeof m.markName === 'string' ? m.markName : '',
      }
    : null;
  return { items, meta };
}

export async function wipe(): Promise<void> {
  const d = await db();
  const tx = d.transaction([ITEMS, BLOBS, META], 'readwrite');
  tx.objectStore(ITEMS).clear();
  tx.objectStore(BLOBS).clear();
  tx.objectStore(META).clear();
  await done(tx);
}
