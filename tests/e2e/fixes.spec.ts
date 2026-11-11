/**
 * One test per bug from the v16 audit (/workspace/badge-studio-audit.md).
 */
import { expect, test } from '@playwright/test';
import { IMG, openApp, pixel, pngSize, savedPath, selectTile, setRange, settle, upload } from './helpers';

test.beforeEach(async ({ page }) => {
  await openApp(page);
});

test('B1 crop (fit/zoom/offset) is per image', async ({ page }) => {
  await upload(page, ['tall.png', 'square.png']);
  await selectTile(page, 0);
  await setRange(page, 'offsetY', 100);
  await page.locator('[data-fit="contain"]').click();
  await selectTile(page, 1);
  await expect(page.locator('#offsetY-v')).toHaveText('0');
  await expect(page.locator('[data-fit].active')).toHaveAttribute('data-fit', 'cover');
  await selectTile(page, 0);
  await expect(page.locator('#offsetY-v')).toHaveText('100');
  await expect(page.locator('[data-fit].active')).toHaveAttribute('data-fit', 'contain');
});

test('B2 panning never exposes a gap and reaches the top of tall art', async ({ page }) => {
  await upload(page, ['tall.png']);
  // the tall image's top band is yellow; at offsetY=100 the top of the panel shows it
  await setRange(page, 'offsetY', 100);
  const top = await pixel(page, 480, 200);
  expect(top[0]!).toBeGreaterThan(200);
  expect(top[1]!).toBeGreaterThan(170);
  await setRange(page, 'offsetY', -100);
  const bottom = await pixel(page, 480, 760);
  expect(bottom[2]!).toBeGreaterThan(150);
  // square art at 100%: offsets are disabled rather than punching holes
  await upload(page, ['square.png']);
  await expect(page.locator('#offsetX')).toBeDisabled();
  await setRange(page, 'zoom', 140);
  await expect(page.locator('#offsetX')).toBeEnabled();
  await setRange(page, 'offsetX', -100);
  await setRange(page, 'offsetY', 100);
  for (const [x, y] of [[170, 160], [790, 160], [170, 770], [790, 770]] as const) expect((await pixel(page, x, y))[3]).toBe(255);
});

test('B3 "contain" leaves no transparent holes in the face', async ({ page }) => {
  await upload(page, ['wide.jpg']);
  await page.locator('[data-fit="contain"]').click();
  await settle(page);
  for (const [x, y] of [[480, 150], [480, 300], [140, 480], [480, 780]] as const) expect((await pixel(page, x, y))[3]).toBe(255);
});

test('B4 transparent PNG prints on white stock (rounded), stays clear on acrylic', async ({ page }) => {
  await upload(page, ['transparent.png']);
  const p = await pixel(page, 200, 700);
  expect(p[3]).toBe(255);
  await page.locator('[data-style="acrylic"]').click();
  await settle(page);
  expect((await pixel(page, 200, 700))[3]).toBeLessThan(255);
});

test('B5 rotation is kept across a style round-trip', async ({ page }) => {
  await upload(page, ['red.png']);
  await setRange(page, 'rotation', -12);
  await page.locator('[data-style="square"]').click();
  await expect(page.locator('#rotation')).toBeDisabled();
  await page.locator('[data-style="rounded"]').click();
  await expect(page.locator('#rotation-v')).toHaveText('-12°');
});

test('B6 a tiny logo does not tint a grey picture', async ({ page }) => {
  await upload(page, ['grey-red-logo.png']);
  const hex = (await page.locator('#overlayHex').innerText()).replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  expect(Math.max(r!, g!, b!) - Math.min(r!, g!, b!)).toBeLessThan(20);
});

test('B8 dropping anywhere on the page imports instead of navigating away', async ({ page }) => {
  const url = page.url();
  const buf = (await import('node:fs')).readFileSync(IMG('green.png'));
  const handle = await page.evaluateHandle((bytes) => {
    const dt = new DataTransfer();
    dt.items.add(new File([new Uint8Array(bytes)], 'dropped.png', { type: 'image/png' }));
    return dt;
  }, Array.from(buf));
  await page.dispatchEvent('.gallery', 'dragenter', { dataTransfer: handle });
  await expect(page.locator('#dropOverlay')).toBeVisible();
  await page.dispatchEvent('.gallery', 'drop', { dataTransfer: handle });
  await expect(page.locator('.tile')).toHaveCount(1);
  await expect(page.locator('.filename').first()).toHaveText('dropped');
  expect(page.url()).toBe(url);
  await expect(page.locator('#dropOverlay')).toBeHidden();
});

test('B9 a long copyright line keeps a readable size inside the face', async ({ page }) => {
  await upload(page, ['blue.png']);
  await page.locator('#copyrightEnabled').check();
  await page.locator('#markText').fill('© 2026 Some Very Long Studio Name / Illustration by Somebody');
  await setRange(page, 'markRight', 170);
  // and nothing of the mark is drawn left of the face's safe margin
  const leftmost = await page.evaluate(() => {
    const ctx = (document.getElementById('preview') as HTMLCanvasElement).getContext('2d')!;
    const a = ctx.getImageData(118, 790, 400, 30).data;
    window.__badge!.store.updateGlobals({ copyrightEnabled: false });
    window.__badge!.paintNow();
    const b = ctx.getImageData(118, 790, 400, 30).data;
    let min = 999;
    for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i]! - b[i]!) > 30) min = Math.min(min, (i / 4) % 400);
    return min;
  });
  expect(leftmost).toBeGreaterThanOrEqual(20);
});

test('B10 big batches still export a sheet (canvas stays within limits)', async ({ page }) => {
  await upload(page, ['red.png']);
  // clone the item many times through the store to avoid a slow upload
  await page.evaluate(() => {
    const s = window.__badge!.store;
    const src = s.items[0]!;
    const clones = Array.from({ length: 299 }, (_, i) => ({ ...src, id: 'c' + i, name: 'clone' + i, settings: { ...src.settings } }));
    s.add(clones, false);
  });
  await expect(page.locator('.tile')).toHaveCount(300);
  const [d] = await Promise.all([page.waitForEvent('download', { timeout: 60_000 }), page.locator('#sheet').click()]);
  const size = pngSize(await savedPath(d));
  expect(size.width).toBeLessThanOrEqual(16384);
  expect(size.height).toBeLessThanOrEqual(16384);
});

test('B11 a broken file gives one toast, no blocking alert', async ({ page }) => {
  let dialogs = 0;
  page.on('dialog', (d) => {
    dialogs++;
    void d.dismiss();
  });
  await page.locator('#files').setInputFiles([IMG('broken.png'), IMG('red.png')]);
  await expect(page.locator('.tile')).toHaveCount(1);
  await expect(page.locator('#toast')).toContainText('无法读取');
  expect(dialogs).toBe(0);
});

test('P2 huge images keep only a downscaled proxy and still export', async ({ page }) => {
  await upload(page, ['huge.jpg']);
  const dims = await page.evaluate(() => {
    const it = window.__badge!.store.selected!;
    return { n: [it.naturalWidth, it.naturalHeight], p: [it.preview.width, it.preview.height], t: [it.thumb.width, it.thumb.height] };
  });
  expect(dims.n).toEqual([5200, 5200]);
  expect(Math.max(...dims.p)).toBeLessThanOrEqual(1400);
  expect(Math.max(...dims.t)).toBeLessThanOrEqual(480);
  await page.locator('#resolution').selectOption('3000');
  const [d] = await Promise.all([page.waitForEvent('download'), page.locator('#download').click()]);
  expect(pngSize(await savedPath(d)).width).toBe(3000);
});

test('U6 low-resolution artwork is flagged', async ({ page }) => {
  await upload(page, ['tiny.png']);
  await expect(page.locator('#lowRes')).toBeVisible();
  await upload(page, ['square.png']);
  await expect(page.locator('#lowRes')).toBeHidden();
});
