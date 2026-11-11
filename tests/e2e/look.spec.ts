/**
 * The v3 merch look (tuned against official tin badge / acrylic photos):
 * checked as relative light relationships rather than pixel baselines, so
 * small retunes stay cheap but the character can't silently regress.
 */
import { expect, test, type Page } from '@playwright/test';
import { openApp, pixel, setRange, settle, upload } from './helpers';

const lum = (p: number[]) => 0.2126 * p[0]! + 0.7152 * p[1]! + 0.0722 * p[2]!;
/** average luminance of a small square in the preview */
async function area(page: Page, x: number, y: number, s = 6): Promise<number> {
  return page.evaluate(
    ([x, y, s]) => {
      const d = (document.getElementById('preview') as HTMLCanvasElement).getContext('2d')!.getImageData(x!, y!, s!, s!).data;
      let t = 0;
      for (let i = 0; i < d.length; i += 4) t += 0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!;
      return t / (d.length / 4);
    },
    [x, y, s] as const,
  );
}

test.beforeEach(async ({ page }) => {
  await openApp(page);
  await upload(page, ['grey-red-logo.png']);
});

test('tin badge: top-left sheen brighter than bottom-right; rim rolls over darker than inside', async ({ page }) => {
  // same flat grey art everywhere, so differences are pure lighting
  const tl = await area(page, 230, 220);
  const br = await area(page, 720, 700);
  expect(tl).toBeGreaterThan(br + 8);
  const rim = await area(page, 836, 470, 4); // just inside the right edge
  const inside = await area(page, 790, 470, 4);
  expect(rim).toBeLessThan(inside);
});

test('gloss slider adds a broad highlight, matte removes it', async ({ page }) => {
  await setRange(page, 'gloss', 0);
  const off = await area(page, 300, 300);
  await setRange(page, 'gloss', 50);
  const on = await area(page, 300, 300);
  expect(on).toBeGreaterThan(off + 10);
});

test('drop shadow is soft, wide and grey-blue', async ({ page }) => {
  const sh = await pixel(page, 480, 846);
  expect(sh[3]!).toBeGreaterThan(0);
  expect(sh[3]!).toBeLessThan(110);
  expect(sh[2]!).toBeGreaterThanOrEqual(sh[0]!);
  // no shadow when 3D is off
  await page.locator('#threeDEnabled').uncheck();
  await settle(page);
  expect((await pixel(page, 480, 846))[3]).toBe(0);
});

test('square badge: flat face with a bright metallic top-left rim', async ({ page }) => {
  await page.locator('[data-style="square"]').click();
  await settle(page);
  const rimTop = await pixel(page, 480, 104);
  const below = await pixel(page, 480, 140);
  expect(lum(rimTop)).toBeGreaterThan(lum(below) + 15);
  const rimBr = await pixel(page, 839, 700);
  expect(lum(rimBr)).toBeLessThan(lum(rimTop));
});

test('acrylic: clear bevel border is see-through, hole bottom-left is transparent with a white wall', async ({ page }) => {
  await page.locator('[data-style="acrylic"]').click();
  await settle(page);
  const border = await pixel(page, 480, 120); // inside the 22px clear border
  expect(border[3]!).toBeLessThan(255);
  expect(border[3]!).toBeGreaterThan(60);
  const print = await pixel(page, 480, 470);
  expect(print[3]).toBe(255);
  // hole centre (ACRYLIC_FACE.x + 26, bottom - 26) is alpha 0; its wall is near-white
  expect((await pixel(page, 154, 790))[3]).toBe(0);
  const wall = await pixel(page, 154, 790 - 14);
  expect(Math.min(wall[0]!, wall[1]!, wall[2]!)).toBeGreaterThan(200);
});
