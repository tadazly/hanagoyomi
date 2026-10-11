import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bindWallpaperScroll } from '../src/ui/wallpaper-scroll.js';

function element(values = {}) {
  const listeners = new Map(), attributes = new Map();
  return Object.assign({ style: {}, hidden: false, listeners, attributes,
    addEventListener(type, handler) { const list = listeners.get(type) || []; list.push(handler); listeners.set(type, list); },
    setAttribute(name, value) { attributes.set(name, value); },
    contains(target) { return target === this; }, focus() {},
    getBoundingClientRect() { return { top: 10 }; },
    setPointerCapture() { throw new Error('宿主合成事件不能捕获指针'); }, releasePointerCapture() {},
  }, values);
}
function fixture() {
  const region = element(), eventTarget = element(), thumb = element();
  const viewport = element({ scrollTop: 0, clientHeight: 200, scrollHeight: 1000, parentElement: region });
  const track = element({ clientHeight: 200 });
  const refresh = bindWallpaperScroll({ viewport, track, thumb, eventTarget });
  refresh();
  const emit = (target, type, data = {}) => {
    const event = { target, button: 0, deltaMode: 0, defaultPrevented: false, stopped: false,
      preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.stopped = true; }, ...data };
    for (const handler of target.listeners.get(type) || []) handler(event);
    return event;
  };
  return { region, eventTarget, thumb, viewport, track, refresh, emit };
}

test('页面收到的滚轮直接滚动内容，像素、行、页单位均生效且不会重复触发原生滚动', () => {
  const f = fixture();
  const wheel = f.emit(f.region, 'wheel', { deltaY: 120, isTrusted: false });
  assert.equal(f.viewport.scrollTop, 120);
  assert.ok(wheel.defaultPrevented && wheel.stopped);
  f.emit(f.region, 'wheel', { deltaY: -2, deltaMode: 1 });
  assert.equal(f.viewport.scrollTop, 88);
  f.emit(f.region, 'wheel', { deltaY: 1, deltaMode: 2 });
  assert.equal(f.viewport.scrollTop, 288);
  f.emit(f.region, 'wheel', { deltaY: 9999 });
  assert.equal(f.viewport.scrollTop, 800);
  f.emit(f.region, 'wheel', { deltaY: -9999 });
  assert.equal(f.viewport.scrollTop, 0);
  assert.equal(f.emit(f.region, 'wheel', { deltaY: 100, ctrlKey: true }).defaultPrevented, false);
  assert.equal(f.viewport.scrollTop, 0);
});

test('仅有 MouseEvent 的宿主可拖动滚动条，移出轨道仍继续，松开后停止', () => {
  const f = fixture();
  f.emit(f.track, 'mousedown', { target: f.thumb, clientY: 30 });
  f.emit(f.eventTarget, 'mousemove', { clientY: 110 });
  assert.equal(f.viewport.scrollTop, 400);
  assert.equal(f.track.attributes.get('aria-valuenow'), '400');
  f.emit(f.eventTarget, 'mousemove', { clientY: 900 });
  assert.equal(f.viewport.scrollTop, 800);
  f.emit(f.eventTarget, 'mouseup');
  f.emit(f.eventTarget, 'mousemove', { clientY: 30 });
  assert.equal(f.viewport.scrollTop, 800);
});

test('点击轨道定位、向上拖动和失焦终止拖动', () => {
  const f = fixture();
  f.emit(f.track, 'mousedown', { clientY: 190 });
  assert.equal(f.viewport.scrollTop, 800);
  f.emit(f.eventTarget, 'mousemove', { clientY: 110 });
  assert.equal(f.viewport.scrollTop, 400);
  f.emit(f.eventTarget, 'blur');
  f.emit(f.eventTarget, 'mousemove', { clientY: 30 });
  assert.equal(f.viewport.scrollTop, 400);
  f.emit(f.track, 'mousedown', { button: 2, clientY: 30 });
  assert.equal(f.viewport.scrollTop, 400);
});

test('触屏拖动兼容捕获失败，忽略其他指针并在取消后停止', () => {
  const f = fixture();
  f.emit(f.track, 'pointerdown', { target: f.thumb, pointerType: 'touch', pointerId: 7, clientY: 30 });
  f.emit(f.eventTarget, 'pointermove', { pointerId: 8, clientY: 110 });
  assert.equal(f.viewport.scrollTop, 0);
  f.emit(f.eventTarget, 'pointermove', { pointerId: 7, clientY: 110 });
  assert.equal(f.viewport.scrollTop, 400);
  f.emit(f.eventTarget, 'pointercancel', { pointerId: 7 });
  f.emit(f.eventTarget, 'pointermove', { pointerId: 7, clientY: 150 });
  assert.equal(f.viewport.scrollTop, 400);
});

test('浏览器鼠标 PointerEvent 与兼容 MouseEvent 不重复启动或滚动', () => {
  const f = fixture();
  f.emit(f.track, 'pointerdown', { target: f.thumb, pointerType: 'mouse', pointerId: 1, clientY: 30 });
  f.emit(f.track, 'mousedown', { target: f.thumb, clientY: 30 });
  f.emit(f.eventTarget, 'pointermove', { pointerId: 1, clientY: 110 });
  f.emit(f.eventTarget, 'mousemove', { clientY: 110 });
  assert.equal(f.viewport.scrollTop, 400);
  f.emit(f.eventTarget, 'pointerup', { pointerId: 1 });
  f.emit(f.eventTarget, 'pointermove', { pointerId: 1, clientY: 150 });
  assert.equal(f.viewport.scrollTop, 400);
});

test('无溢出或面板隐藏时隐藏滚动条，内容增长和滚动后更新尺寸与位置', () => {
  const f = fixture();
  f.viewport.scrollHeight = 180; f.refresh();
  assert.equal(f.track.hidden, true);
  f.viewport.scrollHeight = 1000; f.refresh();
  assert.equal(f.track.hidden, false);
  assert.equal(f.thumb.style.height, '40px');
  f.viewport.scrollTop = 400; f.emit(f.viewport, 'scroll');
  assert.equal(f.thumb.style.transform, 'translateY(80px)');
  f.viewport.clientHeight = 0; f.refresh();
  assert.equal(f.track.hidden, true);
});

test('滚动条支持键盘翻页和首尾定位，事件不传播到场景操纵', () => {
  const f = fixture();
  const event = f.emit(f.track, 'keydown', { key: 'PageDown' });
  assert.equal(f.viewport.scrollTop, 200);
  assert.ok(event.defaultPrevented && event.stopped);
  f.emit(f.track, 'keydown', { key: 'ArrowUp' });
  assert.equal(f.viewport.scrollTop, 160);
  f.emit(f.track, 'keydown', { key: 'End' });
  assert.equal(f.viewport.scrollTop, 800);
  f.emit(f.track, 'keydown', { key: 'Home' });
  assert.equal(f.viewport.scrollTop, 0);
});
