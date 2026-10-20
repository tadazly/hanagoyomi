import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGalleryThumbnails } from '../src/ui/gallery-thumbnails.js';

function setup({ fallback = false } = {}) {
  const frames = new Map(), listeners = new Map(); let nextFrame = 0, callback, options;
  const observed = new Set(), root = {
    getBoundingClientRect: () => ({ left: 0, right: 300, top: 0, bottom: 120, width: 300, height: 120 }),
    addEventListener(type, fn) { listeners.set(type, fn); }, removeEventListener(type) { listeners.delete(type); },
  };
  const eventTarget = {
    IntersectionObserver: fallback ? undefined : class {
      constructor(fn, value) { callback = fn; options = value; }
      observe(image) { observed.add(image); } unobserve(image) { observed.delete(image); }
      disconnect() { observed.clear(); }
    },
    requestAnimationFrame(fn) { frames.set(++nextFrame, fn); return nextFrame; },
    cancelAnimationFrame(id) { frames.delete(id); },
    addEventListener(type, fn) { listeners.set(type, fn); }, removeEventListener(type) { listeners.delete(type); },
  };
  const loader = createGalleryThumbnails({ root, eventTarget, preload: 100 });
  const image = (left = 10, top = 10) => {
    const bounds = { left, right: left + 100, top, bottom: top + 80, width: 100, height: 80 };
    return { bounds, getBoundingClientRect: () => bounds };
  };
  const flush = () => { const work = [...frames.values()]; frames.clear(); work.forEach(fn => fn()); };
  return { loader, root, observed, image, flush, listeners, frames, options: () => options,
    enter: (target, isIntersecting = true) => callback([{ target, isIntersecting }]), };
}

test('关闭时不请求，打开后只加载进入展架预加载范围的图片', () => {
  const g = setup(), first = g.image(), later = g.image(1000);
  g.loader.observe(first, 'first.jpg'); g.loader.observe(later, 'later.jpg');
  assert.equal(first.src, undefined); assert.equal(g.observed.size, 0);
  g.loader.setActive(true);
  assert.equal(g.options().root, g.root); assert.equal(g.options().rootMargin, '0px 100px');
  g.enter(later, false); assert.equal(later.src, undefined);
  g.enter(first); assert.equal(first.src, 'first.jpg'); assert.equal(g.observed.has(first), false);
  assert.equal(later.src, undefined);
});

test('收起时忽略排队回调，展开后继续加载；已加载的图片不重新观察', () => {
  const g = setup(), first = g.image(), later = g.image(1000);
  g.loader.observe(first, 'first.jpg'); g.loader.observe(later, 'later.jpg');
  g.loader.setActive(true); g.enter(first); g.loader.setActive(false); g.enter(later);
  assert.equal(later.src, undefined); assert.equal(g.observed.size, 0);
  g.loader.setActive(true);
  assert.deepEqual([...g.observed], [later]);
  g.enter(later); assert.equal(later.src, 'later.jpg');
});

test('切换收藏或移除卡片后不加载旧图片，销毁后忽略回调', () => {
  const g = setup(), removed = g.image(), current = g.image();
  g.loader.setActive(true); g.loader.observe(removed, 'old.jpg'); g.loader.unobserve(removed);
  g.enter(removed); assert.equal(removed.src, undefined);
  g.loader.observe(current, 'new.jpg'); g.loader.dispose(); g.enter(current);
  assert.equal(current.src, undefined); assert.equal(g.observed.size, 0);
});

test('旧宿主按视口和滚动加载；屏外、隐藏和关闭时都不全量请求', () => {
  const g = setup({ fallback: true }), first = g.image(), near = g.image(350), far = g.image(800), hidden = g.image(10, 500);
  for (const [image, source] of [[first, 'first.jpg'], [near, 'near.jpg'], [far, 'far.jpg'], [hidden, 'hidden.jpg']]) g.loader.observe(image, source);
  g.flush(); assert.equal(first.src, undefined);
  g.loader.setActive(true); g.flush();
  assert.equal(first.src, 'first.jpg'); assert.equal(near.src, 'near.jpg');
  assert.equal(far.src, undefined); assert.equal(hidden.src, undefined);
  far.bounds.left = 280; far.bounds.right = 380;
  g.listeners.get('scroll')(); g.listeners.get('scroll')(); assert.equal(g.frames.size, 1);
  g.flush(); assert.equal(far.src, 'far.jpg');
  hidden.bounds.top = 10; hidden.bounds.bottom = 90;
  g.listeners.get('resize')(); g.loader.setActive(false); g.flush(); assert.equal(hidden.src, undefined);
  g.loader.setActive(true); g.root.getBoundingClientRect = () => ({ width: 0, height: 0 }); g.flush();
  assert.equal(hidden.src, undefined);
  g.loader.dispose(); assert.equal(g.listeners.size, 0);
});
