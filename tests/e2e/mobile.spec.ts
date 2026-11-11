import { expect, test } from '@playwright/test';
import { openApp, upload } from './helpers';

test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

test('B7 mobile order is upload → preview → gallery → settings, no overflow', async ({ page }) => {
  await openApp(page);
  await upload(page, ['square.png', 'red.png']);
  const m = await page.evaluate(() => {
    const top = (s: string) => document.querySelector(s)!.getBoundingClientRect().top + scrollY;
    return {
      upload: top('.upload-panel'),
      preview: top('.preview-panel'),
      gallery: top('.gallery'),
      settings: top('.settings'),
      scrollW: document.documentElement.scrollWidth,
      clientW: document.documentElement.clientWidth,
    };
  });
  expect(m.upload).toBeLessThan(m.preview);
  expect(m.preview).toBeLessThan(m.gallery);
  expect(m.gallery).toBeLessThan(m.settings);
  expect(m.preview).toBeLessThan(300);
  expect(m.scrollW).toBeLessThanOrEqual(m.clientW);
  await expect(page.locator('#download')).toBeInViewport();
});
