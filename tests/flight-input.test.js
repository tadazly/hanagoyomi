import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bindMouseFlightInput, flightStickAxes } from '../src/rendering/flight-input.js';

function fixture() {
  const canvas = new EventTarget(), classes = new Set(), timers = new Map(), actions = [];
  canvas.classList = { add: name => classes.add(name), remove: name => classes.delete(name) };
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 600 });
  canvas.setPointerCapture = () => {};
  let time = 1000, nextTimer = 0, flying = true, enabled = true;
  const input = bindMouseFlightInput({
    canvas, isFlying: () => flying, isEnabled: () => enabled,
    look: (x, y) => actions.push(['look', x, y]), dash: () => actions.push('dash'), turn: () => actions.push('turn'),
    toggleFlight: () => { actions.push('toggle'); flying = !flying; input.reset(); }, now: () => time,
    schedule: (fn, delay) => { const id = ++nextTimer; timers.set(id, { fn, at: time + delay }); return id; },
    cancel: id => timers.delete(id),
  });
  const emit = (type, data = {}) => {
    const event = new Event(type, { cancelable: true });
    Object.defineProperty(event, 'timeStamp', { value: time });
    Object.assign(event, { pointerType: 'mouse', pointerId: 1, button: 0, buttons: 0, clientX: 500, clientY: 300 }, data);
    canvas.dispatchEvent(event);
    return event;
  };
  const advance = ms => {
    time += ms;
    for (const [id, timer] of timers) if (timer.at <= time) { timers.delete(id); timer.fn(); }
  };
  const click = (button = 0, data = {}) => {
    emit('pointerdown', { button, buttons: button === 0 ? 1 : 2, ...data });
    advance(30); emit('pointerup', { button, ...data });
  };
  return { canvas, input, classes, actions, emit, click, advance,
    setFlying: value => { flying = value; input.reset(); }, setEnabled: value => { enabled = value; }, isFlying: () => flying };
}

test('左键双击立即冲刺，单击不触发也不停飞', () => {
  const f = fixture();
  f.click(); assert.deepEqual(f.actions, []); assert.equal(f.isFlying(), true);
  f.advance(80); f.click(); assert.deepEqual(f.actions, ['dash']); assert.equal(f.isFlying(), true);
  f.advance(600); assert.deepEqual(f.actions, ['dash']);
});

test('右键双击等待后只掉头一次，右键三击只暂停/继续而不掉头', () => {
  const double = fixture();
  double.click(2); double.advance(80); double.click(2);
  double.advance(399); assert.deepEqual(double.actions, []);
  double.advance(1); assert.deepEqual(double.actions, ['turn']);
  assert.equal(double.isFlying(), true);
  const triple = fixture();
  for (let cycle = 0; cycle < 2; cycle++) {
    triple.click(2); triple.advance(80); triple.click(2); triple.advance(80); triple.click(2);
    assert.equal(triple.isFlying(), cycle === 1);
    triple.advance(600);
  }
  assert.deepEqual(triple.actions, ['toggle', 'toggle']);
});

test('第三击长按或取消不会提前执行掉头', () => {
  for (const ending of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    const f = fixture();
    f.click(2); f.advance(80); f.click(2); f.advance(80);
    f.emit('pointerdown', { button: 2, buttons: 2 }); f.advance(500);
    assert.deepEqual(f.actions, []);
    f.emit(ending, { button: 2 }); f.advance(500);
    assert.deepEqual(f.actions, []);
  }
});

test('慢速、远距离点击与拖动不组合成双击', () => {
  const slow = fixture(); slow.click(); slow.advance(401); slow.click(); assert.deepEqual(slow.actions, []);
  const far = fixture(); far.click(); far.click(0, { clientX: 550 }); assert.deepEqual(far.actions, []);
  for (const button of [0, 2]) {
    const f = fixture(); f.click(button);
    f.emit('pointerdown', { button, buttons: button === 0 ? 1 : 2 });
    f.emit('pointermove', { button, clientX: 540 }); f.emit('pointerup', { button, clientX: 540 });
    f.advance(600); assert.deepEqual(f.actions, []);
  }
});

test('自动飞行悬空移动鼠标等同触屏摇杆，中心回中、上下升降、左右转向', () => {
  const f = fixture();
  for (const [clientX, clientY, expectedX, expectedY] of [
    [500, 300, 0, 0], [650, 300, 1, 0], [350, 300, -1, 0], [500, 150, 0, -1], [500, 450, 0, 1],
  ]) {
    f.emit('pointermove', { clientX, clientY });
    const axes = flightStickAxes(f.input.stick, 1000, 600);
    assert.equal(axes.x, expectedX); assert.equal(axes.y, expectedY);
    assert.deepEqual(axes, flightStickAxes({ active: true, ox: 40, oy: 80,
      x: 40 + clientX - 500, y: 80 + clientY - 300 }, 1000, 600));
    assert.equal(f.isFlying(), true);
  }
  f.emit('pointermove', { clientX: 650, clientY: 310 });
  assert.equal(flightStickAxes(f.input.stick, 1000, 600).y, 0);
  f.emit('pointermove', { clientX: 505, clientY: 305 });
  assert.deepEqual(flightStickAxes(f.input.stick, 1000, 600), { x: 0, y: 0 });
});

test('暂停时悬空移动无效，左键拖动环顾，右键拖动不环顾', () => {
  const f = fixture(); f.setFlying(false);
  f.emit('pointermove', { clientX: 650 }); assert.equal(f.input.stick.active, false);
  f.emit('pointerdown', { buttons: 1 }); f.emit('pointermove', { clientX: 540, clientY: 320 });
  assert.deepEqual(f.actions, [['look', 40, 20]]); assert.ok(f.classes.has('dragging'));
  f.emit('pointerup', { clientX: 540, clientY: 320 }); assert.ok(!f.classes.has('dragging'));
  f.emit('pointerdown', { button: 2, buttons: 2 }); f.emit('pointermove', { clientX: 540 });
  f.emit('pointerup', { button: 2, clientX: 540 }); f.advance(600);
  assert.deepEqual(f.actions, [['look', 40, 20]]);
});

test('离开画布、失焦清理、帮助弹窗和触屏事件不会留下鼠标操纵或迟到的动作', () => {
  const f = fixture(); f.emit('pointermove', { clientX: 650 }); f.emit('pointerleave');
  assert.equal(f.input.stick.active, false);
  f.click(2); f.click(2); f.input.reset(); f.advance(600); assert.deepEqual(f.actions, []);
  f.setEnabled(false); f.click(); f.click(); f.emit('pointermove', { clientX: 650 });
  assert.deepEqual(f.actions, []); assert.equal(f.input.stick.active, false);
  f.setEnabled(true); f.emit('pointermove', { pointerType: 'touch', clientX: 650 });
  assert.equal(f.input.stick.active, false);
  assert.equal(f.emit('contextmenu').defaultPrevented, true);
});
