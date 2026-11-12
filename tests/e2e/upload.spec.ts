import { expect, test } from '@playwright/test';
import { IMG, openApp, pixel, selectTile, setRange, upload } from './helpers';

for (const width of [390, 680, 1440]) {
  test(`empty workspace upload and selected image replacement at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await openApp(page, false);
    await expect(page.locator('.upload-panel')).toBeHidden();
    await expect(page.locator('#settings')).toBeHidden();
    await expect(page.locator('#emptyUpload')).toBeVisible();
    await expect(page.locator('.tile')).toHaveCount(0);
    const layout = await page.locator('.layout').boundingBox();
    const preview = await page.locator('.preview-panel').boundingBox();
    expect(preview!.width).toBeGreaterThan(layout!.width * 0.85);
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('#emptyUpload').click()]);
    await chooser.setFiles(IMG('red.png'));
    await expect(page.locator('#preview')).toBeVisible();
    await expect(page.locator('#emptyUpload')).toBeHidden();
    await expect(page.locator('#uploadLabel')).toHaveText('替换图片');
    await expect(page.locator('#settings')).toBeVisible();
    await page.locator('[data-style="acrylic"]').click();
    await setRange(page, 'artSize', 80);
    await setRange(page, 'acrylicOutlineWidth', 6);
    await setRange(page, 'acrylicBackgroundBrightness', -20);
    const id = await page.evaluate(() => window.__badge!.store.selected!.id);
    const [add] = await Promise.all([page.waitForEvent('filechooser'), page.locator('#addImages').click()]);
    await add.setFiles(IMG('green.png'));
    await expect(page.locator('.tile')).toHaveCount(2);
    await selectTile(page, 0);
    const settings = await page.evaluate(() => window.__badge!.store.selected!.settings);
    await page.evaluate(() => window.__badge!.saveNow());
    const [replace] = await Promise.all([page.waitForEvent('filechooser'), page.locator('#drop').click()]);
    expect(replace.isMultiple()).toBe(false);
    await replace.setFiles(IMG('blue.png'));
    await expect(page.locator('.filename')).toHaveText(['blue', 'green']);
    expect(await page.evaluate(() => ({ id: window.__badge!.store.selected!.id, settings: window.__badge!.store.selected!.settings }))).toEqual({ id, settings });
    await page.evaluate(() => window.__badge!.saveNow());
    await page.reload();
    await page.waitForSelector('html[data-ready="1"]');
    await expect(page.locator('.filename')).toHaveText(['blue', 'green']);
    expect(await page.evaluate(() => window.__badge!.store.selected!.settings)).toEqual(settings);
    const centre = await pixel(page, 480, 480);
    expect(centre[2]!).toBeGreaterThan(centre[0]! + 50);
    await page.locator('#deleteCurrent').click();
    await page.locator('#deleteCurrent').click();
    await expect(page.locator('#emptyUpload')).toBeVisible();
    await expect(page.locator('.upload-panel')).toBeHidden();
    await expect(page.locator('#settings')).toBeHidden();
  });
}

test('unreadable replacement preserves the current artwork and gallery', async ({ page }) => {
  await openApp(page, false);
  await upload(page, ['red.png', 'green.png']);
  const before = await page.evaluate(() => ({ id: window.__badge!.store.selected!.id, name: window.__badge!.store.selected!.name }));
  await page.locator('#replacementFile').setInputFiles(IMG('broken.png'));
  await expect(page.locator('#toast')).toContainText('已保留原来的图片');
  await expect(page.locator('.filename')).toHaveText(['red', 'green']);
  expect(await page.evaluate(() => ({ id: window.__badge!.store.selected!.id, name: window.__badge!.store.selected!.name }))).toEqual(before);
});
