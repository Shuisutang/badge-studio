/** Public song/alias APIs only; no player account or API key is involved. */
export type MusicGame = 'maimai' | 'chunithm';
export interface Song {
  id: number;
  title: string;
  artist: string;
  aliases: string[];
  jacketId: number;
}
export interface Catalog { songs: Song[]; aliasesAvailable: boolean }
export interface SongMatch { song: Song; alias?: string; rank: number }

const API = 'https://maimai.lxns.net/api/v0';
const catalogs = new Map<MusicGame, Promise<Catalog>>();
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object';
const validId = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v > 0;

async function request(url: string, signal?: AbortSignal): Promise<Response> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) controller.abort();
  const timer = setTimeout(abort, 20_000);
  try {
    const response = await fetch(url, { signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
    if (!response.ok) throw new Error(response.status === 429 ? '落雪请求较多，请稍后再试' : `落雪暂时无法提供资源（${response.status}）`);
    // Consume the body while the timeout and cancellation are still active.
    const blob = await response.blob();
    if (blob.size > 12 * 1024 * 1024) throw new Error('资源过大，请改用本地图片');
    return new Response(blob, { headers: response.headers });
  } catch (error) {
    if (signal?.aborted) throw new DOMException('已取消', 'AbortError');
    if (controller.signal.aborted) throw new Error('落雪连接超时，请重试');
    if (error instanceof TypeError) throw new Error('无法连接落雪，请检查网络后重试');
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}

/** Normalize full-width letters, case and separators without dropping CJK text. */
export function normalizeQuery(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase().replace(/[\p{P}\p{Z}\p{S}\s]/gu, '');
}

export function parseCatalog(game: MusicGame, songsData: unknown, aliasesData: unknown): Catalog {
  if (!isRecord(songsData) || !Array.isArray(songsData.songs)) throw new Error('曲库格式有变化，请稍后重试');
  const aliases = new Map<number, string[]>();
  const aliasRows = isRecord(aliasesData) && Array.isArray(aliasesData.aliases) ? aliasesData.aliases : null;
  if (aliasRows) {
    for (const row of aliasRows as unknown[]) {
      if (isRecord(row) && validId(row.song_id) && Array.isArray(row.aliases))
        aliases.set(row.song_id, row.aliases.filter((s): s is string => typeof s === 'string'));
    }
  }
  const songs: Song[] = [];
  const seen = new Set<number>();
  for (const row of songsData.songs as unknown[]) {
    if (!isRecord(row) || !validId(row.id) || typeof row.title !== 'string' || seen.has(row.id)) continue;
    seen.add(row.id);
    let jacketId = row.id;
    // LXNS maimai uses the base song jacket for SD/DX; utage IDs retain their ID.
    if (game === 'maimai' && jacketId > 10000 && jacketId < 100000) jacketId %= 10000;
    // WORLD'S END variants may refer to an original song's jacket.
    if (game === 'chunithm' && Array.isArray(row.difficulties)) {
      const origin = row.difficulties.find(d => isRecord(d) && validId(d.origin_id));
      if (isRecord(origin) && validId(origin.origin_id)) jacketId = origin.origin_id;
    }
    songs.push({ id: row.id, title: row.title, artist: typeof row.artist === 'string' ? row.artist : '', aliases: aliases.get(row.id) ?? [], jacketId });
  }
  if (!songs.length) throw new Error('曲库暂时为空，请稍后重试');
  return { songs, aliasesAvailable: aliasRows !== null };
}

/** One request per game per page session; typing never requests the API. */
export function loadCatalog(game: MusicGame, refresh = false): Promise<Catalog> {
  if (refresh) catalogs.delete(game);
  let pending = catalogs.get(game);
  if (!pending) {
    pending = (async () => {
      const [songs, aliases] = await Promise.allSettled([
        request(`${API}/${game}/song/list`).then(r => r.json() as Promise<unknown>),
        request(`${API}/${game}/alias/list`).then(r => r.json() as Promise<unknown>),
      ]);
      if (songs.status === 'rejected') throw songs.reason;
      return parseCatalog(game, songs.value, aliases.status === 'fulfilled' ? aliases.value : null);
    })();
    catalogs.set(game, pending);
    void pending.catch(() => { if (catalogs.get(game) === pending) catalogs.delete(game); });
  }
  return pending;
}

export function searchSongs(songs: Song[], query: string): SongMatch[] {
  const q = normalizeQuery(query);
  if (!q) return [];
  const matches: SongMatch[] = [];
  for (const song of songs) {
    const title = normalizeQuery(song.title);
    const exactAlias = song.aliases.find(a => normalizeQuery(a) === q);
    const alias = exactAlias ?? song.aliases.find(a => normalizeQuery(a).includes(q));
    const rank = String(song.id) === q ? 0 : title === q ? 1 : exactAlias ? 2 : title.startsWith(q) ? 3 : title.includes(q) ? 4 : alias ? 5 : normalizeQuery(song.artist).includes(q) ? 6 : -1;
    if (rank >= 0) matches.push({ song, alias, rank });
  }
  return matches.sort((a, b) => a.rank - b.rank || a.song.id - b.song.id);
}

export function jacketUrl(game: MusicGame, id: number): string {
  if (!validId(id)) throw new Error('无效的曲绘 ID');
  return `https://assets2.lxns.net/${game}/jacket/${id}.png`;
}

export async function fetchJacket(game: MusicGame, song: Song, signal: AbortSignal): Promise<File> {
  const response = await request(jacketUrl(game, song.jacketId), signal);
  const blob = await response.blob();
  if (!blob.type.startsWith('image/')) throw new Error('这首歌暂时没有可用曲绘，请换一首试试');
  const name = song.title.replace(/[<>:"/\\|?*\x00-\x1f]/g, ' ').trim() || String(song.id);
  return new File([blob], `${name}.png`, { type: blob.type });
}
