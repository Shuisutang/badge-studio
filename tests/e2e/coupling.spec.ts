/**
 * Controls must not break each other. Every control is driven alone and in
 * random combination, and each render is checked against invariants that a
 * valid badge always satisfies.
 */
import { expect, test } from '@playwright/test';
import { openApp, pixel, setRange, settle, upload } from './helpers';

test.beforeEach(async ({ page }) => {
  await openApp(page);
  await upload(page, ['square.png']);
});

/** Runs in the page: render one state and return invariant violations. */
const CHECK = `(() => {
  const ctx = document.getElementById('preview').getContext('2d');
  const s = window.__badge.store;
  const it = s.selected;
  const a = (x, y) => ctx.getImageData(x, y, 1, 1).data[3];
  const bad = [];
  const st = it.settings.style;
  if (st === 'acrylic') {
    if (a(480, 480) === 0) bad.push('acrylic centre empty');
    if (it.settings.acrylicHole && a(174, 770) !== 0) bad.push('hole not transparent');
  } else {
    // printed face is solid everywhere (no holes from crop/zoom/contain/size)
    for (const [x, y] of [[480, 480], [140, 480], [820, 480], [480, 120], [480, 810], [200, 200], [760, 760]])
      if (a(x, y) !== 255) bad.push('face hole at ' + x + ',' + y + ' a=' + a(x, y));
    // nothing (tint, panel, highlight) is painted outside a rounded corner
    if (st === 'rounded' && s.globals.radius >= 24 && a(120, 104) > 8) bad.push('paint outside rounded corner a=' + a(120, 104));
  }
  // left/right of the product is always empty
  if (a(40, 480) !== 0 || a(920, 480) !== 0) bad.push('paint outside product');
  return bad;
})()`;

test('each control alone: min → max → default leaves no trace', async ({ page }) => {
  const controls = await page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLInputElement>('input[type=range]')).map((i) => ({ id: i.id, min: +i.min, max: +i.max, value: +i.value })),
  );
  const hash = () =>
    page.evaluate(() => {
      const d = (document.getElementById('preview') as HTMLCanvasElement).getContext('2d')!.getImageData(0, 0, 960, 960).data;
      let h = 0;
      for (let i = 0; i < d.length; i += 7) h = (h * 31 + d[i]!) | 0;
      return h;
    });
  const initial = await hash();
  for (const c of controls) {
    if (c.id === 'offsetX' || c.id === 'offsetY') continue; // disabled at 100% zoom
    for (const v of [c.min, c.max]) {
      await setRange(page, c.id, v);
      expect(await page.evaluate(CHECK), `${c.id}=${v}`).toEqual([]);
    }
    await setRange(page, c.id, c.value);
    expect(await hash(), `${c.id} back to default`).toBe(initial);
  }
});

test('random combinations of every control keep a valid render (200 states)', async ({ page }) => {
  const failures = await page.evaluate(`(() => {
    let seed = 20261111;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const pick = (a) => a[Math.floor(rnd() * a.length)];
    const range = (lo, hi) => Math.round(lo + rnd() * (hi - lo));
    const s = window.__badge.store;
    const out = [];
    for (let n = 0; n < 200; n++) {
      const item = {
        style: pick(['rounded', 'square', 'acrylic']),
        rotation: range(-30, 30), artSize: range(65, 110), acrylicHole: rnd() > 0.5,
        overlayMode: pick(['auto', 'custom', 'white', 'black']), overlayCustom: '#3366CC',
        fit: pick(['cover', 'contain']), zoom: range(75, 180), offsetX: range(-100, 100), offsetY: range(-100, 100),
      };
      const g = {
        radius: range(24, 150), ring: range(6, 120), outerZoom: range(90, 140), overlayAlpha: range(0, 100),
        gloss: range(0, 60), threeDEnabled: rnd() > 0.2, bevel: range(0, 100), depth: range(0, 28), shadow: range(0, 100),
        copyrightEnabled: rnd() > 0.5, markRight: range(8, 170), markBottom: range(8, 150), markSize: range(10, 38),
      };
      s.updateItem(s.selected.id, item);
      s.updateGlobals(g);
      try { window.__badge.paintNow(); } catch (e) { out.push({ n, err: String(e) }); continue; }
      const bad = ${CHECK};
      if (bad.length) out.push({ n, item, g, bad });
    }
    return out;
  })()`);
  expect(failures).toEqual([]);
});

test('values are clamped even when written out of range', async ({ page }) => {
  const r = await page.evaluate(() => {
    const s = window.__badge!.store;
    s.updateItem(s.selected!.id, { rotation: 999, artSize: -5, zoom: Number.NaN, offsetX: 1e9 });
    s.updateGlobals({ ring: 999, radius: -1, gloss: 1e6 });
    return { ...s.selected!.settings, ring: s.globals.ring, radius: s.globals.radius, gloss: s.globals.gloss };
  });
  expect(r).toMatchObject({ rotation: 30, artSize: 65, zoom: 100, offsetX: 100, ring: 120, radius: 24, gloss: 60 });
});

test('tilted + oversized panel never paints outside the rounded corners (v16 even-odd bug)', async ({ page }) => {
  // Count opaque pixels outside the rounded face in the top corner zones.
  const outside = () =>
    page.evaluate(() => {
      const d = (document.getElementById('preview') as HTMLCanvasElement).getContext('2d')!.getImageData(0, 0, 960, 960).data;
      const x0 = 118, y0 = 102, w = 724, r = window.__badge!.store.globals.radius;
      let n = 0;
      for (let y = y0; y < y0 + r; y++)
        for (let x = x0; x < x0 + w; x++) {
          const cx = x < x0 + r ? x0 + r : x > x0 + w - r ? x0 + w - r : null;
          if (cx === null) continue;
          if (Math.hypot(x + 0.5 - cx, y + 0.5 - (y0 + r)) > r + 2 && d[(y * 960 + x) * 4 + 3]! > 20) n++;
        }
      return n;
    });
  // Baseline: the plain face (its quadratic corners are slightly fuller than a circle).
  await setRange(page, 'radius', 150);
  const baseline = await outside();
  await setRange(page, 'overlayAlpha', 100);
  await setRange(page, 'artSize', 110);
  // v16 painted ~2,000 extra px here at 8°.
  for (const deg of [0, 5, 8, 15, -8]) {
    await setRange(page, 'rotation', deg);
    expect(await outside(), `rotation ${deg}`).toBeLessThanOrEqual(baseline + 40);
  }
});

test('smaller centre panel: tint reaches the panel edge (no untinted halo)', async ({ page }) => {
  await page.locator('[data-overlay="black"]').click();
  await setRange(page, 'overlayAlpha', 100);
  await setRange(page, 'artSize', 80);
  await settle(page);
  // inner window at 100% starts at x=162; at 80% the panel starts at ~226.
  const gap = await pixel(page, 190, 480);
  // black tint (+ the soft v3 sheen on top); an untinted halo would show the bright art
  expect(Math.max(gap[0]!, gap[1]!, gap[2]!)).toBeLessThan(85);
});

test('controls are grouped: primary visible, advanced folded by default', async ({ page }) => {
  await page.goto('./');
  await page.waitForSelector('html[data-ready="1"]');
  await expect(page.locator('[data-style="rounded"]')).toBeVisible();
  await expect(page.locator('#rotation')).toBeVisible();
  await expect(page.locator('#artSize')).toBeVisible();
  await expect(page.locator('[data-overlay="auto"]')).toBeVisible();
  for (const id of ['radius', 'ring', 'bevel', 'zoom', 'markText']) await expect(page.locator('#' + id)).toBeHidden();
  await page.locator('[data-preset="flat"]').click();
  await expect(page.locator('#threeDEnabled')).not.toBeChecked();
  await page.locator('[data-preset="standard"]').click();
  await expect(page.locator('#threeDEnabled')).toBeChecked();
});
