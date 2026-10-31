import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bindMouseFlightInput, bindTouchFlightInput, flightStickAxes } from '../src/rendering/flight-input.js';

function fixture({ followMouse = false, inputType = 'mouse' } = {}) {
  const canvas = new EventTarget(), classes = new Set(), timers = new Map(), actions = [];
  canvas.classList = { add: name => classes.add(name), remove: name => classes.delete(name) };
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 600 });
  canvas.setPointerCapture = () => {};
  let time = 1000, nextTimer = 0, flying = true, enabled = true;
  const eventTarget = new EventTarget();
  const input = (inputType === 'touch' ? bindTouchFlightInput : bindMouseFlightInput)({
    eventTarget,
    canvas, isFlying: () => flying, isEnabled: () => enabled,
    followsMouse: () => followMouse,
    look: (x, y) => actions.push(['look', x, y]), dash: () => actions.push('dash'), turn: () => actions.push('turn'),
    toggleFlight: () => { actions.push('toggle'); flying = !flying; input.reset(); }, now: () => time,
    schedule: (fn, delay) => { const id = ++nextTimer; timers.set(id, { fn, at: time + delay }); return id; },
    cancel: id => timers.delete(id),
  });
  const emit = (type, data = {}) => {
    const event = new Event(type, { cancelable: true });
    Object.defineProperty(event, 'timeStamp', { value: time });
    Object.assign(event, { pointerType: inputType, pointerId: 1, button: 0, buttons: 0, clientX: 500, clientY: 300 }, data);
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
  return { canvas, input, eventTarget, classes, actions, emit, click, advance,
    setFlying: value => { flying = value; input.reset(); }, setEnabled: value => { enabled = value; },
    setFollowMouse: value => { followMouse = value; input.reset(); }, isFlying: () => flying };
}

test('鼠标连击不冲刺、掉头或开关自动飞行，也没有延迟动作', () => {
  for (const button of [0, 2]) {
    const f = fixture();
    for (let i=0;i<3;i++) { f.click(button); f.advance(80); }
    f.advance(1000);
    assert.deepEqual(f.actions, []); assert.equal(f.isFlying(), true);
  }
});

test('自动飞行悬空移动鼠标等同触屏摇杆，中心回中、上下升降、左右转向', () => {
  const f = fixture({ followMouse: true });
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
  const f = fixture({ followMouse: true }); f.emit('pointermove', { clientX: 650 }); f.emit('pointerleave');
  assert.equal(f.input.stick.active, false);
  f.click(2); f.click(2); f.input.reset(); f.advance(600); assert.deepEqual(f.actions, []);
  f.setEnabled(false); f.click(); f.click(); f.emit('pointermove', { clientX: 650 });
  f.click(2); f.click(2); f.click(2); f.advance(600);
  assert.deepEqual(f.actions, []); assert.equal(f.input.stick.active, false);
  f.setEnabled(true); f.emit('pointermove', { pointerType: 'touch', clientX: 650 });
  assert.equal(f.input.stick.active, false);
  assert.equal(f.emit('contextmenu').defaultPrevented, true);
});

test('默认仅左键拖动操纵，右键不操纵，松开左键立即回中', () => {
  const f = fixture();
  f.emit('pointermove', { clientX: 650, clientY: 150 }); assert.equal(f.input.stick.active, false);
  f.emit('pointerdown', { button: 2, buttons: 2 });
  f.emit('pointermove', { clientX: 650, clientY: 150 }); assert.equal(f.input.stick.active, false);
  f.emit('pointerup', { button: 2 });
  f.emit('pointerdown', { buttons: 1 });f.emit('pointermove', { clientX: 650, clientY: 150 });
  assert.deepEqual(flightStickAxes(f.input.stick, 1000, 600), { x: 1, y: -1 });
  f.emit('pointerup', { clientX: 650, clientY: 150 });
  assert.deepEqual(flightStickAxes(f.input.stick, 1000, 600), { x: 0, y: 0 });assert.deepEqual(f.actions, []);
});

test('关闭跟随清除残留操纵，重新开启后恢复悬空跟随', () => {
  const f = fixture({ followMouse: true });
  f.emit('pointermove', { clientX: 650 }); assert.equal(f.input.stick.active, true);
  f.setFollowMouse(false); assert.equal(f.input.stick.active, false);
  f.emit('pointermove', { clientX: 350 }); assert.equal(f.input.stick.active, false);
  f.setFollowMouse(true); f.emit('pointermove', { clientX: 350 });
  assert.equal(flightStickAxes(f.input.stick, 1000, 600).x, -1);
});

test('触屏单指双击在三击等待窗口后冲刺，三击只切换自动飞行', () => {
  const double=fixture({inputType:'touch'});double.click();double.advance(80);double.click();
  double.advance(319);assert.deepEqual(double.actions,[]);double.advance(1);assert.deepEqual(double.actions,['dash']);
  const triple=fixture({inputType:'touch'});
  for(let cycle=0;cycle<2;cycle++) {
    for(let i=0;i<3;i++){triple.click();triple.advance(70);}
    triple.advance(500);assert.equal(triple.isFlying(),cycle===1);
  }
  assert.deepEqual(triple.actions,['toggle','toggle']);
});

test('第三次触屏按下立刻取消待发冲刺，拖动、长按和取消都不误触发', () => {
  for(const ending of ['pointerup','pointercancel','lostpointercapture']) {
    const f=fixture({inputType:'touch'});f.click();f.advance(80);f.click();f.advance(80);
    f.emit('pointerdown',{buttons:1});f.advance(500);assert.deepEqual(f.actions,[]);
    f.emit(ending);f.advance(500);assert.deepEqual(f.actions,[]);
  }
  const drag=fixture({inputType:'touch'});drag.click();drag.click();
  drag.emit('pointerdown',{buttons:1});drag.emit('pointermove',{clientX:650});
  assert.equal(flightStickAxes(drag.input.stick,1000,600).x,1);
  drag.emit('pointerup',{clientX:650});drag.advance(500);assert.deepEqual(drag.actions,[]);
});

test('触屏拖动不会计作点击，多指双击不再掉头或开关飞行', () => {
  const f=fixture({inputType:'touch'});
  for(let i=0;i<2;i++) {
    f.emit('pointerdown',{buttons:1});f.emit('pointermove',{clientX:650});
    f.emit('pointerup',{clientX:650});f.advance(60);
  }
  for(const fingers of [2,3])for(let tap=0;tap<2;tap++) {
    for(let id=1;id<=fingers;id++)f.emit('pointerdown',{pointerId:id,buttons:1});
    assert.equal(f.input.stick.active,false);
    for(let id=1;id<=fingers;id++)f.emit('pointerup',{pointerId:id});f.advance(60);
  }
  f.advance(500);assert.deepEqual(f.actions,[]);assert.equal(f.isFlying(),true);
});

test('触屏禁用、失焦及新界面操作取消待发冲刺，远距离和超时点击不组合', () => {
  for(const ending of ['disabled','blur','ui','reset']) {
    const f=fixture({inputType:'touch'});f.click();f.click();
    if(ending==='disabled')f.setEnabled(false);
    if(ending==='blur')f.eventTarget.dispatchEvent(new Event('blur'));
    if(ending==='ui')f.eventTarget.dispatchEvent(new Event('pointerdown'));
    if(ending==='reset')f.input.reset();
    f.advance(500);assert.deepEqual(f.actions,[],ending);assert.equal(f.input.stick.active,false);
  }
  const slow=fixture({inputType:'touch'});slow.click();slow.advance(400);slow.click();slow.advance(500);assert.deepEqual(slow.actions,[]);
  const far=fixture({inputType:'touch'});far.click();far.click(0,{clientX:550});far.advance(500);assert.deepEqual(far.actions,[]);
});
