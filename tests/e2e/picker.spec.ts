/** 取色 / colour row: mobile eyedropper flow, hex input, palette & recent swatches, native EyeDropper. */
import { expect, test, type Page } from '@playwright/test';
import { openApp, settle, upload } from './helpers';

const settings = (page: Page) => page.evaluate(() => window.__badge!.store.selected!.settings);
const near = (hex: string, rgb: [number, number, number], tol = 6) => {
  const v = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return v.every((c, i) => Math.abs(c - rgb[i]!) <= tol);
};

test.describe('mobile', () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

  async function touchDrag(page: Page, from: [number, number], to: [number, number], check?: () => Promise<void>) {
    const cdp = await page.context().newCDPSession(page);
    const pt = (p: [number, number]) => [{ x: p[0], y: p[1], id: 1 }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(from) });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt([(from[0] + to[0]) / 2, (from[1] + to[1]) / 2]) });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(to) });
    if (check) await check();
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }

  test('eyedropper: touch-drag shows a loupe, release picks the pixel under the finger', async ({ page }) => {
    await openApp(page, false);
    await upload(page, ['red.png']);
    await page.locator('#tab-color').tap();
    for (const sel of ['#pickOverlay', '.hex-field', '.chip-color']) {
      const b = await page.locator(sel).first().boundingBox();
      expect(Math.min(b!.width, b!.height), sel).toBeGreaterThanOrEqual(44);
    }
    await page.locator('#pickOverlay').tap();
    await expect(page.locator('#pickBar')).toBeVisible();
    await expect(page.locator('body')).toHaveClass(/picking/);
    const box = (await page.locator('#preview').boundingBox())!;
    // red.png: base (215,65,88) with a lighter centre disc; drag from the disc out to the base
    await touchDrag(page, [box.x + box.width / 2, box.y + box.height / 2], [box.x + box.width * 0.12, box.y + box.height * 0.14], async () => {
      await expect(page.locator('#pickLoupe')).toBeVisible();
      const live = (await page.locator('#pickHex').textContent())!;
      expect(near(live, [215, 65, 88]), live).toBe(true);
      // the loupe sits above the finger, not under it
      const lb = (await page.locator('#pickLoupe').boundingBox())!;
      expect(lb.y + lb.height).toBeLessThan(box.y + box.height * 0.14);
    });
    await expect(page.locator('#pickBar')).toBeHidden();
    await expect(page.locator('#pickLoupe')).toBeHidden();
    const s = await settings(page);
    expect(s.overlayMode).toBe('custom');
    expect(near(s.overlayCustom, [215, 65, 88]), s.overlayCustom).toBe(true);
    await expect(page.locator('#overlayHexInput')).toHaveValue(s.overlayCustom);
    // recent colours: shown and kept in localStorage across a reload
    await expect(page.locator(`#recentChips [data-hex="${s.overlayCustom}"]`)).toHaveCount(1);
    await page.evaluate(() => window.__badge!.saveNow());
    await page.reload();
    await page.waitForSelector('html[data-ready="1"]');
    await expect(page.locator('.tile')).toHaveCount(1);
    expect((await settings(page)).overlayCustom).toBe(s.overlayCustom);
    const recent: string[] = await page.evaluate(() => JSON.parse(localStorage.getItem('badge-studio.recentColors') ?? '[]'));
    expect(recent[0]).toBe(s.overlayCustom);
  });

  test('eyedropper: 取消 leaves the colour alone; transparent pixels are not picked', async ({ page }) => {
    await openApp(page, false);
    await upload(page, ['transparent.png']);
    await page.locator('#tab-color').tap();
    const before = await settings(page);
    await page.locator('#pickOverlay').tap();
    const box = (await page.locator('#preview').boundingBox())!;
    await touchDrag(page, [box.x + 12, box.y + 12], [box.x + 16, box.y + 16]);
    await expect(page.locator('#pickBar')).toBeVisible();
    await expect(page.locator('#pickHex')).toHaveText('请点在图片上');
    await page.locator('#pickCancel').tap();
    await expect(page.locator('#pickBar')).toBeHidden();
    expect(await settings(page)).toEqual(before);
    // preview is the badge again (tinted ring around the art), not the flat image
    await settle(page);
    const corner = await page.evaluate(() => (document.getElementById('preview') as HTMLCanvasElement).getContext('2d')!.getImageData(480, 112, 1, 1).data[3]);
    expect(corner).toBe(255);
  });

  test('hex field and image palette swatches', async ({ page }) => {
    await openApp(page, false);
    await upload(page, ['square.png']);
    await page.locator('#tab-color').tap();
    const chips = page.locator('#paletteChips .chip-color');
    const n = await chips.count();
    expect(n).toBeGreaterThanOrEqual(2);
    expect(n).toBeLessThanOrEqual(6);
    const first = (await chips.first().getAttribute('data-hex'))!;
    await chips.first().tap();
    expect(await settings(page)).toMatchObject({ overlayMode: 'custom', overlayCustom: first });
    await expect(chips.first()).toHaveAttribute('aria-pressed', 'true');
    const hex = page.locator('#overlayHexInput');
    await hex.fill('zz12');
    await hex.press('Enter');
    await expect(hex).toHaveAttribute('aria-invalid', 'true');
    expect((await settings(page)).overlayCustom).toBe(first);
    await hex.fill('abc');
    await hex.press('Enter');
    expect(await settings(page)).toMatchObject({ overlayMode: 'custom', overlayCustom: '#AABBCC' });
    await expect(page.locator('#overlayHex')).toHaveText('#AABBCC');
  });
});

test.describe('desktop', () => {
  test('uses the native EyeDropper where available (overlay and text colour)', async ({ page }) => {
    await page.addInitScript(() => {
      (window as unknown as { EyeDropper: unknown }).EyeDropper = class { open() { return Promise.resolve({ sRGBHex: '#123456' }); } };
    });
    await openApp(page);
    await upload(page, ['red.png']);
    await page.locator('#pickOverlay').click();
    await expect.poll(async () => (await settings(page)).overlayCustom).toBe('#123456');
    await expect(page.locator('#pickBar')).toBeHidden();
    await page.locator('#copyrightEnabled').check();
    await page.locator('[data-eyedrop="markColor"]').click();
    await expect.poll(() => page.evaluate(() => window.__badge!.store.globals.markColor.toUpperCase())).toBe('#123456');
    expect(await page.evaluate(() => window.__badge!.store.globals.markColorMode)).toBe('custom');
  });

  test('falls back to the canvas picker without EyeDropper (mouse click)', async ({ page }) => {
    await page.addInitScript(() => { delete (window as unknown as { EyeDropper?: unknown }).EyeDropper; });
    await openApp(page);
    await upload(page, ['blue.png']);
    await page.locator('#pickOverlay').click();
    await expect(page.locator('#pickBar')).toBeVisible();
    const box = (await page.locator('#preview').boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.15, box.y + box.height * 0.15);
    await expect(page.locator('#pickLoupe')).toBeVisible();
    await page.mouse.down();
    await page.mouse.up();
    await expect(page.locator('#pickBar')).toBeHidden();
    const s = await settings(page);
    expect(near(s.overlayCustom, [54, 103, 220]), s.overlayCustom).toBe(true);
    // Esc cancels a session
    await page.locator('#pickOverlay').click();
    await page.keyboard.press('Escape');
    await expect(page.locator('#pickBar')).toBeHidden();
    expect((await settings(page)).overlayCustom).toBe(s.overlayCustom);
  });
});
