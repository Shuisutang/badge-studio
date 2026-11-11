import { expect, type Download, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const IMG = (name: string) => path.join(here, '..', 'fixtures', 'images', name);
export const LEGACY = path.join(here, '..', 'fixtures', 'legacy-v16.html');

export async function openApp(page: Page): Promise<void> {
  await page.goto('./');
  await page.waitForSelector('html[data-ready="1"]');
}

export async function upload(page: Page, names: string[]): Promise<void> {
  const before = await page.locator('.tile').count();
  const demo = await page.evaluate(() => window.__badge!.store.items.every((i) => i.isDemo));
  await page.locator('#files').setInputFiles(names.map(IMG));
  const expected = (demo ? 0 : before) + names.length;
  await expect(page.locator('.tile')).toHaveCount(expected, { timeout: 60_000 });
  await expect(page.locator('#busy')).toBeHidden();
  await settle(page);
}

/** Wait for queued preview/tile repaints. */
export async function settle(page: Page): Promise<void> {
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))));
  await page.evaluate(() => window.__badge!.paintNow());
}

export async function selectTile(page: Page, i: number): Promise<void> {
  await page.locator('.tile .tile-main').nth(i).click();
  await settle(page);
}

export async function pixel(page: Page, x: number, y: number): Promise<number[]> {
  return page.evaluate(
    ([x, y]) => Array.from((document.getElementById('preview') as HTMLCanvasElement).getContext('2d')!.getImageData(x!, y!, 1, 1).data),
    [x, y],
  );
}

/** Set a range input and fire input + change like a user would. */
export async function setRange(page: Page, id: string, value: number): Promise<void> {
  await page.evaluate(
    ([id, v]) => {
      const el = document.getElementById(id as string) as HTMLInputElement;
      el.value = String(v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    },
    [id, value] as const,
  );
  await settle(page);
}

export function pngSize(file: string): { width: number; height: number } {
  const b = fs.readFileSync(file);
  expect(b.subarray(1, 4).toString()).toBe('PNG');
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

export async function savedPath(d: Download): Promise<string> {
  const p = await d.path();
  if (!p) throw new Error('download failed');
  return p;
}
