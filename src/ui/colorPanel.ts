/**
 * Touch-friendly colour row for 叠色 (and a 取色 button for the other colour
 * inputs). Every route ends by writing the target <input type="color"> and
 * firing input + change, so the existing handlers in controls.ts stay the
 * single place that updates the store (custom mode, autosave, repaint).
 */
import { extractPalette, loadRecent, normalizeHex, pushRecent } from '../color/palette';
import { SAMPLE_SIZE } from '../color/color';
import type { BadgeItem, Drawable } from '../model/types';
import { $, el } from './dom';
import type { Eyedropper } from './eyedropper';

const storage = (): Storage | null => {
  try { return window.localStorage; } catch { return null; }
};

const paletteCache = new WeakMap<object, string[]>();
export function imagePalette(src: Drawable): string[] {
  const key = src.source as unknown as object;
  const hit = paletteCache.get(key);
  if (hit) return hit;
  let out: string[] = [];
  try {
    const c = document.createElement('canvas');
    c.width = c.height = SAMPLE_SIZE;
    const x = c.getContext('2d', { willReadFrequently: true })!;
    x.drawImage(src.source, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
    out = extractPalette(x.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data, 6);
  } catch {
    out = [];
  }
  paletteCache.set(key, out);
  return out;
}

/** Write a colour into a native colour input like a user would. */
export function commitColor(input: HTMLInputElement, hex: string): void {
  input.value = hex.toLowerCase();
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

export class ColorPanel {
  private eyedropper: Eyedropper | null = null;
  private readonly overlay = $<HTMLInputElement>('overlayColor');
  private readonly hexInput = $<HTMLInputElement>('overlayHexInput');
  private recent = loadRecent(storage());

  constructor() {
    // Remember colours the user actually committed (native picker, hex, eyedropper, swatches).
    this.overlay.addEventListener('change', () => this.remember(this.overlay.value));
    this.hexInput.addEventListener('change', () => this.applyHex());
    this.hexInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); this.applyHex(); this.hexInput.blur(); } });
    for (const id of ['paletteChips', 'recentChips']) {
      $(id).addEventListener('click', (e) => {
        const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-hex]');
        if (b) commitColor(this.overlay, b.dataset.hex!);
      });
    }
    document.querySelectorAll<HTMLButtonElement>('button[data-eyedrop]').forEach((b) =>
      b.addEventListener('click', async () => {
        if (!this.eyedropper) return;
        const target = $<HTMLInputElement>(b.dataset.eyedrop!);
        b.classList.add('active');
        const hex = await this.eyedropper.pick();
        b.classList.remove('active');
        if (hex) commitColor(target, hex);
      }),
    );
    this.renderRecent();
  }

  attach(e: Eyedropper): void {
    this.eyedropper = e;
  }

  private applyHex(): void {
    const hex = normalizeHex(this.hexInput.value);
    this.hexInput.classList.toggle('invalid', !hex);
    this.hexInput.setAttribute('aria-invalid', String(!hex));
    if (hex) commitColor(this.overlay, hex);
  }

  private remember(hex: string): void {
    this.recent = pushRecent(storage(), hex);
    this.renderRecent();
  }

  private chips(id: string, list: string[], current: string): void {
    const box = $(id);
    box.replaceChildren(
      ...list.map((hex) => {
        const b = el('button', 'chip-color');
        b.type = 'button';
        b.dataset.hex = hex;
        b.style.background = hex;
        b.title = hex;
        b.setAttribute('aria-label', `使用 ${hex}`);
        b.setAttribute('aria-pressed', String(hex === current));
        return b;
      }),
    );
  }

  private renderRecent(current = ''): void {
    this.chips('recentChips', this.recent, current);
    $('recentRow').hidden = this.recent.length === 0;
  }

  /** Called from Controls.syncItem. `hex` is the tint currently shown. */
  sync(it: BadgeItem, hex: string, custom: boolean): void {
    if (document.activeElement !== this.hexInput) {
      this.hexInput.value = hex;
      this.hexInput.classList.remove('invalid');
      this.hexInput.removeAttribute('aria-invalid');
    }
    $('hexDot').style.background = hex;
    const current = custom ? hex : '';
    this.chips('paletteChips', imagePalette(it.preview), current);
    this.renderRecent(current);
  }
}
