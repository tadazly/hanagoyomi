import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bindDragScroll } from '../src/ui/drag-scroll.js';

class Target {
  listeners = new Map();
  addEventListener(type, callback) {
    const list = this.listeners.get(type) || new Set(); list.add(callback); this.listeners.set(type, list);
  }
  removeEventListener(type, callback) { this.listeners.get(type)?.delete(callback); }
  emit(type, values = {}) {
    const event = { type, button: 0, buttons: 1, pointerType: 'mouse', pointerId: 9, clientX: 100, clientY: 100, detail: 1,
      defaultPrevented: false, stopped: false,
      preventDefault() { this.defaultPrevented = true; }, stopImmediatePropagation() { this.stopped = true; }, ...values };
    for (const callback of [...(this.listeners.get(type) || [])]) { callback(event); if (event.stopped) break; }
    return event;
  }
  count() { return [...this.listeners.values()].reduce((sum, list) => sum + list.size, 0); }
}

function fixture(options = {}) {
  const eventTarget = new Target(), doc = new Target(), media = new Target(), frames = new Map();
  let time = 1000, nextFrame = 1, updates = 0, capture = 0, releases = 0;
  eventTarget.performance = { now: () => time };
  eventTarget.requestAnimationFrame = callback => { const id = nextFrame++; frames.set(id, callback); return id; };
  eventTarget.cancelAnimationFrame = id => frames.delete(id);
  eventTarget.matchMedia = () => media;
  media.matches = Boolean(options.reducedMotion);
  doc.hidden = false; doc.defaultView = eventTarget; eventTarget.document = doc;
  doc.getSelection = () => ({ removeAllRanges() {} });
  const viewport = new Target(), classes = new Set();
  viewport.ownerDocument = doc;
  viewport.style = { touchAction: 'auto', userSelect: 'text', webkitUserSelect: 'text' };
  viewport.classList = { add: name => classes.add(name), remove: name => classes.delete(name) };
  viewport.scrollTop = options.position || 0; viewport.scrollLeft = options.position || 0;
  viewport.scrollHeight = options.extent || 2000; viewport.clientHeight = 200;
  viewport.scrollWidth = options.extent || 2000; viewport.clientWidth = 200;
  viewport.setPointerCapture = () => capture++;
  viewport.releasePointerCapture = () => { releases++; viewport.emit('lostpointercapture', { target: viewport, pointerId: 9 }); };
  viewport.contains = target => target?.viewport === viewport;
  const node = (ignored = false) => ({ viewport, closest: selector => ignored && selector ? {} : null });
  const button = node(), label = node();
  const binding = bindDragScroll({ viewport, axis: options.axis, eventTarget, onScroll: () => updates++, ...(options.ignoreSelector ? { ignoreSelector: options.ignoreSelector } : {}) });
  return {
    viewport, eventTarget, doc, media, frames, classes, button, label, node, binding,
    get updates() { return updates; }, get capture() { return capture; }, get releases() { return releases; },
    advance(ms) { time += ms; },
    frame(ms = 16) { time += ms; const queued = [...frames.values()]; frames.clear(); queued.forEach(callback => callback(time)); },
    down(values = {}) { return viewport.emit('pointerdown', { target: button, ...values }); },
    move(values = {}) { return eventTarget.emit('pointermove', { target: button, ...values }); },
    up(values = {}) { return eventTarget.emit('pointerup', { target: button, buttons: 0, ...values }); },
    click(values = {}) { return eventTarget.emit('click', { target: button, ...values }); },
  };
}

test('按钮与标签可起拖，超过5px才捕获；坐标与滚动更新按rAF合并', () => {
  const f = fixture();
  f.down({ target: f.label });
  assert.equal(f.move({ clientY: 95 }).defaultPrevented, false);
  assert.equal(f.capture, 0); assert.equal(f.frames.size, 0);
  assert.equal(f.move({ clientY: 90 }).defaultPrevented, true);
  f.move({ clientY: 70 }); f.move({ clientY: 60 });
  assert.equal(f.capture, 1); assert.equal(f.viewport.scrollTop, 0); assert.equal(f.frames.size, 1);
  assert.equal(f.viewport.style.userSelect, 'none'); assert.ok(f.classes.has('is-dragging'));
  f.frame(); assert.equal(f.viewport.scrollTop, 40); assert.equal(f.updates, 1);
  f.up({ clientY: 60 });
  assert.equal(f.releases, 1); assert.equal(f.viewport.style.userSelect, 'text'); assert.equal(f.viewport.style.webkitUserSelect, 'text');
  assert.equal(f.classes.has('is-dragging'), false);
  assert.equal(f.click().defaultPrevented, true);
  f.binding.destroy();
});

test('小位移保持点击语义，下一次明确点击不被旧拖动抑制吞掉', () => {
  const f = fixture();
  f.down(); f.move({ clientY: 97 }); f.up({ clientY: 97 });
  assert.equal(f.click().defaultPrevented, false);
  f.down(); f.move({ clientY: 70 }); f.frame(); f.up({ clientY: 70 });
  assert.ok(f.frames.size > 0);
  // 不先发送拖动生成的兼容 click，直接开始新的真实点击。
  f.down(); assert.equal(f.frames.size, 0); f.up();
  assert.equal(f.click().defaultPrevented, false);
  f.binding.destroy();
});

test('PointerEvent及其兼容MouseEvent只驱动一次；仅MouseEvent宿主也能拖动', () => {
  const f = fixture();
  f.down(); f.viewport.emit('mousedown', { target: f.button, clientY: 80 });
  f.move({ clientY: 70 }); f.eventTarget.emit('mousemove', { target: f.button, clientY: 50 });
  f.frame(); assert.equal(f.viewport.scrollTop, 30); assert.equal(f.updates, 1);
  f.up({ clientY: 70 }); f.eventTarget.emit('mouseup', { target: f.button, clientY: 50 });
  f.binding.cancel();
  f.viewport.emit('mousedown', { target: f.label, clientY: 100 });
  f.eventTarget.emit('mousemove', { target: f.label, clientY: 50 });
  f.frame(); assert.equal(f.viewport.scrollTop, 80);
  f.eventTarget.emit('mouseup', { target: f.label, clientY: 50 });
  assert.equal(f.click({ target: f.label }).defaultPrevented, true);
  f.binding.destroy();
});

test('输入、范围、搜索及显式ignore目标保留操作；新输入点击也清除旧抑制', () => {
  const f = fixture(), input = f.node(true);
  f.down({ target: input }); f.move({ target: input, clientY: 20 }); f.up({ target: input, clientY: 20 });
  assert.equal(f.capture, 0); assert.equal(f.viewport.scrollTop, 0); assert.equal(f.frames.size, 0);
  f.down(); f.move({ clientY: 60 }); f.frame(); f.up({ clientY: 60 });
  f.down({ target: input }); f.up({ target: input });
  assert.equal(f.click({ target: input }).defaultPrevented, false);
  f.binding.destroy();
});

test('触屏使用原生pan，兼容触屏的MouseEvent不重复驱动', () => {
  const f = fixture();
  assert.equal(f.viewport.style.touchAction, 'pan-y');
  f.down({ pointerType: 'touch' });
  assert.equal(f.move({ pointerType: 'touch', clientY: 0 }).defaultPrevented, false);
  f.up({ pointerType: 'touch', clientY: 0 });
  f.viewport.emit('mousedown', { target: f.button }); f.eventTarget.emit('mousemove', { target: f.button, clientY: 0 });
  assert.equal(f.viewport.scrollTop, 0); assert.equal(f.frames.size, 0); assert.equal(f.capture, 0);
  f.binding.destroy(); assert.equal(f.viewport.style.touchAction, 'auto');
});

test('横向拖动识别主方向，垂直手势不被抢占', () => {
  const f = fixture({ axis: 'x' });
  assert.equal(f.viewport.style.touchAction, 'pan-x');
  f.down(); assert.equal(f.move({ clientX: 98, clientY: 70 }).defaultPrevented, false);
  assert.equal(f.frames.size, 0);
  f.down(); f.move({ clientX: 55, clientY: 99 }); f.frame();
  assert.equal(f.viewport.scrollLeft, 45); assert.equal(f.viewport.scrollTop, 0);
  f.up({ clientX: 55, clientY: 99 }); f.binding.destroy();
});

test('快速释放后平滑惯性继续，最终停止且不越过边界', () => {
  const f = fixture({ position: 100 });
  f.down(); f.move({ clientY: 40 }); f.frame(); f.up({ clientY: 40 });
  const released = f.viewport.scrollTop;
  assert.ok(f.frames.size > 0); f.frame(); assert.ok(f.viewport.scrollTop > released);
  let count = 0;
  while (f.frames.size && count++ < 200) f.frame();
  assert.equal(f.frames.size, 0); assert.ok(count < 200);
  assert.ok(f.viewport.scrollTop <= 1800); f.binding.destroy();
});

test('停住超过150ms再松开没有旧速度惯性，reduced-motion不启动惯性', () => {
  const stopped = fixture(); stopped.down(); stopped.move({ clientY: 20 }); stopped.frame();
  stopped.advance(200); stopped.up({ clientY: 20 });
  assert.equal(stopped.frames.size, 0); stopped.binding.destroy();
  const reduced = fixture({ reducedMotion: true });
  reduced.down(); reduced.move({ clientY: 20 }); reduced.frame(); reduced.up({ clientY: 20 });
  assert.equal(reduced.viewport.scrollTop, 80); assert.equal(reduced.frames.size, 0); reduced.binding.destroy();
});

test('拖动和惯性均在边界停止，无滚动内容时不捕获按钮', () => {
  const f = fixture({ extent: 300, position: 95 });
  f.down(); f.move({ clientY: 0 }); f.frame(); f.up({ clientY: 0 });
  assert.equal(f.viewport.scrollTop, 100); assert.equal(f.frames.size, 0); f.binding.destroy();
  const empty = fixture({ extent: 200 }); empty.down(); empty.move({ clientY: 0 }); empty.up({ clientY: 0 });
  assert.equal(empty.capture, 0); assert.equal(empty.click().defaultPrevented, false); empty.binding.destroy();
});

test('cancel、失焦、页面隐藏、pointercancel及destroy完整清理动画与样式', () => {
  for (const ending of ['cancel', 'blur', 'hidden', 'pointercancel', 'destroy']) {
    const f = fixture(); f.down(); f.move({ clientY: 20 });
    assert.equal(f.frames.size, 1);
    if (ending === 'cancel') f.binding.cancel();
    if (ending === 'blur') f.eventTarget.emit('blur');
    if (ending === 'hidden') { f.doc.hidden = true; f.doc.emit('visibilitychange'); }
    if (ending === 'pointercancel') f.eventTarget.emit('pointercancel');
    if (ending === 'destroy') f.binding.destroy();
    assert.equal(f.frames.size, 0, ending); assert.equal(f.classes.has('is-dragging'), false, ending);
    assert.equal(f.viewport.style.userSelect, 'text', ending); assert.equal(f.releases, 1, ending);
    f.binding.destroy(); f.binding.destroy();
    assert.equal(f.viewport.count(), 0); assert.equal(f.eventTarget.count(), 0); assert.equal(f.doc.count(), 0); assert.equal(f.media.count(), 0);
  }
});

test('媒体偏好切为减少动态时停止已有惯性，键盘click不被鼠标拖动抑制', () => {
  const f = fixture(); f.down(); f.move({ clientY: 20 }); f.frame(); f.up({ clientY: 20 });
  assert.ok(f.frames.size); assert.equal(f.click({ detail: 0 }).defaultPrevented, false);
  f.media.matches = true; f.media.emit('change'); assert.equal(f.frames.size, 0);
  f.binding.destroy();
});

test('滚动区外的新鼠标按下也停止惯性并清除旧click抑制', () => {
  const f = fixture(); f.down(); f.move({ clientY: 20 }); f.frame(); f.up({ clientY: 20 });
  assert.ok(f.frames.size);
  f.eventTarget.emit('pointerdown', { target: {} });
  assert.equal(f.frames.size, 0); assert.equal(f.click().defaultPrevented, false);
  f.binding.destroy();
});

test('反向wheel先停止旧惯性，不取消原生或宿主滚轮的默认与传播', () => {
  const f = fixture({ position: 200 }); f.down(); f.move({ clientY: 20 }); f.frame(); f.up({ clientY: 20 });
  assert.ok(f.frames.size);
  const wheel = f.viewport.emit('wheel', { target: f.button, deltaY: -60 });
  assert.equal(wheel.defaultPrevented, false); assert.equal(wheel.stopped, false); assert.equal(f.frames.size, 0);
  // 模拟捕获阶段之后的原生默认滚动或父级 Wallpaper Engine wheel 接管。
  f.viewport.scrollTop -= 60; const scrolled = f.viewport.scrollTop;
  f.frame(); assert.equal(f.viewport.scrollTop, scrolled);
  f.binding.destroy();
});

test('意外失去pointer capture取消手势；正常释放保留click抑制和惯性', () => {
  const lost = fixture(); lost.down(); lost.move({ clientY: 20 });
  lost.viewport.emit('lostpointercapture', { target: lost.viewport, pointerId: 100 });
  assert.ok(lost.frames.size);
  lost.viewport.emit('lostpointercapture', { target: lost.viewport, pointerId: 9 });
  assert.equal(lost.frames.size, 0); assert.equal(lost.classes.has('is-dragging'), false);
  assert.equal(lost.viewport.style.userSelect, 'text'); assert.equal(lost.click().defaultPrevented, true);
  lost.down(); lost.up(); assert.equal(lost.click().defaultPrevented, false); lost.binding.destroy();
  const normal = fixture(); normal.down(); normal.move({ clientY: 20 }); normal.frame(); normal.up({ clientY: 20 });
  // fixture的releasePointerCapture同步发lost事件；再模拟延迟到达的一次事件。
  normal.viewport.emit('lostpointercapture', { target: normal.viewport, pointerId: 9 });
  assert.ok(normal.frames.size); assert.equal(normal.click().defaultPrevented, true);
  normal.frame(); assert.ok(normal.viewport.scrollTop > 80); normal.binding.destroy();
});
