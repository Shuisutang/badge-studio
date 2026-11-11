export function $<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} missing`);
  return el as T;
}

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text) e.textContent = text;
  return e;
}

let toastTimer = 0;
export function toast(msg: string, ms = 3200): void {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => t.classList.remove('show'), ms);
}

/** Overlay on the preview + text on the drop zone while something slow runs. */
export function setBusy(text: string | null): void {
  const busy = $('busy');
  const prog = $('loadProgress');
  busy.hidden = !text;
  prog.hidden = !text;
  if (text) {
    $('busyText').textContent = text;
    prog.textContent = text;
  }
  for (const id of ['download', 'sheet', 'zipAll']) ($(id) as HTMLButtonElement).disabled = !!text;
}
