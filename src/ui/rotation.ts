/**
 * Rotation slider driven by Pointer Events instead of native drag, so Edge's
 * "Super Drag" can't turn a slider motion into a web search (from v16).
 * Dispatches normal `input` while dragging and one `change` at the end.
 */
export function guardRotationSlider(slider: HTMLInputElement, guard: HTMLElement): void {
  let pointerId: number | null = null;

  const update = (e: PointerEvent) => {
    const rect = slider.getBoundingClientRect();
    if (rect.width <= 0) return;
    const min = Number(slider.min);
    const max = Number(slider.max);
    const step = Number(slider.step) || 1;
    const inset = 9; // native thumb half-width: keep both ends reachable
    const progress = Math.max(0, Math.min(1, (e.clientX - rect.left - inset) / Math.max(1, rect.width - 2 * inset)));
    const value = Math.max(min, Math.min(max, min + Math.round(((max - min) * progress) / step) * step));
    if (Number(slider.value) !== value) {
      slider.value = String(value);
      slider.dispatchEvent(new Event('input', { bubbles: true }));
    }
  };
  const finish = (e: PointerEvent | null) => {
    if (pointerId === null || (e && e.pointerId !== pointerId)) return;
    const id = pointerId;
    pointerId = null;
    document.body.classList.remove('rotation-drag-active');
    try {
      if (slider.hasPointerCapture(id)) slider.releasePointerCapture(id);
    } catch {
      /* already released */
    }
    slider.dispatchEvent(new Event('change', { bubbles: true }));
  };

  slider.addEventListener('pointerdown', (e) => {
    if (slider.disabled || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.preventDefault();
    e.stopPropagation();
    window.getSelection?.()?.removeAllRanges();
    pointerId = e.pointerId;
    document.body.classList.add('rotation-drag-active');
    slider.focus({ preventScroll: true });
    try {
      slider.setPointerCapture(e.pointerId);
    } catch {
      /* not capturable */
    }
    update(e);
  });
  slider.addEventListener('pointermove', (e) => {
    if (e.pointerId !== pointerId) return;
    if (e.cancelable) e.preventDefault();
    update(e);
  });
  slider.addEventListener('pointerup', (e) => {
    if (e.pointerId !== pointerId) return;
    update(e);
    finish(e);
  });
  slider.addEventListener('pointercancel', finish);
  slider.addEventListener('lostpointercapture', finish);
  window.addEventListener('blur', () => finish(null));
  guard.addEventListener('dragstart', (e) => e.preventDefault(), true);
  document.addEventListener(
    'selectstart',
    (e) => {
      if (pointerId !== null || guard.contains(e.target as Node)) e.preventDefault();
    },
    true,
  );
}
