import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import { IMG, openApp, pngSize, savedPath, setRange, upload } from './helpers';

const MAI = { songs: [{ id: 384, title: 'VERTeX', artist: 'Hiro' }, { id: 456, title: 'Glorious Crown', artist: 'xi' }] };
const CHUNI = { songs: [{ id: 180, title: '怒槌', artist: '光吉猛修' }] };
const ALIASES = { maimai: { aliases: [{ song_id: 384, aliases: ['水神'] }] }, chunithm: { aliases: [{ song_id: 180, aliases: ['怒锤'] }] } };
const cors = { 'access-control-allow-origin': '*' };

async function mockMusic(page: Page): Promise<string[]> {
  const requests: string[] = [];
  await page.route('https://maimai.lxns.net/api/v0/**', async route => {
    const url = route.request().url(); requests.push(url);
    const game = url.includes('/chunithm/') ? 'chunithm' : 'maimai';
    await route.fulfill({ json: url.endsWith('alias/list') ? ALIASES[game] : game === 'maimai' ? MAI : CHUNI, headers: cors });
  });
  await page.route('https://assets2.lxns.net/**', route => route.fulfill({ body: fs.readFileSync(IMG('art400.jpg')), contentType: 'image/jpeg', headers: cors }));
  return requests;
}

for (const width of [320, 390, 1440]) {
  test(`search aliases in both games, import, persist and export at ${width}px`, async ({ page }) => {
    const requests = await mockMusic(page);
    await page.setViewportSize({ width, height: 900 });
    await openApp(page, false);
    expect(requests).toHaveLength(0);
    await page.locator('#emptySearchMusic').click();
    await expect(page.locator('#musicQuery')).toBeFocused();
    await expect(page.locator('#musicStatus')).toContainText('已读取');
    await page.locator('#musicQuery').fill('水神');
    await expect(page.locator('.music-title')).toHaveText('VERTeX');
    await expect(page.locator('.music-alias')).toContainText('水神');
    await expect(page.locator('.music-size')).toContainText('400×400');
    await page.getByRole('button', { name: '导入 VERTeX', exact: true }).click();
    await expect(page.locator('#musicDialog')).not.toBeVisible();
    await expect(page.locator('.filename')).toHaveText('VERTeX');
    await expect(page.locator('#lowRes')).toBeVisible();
    await expect(page.locator('#selection')).toContainText('原图 400×400');
    await page.locator('#searchMusic').click();
    await expect(page.locator('.music-title')).toHaveText('VERTeX');
    expect(requests).toHaveLength(2);
    await page.locator('[data-music-game="chunithm"]').click();
    await expect(page.locator('#musicStatus')).toContainText('没有找到');
    await page.locator('#musicQuery').fill('怒锤');
    await expect(page.locator('.music-title')).toHaveText('怒槌');
    await page.getByRole('button', { name: '导入 怒槌', exact: true }).click();
    await expect(page.locator('.filename')).toHaveText(['VERTeX', '怒槌']);
    await page.evaluate(() => window.__badge!.saveNow());
    await page.route('https://maimai.lxns.net/api/v0/**', route => route.abort());
    await page.route('https://assets2.lxns.net/**', route => route.abort());
    const before = requests.length;
    await page.reload();
    await page.waitForSelector('html[data-ready="1"]');
    await expect(page.locator('.filename')).toHaveText(['VERTeX', '怒槌']);
    expect(requests).toHaveLength(before);
    await page.locator('#resolution').selectOption('1200');
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#download').click()]);
    expect(pngSize(await savedPath(download))).toEqual({ width: 1200, height: 1200 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test('failed catalog and alias requests can recover without losing local artwork', async ({ page }) => {
  await mockMusic(page);
  let failCatalog = true;
  let failAlias = true;
  await page.route('**/maimai/song/list', route => route.fulfill({ status: failCatalog ? 503 : 200, json: MAI, headers: cors }));
  await page.route('**/maimai/alias/list', route => route.fulfill({ status: failAlias ? 503 : 200, json: ALIASES.maimai, headers: cors }));
  await openApp(page, false);
  await upload(page, ['red.png']);
  await setRange(page, 'artSize', 80);
  const previous = await page.evaluate(() => ({ id: window.__badge!.store.selected!.id, settings: window.__badge!.store.selected!.settings }));
  await page.locator('#searchMusic').click();
  await expect(page.locator('#musicRetry')).toBeVisible();
  failCatalog = false;
  await page.locator('#musicRetry').click();
  await expect(page.locator('#musicStatus')).toContainText('别称暂未加载');
  await page.locator('#musicQuery').fill('VERTeX');
  await expect(page.locator('.music-title')).toHaveText('VERTeX');
  failAlias = false;
  await page.locator('#musicRetry').click();
  await expect(page.locator('#musicRetry')).toBeHidden();
  await page.locator('#musicQuery').fill('水神');
  await page.getByRole('button', { name: '导入 VERTeX', exact: true }).click();
  await expect(page.locator('.filename')).toHaveText(['red', 'VERTeX']);
  expect(await page.evaluate(() => ({ id: window.__badge!.store.items[0]!.id, settings: window.__badge!.store.items[0]!.settings }))).toEqual(previous);
});

test('failed and cancelled jacket imports preserve the current artwork', async ({ page }) => {
  await mockMusic(page);
  await openApp(page, false);
  await upload(page, ['green.png']);
  await page.locator('#searchMusic').click();
  await page.locator('#musicQuery').fill('VERTeX');
  await expect(page.locator('.music-title')).toHaveText('VERTeX');
  await page.route('https://assets2.lxns.net/**', route => route.fulfill({ status: 429, headers: cors }));
  const button = page.getByRole('button', { name: '导入 VERTeX', exact: true });
  await button.click();
  await expect(page.locator('#musicStatus')).toContainText('稍后再试');
  await expect(button).toBeEnabled();
  await expect(page.locator('.filename')).toHaveText('green');
  let release!: () => void;
  const gate = new Promise<void>(resolve => release = resolve);
  await page.route('https://assets2.lxns.net/**', async route => { await gate; await route.fulfill({ body: fs.readFileSync(IMG('art400.jpg')), contentType: 'image/jpeg', headers: cors }).catch(() => {}); });
  await button.click();
  await expect(page.locator('#musicStatus')).toContainText('正在导入');
  await page.keyboard.press('Escape');
  release();
  await expect(page.locator('#musicDialog')).not.toBeVisible();
  await expect(page.locator('#searchMusic')).toBeFocused();
  await expect(page.locator('.filename')).toHaveText('green');
  await page.locator('#searchMusic').click();
  await expect(button).toBeEnabled();
});
