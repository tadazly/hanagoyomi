import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bindGallerySwipe } from '../src/ui/gallery-swipe.js';

function surface(values = {}) {
  const listeners = new Map(), attributes = new Map(), classes = new Set();
  return Object.assign({ style: {}, hidden: false, listeners, attributes,
    classList: { add: name => classes.add(name), remove: name => classes.delete(name) },
    addEventListener(type, handler) { const all = listeners.get(type) || []; all.push(handler); listeners.set(type, all); },
    setAttribute(name, value) { attributes.set(name, String(value)); },
    getAttribute(name) { return attributes.get(name) ?? null; },
    contains(target) { return target === this || target?.parent === this; }, focus() {},
    getBoundingClientRect() { return { left: 10 }; },
    setPointerCapture() {}, releasePointerCapture() {},
  }, values);
}
function gallery() {
  const viewport = surface({ id: 'exhibit', scrollLeft: 0, clientWidth: 300, scrollWidth: 1200 });
  const frames = new Map(); let frameId = 0, clock = 0;
  const track = surface({ clientWidth: 300 }), thumb = surface(), eventTarget = surface({
    performance: { now: () => clock }, requestAnimationFrame(callback) { frames.set(++frameId, callback); return frameId; },
    cancelAnimationFrame(id) { frames.delete(id); },
  });
  const refresh = bindGallerySwipe({ viewport, track, thumb, eventTarget });
  const emit = (target, type, values = {}) => {
    const event = { type, target, button: 0, clientX: 0, detail: 1, prevented: false, stopped: false,
      preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; }, stopImmediatePropagation() { this.stopped = true; }, ...values };
    if (type === 'click' && target !== eventTarget) {
      for (const handler of eventTarget.listeners.get(type) || []) { handler(event); if (event.stopped) return event; }
    }
    for (const handler of target.listeners.get(type) || []) { handler(event); if (event.stopped) break; }
    return event;
  };
  const flush = (elapsed = 16) => { clock += elapsed; const pending = [...frames.values()]; frames.clear(); for (const callback of pending) callback(clock); };
  return { viewport, track, thumb, eventTarget, refresh, emit, flush, frames };
}

test('共享内容拖动推进展架与ARIA，抑制拖后卡片点击，轨道操作取消已有惯性', () => {
  const g = gallery(), card = { parent: null };
  card.parent = g.viewport;
  g.emit(g.viewport, 'pointerdown', { target: card, pointerType: 'mouse', pointerId: 1, clientX: 220 });
  g.emit(g.viewport, 'mousedown', { target: card, clientX: 220 });
  g.emit(g.eventTarget, 'pointermove', { pointerId: 1, clientX: 160 }); g.flush();
  assert.equal(g.viewport.scrollLeft, 60);
  assert.equal(g.track.getAttribute('aria-valuenow'), '60');
  g.emit(g.eventTarget, 'pointerup', { pointerId: 1, clientX: 150 });
  assert.ok(g.emit(g.viewport, 'click', { target: card }).prevented);
  assert.ok(g.frames.size > 0, '松手后启动共享惯性');
  g.emit(g.track, 'mousedown', { target: g.thumb, clientX: 100 });
  assert.equal(g.frames.size, 0, '操作滑块取消内容惯性');
  g.emit(g.eventTarget, 'mouseup');
  const before = g.viewport.scrollLeft; g.flush(500);
  assert.equal(g.viewport.scrollLeft, before);
  g.emit(g.viewport, 'mousedown', { target: card, clientX: 100 });
  g.emit(g.eventTarget, 'mouseup', { clientX: 100 });
  assert.equal(g.emit(g.viewport, 'click', { target: card }).prevented, false);
  g.refresh.cancel();
});





test('轨道点击和滑块拖动可精确定位至两端，忽略其他指针', () => {
  const g = gallery();
  g.emit(g.track, 'mousedown', { clientX: 1000 });
  assert.equal(g.viewport.scrollLeft, 900);
  g.emit(g.eventTarget, 'mouseup');
  g.emit(g.track, 'pointerdown', { target: g.thumb, pointerType: 'mouse', pointerId: 8, clientX: 250 });
  g.emit(g.eventTarget, 'pointermove', { pointerId: 9, clientX: 100 });
  assert.equal(g.viewport.scrollLeft, 900);
  g.emit(g.eventTarget, 'pointermove', { pointerId: 8, clientX: 100 });
  assert.equal(g.viewport.scrollLeft, 300);
  g.emit(g.eventTarget, 'pointerup', { pointerId: 8 });
  g.emit(g.track, 'mousedown', { clientX: -100 });
  assert.equal(g.viewport.scrollLeft, 0);
  assert.equal(g.track.getAttribute('aria-valuenow'), '0');
});

test('分类变化后的 refresh 更新尺寸和可访问状态，隐藏不重复写入，图片原生拖拽被阻止', () => {
  const g = gallery();
  assert.equal(g.track.getAttribute('role'), 'scrollbar');
  assert.equal(g.track.getAttribute('aria-orientation'), 'horizontal');
  assert.equal(g.track.getAttribute('aria-controls'), 'exhibit');
  assert.equal(g.thumb.style.width, '75px');
  assert.equal(g.thumb.style.transform, 'translateX(0px)');
  let hidden = false, writes = 0;
  Object.defineProperty(g.track, 'hidden', { get: () => hidden, set(value) { hidden = value; writes++; } });
  g.viewport.scrollWidth = 200;
  g.refresh(); g.refresh();
  assert.equal(hidden, true); assert.equal(writes, 1);
  g.viewport.scrollWidth = 1500; g.refresh();
  assert.equal(hidden, false); assert.equal(writes, 2);
  assert.equal(g.thumb.style.width, '60px');
  assert.equal(g.track.getAttribute('aria-valuemax'), '1200');
  assert.equal(g.emit(g.viewport, 'dragstart', { target: { tagName: 'IMG' } }).prevented, true);
});


test('触屏滑块可细调，取消后停止；展架由隐藏恢复时滑块首帧取得真实宽度', () => {
  const g = gallery();
  Object.defineProperty(g.track, 'clientWidth', { get() { return g.track.hidden ? 0 : 300; } });
  g.viewport.clientWidth = 0; g.refresh();
  assert.equal(g.track.hidden, true);
  g.viewport.clientWidth = 300; g.refresh();
  assert.equal(g.track.hidden, false);
  assert.equal(g.thumb.style.width, '75px');
  const down = g.emit(g.track, 'pointerdown', { target: g.thumb, pointerType: 'touch', pointerId: 4, clientX: 100 });
  const move = g.emit(g.eventTarget, 'pointermove', { pointerId: 4, clientX: 102 });
  assert.ok(down.prevented && move.prevented);
  assert.equal(g.viewport.scrollLeft, 8);
  g.emit(g.eventTarget, 'pointercancel', { pointerId: 4 });
  g.emit(g.eventTarget, 'pointermove', { pointerId: 4, clientX: 120 });
  assert.equal(g.viewport.scrollLeft, 8);
});
