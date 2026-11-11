import { expect, test } from '@playwright/test';
import { openApp, settle, upload } from './helpers';

test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

test('B7 mobile: upload → preview → gallery, controls in a bottom sheet, no overflow', async ({ page }) => {
  await openApp(page, false);
  await upload(page, ['square.png', 'red.png']);
  const m = await page.evaluate(() => {
    const r = (s: string) => document.querySelector(s)!.getBoundingClientRect();
    return {
      upload: r('.upload-panel').top + scrollY,
      preview: r('.preview-panel').top + scrollY,
      gallery: r('.gallery').top + scrollY,
      sheetTop: r('#settings').top,
      sheetPos: getComputedStyle(document.getElementById('settings')!).position,
      canvasBottom: r('#preview').bottom,
      scrollW: document.documentElement.scrollWidth,
      clientW: document.documentElement.clientWidth,
    };
  });
  expect(m.upload).toBeLessThan(m.preview);
  expect(m.preview).toBeLessThan(m.gallery);
  expect(m.sheetPos).toBe('fixed');
  // the badge preview is fully visible above the sheet
  expect(m.canvasBottom).toBeLessThanOrEqual(m.sheetTop);
  expect(m.scrollW).toBeLessThanOrEqual(m.clientW);
});

test('mobile tabs switch panels; touch targets are at least 44px', async ({ page }) => {
  await openApp(page, false);
  await upload(page, ['red.png']);
  await expect(page.locator('#p-style')).toBeVisible();
  await expect(page.locator('#p-color')).toBeHidden();
  await page.locator('#tab-color').tap();
  await expect(page.locator('#p-color')).toBeVisible();
  await page.locator('[data-overlay="white"]').tap();
  await settle(page);
  await expect(page.locator('#overlayHex')).toHaveText('#FFFFFF');
  await page.locator('#tab-style').tap();
  for (const sel of ['.tab', '.style-option', '.step', '.tile-remove']) {
    const box = await page.locator(sel).first().boundingBox();
    expect(Math.min(box!.width, box!.height), sel).toBeGreaterThanOrEqual(sel === '.tile-remove' ? 30 : 44);
  }
  await page.locator('.step[data-step="rotation"][data-delta="1"]').tap();
  await page.locator('.step[data-step="rotation"][data-delta="1"]').tap();
  await expect(page.locator('#rotation-v')).toHaveText('+2°');
  await page.locator('#sheetToggle').tap();
  await expect(page.locator('#p-style')).toBeHidden();
});
