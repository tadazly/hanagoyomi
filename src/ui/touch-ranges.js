import { rangeValueAtPosition } from './wallpaper-ranges.js';

// 只接管网页滑条的单指触屏操作，鼠标、键盘及原有样式继续使用原生 input。
export function initTouchRanges(doc = document) {
  const view = doc.defaultView;
  let active = null;
  const cleanups = [];
  const listen = (target, type, listener) => {
    const options = { capture: true, passive: false };
    target.addEventListener(type, listener, options);
    cleanups.push(() => target.removeEventListener(type, listener, options));
  };
  const range = target => target?.closest?.('input[type="range"]');
  const enabled = input => input?.isConnected && !input.matches(':disabled');
  const prevent = event => { if (event.cancelable) event.preventDefault(); };
  const send = (input, type) => input.dispatchEvent(new view.Event(type, { bubbles: true }));
  const paint = input => {
    const min = Number(input.min || 0), span = Number(input.max || 100) - min;
    input.style.setProperty('--fill', `${span > 0 ? (input.valueAsNumber - min) / span * 100 : 100}%`);
  };
  const update = touch => {
    const input = active.input, before = input.value;
    input.value = String(rangeValueAtPosition(input, touch.clientX, view.getComputedStyle(input).direction === 'rtl'));
    if (input.value !== before) send(input, 'input');
    paint(input);
  };
  const finish = () => {
    if (!active) return;
    const { input, initial } = active; active = null;
    delete input.dataset.rangeAdjusting;
    paint(input);
    if (input.isConnected && input.value !== initial) send(input, 'change');
  };
  // PointerEvent 仍可能先触发原生 range 的按下动作，需与 TouchEvent 一起排除。
  listen(doc, 'pointerdown', event => {
    if (event.pointerType === 'touch' && enabled(range(event.target))) prevent(event);
  });
  listen(doc, 'touchstart', event => {
    if (event.touches.length !== 1) { finish(); return; }
    const input = range(event.target);
    if (!enabled(input)) return;
    finish(); prevent(event);
    const touch = event.touches[0];
    input.focus({ preventScroll: true });
    active = { input, id: touch.identifier, initial: input.value };
    input.dataset.rangeAdjusting = 'true';
    update(touch);
  });
  listen(doc, 'touchmove', event => {
    if (!active) return;
    if (event.touches.length !== 1 || !enabled(active.input)) { finish(); return; }
    const touch = Array.from(event.touches).find(t => t.identifier === active.id);
    if (touch) { prevent(event); update(touch); }
  });
  listen(doc, 'touchend', event => {
    if (!active) return;
    const touch = Array.from(event.changedTouches).find(t => t.identifier === active.id);
    if (!touch) return;
    prevent(event);
    if (enabled(active.input)) update(touch);
    finish();
  });
  listen(doc, 'touchcancel', finish);
  listen(doc, 'uiscalechange', finish);
  listen(doc, 'visibilitychange', () => { if (doc.hidden) finish(); });
  listen(view, 'blur', event => { if (event.target === view) finish(); });
  return { destroy() { finish(); cleanups.splice(0).forEach(remove => remove()); } };
}
