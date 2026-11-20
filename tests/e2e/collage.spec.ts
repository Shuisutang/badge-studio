/** 拼图布局: balanced automatic grid, chosen column count, live miniature, persistence. */
import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import { openApp, pngSize, savedPath, settle, upload } from './helpers';

const NINE = ['red.png', 'green.png', 'blue.png', 'square.png', 'photo.webp', 'art400.jpg', 'grey-red-logo.png', 'tall.png', 'wide.jpg'];

async function exportSheetFile(page: Page): Promise<string> {
  const [d] = await Promise.all([page.waitForEvent('download', { timeout: 60_000 }), page.locator('#sheet').click()]);
  return savedPath(d);
}
/** Alpha-blind check: is the exported sheet pure white at (x, y)? */
async function isWhite(page: Page, file: string, pts: [number, number][]): Promise<boolean[]> {
  const b64 = fs.readFileSync(file).toString('base64');
  return page.evaluate(async ([b64, pts]) => {
    const bin = Uint8Array.from(atob(b64 as string), (c) => c.charCodeAt(0));
    const bmp = await createImageBitmap(new Blob([bin], { type: 'image/png' }));
    const c = new OffscreenCanvas(bmp.width, bmp.height);
    const x = c.getContext('2d')!;
    x.drawImage(bmp, 0, 0);
    return (pts as [number, number][]).map(([px, py]) => {
      const d = x.getImageData(px, py, 1, 1).data;
      return d[0]! > 250 && d[1]! > 250 && d[2]! > 250;
    });
  }, [b64, pts] as const);
}

test('9 badges export as 3×3 by default; a chosen 4 columns gives a centred 4+4+1', async ({ page }) => {
  await openApp(page);
  await upload(page, NINE);
  await expect(page.locator('#sheetAuto')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#sheetColsV')).toHaveText('3 列');
  await expect(page.locator('#sheetLayoutInfo')).toContainText('3 + 3 + 3');
  await expect(page.locator('#sheetPreview')).toHaveAttribute('data-rows', '3');
  expect(pngSize(await exportSheetFile(page))).toEqual({ width: 1790, height: 1790 });

  await page.locator('#sheetColsUp').click();
  await expect(page.locator('#sheetColsV')).toHaveText('4 列');
  await expect(page.locator('#sheetAuto')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#sheetLayoutInfo')).toContainText('4 + 4 + 1');
  const four = await exportSheetFile(page);
  expect(pngSize(four)).toEqual({ width: 2340, height: 1790 });
  // the lonely 9th badge sits in the middle of row 3, not at the left edge
  const row3 = 70 + 2 * 550 + 275;
  expect(await isWhite(page, four, [[70 + 275, row3], [1170, row3], [70 + 3 * 550 + 275, row3]])).toEqual([true, false, true]);
});

test('7 badges: auto 4+3 with the short row centred; 列数 is clamped and 自动 restores', async ({ page }) => {
  await openApp(page);
  await upload(page, NINE.slice(0, 7));
  await expect(page.locator('#sheetLayoutInfo')).toContainText('4 + 3');
  const file = await exportSheetFile(page);
  expect(pngSize(file)).toEqual({ width: 2340, height: 1240 });
  const y2 = 70 + 550 + 275;
  // row 2 has 3 badges centred: left/right half-tile gaps are white, the middle is a badge
  expect(await isWhite(page, file, [[70 + 120, y2], [1170, y2], [2340 - 70 - 120, y2]])).toEqual([true, false, true]);
  for (let i = 0; i < 10; i++) if (await page.locator('#sheetColsDown').isEnabled()) await page.locator('#sheetColsDown').click();
  await expect(page.locator('#sheetColsV')).toHaveText('1 列');
  await expect(page.locator('#sheetColsDown')).toBeDisabled();
  for (let i = 0; i < 10; i++) if (await page.locator('#sheetColsUp').isEnabled()) await page.locator('#sheetColsUp').click();
  await expect(page.locator('#sheetColsV')).toHaveText('7 列');
  await expect(page.locator('#sheetColsUp')).toBeDisabled();
  await page.locator('#sheetAuto').click();
  expect(await page.evaluate(() => window.__badge!.store.globals.sheetCols)).toBe(0);
  await expect(page.locator('#sheetColsV')).toHaveText('4 列');
});

test('layout follows the 拼图 checkboxes and survives a reload', async ({ page }) => {
  await openApp(page);
  await upload(page, NINE.slice(0, 5));
  await expect(page.locator('#sheetLayoutInfo')).toContainText('3 + 2');
  await page.locator('.tile-include input').first().uncheck();
  await settle(page);
  await expect(page.locator('#sheetLayoutInfo')).toContainText('4 张 · 2 + 2');
  await page.locator('#sheetColsUp').click();
  await expect(page.locator('#sheetLayoutInfo')).toContainText('3 + 1');
  await page.evaluate(() => window.__badge!.saveNow());
  await page.reload();
  await page.waitForSelector('html[data-ready="1"]');
  await expect(page.locator('.tile')).toHaveCount(5);
  expect(await page.evaluate(() => window.__badge!.store.globals.sheetCols)).toBe(3);
  await expect(page.locator('#sheetColsV')).toHaveText('3 列');
  await expect(page.locator('#sheetAuto')).toHaveAttribute('aria-pressed', 'false');
});

test.describe('mobile', () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  test('拼图布局 controls are large touch targets and work by tap', async ({ page }) => {
    await openApp(page, false);
    await upload(page, NINE.slice(0, 6));
    await page.locator('#sheetToggle').tap(); // fold the settings sheet
    await page.locator('#sheetColsUp').scrollIntoViewIfNeeded();
    for (const id of ['#sheetAuto', '#sheetColsDown', '#sheetColsUp']) {
      const b = (await page.locator(id).boundingBox())!;
      expect(Math.min(b.width, b.height), id).toBeGreaterThanOrEqual(44);
    }
    await expect(page.locator('#sheetLayoutInfo')).toContainText('3 + 3');
    await page.locator('#sheetColsDown').tap();
    await expect(page.locator('#sheetLayoutInfo')).toContainText('2 + 2 + 2');
    const pv = (await page.locator('#sheetPreview').boundingBox())!;
    expect(pv.width).toBeLessThanOrEqual(390);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });
});
