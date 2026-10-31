const TAP_MS = 320, TAP_SLOP = 14, CLICK_SLOP = 24;

// 触屏与鼠标共享摇杆幅度、死区和横向滑动时的高度锁定。
export function flightStickAxes(stick, width, height) {
  if (!stick.active) return { x: 0, y: 0 };
  const radius = Math.max(40, Math.min(width, height) * 0.22);
  const axis = value => {
    const v = Math.max(-1, Math.min(1, value / radius));
    return Math.sign(v) * Math.max(0, Math.abs(v) - 0.08) / 0.92;
  };
  const x = axis(stick.x - stick.ox);
  let y = axis(stick.y - stick.oy);
  if (Math.abs(y) < Math.abs(x) * 0.6) y = 0;
  return { x, y };
}

export function bindMouseFlightInput({ canvas, isFlying, isEnabled = () => true, followsMouse = () => false, look }) {
  const stick = { active: false, ox: 0, oy: 0, x: 0, y: 0 };
  let press = null;
  const reset = () => {
    const id = press?.id;
    press = null; stick.active = false;
    if (id !== undefined) { try { canvas.releasePointerCapture(id); } catch {} }
    canvas.classList.remove('dragging');
  };
  canvas.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'mouse') return;
    if (e.button !== 0) return;
    if (!isEnabled() || press || e.buttons !== 1) { reset(); return; }
    e.preventDefault();
    canvas.focus?.({ preventScroll: true });
    press = { id: e.pointerId, button: e.button, x: e.clientX, y: e.clientY,
      lastX: e.clientX, lastY: e.clientY, moved: false };
    try { canvas.setPointerCapture(e.pointerId); } catch {}
  });
  canvas.addEventListener('pointermove', e => {
    if (e.pointerType !== 'mouse') return;
    if (!isEnabled()) { reset(); return; }
    if (press && e.pointerId === press.id) {
      const dx = e.clientX - press.lastX, dy = e.clientY - press.lastY;
      const wasMoved = press.moved;
      press.lastX = e.clientX; press.lastY = e.clientY;
      if (Math.hypot(e.clientX - press.x, e.clientY - press.y) > TAP_SLOP) {
        press.moved = true;
      }
      if (press.button === 0 && press.moved && !isFlying()) {
        canvas.classList.add('dragging');
        look(wasMoved ? dx : e.clientX - press.x, wasMoved ? dy : e.clientY - press.y);
      }
    }
    // 鼠标按住时沿用原有操纵；开关仅限制未按键时的跟随。
    if (!isFlying() || (!followsMouse() && (!press || press.id !== e.pointerId))) { stick.active = false; return; }
    const rect = canvas.getBoundingClientRect();
    // 画面中心回中；鼠标悬停在设置、工具栏等界面上时停止操纵。
    stick.active = true;
    stick.ox = rect.left + rect.width / 2; stick.oy = rect.top + rect.height / 2;
    stick.x = e.clientX; stick.y = e.clientY;
  });
  canvas.addEventListener('pointerup', e => {
    if (e.pointerType !== 'mouse' || !press || e.pointerId !== press.id || e.button !== press.button) return;
    const id = press.id; press = null; canvas.classList.remove('dragging');
    if (!followsMouse()) stick.active = false;
    try { canvas.releasePointerCapture(id); } catch {}
  });
  canvas.addEventListener('pointerleave', e => {
    if (e.pointerType === 'mouse') stick.active = false;
  });
  canvas.addEventListener('pointercancel', e => { if (e.pointerType === 'mouse') reset(); });
  canvas.addEventListener('lostpointercapture', e => { if (press?.id === e.pointerId) reset(); });
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  return { stick, reset };
}

export function bindTouchFlightInput({ canvas, isEnabled = () => true, onStart = () => {}, dash, toggleFlight,
  eventTarget = globalThis.window, now = () => performance.now(), schedule = setTimeout, cancel = clearTimeout }) {
  const touches = new Map(), stick = { active: false, id: -1, ox: 0, oy: 0, x: 0, y: 0 };
  let gesture = null, taps = null, dashTimer = null;
  const eventTime = event => Number.isFinite(event.timeStamp) ? event.timeStamp : now();
  const clearTaps = () => { if (dashTimer !== null) cancel(dashTimer); dashTimer = null; taps = null; };
  const reset = () => {
    const ids = [...touches.keys()]; touches.clear(); stick.active = false; gesture = null; clearTaps();
    for (const id of ids) { try { canvas.releasePointerCapture(id); } catch {} }
  };
  canvas.addEventListener('pointerdown', event => {
    if (event.pointerType === 'mouse') return;
    if (!isEnabled()) { reset(); return; }
    event.preventDefault(); canvas.focus?.({ preventScroll: true }); onStart();
    if (taps && (eventTime(event) - taps.t >= TAP_MS || Math.hypot(event.clientX - taps.x, event.clientY - taps.y) > CLICK_SLOP)) clearTaps();
    if (dashTimer !== null) { cancel(dashTimer); dashTimer = null; }
    touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
    gesture ||= { t: eventTime(event), maxN: 0, moved: false };
    gesture.maxN = Math.max(gesture.maxN, touches.size);
    if (touches.size === 1) Object.assign(stick, { active: true, id: event.pointerId, ox: event.clientX, oy: event.clientY, x: event.clientX, y: event.clientY });
    else { stick.active = false; clearTaps(); }
    try { canvas.setPointerCapture(event.pointerId); } catch {}
  });
  canvas.addEventListener('pointermove', event => {
    const start = touches.get(event.pointerId);
    if (!start) return;
    if (!isEnabled()) { reset(); return; }
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > TAP_SLOP) { gesture.moved = true; clearTaps(); }
    if (stick.active && stick.id === event.pointerId) { stick.x = event.clientX; stick.y = event.clientY; }
  });
  canvas.addEventListener('pointerup', event => {
    const start = touches.get(event.pointerId);
    if (!start) return;
    touches.delete(event.pointerId); if (stick.id === event.pointerId) stick.active = false;
    try { canvas.releasePointerCapture(event.pointerId); } catch {}
    if (touches.size || !gesture) return;
    const quick = eventTime(event) - gesture.t < 300 && !gesture.moved && gesture.maxN === 1
      && Math.hypot(event.clientX - start.x, event.clientY - start.y) <= TAP_SLOP;
    gesture = null;
    if (!isEnabled() || !quick) { clearTaps(); return; }
    taps = { n: (taps?.n || 0) + 1, t: eventTime(event), x: event.clientX, y: event.clientY };
    if (taps.n === 3) { clearTaps(); toggleFlight(); }
    else if (taps.n === 2) dashTimer = schedule(() => { clearTaps(); if (isEnabled()) dash(); }, TAP_MS);
  });
  canvas.addEventListener('pointercancel', event => { if (touches.has(event.pointerId)) reset(); });
  canvas.addEventListener('lostpointercapture', event => { if (touches.has(event.pointerId)) reset(); });
  eventTarget?.addEventListener('blur', reset);
  eventTarget?.addEventListener('pointerdown', event => { if (event.target !== canvas) reset(); }, true);
  return { stick, reset };
}
