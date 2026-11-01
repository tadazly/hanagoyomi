import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initRanges, rangeValueAtPosition } from '../src/ui/ranges.js';

test('点击轨道定位遵循小数步长、端点、单档范围与方向', () => {
  const input = { min: '0', max: '100', step: '1', getBoundingClientRect: () => ({left:100,width:100}) };
  assert.equal(rangeValueAtPosition(input,90),0);
  assert.equal(rangeValueAtPosition(input,175),75);
  assert.equal(rangeValueAtPosition(input,220),100);
  input.min='.5';input.max='1.5';input.step='.05';
  assert.equal(rangeValueAtPosition(input,171),1.2);
  assert.equal(rangeValueAtPosition(input,100,true),1.5);
  input.min='5';input.max='5';assert.equal(rangeValueAtPosition(input,180),5);
});

function fixture({ rtl = false } = {}) {
  const listeners = new Map(), viewListeners = new Map(), events = [], styles = {};
  let observed;
  const view = { Event, ontouchstart: null, getComputedStyle: () => ({ direction: rtl ? 'rtl' : 'ltr' }),
    MutationObserver: class { constructor(callback) { observed = callback; } observe() {} disconnect() {} },
    addEventListener: (type, fn) => viewListeners.set(type, fn), removeEventListener: type => viewListeners.delete(type) };
  const doc = { defaultView: view, hidden: false, body: {},
    addEventListener: (type, fn) => listeners.set(type, fn), removeEventListener: type => listeners.delete(type) };
  const input = { min: '0', max: '100', step: '1', value: '20', dataset: {}, isConnected: true,
    disabled: false, fieldsetDisabled: false, hidden: false, focused: 0, left: 100, width: 200,
    get valueAsNumber() { return Number(this.value); },
    getBoundingClientRect: () => ({ left: input.left, width: input.width }),
    closest: selector => selector === '[hidden]' ? (input.hidden ? input : null) : input,
    matches: () => input.disabled || input.fieldsetDisabled,
    focus() { this.focused++; }, style: { setProperty: (name, value) => { styles[name] = value; } },
    setPointerCapture() {}, releasePointerCapture() { listeners.get('lostpointercapture')?.({ pointerId: 9 }); },
    dispatchEvent: event => { events.push({ type: event.type, value: input.value, adjusting: input.dataset.rangeAdjusting }); } };
  const binding = initRanges(doc);
  const emit = (type, values = {}) => {
    const event = { target: input, cancelable: true, pointerId: 9, pointerType: 'mouse', button: 0,
      clientX: 260, clientY: 50, detail: 1, prevented: false, stopped: false,
      preventDefault() { this.prevented = true; }, stopImmediatePropagation() { this.stopped = true; }, ...values };
    (viewListeners.has(type) ? viewListeners : listeners).get(type)?.(event); return event;
  };
  const touch = (type, xs = [], changed = xs) => emit(type, {
    touches: xs.map((x, i) => ({ identifier: 9 + i, clientX: x, clientY: 50 })),
    changedTouches: changed.map((x, i) => ({ identifier: 9 + i, clientX: x, clientY: 50 })),
  });
  return { input, doc, view, events, listeners, viewListeners, styles, binding, emit, touch, mutate: () => observed() };
}

test('点击任意位置在松开时定位，按下不跳值，输入实时生效且只提交一次', () => {
  const f = fixture();
  assert(f.emit('pointerdown').prevented); assert.equal(f.input.value, '20');
  f.emit('pointerup'); assert.equal(f.input.value, '80'); assert.equal(f.styles['--fill'], '80%');
  assert.deepEqual(f.events, [
    { type: 'input', value: '80', adjusting: 'true' }, { type: 'change', value: '80', adjusting: undefined },
  ]);
  assert(f.emit('click').stopped); assert.equal(f.input.value, '80');
  f.binding.destroy(); assert.equal(f.listeners.size, 0); assert.equal(f.viewListeners.size, 0);
});

for (const source of ['pointer', 'mouse', 'touch']) {
  test(`${source} 横拖从原进度相对移动，松开使用最后坐标，之后无惯性或兼容点击跳值`, () => {
    const f = fixture();
    if (source === 'touch') {
      assert(f.emit('pointerdown', { pointerType: 'touch' }).prevented);
      f.touch('touchstart', [260]); assert.equal(f.input.value, '20');
      f.touch('touchmove', [280]); assert.equal(f.input.value, '30');
      f.touch('touchend', [], [290]);
      f.touch('touchmove', [300]); f.touch('touchend', [], [300]);
    } else {
      f.emit(`${source}down`); assert.equal(f.input.value, '20');
      f.emit(`${source}move`, { clientX: 280 }); assert.equal(f.input.value, '30');
      f.emit(`${source}up`, { clientX: 290 });
      f.emit(`${source}move`, { clientX: 300 }); f.emit(`${source}up`, { clientX: 300 });
    }
    assert.equal(f.input.value, '35'); assert.equal(f.styles['--fill'], '35%');
    assert.equal(f.input.dataset.rangeAdjusting, undefined);
    assert.deepEqual(f.events.filter(e => e.type === 'change'), [{ type: 'change', value: '35', adjusting: undefined }]);
    assert(f.emit('click', { clientX: 290 }).stopped); assert.equal(f.input.value, '35');
    f.binding.destroy();
  });
}

test('5px 阈值保留轻点，松开事件也能识别漏报的横拖，垂直手势不误跳值', () => {
  const f = fixture();
  f.emit('pointerdown'); f.emit('pointermove', { clientX: 263 }); assert.equal(f.input.value, '20');
  f.emit('pointerup', { clientX: 263 }); assert.equal(f.input.value, '82');
  f.input.value = '20'; f.emit('pointerdown'); f.emit('pointerup', { clientX: 280 }); assert.equal(f.input.value, '30');
  f.emit('pointerdown'); f.emit('pointermove', { clientY: 80 }); f.emit('pointerup', { clientY: 80 });
  assert.equal(f.input.value, '30'); f.binding.destroy();
});

test('连续位移不受步长累计误差影响，可反向调整并钳制端点', () => {
  const f = fixture(); f.input.step = '5';
  f.emit('pointerdown');
  for (let x = 261; x <= 270; x++) f.emit('pointermove', { clientX: x });
  assert.equal(f.input.value, '25');
  f.emit('pointermove', { clientX: 220 }); assert.equal(f.input.value, '0');
  f.emit('pointermove', { clientX: 240 }); assert.equal(f.input.value, '10');
  f.emit('pointerup', { clientX: 600 }); assert.equal(f.input.value, '100'); f.binding.destroy();
});

test('RTL 点击与拖动方向一致，界面缩放后的屏幕宽度决定位移', () => {
  const f = fixture({ rtl: true }); f.input.width = 250;
  f.emit('pointerdown'); f.emit('pointerup'); assert.equal(f.input.value, '36');
  f.input.value = '20'; f.emit('pointerdown'); f.emit('pointermove', { clientX: 235 }); assert.equal(f.input.value, '30');
  f.emit('pointerup', { clientX: 210 }); assert.equal(f.input.value, '40'); f.binding.destroy();
});

for (const source of ['pointer', 'mouse', 'touch']) {
  test(`${source} 读数改变导致轨道宽度和位置变化时，继续按起始轨道相对拖动`, () => {
    for (const rtl of [false, true]) {
      const f = fixture({ rtl });
      const move = x => source === 'touch' ? f.touch('touchmove', [x]) : f.emit(`${source}move`, { clientX: x });
      if (source === 'touch') f.touch('touchstart', [260]); else f.emit(`${source}down`);
      move(280); assert.equal(f.input.value, rtl ? '10' : '30');
      // 模拟高度读数由三位变为四位，占用更多列宽并移动轨道。
      f.input.width = 180; f.input.left = 108; f.mutate();
      assert.equal(f.input.dataset.rangeAdjusting, 'true');
      move(290); assert.equal(f.input.value, rtl ? '5' : '35');
      f.input.width = 195; f.input.left = 103; f.mutate();
      if (source === 'touch') f.touch('touchend', [], [300]); else f.emit(`${source}up`, { clientX: 300 });
      assert.equal(f.input.value, rtl ? '0' : '40');
      assert.equal(f.events.filter(e => e.type === 'change').length, 1);
      assert.equal(f.input.dataset.rangeAdjusting, undefined); f.binding.destroy();
    }
  });
}

test('PointerEvent 和兼容 MouseEvent 不重复驱动，非当前指针及右键不接管', () => {
  const f = fixture();
  f.emit('pointerdown', { button: 2 }); assert.equal(f.input.dataset.rangeAdjusting, undefined);
  f.emit('pointerdown'); f.emit('mousedown', { clientX: 180 });
  f.emit('pointermove', { pointerId: 10, clientX: 300 }); f.emit('mousemove', { clientX: 300 }); assert.equal(f.input.value, '20');
  f.emit('pointerup', { clientX: 280 }); f.emit('mouseup', { clientX: 300 }); assert.equal(f.input.value, '30');
  f.binding.destroy();
});

test('非滑条、禁用控件、禁用 fieldset 和隐藏控件不接管；键盘保留原生行为', () => {
  const f = fixture();
  assert.equal(f.emit('pointerdown', { target: { closest: () => null } }).prevented, false);
  for (const field of ['disabled', 'fieldsetDisabled', 'hidden']) {
    f.input[field] = true; assert.equal(f.emit('pointerdown').prevented, false); f.input[field] = false;
  }
  assert.equal(f.emit('keydown').prevented, false); assert.equal(f.emit('click', { detail: 0 }).prevented, false);
  assert.equal(f.input.value, '20'); f.binding.destroy();
});

test('动态边界、禁用、隐藏、移除及窗口变化立即结束旧手势，取消不会执行点击定位', () => {
  for (const reason of ['bounds', 'disabled', 'hidden', 'removed', 'width', 'scale', 'resize', 'blur', 'visibility', 'cancel', 'capture', 'key', 'destroy']) {
    const f = fixture(); f.emit('pointerdown'); f.emit('pointermove', { clientX: 280 });
    if (reason === 'bounds') f.input.max = '200';
    if (reason === 'disabled') f.input.disabled = true;
    if (reason === 'hidden') f.input.hidden = true;
    if (reason === 'removed') f.input.isConnected = false;
    if (reason === 'width') f.input.width = 0;
    if (['bounds', 'disabled', 'hidden', 'removed', 'width'].includes(reason)) f.mutate();
    if (reason === 'scale') f.emit('uiscalechange');
    if (reason === 'resize') f.emit('resize');
    if (reason === 'blur') f.emit('blur', { target: f.view });
    if (reason === 'visibility') { f.doc.hidden = true; f.emit('visibilitychange'); }
    if (reason === 'cancel') f.emit('pointercancel');
    if (reason === 'capture') f.emit('lostpointercapture');
    if (reason === 'key') f.emit('keydown');
    if (reason === 'destroy') f.binding.destroy();
    f.emit('pointerup', { clientX: 300 }); assert.equal(f.input.value, '30', reason);
    assert.equal(f.input.dataset.rangeAdjusting, undefined, reason);
    assert.equal(f.events.filter(e => e.type === 'change').length, reason === 'removed' ? 0 : 1, reason);
    f.binding.destroy();
  }
});

test('触屏轻点定位；多指与取消停止手势，兼容鼠标事件不再次调整', () => {
  const f = fixture();
  f.touch('touchstart', [260]); f.touch('touchend', [], [260]); assert.equal(f.input.value, '80');
  f.emit('mousedown', { clientX: 100 }); f.emit('mouseup', { clientX: 100 }); assert.equal(f.input.value, '80');
  for (const reason of ['multi', 'cancel']) {
    f.input.value = '20'; f.touch('touchstart', [260]); f.touch('touchmove', [280]);
    if (reason === 'multi') f.touch('touchstart', [280, 290]); else f.touch('touchcancel');
    f.touch('touchend', [], [300]); assert.equal(f.input.value, '30');
  }
  f.binding.destroy();
});
