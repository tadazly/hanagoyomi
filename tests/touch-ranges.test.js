import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initTouchRanges } from '../src/ui/touch-ranges.js';

function fixture() {
  const listeners = new Map(), viewListeners = new Map(), events = [], values = {};
  const view = { Event, getComputedStyle: () => ({ direction: 'ltr' }),
    addEventListener: (type, fn) => viewListeners.set(type, fn), removeEventListener: type => viewListeners.delete(type) };
  const doc = { defaultView: view, hidden: false,
    addEventListener: (type, fn) => listeners.set(type, fn), removeEventListener: type => listeners.delete(type) };
  const input = { min: '0', max: '100', step: '1', value: '20', dataset: {}, isConnected: true, disabled: false, fieldsetDisabled: false, focused: 0,
    get valueAsNumber() { return Number(this.value); },
    getBoundingClientRect: () => ({ left: 100, width: 200 }),
    closest: () => input, matches: () => input.disabled || input.fieldsetDisabled,
    focus() { this.focused++; }, style: { setProperty: (name, value) => { values[name] = value; } },
    dispatchEvent: event => { events.push({ type: event.type, value: input.value, adjusting: input.dataset.rangeAdjusting }); } };
  const binding = initTouchRanges(doc);
  const touch = x => ({ identifier: 9, clientX: x });
  const emit = (type, xs = [], changed = xs, target = input) => {
    const event = { target, cancelable: true, touches: xs.map(touch), changedTouches: changed.map(touch),
      prevented: false, preventDefault() { this.prevented = true; } };
    listeners.get(type)?.(event); return event;
  };
  return { input, doc, view, events, listeners, viewListeners, values, binding, emit };
}

test('单指可从非当前进度按下定位并左右拖动，最后坐标提交一次，松手后不再更新', () => {
  const f = fixture();
  assert(f.emit('touchstart', [260]).prevented); assert.equal(f.input.value, '80');
  f.viewListeners.get('blur')({ target: f.input }); assert.equal(f.input.dataset.rangeAdjusting, 'true', '控件间焦点切换不等于窗口失焦');
  f.emit('touchmove', [180]); assert.equal(f.input.value, '40');
  f.emit('touchmove', [240]); assert.equal(f.input.value, '70');
  f.emit('touchend', [], [250]); assert.equal(f.input.value, '75'); assert.equal(f.values['--fill'], '75%');
  assert.equal(f.input.dataset.rangeAdjusting, undefined);
  assert.deepEqual(f.events.filter(e => e.type === 'change'), [{ type: 'change', value: '75', adjusting: undefined }]);
  f.emit('touchmove', [100]); f.emit('touchend', [], [100]); assert.equal(f.input.value, '75');
  f.binding.destroy(); assert.equal(f.listeners.size, 0); assert.equal(f.viewListeners.size, 0);
});

test('支持端点和步长，禁用输入及禁用fieldset不可调整；鼠标保持原生处理', () => {
  const f = fixture(); f.input.step = '5';
  const mouse = { target: f.input, pointerType: 'mouse', cancelable: true, preventDefault() { throw new Error('mouse intercepted'); } };
  f.listeners.get('pointerdown')(mouse); assert.equal(f.input.value, '20'); assert.equal(f.input.focused, 0);
  f.input.fieldsetDisabled = true; assert.equal(f.emit('touchstart', [200]).prevented, false); assert.equal(f.input.value, '20');
  f.input.fieldsetDisabled = false;
  f.emit('touchstart', [80]); assert.equal(f.input.value, '0');
  f.emit('touchmove', [231]); assert.equal(f.input.value, '65');
  f.emit('touchend', [], [340]); assert.equal(f.input.value, '100'); f.binding.destroy();
});

test('多指、触屏取消、缩放切换与失焦都停止旧手势，不干扰非滑条触屏', () => {
  const f = fixture();
  assert.equal(f.emit('touchstart', [200], [200], { closest: () => null }).prevented, false);
  for (const cancel of ['touchcancel', 'uiscalechange', 'blur', 'multi']) {
    f.emit('touchstart', [180]);
    if (cancel === 'blur') f.viewListeners.get('blur')({ target: f.view });
    else if (cancel === 'multi') f.emit('touchstart', [180, 250]);
    else f.emit(cancel);
    assert.equal(f.input.dataset.rangeAdjusting, undefined);
    f.emit('touchmove', [300]); assert.equal(f.input.value, '40');
  }
  f.binding.destroy();
});
