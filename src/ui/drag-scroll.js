const DEFAULT_IGNORE = 'input,textarea,select,a,[contenteditable="true"],.ctl,.search-field,[data-no-drag-scroll]';

// 鼠标拖动内容；触屏仍由浏览器按 pan-x / pan-y 原生滚动。
export function bindDragScroll({ viewport, axis = 'y', eventTarget = globalThis.window, onScroll = () => {}, ignoreSelector = DEFAULT_IGNORE }) {
  if (!viewport || !eventTarget) throw new TypeError('拖动滚动需要 viewport 与 eventTarget');
  const horizontal = axis === 'x', positionKey = horizontal ? 'scrollLeft' : 'scrollTop';
  const extentKey = horizontal ? 'scrollWidth' : 'scrollHeight', clientKey = horizontal ? 'clientWidth' : 'clientHeight';
  const coordinate = event => Number(horizontal ? event.clientX : event.clientY) || 0;
  const crossCoordinate = event => Number(horizontal ? event.clientY : event.clientX) || 0;
  const doc = viewport.ownerDocument || eventTarget.document;
  const view = doc?.defaultView || eventTarget;
  const now = () => view.performance?.now?.() ?? globalThis.performance?.now?.() ?? Date.now();
  const requestFrame = view.requestAnimationFrame?.bind(view) || (callback => setTimeout(() => callback(now()), 16));
  const cancelFrame = view.cancelAnimationFrame?.bind(view) || clearTimeout;
  const reducedMotion = view.matchMedia?.('(prefers-reduced-motion: reduce)');
  const previousTouchAction = viewport.style.touchAction;
  viewport.style.touchAction = horizontal ? 'pan-x' : 'pan-y';
  let gesture = null, frame = 0, velocity = 0, inertiaAt = 0, inertiaStarted = 0, suppression = null, destroyed = false;
  let nonMouseUntil = 0;
  const cleanups = [];
  const listen = (target, type, listener, options) => {
    target?.addEventListener?.(type, listener, options);
    cleanups.push(() => target?.removeEventListener?.(type, listener, options));
  };
  const limit = () => Math.max(0, (Number(viewport[extentKey]) || 0) - (Number(viewport[clientKey]) || 0));
  const position = () => Number(viewport[positionKey]) || 0;
  function scrollTo(value) {
    const before = position();
    viewport[positionKey] = Math.max(0, Math.min(limit(), value));
    const after = position();
    if (after !== before) onScroll();
    return after;
  }
  const schedule = () => { if (!frame && !destroyed) frame = requestFrame(animate); };
  function stopMotion() {
    if (frame) cancelFrame(frame);
    frame = 0; velocity = 0;
  }
  function releaseGesture() {
    const current = gesture; gesture = null;
    if (!current) return;
    if (current.dragging) {
      viewport.classList.remove('is-dragging');
      viewport.style.userSelect = current.userSelect;
      viewport.style.webkitUserSelect = current.webkitUserSelect;
    }
    if (current.captured) { try { viewport.releasePointerCapture(current.pointerId); } catch {} }
  }
  function cancel() {
    stopMotion(); releaseGesture(); suppression = null;
  }
  function applyDrag(time) {
    const current = gesture;
    if (!current?.dragging || !current.pending) return;
    current.pending = false;
    const before = position(), desired = current.startScroll - (current.latest - current.start);
    const actual = scrollTo(desired), elapsed = Math.max(1, time - current.sampleAt);
    const sample = Math.max(-3, Math.min(3, (actual - current.sampleScroll) / elapsed));
    current.velocity += (sample - current.velocity) * (1 - Math.exp(-elapsed / 40));
    if (actual === before && (desired <= 0 || desired >= limit())) current.velocity = 0;
    current.sampleAt = time; current.sampleScroll = actual;
  }
  function animate(time) {
    frame = 0;
    if (destroyed) return;
    if (gesture?.dragging) { applyDrag(time); return; }
    if (!velocity) return;
    if (reducedMotion?.matches || doc?.hidden || time - inertiaStarted > 1800) { velocity = 0; return; }
    const elapsed = Math.max(1, Math.min(64, time - inertiaAt)); inertiaAt = time;
    const decay = Math.exp(-elapsed / 240), desired = position() + velocity * 240 * (1 - decay);
    const actual = scrollTo(desired);
    velocity *= decay;
    if (Math.abs(velocity) < .02 || (actual <= 0 && velocity < 0) || (actual >= limit() && velocity > 0)) velocity = 0;
    if (velocity) schedule();
  }
  function down(event, source) {
    // PointerEvent 之后的兼容 mousedown 属于同一手势，不能取消它或重复绑定。
    if (source === 'mouse' && gesture?.source === 'pointer') return;
    cancel(); // 新的明确点击先清除上一次拖动的 click 抑制与惯性。
    if (source === 'pointer' && event.pointerType !== 'mouse') { nonMouseUntil = now() + 800; return; }
    if (source === 'mouse' && (event.sourceCapabilities?.firesTouchEvents || now() < nonMouseUntil)) return;
    if (event.button !== undefined && event.button !== 0) return;
    if (event.target?.closest?.(ignoreSelector) || limit() <= 0) return;
    gesture = { source, pointerId: event.pointerId, start: coordinate(event), cross: crossCoordinate(event), latest: coordinate(event),
      startScroll: position(), sampleScroll: position(), sampleAt: now(), lastMoveAt: now(), velocity: 0, pending: false, dragging: false, captured: false };
  }
  function move(event, source) {
    const current = gesture;
    if (!current || current.source !== source || (source === 'pointer' && event.pointerId !== current.pointerId)) return;
    const primary = Math.abs(coordinate(event) - current.start), cross = Math.abs(crossCoordinate(event) - current.cross);
    if (!current.dragging) {
      if (cross > 5 && cross > primary * 1.2) { releaseGesture(); return; }
      if (primary <= 5 || primary < cross) return;
      current.dragging = true; current.userSelect = viewport.style.userSelect; current.webkitUserSelect = viewport.style.webkitUserSelect;
      viewport.style.userSelect = 'none'; viewport.style.webkitUserSelect = 'none'; viewport.classList.add('is-dragging');
      try { doc?.getSelection?.()?.removeAllRanges(); } catch {}
      if (source === 'pointer') { try { viewport.setPointerCapture(current.pointerId); current.captured = true; } catch {} }
    }
    event.preventDefault(); current.latest = coordinate(event); current.lastMoveAt = now(); current.pending = true; schedule();
  }
  function up(event, source) {
    const current = gesture;
    if (!current || current.source !== source || (source === 'pointer' && event.pointerId !== current.pointerId)) return;
    if (!current.dragging) { releaseGesture(); return; }
    const releasedAt = now(), idle = Math.max(0, releasedAt - current.lastMoveAt);
    current.latest = coordinate(event); current.pending = true; applyDrag(releasedAt);
    // 手停住再松开不能继续使用旧速度；快速释放时平滑减弱事件与帧之间的间隔。
    const speed = idle > 150 ? 0 : current.velocity * Math.exp(-idle / 80);
    suppression = { until: now() + 500 };
    stopMotion(); releaseGesture();
    if (!reducedMotion?.matches && !doc?.hidden && Math.abs(speed) >= .02
      && !(position() <= 0 && speed < 0) && !(position() >= limit() && speed > 0)) {
      velocity = speed; inertiaAt = inertiaStarted = now(); schedule();
    }
  }
  const pointerDown = event => down(event, 'pointer'), mouseDown = event => down(event, 'mouse');
  const pointerMove = event => move(event, 'pointer'), mouseMove = event => move(event, 'mouse');
  const pointerUp = event => up(event, 'pointer'), mouseUp = event => up(event, 'mouse');
  // 点到滚动区域外的关闭按钮、轨道等也应立即停止惯性；兼容 mousedown 不算新输入。
  listen(eventTarget, 'pointerdown', () => cancel(), true);
  listen(eventTarget, 'mousedown', () => { if (gesture?.source !== 'pointer') cancel(); }, true);
  listen(viewport, 'pointerdown', pointerDown);
  listen(viewport, 'mousedown', mouseDown);
  // 先停止旧惯性，再让原生或宿主的 wheel 处理器更新位置；不取消滚轮事件。
  listen(viewport, 'wheel', cancel, { capture: true, passive: true });
  listen(viewport, 'dragstart', event => { if (gesture && !event.target?.closest?.(ignoreSelector)) event.preventDefault(); });
  listen(viewport, 'lostpointercapture', event => {
    if (!gesture?.captured || event.pointerId !== gesture.pointerId) return;
    const dragging = gesture.dragging;
    cancel();
    if (dragging) suppression = { until: now() + 500 };
    // 正常 releaseGesture 会先清空 gesture；其 lostpointercapture 不会走到这里。
  });
  listen(eventTarget, 'pointermove', pointerMove, { passive: false });
  listen(eventTarget, 'mousemove', mouseMove, { passive: false });
  listen(eventTarget, 'pointerup', pointerUp);
  listen(eventTarget, 'mouseup', mouseUp);
  listen(eventTarget, 'pointercancel', cancel);
  listen(eventTarget, 'blur', cancel);
  listen(doc, 'visibilitychange', () => { if (doc.hidden) cancel(); });
  listen(reducedMotion, 'change', () => { if (reducedMotion.matches) stopMotion(); });
  listen(eventTarget, 'click', event => {
    if (!suppression || event.detail === 0) return;
    if (now() > suppression.until) { suppression = null; return; }
    if (event.target !== viewport && !viewport.contains?.(event.target)) return;
    suppression = null; event.preventDefault(); event.stopImmediatePropagation();
  }, true);
  return {
    cancel,
    destroy() {
      if (destroyed) return;
      cancel(); destroyed = true; cleanups.splice(0).forEach(remove => remove());
      viewport.style.touchAction = previousTouchAction;
    },
  };
}
