import { expect, test, type Page } from '@playwright/test';
import { DEFAULT_ITEM } from '../../src/model/defaults';
import { openApp, selectTile, setRange, settle, upload } from './helpers';

async function probe(page: Page) {
  return page.evaluate(() => {
    const preview = document.getElementById('preview') as HTMLCanvasElement;
    const print = window.__badge!.preview3d.input()!.print;
    const pixels = (c: HTMLCanvasElement) => {
      const px = (x: number, y: number) => Array.from(c.getContext('2d')!.getImageData(Math.round(x * c.width / 960), Math.round(y * c.height / 960), 1, 1).data);
      return { background: px(170, 470), main: px(480, 464), outline: px(201, 464), hole: px(174, 770) };
    };
    return { preview: pixels(preview), print: pixels(print) };
  });
}

test('outline colour/width/opacity and background brightness affect both preview and 3D print', async ({ page }) => {
  await openApp(page, false);
  await upload(page, ['red.png']);
  await expect(page.locator('#acrylicAppearance')).toBeHidden();
  await page.locator('[data-style="acrylic"]').click();
  await expect(page.locator('#acrylicAppearance')).toBeVisible();
  await setRange(page, 'acrylicBackgroundBrightness', -60);
  const dark = await probe(page);
  await setRange(page, 'acrylicBackgroundBrightness', 60);
  const light = await probe(page);
  for (const mode of ['preview', 'print'] as const) {
    const sum = (a: number[]) => a[0]! + a[1]! + a[2]!;
    expect(sum(light[mode].background) - sum(dark[mode].background)).toBeGreaterThan(150);
    expect(light[mode].main).toEqual(dark[mode].main);
  }
  await setRange(page, 'acrylicOutlineWidth', 8);
  await setRange(page, 'acrylicOutlineOpacity', 100);
  await page.locator('#acrylicOutlineColor').fill('#00ff00');
  await page.locator('#acrylicOutlineColor').dispatchEvent('change');
  await settle(page);
  const outlined = await probe(page);
  for (const mode of ['preview', 'print'] as const) expect(outlined[mode].outline[1]! - outlined[mode].outline[0]!).toBeGreaterThan(80);
  await setRange(page, 'acrylicOutlineOpacity', 0);
  const transparent = await probe(page);
  await setRange(page, 'acrylicOutlineOpacity', 100);
  await setRange(page, 'acrylicOutlineWidth', 0);
  const noOutline = await probe(page);
  for (const mode of ['preview', 'print'] as const) {
    // Canvas filter passes can round individual colour channels by one level.
    for (let i = 0; i < 4; i++) expect(Math.abs(noOutline[mode].outline[i]! - transparent[mode].outline[i]!)).toBeLessThanOrEqual(2);
    expect(noOutline[mode].outline[0]! - noOutline[mode].outline[1]!).toBeGreaterThan(80);
  }
  expect(noOutline.preview.hole[3]).toBe(0);
});

test('acrylic settings stay with each image, restore after reload, and reset explicitly', async ({ page }) => {
  await openApp(page, false);
  await upload(page, ['red.png', 'green.png']);
  await page.locator('[data-style="acrylic"]').click();
  await setRange(page, 'acrylicOutlineWidth', 7);
  await setRange(page, 'acrylicOutlineOpacity', 80);
  await setRange(page, 'acrylicBackgroundBrightness', -40);
  const first = await page.evaluate(() => window.__badge!.store.selected!.settings);
  await selectTile(page, 1);
  await page.locator('[data-style="acrylic"]').click();
  await expect(page.locator('#acrylicOutlineWidth')).toHaveValue(String(DEFAULT_ITEM.acrylicOutlineWidth));
  await expect(page.locator('#acrylicBackgroundBrightness')).toHaveValue(String(DEFAULT_ITEM.acrylicBackgroundBrightness));
  await selectTile(page, 0);
  await expect(page.locator('#acrylicOutlineWidth')).toHaveValue('7');
  await page.evaluate(() => window.__badge!.saveNow());
  await page.reload();
  await page.waitForSelector('html[data-ready="1"]');
  expect(await page.evaluate(() => window.__badge!.store.selected!.settings)).toEqual(first);
  await page.locator('#resetAcrylic').click();
  await expect(page.locator('#acrylicOutlineWidth')).toHaveValue(String(DEFAULT_ITEM.acrylicOutlineWidth));
  await expect(page.locator('#acrylicOutlineOpacity')).toHaveValue(String(DEFAULT_ITEM.acrylicOutlineOpacity));
  await expect(page.locator('#acrylicBackgroundBrightness')).toHaveValue(String(DEFAULT_ITEM.acrylicBackgroundBrightness));
});

test('acrylic appearance controls are reachable in the mobile settings sheet', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openApp(page, false);
  await upload(page, ['red.png']);
  await page.locator('[data-style="acrylic"]').click();
  const brightness = page.locator('#acrylicBackgroundBrightness');
  await brightness.scrollIntoViewIfNeeded();
  await expect(brightness).toBeVisible();
  await brightness.focus();
  await page.keyboard.press('ArrowRight');
  await expect(brightness).toHaveValue(String(DEFAULT_ITEM.acrylicBackgroundBrightness + 1));
  await page.locator('#acrylicOutlineWidth').scrollIntoViewIfNeeded();
  await expect(page.locator('#acrylicOutlineWidth')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
