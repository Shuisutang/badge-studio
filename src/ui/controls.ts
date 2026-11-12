import { automaticTint, overlayTint, rgbToHex } from '../color/color';
import { LOOK_PRESETS, matchPreset } from '../model/presets';
import { DEFAULT_ITEM } from '../model/defaults';
import type { Store } from '../model/store';
import type { BadgeItem, GlobalSettings, ItemSettings, MarkColorMode, MarkMode, MarkPosition, OverlayMode, PreviewBg } from '../model/types';
import { ACRYLIC_ART_BASE, ACRYLIC_FACE, BADGE_FACE, artPanelGeometry, panRange } from '../render/geometry';
import { ACRYLIC_LIGHT } from '../render/lighting';
import { $ } from './dom';
import { guardRotationSlider } from './rotation';

const STYLE_HINTS: Record<ItemSettings['style'], string> = {
  rounded: '圆角马口铁吧唧：微微鼓起的面，左上斜向柔光，边缘包边变暗。',
  square: '直角方吧唧：平整印刷面，金属反光包边，柔和投影。',
  acrylic: '厚亚克力：清透板材、柔和边缘反光；描边、画外背景和左下圆孔均可调整。',
};

type NumKey<T> = { [K in keyof T]: T[K] extends number ? K : never }[keyof T];

function fmt(input: HTMLInputElement, v: number): string {
  return `${Math.round(v * 10) / 10}${input.dataset.unit ?? ''}`;
}
const signedDeg = (v: number) => (v > 0 ? '+' : '') + v + '°';

/** Two-way binding between the side panels and the store. */
export class Controls {
  constructor(private store: Store) {
    this.bindItemSliders();
    this.bindGlobalSliders();
    this.bindItemButtons();
    this.bindGlobalInputs();
  }

  private get item(): BadgeItem | null {
    return this.store.selected;
  }
  private patchItem(p: Partial<ItemSettings>, live = false): void {
    const it = this.item;
    if (it) this.store.updateItem(it.id, p, live);
  }

  private bindItemSliders(): void {
    for (const input of document.querySelectorAll<HTMLInputElement>('input[data-item]')) {
      const key = input.dataset.item as NumKey<ItemSettings>;
      input.addEventListener('input', () => {
        $(input.id + '-v').textContent = fmt(input, Number(input.value));
        this.patchItem({ [key]: Number(input.value) }, true);
      });
      input.addEventListener('change', () => this.patchItem({ [key]: Number(input.value) }, false));
    }
    const rot = $<HTMLInputElement>('rotation');
    guardRotationSlider(rot, $('rotationControl'));
    rot.addEventListener('input', () => {
      const it = this.item;
      if (!it || it.settings.style !== 'rounded') return;
      $('rotation-v').textContent = signedDeg(Number(rot.value));
      this.patchItem({ rotation: Number(rot.value) }, true);
    });
    rot.addEventListener('change', () => {
      const it = this.item;
      if (it && it.settings.style === 'rounded') this.patchItem({ rotation: Number(rot.value) });
    });
  }

  private bindGlobalSliders(): void {
    for (const input of document.querySelectorAll<HTMLInputElement>('input[data-global]')) {
      const key = input.dataset.global as NumKey<GlobalSettings>;
      input.addEventListener('input', () => {
        $(input.id + '-v').textContent = fmt(input, Number(input.value));
        this.store.updateGlobals({ [key]: Number(input.value) }, true);
      });
      input.addEventListener('change', () => this.store.updateGlobals({ [key]: Number(input.value) }));
    }
  }

  private bindItemButtons(): void {
    document.querySelectorAll<HTMLButtonElement>('[data-style]').forEach((b) =>
      // Fix (B5): the rotation value is kept when switching style; it is simply
      // not applied to square/acrylic, and comes back when you return to rounded.
      b.addEventListener('click', () => this.patchItem({ style: b.dataset.style as ItemSettings['style'] })),
    );
    document.querySelectorAll<HTMLButtonElement>('[data-fit]').forEach((b) =>
      b.addEventListener('click', () => this.patchItem({ fit: b.dataset.fit === 'contain' ? 'contain' : 'cover' })),
    );
    $('resetRotation').addEventListener('click', () => this.patchItem({ rotation: 0 }));
    $('resetCrop').addEventListener('click', () =>
      this.patchItem({ zoom: DEFAULT_ITEM.zoom, offsetX: 0, offsetY: 0, fit: DEFAULT_ITEM.fit }),
    );
    $<HTMLInputElement>('acrylicHole').addEventListener('change', (e) =>
      this.patchItem({ acrylicHole: (e.target as HTMLInputElement).checked }),
    );
    const outlineColor = $<HTMLInputElement>('acrylicOutlineColor');
    outlineColor.addEventListener('input', () => {
      $('acrylicOutlineColor-v').textContent = outlineColor.value.toUpperCase();
      this.patchItem({ acrylicOutlineColor: outlineColor.value.toUpperCase() }, true);
    });
    outlineColor.addEventListener('change', () => this.patchItem({ acrylicOutlineColor: outlineColor.value.toUpperCase() }));
    $('resetAcrylic').addEventListener('click', () => this.patchItem({
      acrylicOutlineWidth: DEFAULT_ITEM.acrylicOutlineWidth,
      acrylicOutlineColor: DEFAULT_ITEM.acrylicOutlineColor,
      acrylicOutlineOpacity: DEFAULT_ITEM.acrylicOutlineOpacity,
      acrylicBackgroundBrightness: DEFAULT_ITEM.acrylicBackgroundBrightness,
    }));
    document.querySelectorAll<HTMLButtonElement>('button[data-overlay]').forEach((b) =>
      b.addEventListener('click', () => this.patchItem({ overlayMode: b.dataset.overlay as OverlayMode })),
    );
    // Steppers: big ± buttons next to the primary sliders (touch friendly).
    document.querySelectorAll<HTMLButtonElement>('button[data-step]').forEach((b) =>
      b.addEventListener('click', () => {
        const it = this.item;
        if (!it) return;
        const key = b.dataset.step as 'rotation' | 'artSize';
        if (key === 'rotation' && it.settings.style !== 'rounded') return;
        this.patchItem({ [key]: it.settings[key] + Number(b.dataset.delta) });
      }),
    );
    $('resetItem').addEventListener('click', () => {
      const it = this.item;
      if (it) this.patchItem({ ...DEFAULT_ITEM, overlayCustom: it.settings.overlayCustom, exported: it.settings.exported });
    });
    const color = $<HTMLInputElement>('overlayColor');
    color.addEventListener('input', () => this.patchItem({ overlayCustom: color.value.toUpperCase(), overlayMode: 'custom' }, true));
    color.addEventListener('change', () => this.patchItem({ overlayCustom: color.value.toUpperCase(), overlayMode: 'custom' }));
  }

  private bindGlobalInputs(): void {
    const s = this.store;
    const check = (id: string, key: 'threeDEnabled' | 'copyrightEnabled') =>
      $<HTMLInputElement>(id).addEventListener('change', (e) => s.updateGlobals({ [key]: (e.target as HTMLInputElement).checked }));
    check('threeDEnabled', 'threeDEnabled');
    check('copyrightEnabled', 'copyrightEnabled');
    document.querySelectorAll<HTMLButtonElement>('[data-mark-position]').forEach(b =>
      b.addEventListener('click', () => s.updateGlobals({ markPosition: b.dataset.markPosition as MarkPosition })),
    );
    $<HTMLSelectElement>('markMode').addEventListener('change', (e) =>
      s.updateGlobals({ markMode: (e.target as HTMLSelectElement).value as MarkMode }),
    );
    const text = $<HTMLInputElement>('markText');
    text.addEventListener('input', () => s.updateGlobals({ markText: text.value }, true));
    text.addEventListener('change', () => s.updateGlobals({ markText: text.value }));
    $<HTMLSelectElement>('markColorMode').addEventListener('change', (e) =>
      s.updateGlobals({ markColorMode: (e.target as HTMLSelectElement).value as MarkColorMode }),
    );
    const mc = $<HTMLInputElement>('markColor');
    mc.addEventListener('input', () => s.updateGlobals({ markColor: mc.value, markColorMode: 'custom' }, true));
    mc.addEventListener('change', () => s.updateGlobals({ markColor: mc.value, markColorMode: 'custom' }));
    document.querySelectorAll<HTMLButtonElement>('[data-bg]').forEach((b) =>
      b.addEventListener('click', () => s.updateGlobals({ bg: b.dataset.bg as PreviewBg })),
    );
    const presets = $('presets');
    for (const p of LOOK_PRESETS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'mode preset';
      b.dataset.preset = p.id;
      b.title = p.hint;
      b.textContent = p.name;
      b.setAttribute('aria-pressed', 'false');
      b.addEventListener('click', () => s.updateGlobals(p.values));
      presets.append(b);
    }
    $('resetLook').addEventListener('click', () => s.updateGlobals(LOOK_PRESETS[0]!.values));
    $<HTMLSelectElement>('resolution').addEventListener('change', (e) =>
      s.updateGlobals({ resolution: Number((e.target as HTMLSelectElement).value) }),
    );
  }

  /** Reflect the selected item into the per-image controls. */
  syncItem(): void {
    const it = this.item;
    const disabled = !it;
    for (const id of ['artSize', 'zoom', 'offsetX', 'offsetY', 'overlayColor', 'acrylicHole', 'applyAll', 'resetCrop', 'resetItem', 'rotation', 'resetRotation'])
      ($(id) as HTMLInputElement).disabled = disabled;
    document.querySelectorAll<HTMLButtonElement>('[data-style],[data-fit]').forEach((b) => (b.disabled = disabled));
    document.querySelectorAll<HTMLInputElement>('input[data-item],#acrylicOutlineColor').forEach((i) => (i.disabled = disabled));
    if (!it) return;
    const st = it.settings;
    document.querySelectorAll<HTMLButtonElement>('[data-style]').forEach((b) => {
      const on = b.dataset.style === st.style;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', String(on));
    });
    document.querySelectorAll<HTMLButtonElement>('[data-fit]').forEach((b) => {
      const on = b.dataset.fit === st.fit;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', String(on));
    });
    const rotationEnabled = st.style === 'rounded';
    const rot = $<HTMLInputElement>('rotation');
    rot.value = String(st.rotation);
    rot.disabled = !rotationEnabled;
    ($('resetRotation') as HTMLButtonElement).disabled = !rotationEnabled;
    $('rotation-v').textContent = signedDeg(st.rotation);
    $('rotationRow').style.opacity = rotationEnabled ? '1' : '.45';
    $('rotationNote').textContent = rotationEnabled
      ? '只旋转中间主图，外圈仍保持水平'
      : st.rotation
        ? `直角和亚克力不旋转（切回圆角会恢复 ${signedDeg(st.rotation)}）`
        : '直角方吧唧和亚克力不使用旋转';
    for (const input of document.querySelectorAll<HTMLInputElement>('input[data-item]')) {
      const k = input.dataset.item as NumKey<ItemSettings>;
      input.value = String(st[k]);
      $(input.id + '-v').textContent = fmt(input, st[k]);
    }
    $('acrylicHoleRow').hidden = st.style !== 'acrylic';
    $('acrylicAppearance').hidden = st.style !== 'acrylic';
    $<HTMLInputElement>('acrylicHole').checked = st.acrylicHole;
    $<HTMLInputElement>('acrylicOutlineColor').value = st.acrylicOutlineColor.toLowerCase();
    $('acrylicOutlineColor-v').textContent = st.acrylicOutlineColor;
    ($('radius') as HTMLInputElement).disabled = st.style !== 'rounded';
    $('styleHint').textContent = STYLE_HINTS[st.style];
    const hex = rgbToHex(overlayTint(st, it.colors));
    document.querySelectorAll<HTMLElement>('[data-overlay]').forEach((b) => {
      const on = b.dataset.overlay === st.overlayMode;
      b.classList.toggle('active', on);
      if (b.tagName === 'BUTTON') b.setAttribute('aria-checked', String(on));
    });
    $('autoDot').style.background = rgbToHex(automaticTint(it.colors));
    $<HTMLInputElement>('overlayColor').value = hex.toLowerCase();
    $('overlayHex').textContent = hex;
    document.querySelectorAll<HTMLButtonElement>('button[data-step="rotation"]').forEach((b) => (b.disabled = st.style !== 'rounded'));
    this.syncPanHint(it);
  }

  private syncPanHint(it: BadgeItem): void {
    const acrylic = it.settings.style === 'acrylic';
    const face = acrylic ? ACRYLIC_FACE : BADGE_FACE;
    const ring = acrylic ? ACRYLIC_LIGHT.border : this.store.globals.ring;
    const box = { x: 0, y: 0, w: face.w - 2 * ring, h: face.h - 2 * ring };
    const panel = artPanelGeometry(it.settings.style, it.settings.rotation,
      it.settings.artSize * (acrylic ? ACRYLIC_ART_BASE : 1), box, 0,
      acrylic ? face.w - 8 : face.w, it.settings.zoom);
    const r = panRange(it.preview.width, it.preview.height,
      { x: 0, y: 0, w: panel.panelW, h: panel.panelH },
      { ...it.settings, zoom: Math.max(100, it.settings.zoom) });
    const canX = r.x > 0.5;
    const canY = r.y > 0.5;
    $<HTMLInputElement>('offsetX').disabled = !canX;
    $<HTMLInputElement>('offsetY').disabled = !canY;
    $('panHint').textContent =
      canX || canY ? '裁切和位置只影响当前图片' : '图片刚好铺满，放大主图后才能移动位置';
  }

  syncGlobals(): void {
    const g = this.store.globals;
    for (const input of document.querySelectorAll<HTMLInputElement>('input[data-global]')) {
      const key = input.dataset.global as NumKey<GlobalSettings>;
      if (document.activeElement !== input) input.value = String(g[key]);
      $(input.id + '-v').textContent = fmt(input, g[key]);
    }
    $<HTMLInputElement>('threeDEnabled').checked = g.threeDEnabled;
    $<HTMLInputElement>('copyrightEnabled').checked = g.copyrightEnabled;
    $('markSettings').hidden = !g.copyrightEnabled;
    document.querySelectorAll<HTMLButtonElement>('[data-mark-position]').forEach(b => {
      const on = b.dataset.markPosition === g.markPosition;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', String(on));
    });
    $('markHorizontalLabel').textContent = g.markPosition.endsWith('left') ? '左侧留距' : '右侧留距';
    $('markVerticalLabel').textContent = g.markPosition.startsWith('top') ? '上方留距' : '下方留距';
    $<HTMLSelectElement>('markMode').value = g.markMode;
    $('markTextSettings').hidden = g.markMode !== 'text';
    $('markLogoSettings').hidden = g.markMode !== 'logo';
    const text = $<HTMLInputElement>('markText');
    if (document.activeElement !== text) text.value = g.markText;
    $<HTMLSelectElement>('markColorMode').value = g.markColorMode;
    $<HTMLInputElement>('markColor').value = g.markColor.toLowerCase();
    $<HTMLSelectElement>('resolution').value = String(g.resolution);
    document.querySelectorAll<HTMLButtonElement>('[data-bg]').forEach((b) => {
      const on = b.dataset.bg === g.bg;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', String(on));
    });
    $('previewBg').className = 'preview-bg ' + g.bg;
    $('markLogoName').textContent = this.store.markName || '尚未选择图片';
    for (const id of ['bevel', 'depth', 'shadow']) ($(id) as HTMLInputElement).disabled = !g.threeDEnabled;
    const active = matchPreset(g);
    document.querySelectorAll<HTMLButtonElement>('[data-preset]').forEach((b) => {
      const on = b.dataset.preset === active;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', String(on));
    });
  }
}

