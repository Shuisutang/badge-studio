import { describe, expect, it } from 'vitest';
import { jacketUrl, normalizeQuery, parseCatalog, searchSongs } from '../../src/music/lxns';

const songs = { songs: [
  { id: 384, title: 'VERTeX', artist: 'Hiro' },
  { id: 180, title: '怒槌', artist: '光吉猛修' },
  { id: 11544, title: 'VERTeX (remix)', artist: 'rintaro soma' },
] };
const aliases = { aliases: [{ song_id: 384, aliases: ['水神', 'vertex'] }, { song_id: 180, aliases: ['怒锤', '锤子', null] }] };

describe('LXNS catalog and matching', () => {
  it('finds full-width titles, punctuation, CJK aliases, IDs and artists', () => {
    const catalog = parseCatalog('maimai', songs, aliases);
    expect(normalizeQuery('Ｂ．Ｂ．Ｋ．Ｋ．')).toBe('bbkk');
    expect(searchSongs(catalog.songs, 'ｖｅｒｔｅｘ').map(m => m.song.id)).toEqual([384, 11544]);
    expect(searchSongs(catalog.songs, '怒锤')[0]).toMatchObject({ song: { id: 180 }, alias: '怒锤' });
    expect(searchSongs(catalog.songs, '384')[0]?.song.id).toBe(384);
    expect(searchSongs(catalog.songs, '光吉')[0]?.song.id).toBe(180);
    expect(searchSongs(catalog.songs, '...')).toEqual([]);
    expect(searchSongs(catalog.songs, '不存在的歌曲')).toEqual([]);
  });
  it('ignores malformed rows, duplicate IDs and non-text aliases', () => {
    const data = { songs: [...songs.songs, { id: 384, title: 'duplicate' }, { id: '../1', title: 'invalid' }, null] };
    const catalog = parseCatalog('maimai', data, aliases);
    expect(catalog.songs).toHaveLength(3);
    expect(catalog.songs[1]?.aliases).toEqual(['怒锤', '锤子']);
  });
  it('continues title search when the alias service is unavailable', () => {
    const catalog = parseCatalog('maimai', songs, null);
    expect(catalog.aliasesAvailable).toBe(false);
    expect(searchSongs(catalog.songs, 'VERTeX')).toHaveLength(2);
    expect(searchSongs(catalog.songs, '水神')).toHaveLength(0);
  });
  it('uses base jackets for DX and original jackets for WORLD’S END', () => {
    expect(parseCatalog('maimai', { songs: [{ id: 10384, title: 'DX' }, { id: 100456, title: '宴' }] }, null).songs.map(s => s.jacketId)).toEqual([384, 100456]);
    const we = parseCatalog('chunithm', { songs: [{ id: 8001, title: 'WE', difficulties: [{ origin_id: 180 }] }] }, null);
    expect(we.songs[0]?.jacketId).toBe(180);
    expect(jacketUrl('chunithm', 180)).toBe('https://assets2.lxns.net/chunithm/jacket/180.png');
    expect(() => jacketUrl('maimai', NaN)).toThrow();
  });
  it('rejects empty or incompatible catalogs rather than reporting no search matches', () => {
    expect(() => parseCatalog('maimai', { songs: [] }, null)).toThrow();
    expect(() => parseCatalog('chunithm', {}, null)).toThrow();
  });
});
