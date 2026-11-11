import { expect, test } from '@playwright/test';
import { IMG, openApp, savedPath, selectTile, setRange, settle, upload } from './helpers';
import fs from 'node:fs';
import { unzipSync } from 'fflate';

test.beforeEach(async ({ page }) => {
  await openApp(page);
});

test('delete, reorder and keyboard navigation in the gallery', async ({ page }) => {
  await upload(page, ['red.png', 'green.png', 'blue.png']);
  await selectTile(page, 0);
  await page.locator('#moveRight').click();
  await expect(page.locator('.filename')).toHaveText(['green', 'red', 'blue']);
  await page.locator('.tile.selected .tile-main').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.tile.selected .filename')).toHaveText('blue');
  await page.keyboard.press('Delete');
  await expect(page.locator('.tile')).toHaveCount(2);
  await expect(page.locator('.tile.selected .filename')).toHaveText('red');
  await page.locator('.tile').first().hover();
  await page.locator('.tile').first().locator('.tile-remove').click();
  await expect(page.locator('.filename')).toHaveText(['red']);
});

test('autosave restores images and per-image settings after reload', async ({ page }) => {
  await upload(page, ['red.png', 'green.png']);
  await selectTile(page, 1);
  await page.locator('[data-style="acrylic"]').click();
  await setRange(page, 'gloss', 33);
  await page.evaluate(() => window.__badge!.saveNow());
  await page.reload();
  await page.waitForSelector('html[data-ready="1"]');
  await expect(page.locator('.tile')).toHaveCount(2);
  await expect(page.locator('.tile.selected .filename')).toHaveText('green');
  await expect(page.locator('[data-style].active')).toHaveAttribute('data-style', 'acrylic');
  await expect(page.locator('#gloss-v')).toHaveText('33%');
  await page.on('dialog', (d) => void d.accept());
  await page.locator('#clearAll').click();
  await expect(page.locator('.filename')).toHaveText(['示例插画']);
});

test('zip export has every badge plus the sheet', async ({ page }) => {
  await upload(page, ['red.png', 'green.png', 'red.png']);
  await page.locator('#resolution').selectOption('1200');
  const [d] = await Promise.all([page.waitForEvent('download', { timeout: 60_000 }), page.locator('#zipAll').click()]);
  expect(d.suggestedFilename()).toMatch(/\.zip$/);
  const files = Object.keys(unzipSync(new Uint8Array(fs.readFileSync(await savedPath(d)))));
  expect(files.sort()).toEqual(['green_样机.png', 'red (2)_样机.png', 'red_样机.png', '方吧唧与亚克力_商品展示拼图.png'].sort());
});

test('apply style to all copies composition but keeps colours', async ({ page }) => {
  await upload(page, ['red.png', 'green.png', 'blue.png']);
  const tints = await page.locator('.item-tint').allTextContents();
  await selectTile(page, 0);
  await page.locator('[data-style="square"]').click();
  await setRange(page, 'artSize', 80);
  await page.locator('#applyAll').click();
  await selectTile(page, 2);
  await expect(page.locator('[data-style].active')).toHaveAttribute('data-style', 'square');
  await expect(page.locator('#artSize-v')).toHaveText('80%');
  await page.waitForTimeout(150);
  expect(await page.locator('.item-tint').allTextContents()).toEqual(tints);
});

test('paste an image from the clipboard', async ({ page }) => {
  const bytes = Array.from(fs.readFileSync(IMG('blue.png')));
  await page.evaluate((b) => {
    const dt = new DataTransfer();
    dt.items.add(new File([new Uint8Array(b)], 'clip.png', { type: 'image/png' }));
    document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true }));
  }, bytes);
  await expect(page.locator('.tile')).toHaveCount(1);
  await expect(page.locator('.filename')).toHaveText('clip');
});

test('style buttons and sliders work from the keyboard', async ({ page }) => {
  await upload(page, ['red.png']);
  await page.locator('[data-style="square"]').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-style="square"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('[data-style="rounded"]').focus();
  await page.keyboard.press('Space');
  await page.locator('#rotation').focus();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await settle(page);
  await expect(page.locator('#rotation-v')).toHaveText('-2°');
  // labels are associated with their inputs
  await expect(page.getByLabel('主图旋转')).toHaveAttribute('id', 'rotation');
});

test('no console errors through a full session', async ({ page }) => {
  const errs: string[] = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  await upload(page, ['square.png', 'wide.jpg', 'photo.webp', 'transparent.png']);
  for (const s of ['square', 'acrylic', 'rounded']) {
    await page.locator(`[data-style="${s}"]`).click();
    await settle(page);
  }
  await setRange(page, 'radius', 120);
  await page.locator('[data-bg="dark"]').click();
  await selectTile(page, 3);
  expect(errs).toEqual([]);
});
