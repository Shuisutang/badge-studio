import { describe, expect, it } from 'vitest';
import { makeItemSettings, Store } from '../../src/model/store';
import type { BadgeItem } from '../../src/model/types';

const item = (id: string, isDemo = false): BadgeItem => ({
  id,
  name: id,
  isDemo,
  naturalWidth: 100,
  naturalHeight: 100,
  blob: null,
  preview: { source: {} as CanvasImageSource, width: 100, height: 100 },
  thumb: { source: {} as CanvasImageSource, width: 100, height: 100 },
  colors: { sample: [1, 1, 1], center: [1, 1, 1], dominant: [1, 1, 1] },
  settings: makeItemSettings(),
  version: 0,
});

describe('Store', () => {
  it('replaces the demo when real art arrives and selects it', () => {
    const s = new Store();
    s.add([item('demo', true)]);
    s.add([item('a'), item('b')]);
    expect(s.items.map((i) => i.id)).toEqual(['a', 'b']);
    expect(s.selected?.id).toBe('a');
  });

  it('keeps settings per item (no bleed)', () => {
    const s = new Store();
    s.add([item('a'), item('b')]);
    s.updateItem('a', { offsetY: 80, fit: 'contain', rotation: -12 });
    expect(s.items[1]!.settings).toEqual(makeItemSettings());
    expect(s.items[0]!.settings).toMatchObject({ offsetY: 80, fit: 'contain', rotation: -12 });
    expect(s.items[0]!.version).toBe(1);
  });

  it('apply-to-all copies composition but not colour or offsets', () => {
    const s = new Store();
    s.add([item('a'), item('b')]);
    s.updateItem('a', { style: 'acrylic', artSize: 80, offsetX: 50, overlayMode: 'black' });
    expect(s.applyStyleToAll('a')).toBe(1);
    expect(s.items[1]!.settings).toMatchObject({ style: 'acrylic', artSize: 80, offsetX: 0, overlayMode: 'auto' });
  });

  it('remove selects the neighbour; move reorders', () => {
    const s = new Store();
    s.add([item('a'), item('b'), item('c')]);
    s.select('b');
    s.move('b', 1);
    expect(s.items.map((i) => i.id)).toEqual(['a', 'c', 'b']);
    s.remove('b');
    expect(s.selected?.id).toBe('c');
    s.selectOffset(1);
    expect(s.selected?.id).toBe('a');
  });

  it('marks slider drags as live so tiles and autosave can wait', () => {
    const s = new Store();
    const seen: string[] = [];
    s.subscribe((c) => seen.push(c.kind + ('live' in c && c.live ? ':live' : '')));
    s.updateGlobals({ gloss: 20 }, true);
    s.updateGlobals({ gloss: 20 });
    expect(seen).toEqual(['globals:live', 'globals']);
  });
});
