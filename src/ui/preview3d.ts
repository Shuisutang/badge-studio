/**
 * "3D 预览" modal. three.js is loaded only when the modal is first opened
 * (separate chunk), so the 2D editor stays light.
 */
import type { Store } from '../model/store';
import { renderBadge } from '../render/render';
import type { Viewer, ViewerInput } from '../three/viewer';
import { $, toast } from './dom';

const BG: Record<string, string> = { checkers: '#eeedf2', white: '#f6f6f8', dark: '#2a2833' };

export function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

export class Preview3D {
  private viewer: Viewer | null = null;
  private loading: Promise<typeof import('../three/viewer')> | null = null;
  private lastFocus: HTMLElement | null = null;
  private readonly modal = $('modal3d');
  private readonly stage = $('m3dStage');

  constructor(private readonly store: Store) {
    $('view3d').addEventListener('click', () => void this.open());
    $('m3dClose').addEventListener('click', () => this.close());
    $('m3dReset').addEventListener('click', () => this.viewer?.resetView());
    $('m3dFlip').addEventListener('click', () => this.viewer?.flip());
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) this.close();
    });
  }

  get isOpen(): boolean {
    return !this.modal.hidden;
  }

  /** Print-only texture of the selected badge (public for tests). */
  input(): ViewerInput | null {
    const it = this.store.selected;
    if (!it) return null;
    const g = this.store.globals;
    const small = Math.min(window.innerWidth, window.innerHeight) < 700;
    const dim = small ? 1024 : 2048;
    const c = document.createElement('canvas');
    c.width = c.height = dim;
    renderBadge(c.getContext('2d')!, { src: it.preview, settings: it.settings, colors: it.colors, globals: g, mark: this.store.mark, printOnly: true }, dim);
    let inkMask: HTMLCanvasElement | undefined;
    if (it.settings.style === 'acrylic') {
      inkMask = document.createElement('canvas');
      inkMask.width = inkMask.height = dim;
      renderBadge(inkMask.getContext('2d')!, { src: it.preview, settings: it.settings, colors: it.colors, globals: g, mark: this.store.mark, printOnly: true, inkMask: true }, dim);
    }
    return {
      print: c,
      inkMask,
      style: it.settings.style,
      radius: g.radius,
      hole: it.settings.acrylicHole,
      bevel: g.threeDEnabled ? g.bevel / 100 : 0,
      gloss: g.gloss / 100,
      background: BG[g.bg] ?? BG.checkers!,
    };
  }

  async open(): Promise<void> {
    const input = this.input();
    if (!input) return;
    if (!webglAvailable()) {
      toast('这个浏览器不支持 WebGL，无法打开 3D 预览');
      return;
    }
    this.lastFocus = document.activeElement as HTMLElement | null;
    this.modal.hidden = false;
    document.body.style.overflow = 'hidden';
    $('m3dTitle').textContent = `3D 预览 · ${this.store.selected?.name ?? ''}`;
    $('m3dClose').focus();
    $('m3dLoading').hidden = false;
    try {
      this.loading ??= import('../three/viewer');
      const mod = await this.loading;
      if (!this.isOpen) return;
      if (this.viewer) this.viewer.update(input);
      else this.viewer = mod.createViewer(this.stage, input);
      this.modal.dataset.ready = '1';
    } catch (err) {
      this.loading = null;
      toast('3D 预览加载失败：' + (err instanceof Error ? err.message : String(err)), 5000);
      this.close();
    } finally {
      $('m3dLoading').hidden = true;
    }
  }

  close(): void {
    if (this.modal.hidden) return;
    this.modal.hidden = true;
    delete this.modal.dataset.ready;
    document.body.style.overflow = '';
    // free the GPU while closed; reopening rebuilds in well under a second
    this.viewer?.dispose();
    this.viewer = null;
    this.lastFocus?.focus?.();
  }

  /** for tests */
  get info(): Viewer['info'] | null {
    return this.viewer?.info ?? null;
  }
}
