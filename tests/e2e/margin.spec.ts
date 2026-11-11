/**
 * Regression (CC, Nov 2026): 亚克力牌 + 主图尺寸 90% on a 400×400 image left the
 * gap between the shrunk art and the bevel fully see-through. Every style must
 * keep an opaque, tinted printed background around a smaller / tilted panel —
 * in the 2D preview AND in the 3D preview's print texture.
 */
import { expect, test, type Page } from '@playwright/test';
import { openApp, setRange, settle, upload } from './helpers';

const STYLES = ['rounded', 'square', 'acrylic'] as const;
/** a point inside the print area that is outside the panel at 65–90% (design 960 space) */
const GAP = { rounded: [196, 470], square: [196, 470], acrylic: [170, 470] } as const;

async function px(page: Page, x: number, y: number, from: 'preview' | 'print' = 'preview'): Promise<number[]> {
  return page.evaluate(
    ([x, y, from]) => {
      let c = document.getElementById('preview') as HTMLCanvasElement;
      let k = 1;
      if (from === 'print') {
        c = window.__badge!.preview3d.input()!.print;
        k = c.width / 960;
      }
      return Array.from(c.getContext('2d')!.getImageData(Math.round(x! * k), Math.round(y! * k), 1, 1).data);
    },
    [x, y, from] as const,
  );
}

test.beforeEach(async ({ page }) => {
  await openApp(page);
  await upload(page, ['art400.jpg']);
});

test('CC repro: acrylic at 90% keeps an opaque tinted background', async ({ page }) => {
  await page.locator('[data-style="acrylic"]').click();
  await setRange(page, 'artSize', 90);
  await expect(page.locator('#lowRes')).toBeVisible();
  expect((await px(page, 166, 470))[3]).toBe(255);
});

for (const style of STYLES) {
  test(`margin is opaque for every size × rotation × preset: ${style}`, async ({ page }) => {
    await page.locator(`[data-style="${style}"]`).click();
    await settle(page);
    const presets = await page.locator('#presets button').count();
    const [gx, gy] = GAP[style];
    const bad: string[] = [];
    for (let p = 0; p < presets; p++) {
      await page.locator('#presets button').nth(p).click();
      for (const size of [65, 90, 100, 110]) {
        await setRange(page, 'artSize', size);
        for (const rot of style === 'rounded' ? [0, -12, 30] : [0]) {
          await setRange(page, 'rotation', rot);
          for (const from of ['preview', 'print'] as const) {
            const a = (await px(page, gx, gy, from))[3];
            if (a !== 255) bad.push(`preset#${p} size${size} rot${rot} ${from} alpha=${a}`);
          }
        }
      }
    }
    expect(bad).toEqual([]);
  });

  test(`margin carries the overlay tint: ${style}`, async ({ page }) => {
    await page.locator(`[data-style="${style}"]`).click();
    await setRange(page, 'artSize', 70);
    const [gx, gy] = GAP[style];
    await page.locator('[data-overlay="black"]').click();
    await setRange(page, 'overlayAlpha', 100);
    const dark = await px(page, gx, gy);
    await page.locator('[data-overlay="white"]').click();
    await settle(page);
    const light = await px(page, gx, gy);
    expect(dark[3]).toBe(255);
    expect(light[3]).toBe(255);
    const lum = (c: number[]) => c[0]! + c[1]! + c[2]!;
    expect(lum(light) - lum(dark)).toBeGreaterThan(200);
  });
}
