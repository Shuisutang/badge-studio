import { expect, test } from '@playwright/test';
import { openApp, upload } from './helpers';

test('three.js is not in the main bundle (lazy chunk only)', async ({ page, request }) => {
  await openApp(page, false);
  const srcs = await page.evaluate(() => Array.from(document.querySelectorAll('script[src]')).map((s) => (s as HTMLScriptElement).src));
  for (const src of srcs) {
    const body = await (await request.get(src)).text();
    expect(body).not.toContain('WebGLRenderer');
  }
});

for (const style of ['rounded', 'square', 'acrylic'] as const) {
  test(`3D preview opens, renders and closes: ${style}`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await openApp(page, false);
    await upload(page, ['photo.webp']);
    await page.locator(`[data-style="${style}"]`).click();
    await page.locator('#view3d').click();
    await expect(page.locator('#modal3d')).toBeVisible();
    await page.waitForSelector('#modal3d[data-ready]', { timeout: 60_000 });
    await page.waitForFunction(() => (window.__badge!.preview3d.info?.frames ?? 0) > 1, null, { timeout: 60_000 });
    const info = await page.evaluate(() => window.__badge!.preview3d.info!);
    expect(info.style).toBe(style);
    expect(info.triangles).toBeGreaterThan(500);
    // something other than the flat background was drawn
    const shot = await page.locator('#m3dStage canvas').screenshot();
    expect(shot.length).toBeGreaterThan(20_000);
    // drag rotates and re-renders
    const before = info.frames;
    const box = (await page.locator('#m3dStage').boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 - 120, box.y + box.height / 2, { steps: 6 });
    await page.mouse.up();
    await page.waitForFunction((b) => (window.__badge!.preview3d.info?.frames ?? 0) > b + 2, before);
    await page.keyboard.press('Escape');
    await expect(page.locator('#modal3d')).toBeHidden();
    await expect(page.locator('#m3dStage canvas')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}
