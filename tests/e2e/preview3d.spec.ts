import { expect, test } from '@playwright/test';
import { openApp, upload } from './helpers';

test('acrylic print keeps the physical rim clear without erasing the printed frame', async ({ page }) => {
  await openApp(page, false);
  await upload(page, ['red.png']);
  await page.locator('[data-style="acrylic"]').click();
  const alpha = await page.evaluate(() => {
    const print = window.__badge!.preview3d.input()!.print;
    const ctx = print.getContext('2d')!;
    const px = (x: number, y: number) => ctx.getImageData(Math.round(x * print.width / 960), Math.round(y * print.height / 960), 1, 1).data[3];
    return { clearRim: px(480, 120), printedFrame: px(170, 470), art: px(480, 470) };
  });
  expect(alpha).toEqual({ clearRim: 0, printedFrame: 255, art: 255 });
});

for (const style of ['rounded', 'square'] as const) {
  test(`watermark stays on the front and is absent from the side wrap: ${style}`, async ({ page }) => {
    await openApp(page, false);
    await upload(page, ['red.png']);
    await page.locator(`[data-style="${style}"]`).click();
    const diff = await page.evaluate(() => {
      const app = window.__badge!;
      const pixels = (c: HTMLCanvasElement) => c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
      app.store.updateGlobals({ copyrightEnabled: false });
      const clean = pixels(app.preview3d.input()!.print);
      app.store.updateGlobals({ copyrightEnabled: true, markMode: 'text', markText: 'SIDE TEST', markSize: 32, markRight: 8, markBottom: 8 });
      const marked = app.preview3d.input()!;
      const front = pixels(marked.print);
      const side = pixels(marked.sidePrint!);
      let frontChanges = 0;
      let sideChanges = 0;
      for (let i = 0; i < clean.length; i++) {
        if (front[i] !== clean[i]) frontChanges++;
        if (side[i] !== clean[i]) sideChanges++;
      }
      return { frontChanges, sideChanges };
    });
    expect(diff.frontChanges).toBeGreaterThan(100);
    expect(diff.sideChanges).toBe(0);
    // Both independently owned textures also have to survive the real WebGL path.
    await page.locator('#view3d').click();
    await page.waitForSelector('#modal3d[data-ready]');
    await page.waitForFunction(() => (window.__badge!.preview3d.info?.frames ?? 0) > 0);
    await page.keyboard.press('Escape');
  });

  test(`tin back hides the front artwork after flipping: ${style}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openApp(page, false);
    await upload(page, ['red.png']);
    await page.locator(`[data-style="${style}"]`).click();
    await page.locator('#view3d').click();
    await page.waitForSelector('#modal3d[data-ready]');
    await page.waitForFunction(() => (window.__badge!.preview3d.info?.frames ?? 0) > 0);
    const stage = page.locator('#m3dStage canvas');
    const sample = async () => {
      const png = await stage.screenshot();
      return page.evaluate(async (src) => {
        const image = new Image();
        image.src = src;
        await image.decode();
        const c = document.createElement('canvas');
        c.width = image.width; c.height = image.height;
        const ctx = c.getContext('2d')!;
        ctx.drawImage(image, 0, 0);
        // Below the safety pin, well inside the recessed backplate.
        const data = ctx.getImageData(Math.round(c.width * 0.5), Math.round(c.height * 0.65), 8, 8).data;
        const rgb = [0, 0, 0];
        for (let i = 0; i < data.length; i += 4) for (let k = 0; k < 3; k++) rgb[k]! += data[i + k]! / 64;
        return rgb;
      }, `data:image/png;base64,${png.toString('base64')}`);
    };
    const front = await sample();
    expect(front[0]! - front[1]!).toBeGreaterThan(50);
    const frames = await page.evaluate(() => window.__badge!.preview3d.info!.frames);
    await page.locator('#m3dFlip').click();
    await page.waitForFunction((n) => window.__badge!.preview3d.info!.frames > n, frames);
    const back = await sample();
    expect(Math.max(...back) - Math.min(...back)).toBeLessThan(25);
    expect(Math.min(...back)).toBeGreaterThan(40);
  });
}

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
