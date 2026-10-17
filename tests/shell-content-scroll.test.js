import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bindShellContentScrolling } from '../src/ui/shell.js';
import { bindDragScroll } from '../src/ui/drag-scroll.js';

class Target {
  listeners = new Map();
  addEventListener(type, callback) {
    const set = this.listeners.get(type) || new Set(); set.add(callback); this.listeners.set(type, set);
  }
  removeEventListener(type, callback) { this.listeners.get(type)?.delete(callback); }
  emit(type, values = {}) {
    const event = { type, button: 0, pointerType: 'mouse', pointerId: 1, clientY: 180, clientX: 20, detail: 1,
      defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, stopImmediatePropagation() {}, ...values };
    for (const callback of [...(this.listeners.get(type) || [])]) callback(event);
    return event;
  }
  count() { return [...this.listeners.values()].reduce((sum, set) => sum + set.size, 0); }
}

function fixture(wallpaper = false) {
  const doc = new Target(), win = new Target(), ids = new Map(), frames = new Map(), observers = [];
  let clock = 1000, nextFrame = 1;
  win.performance = { now: () => clock };
  win.requestAnimationFrame = callback => { const id = nextFrame++; frames.set(id, callback); return id; };
  win.cancelAnimationFrame = id => frames.delete(id);
  win.document = doc; doc.defaultView = win; doc.hidden = false;
  doc.getElementById = id => ids.get(id);
  doc.querySelector = selector => selector === '.help-body' ? surfaces.help.viewport : null;
  const surfaces = {};
  for (const [name, viewportId, containerId] of [['panel', 'panelBody', 'panel'], ['help', 'help-body', 'helpDialog'], ['time', 'quickTimeControls', 'timePopover']]) {
    const viewport = new Target(), container = new Target(), classes = new Set();
    viewport.ownerDocument = doc; viewport.style = { touchAction: 'auto', overflowY: 'auto' };
    viewport.classList = { add: value => classes.add(value), remove: value => classes.delete(value) };
    viewport.scrollTop = 0; viewport.clientHeight = 200; viewport.scrollHeight = 1200;
    viewport.contains = node => node?.viewport === viewport;
    viewport.setPointerCapture = () => {}; viewport.releasePointerCapture = () => {};
    container.hidden = false; container.inert = false;
    container.getClientRects = () => container.hidden ? [] : [{}];
    ids.set(viewportId, viewport); ids.set(containerId, container);
    surfaces[name] = { viewport, container, node: { viewport, closest: () => null } };
  }
  class Observer {
    constructor(callback) { this.callback = callback; this.disconnected = false; observers.push(this); }
    observe() {}
    disconnect() { this.disconnected = true; }
  }
  const prebound = wallpaper ? Object.values(surfaces).map(({ viewport }) => bindDragScroll({ viewport, axis: 'y', eventTarget: win })) : [];
  const before = Object.values(surfaces).map(({ viewport }) => viewport.count());
  const controller = bindShellContentScrolling({ document: doc, eventTarget: win, wallpaper, mutationObserver: Observer });
  const frame = () => { clock += 16; const jobs = [...frames.values()]; frames.clear(); jobs.forEach(callback => callback(clock)); };
  const start = (name, values = {}) => {
    const surface = surfaces[name], event = { target: surface.node, ...values };
    win.emit('pointerdown', event); surface.viewport.emit('pointerdown', event);
    return event;
  };
  const fling = name => {
    const event = start(name); win.emit('pointermove', { ...event, clientY: 90 }); frame();
    win.emit('pointerup', { ...event, clientY: 90 });
  };
  const destroy = () => { controller.destroy(); prebound.forEach(binding => binding.destroy()); };
  return { doc, win, surfaces, frames, observers, controller, before, start, fling, frame, destroy };
}

test('普通网站三个表面都可拖动内容并惯性滚动，保留原生滚动样式', () => {
  const f = fixture();
  for (const name of ['panel', 'help', 'time']) {
    f.fling(name);
    const viewport = f.surfaces[name].viewport, released = viewport.scrollTop;
    assert.equal(released, 90, name);
    assert.ok(f.frames.size > 0, `${name} 松手后继续惯性`);
    f.frame(); assert.ok(viewport.scrollTop > released, name);
    f.controller.cancel(name); assert.equal(f.frames.size, 0);
    assert.equal(viewport.style.overflowY, 'auto');
    assert.equal(viewport.style.touchAction, 'pan-y');
  }
  f.destroy();
});

test('切分类、打开其他表面、直接隐藏和关闭帮助都及时取消旧惯性', () => {
  const f = fixture();
  f.fling('panel'); f.controller.cancel('panel'); // selectTab 使用同一取消入口。
  f.surfaces.panel.viewport.scrollTop = 0; f.frame(); assert.equal(f.surfaces.panel.viewport.scrollTop, 0);
  for (const event of ['galleryopen', 'worldpanelopen']) {
    f.fling('time'); assert.ok(f.frames.size); f.doc.emit(event); assert.equal(f.frames.size, 0, event);
  }
  f.fling('panel'); f.surfaces.panel.container.hidden = true;
  f.observers[0].callback(); assert.equal(f.frames.size, 0);
  f.fling('help'); f.surfaces.help.container.emit('close'); assert.equal(f.frames.size, 0);
  f.destroy(); assert.equal(f.observers[0].disconnected, true);
});

test('网站输入框与范围控件不抢拖动，触屏及滚轮仍保留原生行为', () => {
  const f = fixture(), viewport = f.surfaces.panel.viewport;
  const input = { viewport, closest: () => ({}) };
  f.start('panel', { target: input }); f.win.emit('pointermove', { target: input, clientY: 40 }); f.frame();
  assert.equal(viewport.scrollTop, 0); assert.equal(f.frames.size, 0);
  f.start('panel', { pointerType: 'touch' });
  const touch = f.win.emit('pointermove', { target: f.surfaces.panel.node, pointerType: 'touch', clientY: 40 });
  assert.equal(touch.defaultPrevented, false); assert.equal(viewport.scrollTop, 0);
  const wheel = viewport.emit('wheel', { target: input, deltaY: 60 });
  assert.equal(wheel.defaultPrevented, false);
  f.destroy();
});

test('WE 已有绑定不重复注册内容手势，同样可通过表面生命周期取消惯性', () => {
  const f = fixture(true);
  assert.deepEqual(Object.values(f.surfaces).map(({ viewport }) => viewport.count()), f.before);
  assert.equal(f.observers.length, 0, 'WE 初始化器保留自己的显隐观察器');
  f.fling('panel'); assert.ok(f.frames.size);
  f.doc.emit('worldpanelopen'); assert.equal(f.frames.size, 0);
  f.destroy();
});

test('共享拖动按 viewport 去重，销毁后可重新绑定', () => {
  const f = fixture(), viewport = f.surfaces.panel.viewport;
  const count = viewport.count();
  const first = bindDragScroll({ viewport, axis: 'y', eventTarget: f.win });
  assert.equal(bindDragScroll({ viewport, axis: 'y', eventTarget: f.win }), first);
  assert.equal(viewport.count(), count);
  first.destroy();
  const next = bindDragScroll({ viewport, axis: 'y', eventTarget: f.win });
  assert.notEqual(next, first); next.destroy(); f.destroy();
});
