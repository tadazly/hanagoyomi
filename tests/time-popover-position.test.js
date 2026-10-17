import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bindTimePopoverPosition } from '../src/ui/shell.js';

function fixture(wallpaper = true) {
  const pending = new Set(), observations = [], listeners = new Map(), styles = {};
  let contentHeight = 180, visible = true, writes = 0;
  const boxHeight = () => Math.min(contentHeight, Number.parseFloat(styles.maxHeight) || Infinity);
  const doc = { addEventListener() {} };
  const popover = { hidden: false, ownerDocument: doc, offsetWidth: 344,
    get offsetHeight() { return boxHeight(); },
    addEventListener(type, listener, capture) { listeners.set(type, { listener, capture }); },
    style: new Proxy(styles, { set(target, key, value) {
      const before = boxHeight(); target[key] = value; writes++;
      if (boxHeight() !== before) for (const observer of observations) pending.add(observer);
      return true;
    } }),
  };
  const anchor = { top: 700, bottom: 744, right: 1000 };
  const attributes = new Map([['aria-expanded', 'true']]);
  const trigger = { getClientRects: () => visible ? [{}] : [], getBoundingClientRect: () => anchor,
    getAttribute: key => attributes.get(key), setAttribute: (key, value) => attributes.set(key, value) };
  const eventTarget = { innerWidth: 1100, innerHeight: 800, document: doc, addEventListener() {} };
  class Observer { constructor(callback) { observations.push(callback); } observe() {} }
  const position = bindTimePopoverPosition({ popover, trigger, wallpaper, eventTarget, resizeObserver: Observer });
  const flush = () => {
    let count = 0;
    while (pending.size && count < 10) { const jobs = [...pending]; pending.clear(); for (const job of jobs) { job(); count++; } }
    assert.equal(pending.size, 0, 'ResizeObserver 必须收敛，不能重复排队');
    return count;
  };
  return { popover, anchor, styles, position, listeners, attributes, eventTarget, flush,
    writes: () => writes, setVisible: value => { visible = value; },
    resize: height => { contentHeight = height; for (const callback of observations) pending.add(callback); },
  };
}

test('壁纸时间进阶展开/收起时重新锚定，并始终在工具栏上方保留间隙', () => {
  const f = fixture(); f.position();
  assert.equal(f.styles.top, '508px');
  assert.equal(f.listeners.get('toggle').capture, true, 'details toggle 不冒泡，需要捕获监听');
  f.resize(380); f.listeners.get('toggle').listener(); f.flush();
  assert.equal(f.styles.top, '308px');
  assert.equal(Number.parseFloat(f.styles.top) + f.popover.offsetHeight, f.anchor.top - 12);
  f.resize(180); f.listeners.get('toggle').listener(); f.flush();
  assert.equal(f.styles.top, '508px');
});

test('超高内容以工具栏位置限制高度，ResizeObserver 与重复定位不循环或重复写样式', () => {
  const f = fixture(); f.resize(1200); f.position(); f.flush();
  assert.equal(f.styles.maxHeight, '676px');
  assert.equal(f.styles.top, '12px');
  assert.equal(f.popover.offsetHeight + Number.parseFloat(f.styles.top), 688);
  const writes = f.writes();
  f.position(); f.position(); f.flush();
  assert.equal(f.writes(), writes);
});

test('普通网站仍在工具栏下方定位，锚点隐藏时关闭浮层', () => {
  const f = fixture(false); f.anchor.top = 24; f.anchor.bottom = 68;
  f.position();
  assert.equal(f.styles.top, '80px'); assert.equal(f.styles.maxHeight, '708px');
  f.setVisible(false); f.position();
  assert.equal(f.popover.hidden, true);
  assert.equal(f.attributes.get('aria-expanded'), 'false');
});
