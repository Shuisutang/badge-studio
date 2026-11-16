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

/**
 * Since v3 the lighting/shadow layers were retuned against official merch
 * photos (see look.spec.ts), and the square badge got slightly softer corners
 * plus a metal rim, so parity with v16 is only checked for the PRINT: rounded
 * badges with 3D off and gloss 0 (geometry, fit, centre panel, outline).
 * Since the Nov 2026 official-photo pass the printed frame (底) is the art
 * blown up further and washed toward white, and the tilt became its own 旋转
 * style with a slightly smaller panel, so the frame band between the face edge
 * and the main panel is masked out and the old rounded+rotation case is gone
 * (covered by unit tests and features.spec.ts instead).
 */
const FLAT = { gloss: 0 };
const CASES: Case[] = [
  { name: 'demo-rounded', img: null, no3d: true, ranges: FLAT },
  { name: 'red-rounded', img: 'red.png', no3d: true, ranges: FLAT },
  { name: 'square-rounded', img: 'square.png', no3d: true, ranges: FLAT },
  { name: 'photo-rounded', img: 'photo.webp', no3d: true, ranges: FLAT },
  // artSize ≠ 100 is intentionally different now (tint window follows the panel), see coupling.spec.ts
  { name: 'square-size110', img: 'square.png', artSize: 100, no3d: true, ranges: { ...FLAT, ring: 20 } },
  { name: 'square-look', img: 'square.png', no3d: true, ranges: { gloss: 0, radius: 120, ring: 70, overlayAlpha: 70 } },
  { name: 'blue-copyright', img: 'blue.png', copyright: true, no3d: true, ranges: FLAT },
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
    else await page.locator('#loadDemo').click();
    await applyCase(page, c, false);
    const b = Buffer.from(await grab(page), 'base64');
    expect(b.length).toBe(a.length);
    // Mask: the printed frame band (face minus the main panel, corners included).
    const F = { x: 118, y: 102, w: 724, h: 724 };
    const ring = c.ranges?.ring ?? 44;
    const radius = c.ranges?.radius ?? 84;
    const innerR = Math.max(6, radius - ring * 0.85);
    const pad = 3;
    const framed = (px: number, py: number) => {
      const inFace = px >= F.x - pad && px < F.x + F.w + pad && py >= F.y - pad && py < F.y + F.h + pad;
      if (!inFace) return false;
      const x0 = F.x + ring + pad, y0 = F.y + ring + pad, x1 = F.x + F.w - ring - pad, y1 = F.y + F.h - ring - pad;
      if (px < x0 || px >= x1 || py < y0 || py >= y1) return true;
      const cx = px < x0 + innerR ? x0 + innerR : px > x1 - innerR ? x1 - innerR : px;
      const cy = py < y0 + innerR ? y0 + innerR : py > y1 - innerR ? y1 - innerR : py;
      return (px - cx) ** 2 + (py - cy) ** 2 > innerR ** 2;
    };
    let max = 0;
    let sum = 0;
    let over = 0;
    for (let i = 0; i < a.length; i++) {
      const p = i >> 2;
      if (framed(p % 960, Math.floor(p / 960))) continue;
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
