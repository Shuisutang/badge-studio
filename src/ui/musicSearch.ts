import { fetchJacket, jacketUrl, loadCatalog, searchSongs, type Catalog, type MusicGame, type Song } from '../music/lxns';
import { $, el, toast } from './dom';

export class MusicSearch {
  private readonly dialog = $<HTMLDialogElement>('musicDialog');
  private readonly query = $<HTMLInputElement>('musicQuery');
  private readonly results = $('musicResults');
  private readonly status = $('musicStatus');
  private readonly retry = $<HTMLButtonElement>('musicRetry');
  private readonly fields = $<HTMLFieldSetElement>('musicFields');
  private game: MusicGame = 'maimai';
  private catalog: Catalog | null = null;
  private generation = 0;
  private searchTimer = 0;
  private importController: AbortController | null = null;
  private lastFocus: HTMLElement | null = null;

  constructor(private readonly importImage: (file: File, signal: AbortSignal) => Promise<void>) {
    for (const id of ['searchMusic', 'emptySearchMusic']) $(id).addEventListener('click', () => this.open());
    $('musicClose').addEventListener('click', () => this.close());
    this.dialog.addEventListener('cancel', () => this.importController?.abort());
    this.dialog.addEventListener('close', () => {
      this.generation++;
      this.importController?.abort();
      clearTimeout(this.searchTimer);
      if (this.lastFocus?.isConnected && this.lastFocus.getClientRects().length) this.lastFocus.focus();
      else if (!$('preview').hidden) $('preview').focus();
    });
    this.dialog.addEventListener('click', e => {
      if (e.target === this.dialog) {
        const r = this.dialog.getBoundingClientRect();
        if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) this.close();
      }
    });
    document.querySelectorAll<HTMLButtonElement>('[data-music-game]').forEach(button => button.addEventListener('click', () => {
      if (this.game === button.dataset.musicGame) return;
      this.game = button.dataset.musicGame as MusicGame;
      document.querySelectorAll('[data-music-game]').forEach(b => {
        const active = (b as HTMLElement).dataset.musicGame === this.game;
        b.setAttribute('aria-pressed', String(active));
        b.classList.toggle('active', active);
      });
      void this.load();
    }));
    this.query.addEventListener('input', () => {
      clearTimeout(this.searchTimer);
      this.searchTimer = window.setTimeout(() => this.search(), 180);
    });
    $('musicForm').addEventListener('submit', e => { e.preventDefault(); clearTimeout(this.searchTimer); this.search(); });
    this.retry.addEventListener('click', () => void this.load(true));
  }

  private open(): void {
    if (this.dialog.open || this.importController) return;
    this.lastFocus = document.activeElement as HTMLElement;
    this.dialog.showModal();
    this.query.focus();
    void this.load();
  }

  private close(): void {
    this.importController?.abort();
    this.dialog.close();
  }

  private async load(refresh = false): Promise<void> {
    const generation = ++this.generation;
    this.catalog = null;
    this.results.replaceChildren();
    this.retry.hidden = true;
    this.status.textContent = '正在读取落雪曲库…';
    this.results.setAttribute('aria-busy', 'true');
    try {
      const catalog = await loadCatalog(this.game, refresh);
      if (generation !== this.generation || !this.dialog.open) return;
      this.catalog = catalog;
      this.retry.hidden = catalog.aliasesAvailable;
      this.retry.textContent = '重试别称加载';
      this.search();
    } catch (error) {
      if (generation !== this.generation || !this.dialog.open) return;
      this.status.textContent = error instanceof Error ? error.message : '曲库加载失败，请重试';
      this.retry.textContent = '重新加载';
      this.retry.hidden = false;
    } finally {
      if (generation === this.generation) this.results.setAttribute('aria-busy', 'false');
    }
  }

  private search(): void {
    if (!this.catalog || this.importController) return;
    this.results.replaceChildren();
    const query = this.query.value.trim();
    const suffix = this.catalog.aliasesAvailable ? '' : ' · 别称暂未加载，可先按曲名搜索';
    if (!query) {
      this.status.textContent = `已读取 ${this.catalog.songs.length} 首歌曲，输入曲名、别称或歌曲 ID${suffix}`;
      return;
    }
    const matches = searchSongs(this.catalog.songs, query);
    this.status.textContent = (matches.length ? `找到 ${matches.length} 首${matches.length > 20 ? '，显示前 20 首，请补充关键词' : ''}` : '没有找到，试试其他曲名或别称') + suffix;
    for (const { song, alias } of matches.slice(0, 20)) {
      const row = el('li', 'music-result');
      const art = el('div', 'music-art');
      const image = el('img');
      image.alt = `${song.title} 曲绘`;
      image.loading = 'lazy';
      image.crossOrigin = 'anonymous';
      image.referrerPolicy = 'no-referrer';
      image.width = image.height = 72;
      const info = el('div', 'music-info');
      const size = el('span', 'music-size', '原图像素读取中');
      image.addEventListener('load', () => { size.textContent = `原图 ${image.naturalWidth}×${image.naturalHeight}`; });
      image.addEventListener('error', () => {
        image.hidden = true;
        art.append(el('span', '', '暂无预览'));
        size.textContent = '预览未加载，可尝试导入';
      }, { once: true });
      image.src = jacketUrl(this.game, song.jacketId);
      art.append(image);
      info.append(el('strong', 'music-title', song.title), el('span', 'music-artist', `${song.artist} · ID ${song.id}`));
      if (alias) info.append(el('span', 'music-alias', `别称：${alias}`));
      info.append(size);
      const button = el('button', 'btn small', '导入');
      button.type = 'button';
      button.setAttribute('aria-label', `导入 ${song.title}`);
      button.addEventListener('click', () => void this.import(song, button));
      row.append(art, info, button);
      this.results.append(row);
    }
  }

  private async import(song: Song, button: HTMLButtonElement): Promise<void> {
    if (this.importController) return;
    const controller = this.importController = new AbortController();
    this.fields.disabled = true;
    this.results.querySelectorAll('button').forEach(b => b.disabled = true);
    this.retry.disabled = true;
    button.textContent = '导入中…';
    this.status.textContent = `正在导入 ${song.title}…`;
    try {
      const file = await fetchJacket(this.game, song, controller.signal);
      controller.signal.throwIfAborted();
      await this.importImage(file, controller.signal);
      this.dialog.close();
      toast(`已导入 ${song.title}，可用「替换图片」换成高清图`);
    } catch (error) {
      const message = error instanceof DOMException ? '曲绘图片无法读取' : error instanceof Error ? error.message : '曲绘导入失败';
      if (!controller.signal.aborted) this.status.textContent = `${message}；可以重试或上传本地图片`;
    } finally {
      this.importController = null;
      this.fields.disabled = false;
      this.results.querySelectorAll('button').forEach(b => b.disabled = false);
      this.retry.disabled = false;
      button.textContent = '导入';
    }
  }
}
