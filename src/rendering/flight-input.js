const TAP_MS = 400, TAP_SLOP = 14, CLICK_SLOP = 24;

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

export function bindMouseFlightInput({ canvas, isFlying, isEnabled = () => true, look, dash, turn, toggleFlight,
  now = () => performance.now(), schedule = setTimeout, cancel = clearTimeout }) {
  const stick = { active: false, ox: 0, oy: 0, x: 0, y: 0 };
  let press = null, clicks = null, turnTimer = null;
  const clearClicks = () => {
    if (turnTimer !== null) cancel(turnTimer);
    turnTimer = null; clicks = null;
  };
  const reset = () => {
    press = null; clearClicks(); stick.active = false;
    canvas.classList.remove('dragging');
  };
  // 使用原始事件时间，避免渲染繁忙、事件排队改变点击间隔。
  const eventTime = e => Number.isFinite(e.timeStamp) ? e.timeStamp : now();
  const compatible = e => clicks && clicks.button === e.button && eventTime(e) - clicks.t < TAP_MS
    && Math.hypot(e.clientX - clicks.x, e.clientY - clicks.y) <= CLICK_SLOP;
  canvas.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'mouse') return;
    if (![0, 2].includes(e.button)) { clearClicks(); return; }
    if (!isEnabled() || press || e.buttons !== (e.button === 0 ? 1 : 2)) { reset(); return; }
    e.preventDefault();
    if (!compatible(e)) {
      // 双击之后改按其他键或换位置，已完成的掉头仍然有效。
      const pendingTurn = turnTimer !== null;
      clearClicks();
      if (pendingTurn) turn();
    } else if (turnTimer !== null) {
      // 第三击按下就取消待执行的掉头，避免长按第三击时提前掉头。
      cancel(turnTimer); turnTimer = null;
    }
    press = { id: e.pointerId, button: e.button, x: e.clientX, y: e.clientY,
      lastX: e.clientX, lastY: e.clientY, t: eventTime(e), moved: false };
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
        press.moved = true; clearClicks();
      }
      if (press.button === 0 && press.moved && !isFlying()) {
        canvas.classList.add('dragging');
        look(wasMoved ? dx : e.clientX - press.x, wasMoved ? dy : e.clientY - press.y);
      }
    }
    if (!isFlying()) { stick.active = false; return; }
    const rect = canvas.getBoundingClientRect();
    // 画面中心回中；鼠标悬停在设置、工具栏等界面上时停止操纵。
    stick.active = true;
    stick.ox = rect.left + rect.width / 2; stick.oy = rect.top + rect.height / 2;
    stick.x = e.clientX; stick.y = e.clientY;
  });
  canvas.addEventListener('pointerup', e => {
    if (e.pointerType !== 'mouse' || !press || e.pointerId !== press.id || e.button !== press.button) return;
    const p = press; press = null; canvas.classList.remove('dragging');
    if (!isEnabled() || p.moved || eventTime(e) - p.t >= 300
      || Math.hypot(e.clientX - p.x, e.clientY - p.y) > TAP_SLOP) { clearClicks(); return; }
    const n = compatible(e) ? clicks.n + 1 : 1;
    clicks = { button: e.button, n, t: eventTime(e), x: e.clientX, y: e.clientY };
    if (e.button === 0 && n === 2) { clearClicks(); dash(); }
    else if (e.button === 2 && n === 3) { clearClicks(); toggleFlight(); }
    else if (e.button === 2 && n === 2) {
      turnTimer = schedule(() => { turnTimer = null; clicks = null; turn(); }, TAP_MS);
    }
  });
  canvas.addEventListener('pointerleave', e => {
    if (e.pointerType === 'mouse') stick.active = false;
  });
  canvas.addEventListener('pointercancel', e => { if (e.pointerType === 'mouse') reset(); });
  canvas.addEventListener('lostpointercapture', e => { if (press?.id === e.pointerId) reset(); });
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  return { stick, reset };
}
