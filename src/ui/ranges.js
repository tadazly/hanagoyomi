function rangeBounds(input) {
  return `${input.min}|${input.max}|${input.step}`;
}

function rangeRatio(input) {
  const min = Number(input.min || 0), span = Number(input.max || 100) - min;
  return span > 0 ? Math.max(0, Math.min(1, (input.valueAsNumber - min) / span)) : 1;
}

export function rangeValueAtPosition(input, clientX, rtl = false, rect = input.getBoundingClientRect()) {
  const min = Number(input.min || 0), max = Number(input.max || 100);
  if (!(rect.width > 0) || max <= min) return min;
  let ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  if (rtl) ratio = 1 - ratio;
  const step = input.step === 'any' ? 0 : Number(input.step || 1);
  const raw = min + ratio * (max - min);
  const value = step > 0 ? min + Math.round((raw - min) / step) * step : raw;
  return Math.max(min, Math.min(max, Number(value.toPrecision(12))));
}

// 网页、WE 与触屏共用点击/相对拖动；不使用滚动引擎，也不积累松手后的速度。
export function initRanges(doc = document) {
  const view = doc.defaultView, cleanups = [];
  let active = null, suppression = null, nonMouseUntil = 0;
  const listen = (target, type, listener) => {
    const options = { capture: true, passive: false };
    target.addEventListener(type, listener, options);
    cleanups.push(() => target.removeEventListener(type, listener, options));
  };
  const range = target => target?.closest?.('input[type="range"]');
  const enabled = input => input?.isConnected && !input.matches(':disabled') && !input.closest('[hidden]');
  const valid = () => enabled(active?.input) && rangeBounds(active.input) === active.bounds
    && active.input.getBoundingClientRect().width > 0;
  const prevent = event => { if (event.cancelable) event.preventDefault(); };
  const send = (input, type) => input.dispatchEvent(new view.Event(type, { bubbles: true }));
  const paint = input => input.style.setProperty('--fill', `${rangeRatio(input) * 100}%`);
  const update = clientX => {
    const { input, rect, rtl } = active, before = input.value;
    // 高度等读数位数变化会挤窄轨道；整次手势使用按下时的矩形，避免取消或跳值。
    input.value = String(rangeValueAtPosition(input, clientX, rtl, rect));
    if (input.value !== before) send(input, 'input');
    paint(input);
  };
  const drag = point => {
    const { rect, startRatio, startX, rtl } = active;
    // 使用按下时的连续进度，不把每次步进取整后的值累加回手势。
    const fraction = startRatio + (point.clientX - startX) / rect.width * (rtl ? -1 : 1);
    update(rect.left + (rtl ? 1 - fraction : fraction) * rect.width);
  };
  const finish = () => {
    if (!active) return;
    const { input, initial, source, id } = active; active = null;
    suppression = { input, until: Date.now() + 800 };
    delete input.dataset.rangeAdjusting;
    paint(input);
    if (source === 'pointer') { try { input.releasePointerCapture(id); } catch {} }
    if (input.isConnected && input.value !== initial) send(input, 'change');
  };
  const begin = (event, point, source, id) => {
    finish(); suppression = null;
    const input = range(event.target);
    if (!enabled(input)) return;
    const rect = input.getBoundingClientRect();
    if (!(rect.width > 0)) return;
    prevent(event); input.focus({ preventScroll: true });
    active = { input, source, id, rect, initial: input.value, bounds: rangeBounds(input),
      startRatio: rangeRatio(input), startX: point.clientX, startY: point.clientY,
      rtl: view.getComputedStyle(input).direction === 'rtl', dragging: false };
    input.dataset.rangeAdjusting = 'true';
    if (source === 'pointer') { try { input.setPointerCapture(id); } catch {} }
  };
  const move = (event, point) => {
    if (!valid()) { finish(); return; }
    prevent(event);
    if (!active.dragging) {
      const primary = Math.abs(point.clientX - active.startX), cross = Math.abs(point.clientY - active.startY);
      if (cross > 5 && cross > primary * 1.2) { finish(); return; }
      if (primary <= 5 || primary < cross) return;
      active.dragging = true;
    }
    drag(point);
  };
  const end = (event, point) => {
    if (!valid()) { finish(); return; }
    move(event, point);
    if (!active) return;
    if (!active.dragging) update(point.clientX);
    finish();
  };
  const downPointer = event => {
    // Safari/CEF 的触屏原生 range 默认动作需同时从 PointerEvent 和 TouchEvent 排除。
    if (event.pointerType === 'touch' && 'ontouchstart' in view) {
      nonMouseUntil = Date.now() + 800;
      if (enabled(range(event.target))) prevent(event);
      return;
    }
    if (event.isPrimary === false) { finish(); return; }
    if (event.button !== undefined && event.button !== 0) return;
    begin(event, event, 'pointer', event.pointerId);
  };
  listen(doc, 'pointerdown', downPointer);
  listen(doc, 'mousedown', event => {
    if (active?.source === 'pointer' || event.sourceCapabilities?.firesTouchEvents || Date.now() < nonMouseUntil || event.button !== 0) return;
    begin(event, event, 'mouse');
  });
  for (const [source, prefix] of [['pointer', 'pointer'], ['mouse', 'mouse']]) {
    const matches = event => active?.source === source && (source !== 'pointer' || active.id === event.pointerId);
    listen(view, `${prefix}move`, event => { if (matches(event)) move(event, event); });
    listen(view, `${prefix}up`, event => { if (matches(event)) end(event, event); });
  }
  listen(doc, 'pointercancel', event => { if (active?.source === 'pointer' && active.id === event.pointerId) finish(); });
  listen(doc, 'lostpointercapture', event => { if (active?.source === 'pointer' && active.id === event.pointerId) finish(); });
  listen(doc, 'touchstart', event => {
    nonMouseUntil = Date.now() + 800;
    if (event.touches.length !== 1) { finish(); return; }
    const touch = event.touches[0];
    begin(event, touch, 'touch', touch.identifier);
  });
  listen(doc, 'touchmove', event => {
    if (active?.source !== 'touch') return;
    if (event.touches.length !== 1) { finish(); return; }
    const touch = Array.from(event.touches).find(t => t.identifier === active.id);
    if (touch) move(event, touch);
  });
  listen(doc, 'touchend', event => {
    if (active?.source !== 'touch') return;
    nonMouseUntil = Date.now() + 800;
    const touch = Array.from(event.changedTouches).find(t => t.identifier === active.id);
    if (touch) end(event, touch);
  });
  listen(doc, 'touchcancel', () => { if (active?.source === 'touch') finish(); });
  listen(doc, 'click', event => {
    if (!suppression || event.detail === 0 || Date.now() > suppression.until || range(event.target) !== suppression.input) return;
    suppression = null; prevent(event); event.stopImmediatePropagation();
  });
  listen(doc, 'keydown', event => { if (range(event.target)) finish(); });
  listen(doc, 'uiscalechange', finish);
  listen(doc, 'visibilitychange', () => { if (doc.hidden) finish(); });
  listen(view, 'resize', finish);
  listen(view, 'blur', event => { if (event.target === view) finish(); });
  const observer = new view.MutationObserver(() => { if (active && !valid()) finish(); });
  observer.observe(doc.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['min', 'max', 'step', 'disabled', 'hidden'] });
  return { destroy() { finish(); observer.disconnect(); cleanups.splice(0).forEach(remove => remove()); } };
}
