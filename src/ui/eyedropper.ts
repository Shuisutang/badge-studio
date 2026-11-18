/**
 * 取色: pick a colour from the user's own artwork.
 *
 * - Desktop browsers with the native EyeDropper API (Chrome/Edge) and a fine
 *   pointer use it, so any pixel on screen can be picked.
 * - Everywhere else (iOS Safari, Android Chrome, Firefox) the preview canvas
 *   switches to the plain uploaded image; touch-drag shows a loupe above the
 *   finger with the live colour, releasing confirms, 取消 / Esc cancels.
 *
 * The artwork is always decoded from a local Blob (uploads and LXNS imports
 * are fetched into Blobs), so the canvas is same-origin; getImageData is still
 * guarded and a tainted canvas just reports that this image can't be sampled.
 */
import { parseCssColor, sampleAt } from '../color/palette';
import type { BadgeItem } from '../model/types';
import { $, toast } from './dom';

interface NativeEyeDropper { open(o?: { signal?: AbortSignal }): Promise<{ sRGBHex: string }> }
type EyeDropperCtor = new () => NativeEyeDropper;

const LOUPE_PX = 120;
const LOUPE_CELLS = 15;

export class Eyedropper {
  private session: { resolve: (hex: string | null) => void; hex: string | null; pointer: number | null } | null = null;
  private data: ImageData | null = null;
  private readonly bar = $('pickBar');
  private readonly loupe = $('pickLoupe');
  private readonly loupeCanvas = this.loupe.querySelector('canvas')!;
  private readonly swatch = $('pickSwatch');
  private readonly label = $('pickHex');

  constructor(private canvas: HTMLCanvasElement, private getItem: () => BadgeItem | null, private repaint: () => void) {
    $('pickCancel').addEventListener('click', () => this.finish(null));
    $('pickConfirm').addEventListener('click', () => this.session?.hex && this.finish(this.session.hex));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && this.session) this.finish(null); });
    canvas.addEventListener('pointerdown', (e) => this.down(e));
    canvas.addEventListener('pointermove', (e) => this.move(e));
    canvas.addEventListener('pointerup', (e) => this.up(e));
    canvas.addEventListener('pointercancel', () => this.hideLoupe());
    canvas.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') this.hideLoupe(); });
  }

  get active(): boolean {
    return !!this.session;
  }

  /** Whether the native API will be used (desktop Chromium with a mouse). */
  static nativeAvailable(): boolean {
    return typeof window !== 'undefined' && 'EyeDropper' in window && matchMedia('(pointer: fine)').matches;
  }

  /** Resolves with "#RRGGBB", or null when cancelled. */
  async pick(): Promise<string | null> {
    if (this.session) this.finish(null);
    if (Eyedropper.nativeAvailable()) {
      try {
        const Ctor = (window as unknown as { EyeDropper: EyeDropperCtor }).EyeDropper;
        const r = await new Ctor().open();
        return parseCssColor(r.sRGBHex);
      } catch {
        return null; // Esc / dismissed
      }
    }
    if (!this.getItem()) return null;
    return new Promise((resolve) => {
      this.session = { resolve, hex: null, pointer: null };
      document.body.classList.add('picking');
      this.bar.hidden = false;
      this.setLive(null);
      this.canvas.style.touchAction = 'none';
      this.repaint();
      if (!this.data) {
        toast('这张图片无法取色，请输入色值或换用本地图片');
        this.finish(null);
      }
    });
  }

  /** While picking, the preview shows the plain artwork (true colours, no tint or lighting). */
  paintFlat(ctx: CanvasRenderingContext2D, dim: number): void {
    const it = this.getItem();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, dim, dim);
    if (!it) return;
    const { width: w, height: h, source } = it.preview;
    const pad = dim * 0.04;
    const k = Math.min((dim - 2 * pad) / w, (dim - 2 * pad) / h);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, (dim - w * k) / 2, (dim - h * k) / 2, w * k, h * k);
    try {
      this.data = ctx.getImageData(0, 0, dim, dim);
    } catch {
      this.data = null; // tainted: sampling disabled for this image
    }
  }

  private point(e: PointerEvent): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) * this.canvas.width) / r.width, y: ((e.clientY - r.top) * this.canvas.height) / r.height };
  }

  private sample(e: PointerEvent): string | null {
    if (!this.data) return null;
    const { x, y } = this.point(e);
    return sampleAt(this.data.data, this.data.width, this.data.height, x, y, 2);
  }

  private down(e: PointerEvent): void {
    if (!this.session) return;
    e.preventDefault();
    e.stopPropagation();
    this.session.pointer = e.pointerId;
    try { this.canvas.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    this.track(e);
  }

  private move(e: PointerEvent): void {
    if (!this.session) return;
    if (this.session.pointer === e.pointerId || e.pointerType === 'mouse') {
      e.preventDefault();
      this.track(e);
    }
  }

  private up(e: PointerEvent): void {
    const s = this.session;
    if (!s || s.pointer !== e.pointerId) return;
    e.preventDefault();
    s.pointer = null;
    const hex = this.sample(e);
    this.hideLoupe();
    if (hex) this.finish(hex);
    else this.label.textContent = '请点在图片上';
  }

  private track(e: PointerEvent): void {
    const hex = this.sample(e);
    this.setLive(hex);
    if (this.session) this.session.hex = hex ?? this.session.hex;
    this.showLoupe(e, hex);
  }

  private setLive(hex: string | null): void {
    this.swatch.style.background = hex ?? 'transparent';
    this.swatch.classList.toggle('empty', !hex);
    this.label.textContent = hex ?? '在图片上按住拖动取色';
    ($('pickConfirm') as HTMLButtonElement).disabled = !(hex ?? this.session?.hex);
  }

  private showLoupe(e: PointerEvent, hex: string | null): void {
    const { x, y } = this.point(e);
    const c = this.loupeCanvas;
    c.width = c.height = LOUPE_PX;
    const g = c.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, LOUPE_PX, LOUPE_PX);
    const half = LOUPE_CELLS / 2;
    g.drawImage(this.canvas, x - half, y - half, LOUPE_CELLS, LOUPE_CELLS, 0, 0, LOUPE_PX, LOUPE_PX);
    this.loupe.querySelector('span')!.textContent = hex ?? '—';
    this.loupe.style.setProperty('--pick', hex ?? '#fff');
    const touch = e.pointerType !== 'mouse';
    // Above the finger on touch (the finger would hide it), beside the cursor with a mouse.
    let left = e.clientX - LOUPE_PX / 2 + (touch ? 0 : LOUPE_PX / 2 + 18);
    let top = e.clientY - LOUPE_PX - (touch ? 56 : -18);
    left = Math.max(6, Math.min(innerWidth - LOUPE_PX - 6, left));
    if (top < 6) top = e.clientY + 48;
    this.loupe.style.left = `${left}px`;
    this.loupe.style.top = `${top}px`;
    this.loupe.hidden = false;
  }

  private hideLoupe(): void {
    this.loupe.hidden = true;
  }

  private finish(hex: string | null): void {
    const s = this.session;
    if (!s) return;
    this.session = null;
    this.data = null;
    document.body.classList.remove('picking');
    this.bar.hidden = true;
    this.hideLoupe();
    this.canvas.style.touchAction = '';
    this.repaint();
    s.resolve(hex);
  }
}
