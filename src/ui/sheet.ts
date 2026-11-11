import { $ } from './dom';

/**
 * Settings tabs. On phones the settings become a bottom sheet with three tabs
 * (款式 / 叠色 / 高级) so the preview stays in view; on desktop every panel is
 * shown in the sidebar and the tabs are hidden.
 */
export function initSettingsSheet(): void {
  const root = $('settings');
  const tabs = Array.from(root.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
  const select = (name: string, focus = false) => {
    for (const t of tabs) {
      const on = t.dataset.tab === name;
      t.classList.toggle('active', on);
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      if (on && focus) t.focus();
    }
    root.querySelectorAll<HTMLElement>('[data-panel]').forEach((p) => p.classList.toggle('active', p.dataset.panel === name));
    root.classList.remove('collapsed');
    $('sheetToggle').setAttribute('aria-expanded', 'true');
  };
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => select(t.dataset.tab!));
    t.addEventListener('keydown', (e) => {
      const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!d) return;
      e.preventDefault();
      select(tabs[(i + d + tabs.length) % tabs.length]!.dataset.tab!, true);
    });
  });
  $('sheetToggle').addEventListener('click', () => {
    const collapsed = root.classList.toggle('collapsed');
    $('sheetToggle').setAttribute('aria-expanded', String(!collapsed));
  });
}
