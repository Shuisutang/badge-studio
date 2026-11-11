/**
 * Visual parity: the refactor must render the same pixels as the v16 single
 * file for every case where no bug was fixed. Remaining differences are
 * sub-pixel resampling at shape edges (ImageBitmap vs <img> sampling).
 * written to test-results/parity/ for a human look.
 */
import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { IMG, LEGACY, openApp, settle, upload } from './helpers';

interface Case {
  name: string;
  img: string | null; // null = built-in demo
  style?: 'rounded' | 'square' | 'acrylic';
  rotation?: number;
  artSize?: number;
  ranges?: Record<string, number>;
  copyright?: boolean;
  no3d?: boolean;
}

const CASES: Case[] = [
  { name: 'demo-rounded', img: null },
  { name: 'red-rounded', img: 'red.png' },
  { name: 'square-rounded', img: 'square.png' },
  { name: 'photo-square', img: 'photo.webp', style: 'square' },
  { name: 'photo-acrylic', img: 'photo.webp', style: 'acrylic' },
  { name: 'square-rot-12', img: 'square.png', rotation: -12 },
  { name: 'square-size80', img: 'square.png', artSize: 80 },
  { name: 'square-look', img: 'square.png', ranges: { gloss: 40, radius: 120, ring: 70, overlayAlpha: 70, bevel: 80, shadow: 90 } },
  { name: 'red-no3d', img: 'red.png', no3d: true },
  { name: 'blue-copyright', img: 'blue.png', copyright: true },
  { name: 'wide-acrylic-rot', img: 'wide.jpg', style: 'acrylic' },
];

async function applyCase(page: Page, c: Case, legacy: boolean): Promise<void> {
  if (c.style && c.style !== 'rounded') await page.locator(`[data-style="${c.style}"]`).click();
  const set = async (id: string, v: number) =>
    page.evaluate(
      ([id, v]) => {
        const el = document.getElementById(id as string) as HTMLInputElement;
        el.value = String(v);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      },
      [id, v] as const,
    );
  if (c.rotation) await set('rotation', c.rotation);
  if (c.artSize) await set('artSize', c.artSize);
  for (const [k, v] of Object.entries(c.ranges ?? {})) await set(k, v);
  if (c.no3d) await page.locator('#threeDEnabled').uncheck();
  if (c.copyright) await page.locator('#copyrightEnabled').check();
  if (!legacy) await settle(page);
  else await page.waitForTimeout(100);
}

const grab = (page: Page) =>
  page.evaluate(() => {
    const c = document.getElementById('preview') as HTMLCanvasElement;
    const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    let s = '';
    for (let i = 0; i < d.length; i += 0x8000) s += String.fromCharCode(...d.subarray(i, i + 0x8000));
    return btoa(s);
  });

test.describe.configure({ mode: 'parallel' });

for (const c of CASES) {
  test(`parity with v16: ${c.name}`, async ({ page, browser }) => {
    // legacy
    const lp = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await lp.setContent(fs.readFileSync(LEGACY, 'utf8'), { waitUntil: 'load' });
    if (c.img) {
      await lp.locator('#files').setInputFiles(IMG(c.img));
      await lp.waitForFunction(() => !document.querySelector('.tile .filename')?.textContent?.includes('示例'));
    }
    await applyCase(lp, c, true);
    const a = Buffer.from(await grab(lp), 'base64');
    await lp.close();
    // new
    await openApp(page);
    if (c.img) await upload(page, [c.img]);
    await applyCase(page, c, false);
    const b = Buffer.from(await grab(page), 'base64');
    expect(b.length).toBe(a.length);
    let max = 0;
    let sum = 0;
    let over = 0;
    for (let i = 0; i < a.length; i++) {
      const d = Math.abs(a[i]! - b[i]!);
      sum += d;
      if (d > max) max = d;
      if (d > 3) over++;
    }
    const mean = sum / a.length;
    const frac = over / a.length;
    // write legacy | new | diff×8 for review
    const out = path.join('test-results', 'parity');
    fs.mkdirSync(out, { recursive: true });
    const png = await page.evaluate(
      ([a64, b64]) => {
        const dec = (s: string) => Uint8ClampedArray.from(atob(s), (ch) => ch.charCodeAt(0));
        const A = dec(a64!);
        const B = dec(b64!);
        const D = new Uint8ClampedArray(A.length);
        for (let i = 0; i < A.length; i += 4) {
          const m = Math.max(Math.abs(A[i]! - B[i]!), Math.abs(A[i + 1]! - B[i + 1]!), Math.abs(A[i + 2]! - B[i + 2]!), Math.abs(A[i + 3]! - B[i + 3]!));
          D[i] = Math.min(255, m * 8);
          D[i + 1] = 0;
          D[i + 2] = 0;
          D[i + 3] = 255;
        }
        const c = document.createElement('canvas');
        c.width = 960 * 3;
        c.height = 960;
        const x = c.getContext('2d')!;
        x.fillStyle = '#fff';
        x.fillRect(0, 0, c.width, c.height);
        const tmp = document.createElement('canvas');
        tmp.width = tmp.height = 960;
        const t = tmp.getContext('2d')!;
        [A, B, D].forEach((arr, k) => {
          t.putImageData(new ImageData(arr, 960, 960), 0, 0);
          x.drawImage(tmp, 960 * k, 0);
        });
        return c.toDataURL('image/png').split(',')[1]!;
      },
      [a.toString('base64'), b.toString('base64')] as const,
    );
    fs.writeFileSync(path.join(out, `${c.name}.png`), Buffer.from(png, 'base64'));
    fs.appendFileSync(path.join(out, 'stats.txt'), `${c.name}\tmax=${max}\tmean=${mean.toFixed(4)}\tover3=${(frac * 100).toFixed(4)}%\n`);
    expect(frac, `>3 diff fraction for ${c.name}`).toBeLessThan(0.006);
    expect(mean).toBeLessThan(0.25);
  });
}
