/**
 * The v12 handoff's regression acceptance list, against the new build.
 */
import { expect, test } from '@playwright/test';
import { openApp, pixel, pngSize, savedPath, selectTile, setRange, settle, upload } from './helpers';

test.beforeEach(async ({ page }) => {
  await openApp(page);
});

test('red/green/blue get their own tint; editing one leaves the others alone', async ({ page }) => {
  await upload(page, ['red.png', 'green.png', 'blue.png']);
  const tints = await page.locator('.item-tint').allTextContents();
  expect(new Set(tints).size).toBe(3);
  await selectTile(page, 1);
  await page.locator('[data-overlay="black"]').click();
  await settle(page);
  await page.waitForTimeout(100);
  const after = await page.locator('.item-tint').allTextContents();
  expect(after[0]).toBe(tints[0]);
  expect(after[2]).toBe(tints[2]);
  expect(after[1]).toBe('#000000');
  await selectTile(page, 0);
  await expect(page.locator('[data-overlay].active')).toHaveAttribute('data-overlay', 'auto');
});

test('rotation -12° survives switching images', async ({ page }) => {
  await upload(page, ['red.png', 'green.png']);
  await selectTile(page, 0);
  await setRange(page, 'rotation', -12);
  await expect(page.locator('#rotation-v')).toHaveText('-12°');
  await selectTile(page, 1);
  await expect(page.locator('#rotation-v')).toHaveText('0°');
  await selectTile(page, 0);
  await expect(page.locator('#rotation-v')).toHaveText('-12°');
});

test('styles are per image; mixed sheet and exports work', async ({ page }) => {
  await upload(page, ['red.png', 'green.png', 'blue.png']);
  await selectTile(page, 0);
  await page.locator('[data-style="square"]').click();
  await selectTile(page, 2);
  await page.locator('[data-style="acrylic"]').click();
  await selectTile(page, 1);
  await expect(page.locator('[data-style].active')).toHaveAttribute('data-style', 'rounded');
  await selectTile(page, 0);
  await expect(page.locator('[data-style].active')).toHaveAttribute('data-style', 'square');
  await page.waitForTimeout(150);
  await expect(page.locator('.item-style-label').nth(2)).toContainText('亚克力');
  const [d] = await Promise.all([page.waitForEvent('download'), page.locator('#sheet').click()]);
  expect(d.suggestedFilename()).toMatch(/\.png$/);
  expect(pngSize(await savedPath(d))).toEqual({ width: 140 + 3 * 550, height: 140 + 550 });
});

test('acrylic hole is truly transparent, and closes when turned off', async ({ page }) => {
  await upload(page, ['red.png']);
  await page.locator('[data-style="acrylic"]').click();
  await settle(page);
  await expect(page.locator('#acrylicHoleRow')).toBeVisible();
  expect((await pixel(page, 154, 790))[3]).toBe(0);
  await page.locator('#acrylicHole').uncheck();
  await settle(page);
  expect((await pixel(page, 154, 790))[3]).toBeGreaterThan(0);
});

test('no white frame or dark base; top highlight and soft shadow kept', async ({ page }) => {
  await upload(page, ['red.png']);
  // ring area (between face edge and inner panel) is the tinted artwork, not white
  const ring = await pixel(page, 480, 125);
  expect(ring[0]! - ring[2]!).toBeGreaterThan(40);
  expect(Math.min(ring[0]!, ring[1]!, ring[2]!)).toBeLessThan(200);
  // top specular strip brighter than just below it
  const strip = await pixel(page, 480, 110);
  const below = await pixel(page, 480, 160);
  expect(strip[1]!).toBeGreaterThan(below[1]!);
  // contact shadow below the face is soft and pale: low alpha, grey-blue, never black
  const sh = await pixel(page, 480, 836);
  expect(sh[3]!).toBeGreaterThan(0);
  expect(sh[3]!).toBeLessThan(120);
  expect(sh[2]!).toBeGreaterThanOrEqual(sh[0]!);
});

test('copyright mark shows in the transparent PNG; 1200/2000/3000 exports', async ({ page }) => {
  await upload(page, ['blue.png']);
  for (const res of ['1200', '2000', '3000']) {
    await page.locator('#resolution').selectOption(res);
    const [d] = await Promise.all([page.waitForEvent('download'), page.locator('#download').click()]);
    expect(pngSize(await savedPath(d))).toEqual({ width: Number(res), height: Number(res) });
  }
  // mark pixels appear in the preview's bottom-right when enabled
  const read = () =>
    page.evaluate(() => {
      const d = (document.getElementById('preview') as HTMLCanvasElement).getContext('2d')!.getImageData(600, 770, 230, 50).data;
      let s = 0;
      for (let i = 0; i < d.length; i += 4) s += d[i]! + d[i + 1]! + d[i + 2]!;
      return s;
    });
  const without = await read();
  await page.locator('#copyrightEnabled').check();
  await settle(page);
  expect(await read()).toBeGreaterThan(without);
  await page.locator('#resolution').selectOption('1200');
  const [d] = await Promise.all([page.waitForEvent('download'), page.locator('#download').click()]);
  expect(pngSize(await savedPath(d)).width).toBe(1200);
});
