import { expect, test, type Page } from '@playwright/test';
import { IMG, openApp, pngSize, savedPath, setRange, settle, upload } from './helpers';
import type { MarkPosition } from '../../src/model/types';

const corners: MarkPosition[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];

/** Locate only mark pixels by subtracting the same render with copyright disabled. */
async function markBounds(page: Page, print = false) {
  return page.evaluate((print) => {
    const app = window.__badge!;
    const read = () => {
      app.paintNow();
      const canvas = print ? app.preview3d.input()!.print : document.getElementById('preview') as HTMLCanvasElement;
      return { size: canvas.width, data: canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data };
    };
    const marked = read();
    app.store.updateGlobals({ copyrightEnabled: false });
    const clean = read();
    app.store.updateGlobals({ copyrightEnabled: true });
    app.paintNow();
    let x0 = marked.size, y0 = marked.size, x1 = 0, y1 = 0, count = 0;
    for (let i = 0; i < marked.data.length; i += 4) {
      if (Math.abs(marked.data[i]! - clean.data[i]!) + Math.abs(marked.data[i + 1]! - clean.data[i + 1]!) + Math.abs(marked.data[i + 2]! - clean.data[i + 2]!) < 40) continue;
      const x = (i / 4) % marked.size, y = Math.floor(i / 4 / marked.size);
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); count++;
    }
    return { x: (x0 + x1) / 2 / marked.size, y: (y0 + y1) / 2 / marked.size, count };
  }, print);
}

function expectCorner(bounds: { x: number; y: number; count: number }, corner: MarkPosition) {
  expect(bounds.count).toBeGreaterThan(80);
  if (corner.endsWith('left')) expect(bounds.x).toBeLessThan(0.4); else expect(bounds.x).toBeGreaterThan(0.6);
  if (corner.startsWith('top')) expect(bounds.y).toBeLessThan(0.3); else expect(bounds.y).toBeGreaterThan(0.7);
}

for (const style of ['rounded', 'square', 'acrylic']) {
  test(`text and logo render at all corners: ${style}`, async ({ page }) => {
    await openApp(page, false);
    await upload(page, ['blue.png']);
    await page.locator(`[data-style="${style}"]`).click();
    await expect(page.locator('#p-style #copyrightEnabled')).toBeVisible();
    await page.locator('#copyrightEnabled').check();
    await page.locator('#d-mark').evaluate((e: HTMLDetailsElement) => e.open = true);
    await page.locator('#markText').fill('© STUDIO');
    await setRange(page, 'markSize', 30);
    await setRange(page, 'markRight', 54);
    await setRange(page, 'markBottom', 54);
    for (const corner of corners) {
      await page.locator(`[data-mark-position="${corner}"]`).click();
      await expect(page.locator(`[data-mark-position="${corner}"]`)).toHaveAttribute('aria-pressed', 'true');
      expectCorner(await markBounds(page), corner);
    }
    await page.locator('#markMode').selectOption('logo');
    await page.locator('#markLogo').setInputFiles(IMG('green.png'));
    await expect(page.locator('#markLogoName')).toHaveText('green.png');
    for (const corner of corners) {
      await page.locator(`[data-mark-position="${corner}"]`).click();
      expectCorner(await markBounds(page), corner);
    }
    await page.locator('[data-mark-position="top-left"]').click();
    expectCorner(await markBounds(page, true), 'top-left');
    await page.locator('#resolution').selectOption('1200');
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#download').click()]);
    const path = await savedPath(download);
    expect(pngSize(path)).toEqual({ width: 1200, height: 1200 });
  });
}

test('mobile copyright controls, insets and logo survive refresh', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openApp(page, false);
  await upload(page, ['blue.png']);
  await expect(page.locator('#copyrightEnabled')).toBeVisible();
  await page.locator('#copyrightEnabled').check();
  await page.locator('[data-mark-position="bottom-left"]').click();
  await expect(page.locator('#markHorizontalLabel')).toHaveText('左侧留距');
  await expect(page.locator('#markVerticalLabel')).toHaveText('下方留距');
  await page.locator('#d-mark summary').click();
  await setRange(page, 'markRight', 90);
  await setRange(page, 'markBottom', 60);
  await setRange(page, 'markOpacity', 65);
  await page.locator('#markMode').selectOption('logo');
  await page.locator('#markLogo').setInputFiles(IMG('green.png'));
  await expect(page.locator('#markLogoName')).toHaveText('green.png');
  await page.evaluate(() => window.__badge!.saveNow());
  await page.reload();
  await page.waitForSelector('html[data-ready="1"]');
  await expect(page.locator('[data-mark-position="bottom-left"]')).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => window.__badge!.store.globals)).toMatchObject({ markPosition: 'bottom-left', markRight: 90, markBottom: 60, markOpacity: 65, markMode: 'logo' });
  await page.locator('[data-mark-position="top-right"]').click();
  await expect(page.locator('#markHorizontalLabel')).toHaveText('右侧留距');
  await expect(page.locator('#markVerticalLabel')).toHaveText('上方留距');
  await settle(page);
  expectCorner(await markBounds(page), 'top-right');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
