import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNightObservation, nightObservationAppearance } from '../src/rendering/night-observation.js';

const pose = () => ({ position: [0, 2, 0], yaw: 0, pitch: .2, roll: 0, fov: 78 });
test('静止观察有等待时间，上升连续并受弱星与银河增益上限约束', () => {
  const state = createNightObservation(), camera = pose();
  for (let i = 0; i < 14; i++) assert.equal(state.update(.1, camera), 0);
  let amount = 0;
  for (let i = 0; i < 600; i++) {
    const next = state.update(.1, camera);
    assert.ok(next >= amount && next - amount < .015); amount = next;
    const a = nightObservationAppearance(next);
    assert.ok(a.limitingMagnitude <= 7.3 && a.starGain <= 1.2 && a.galaxyGain <= 1.3);
  }
  assert.ok(amount > .999 && amount <= 1);
});

test('平移、转动、缩放均平滑回退，不依赖按键输入，不瞬间清空星空', () => {
  for (const move of [p => { p.position[0] += .1; }, p => { p.yaw += .01; }, p => { p.fov += .1; }]) {
    const state = createNightObservation(), camera = pose(); let amount;
    for (let i = 0; i < 400; i++) amount = state.update(.1, camera);
    move(camera); const first = state.update(.1, camera);
    assert.ok(first < amount && first > amount * .85);
    for (let i = 0; i < 40; i++) { move(camera); amount = state.update(.1, camera); }
    assert.ok(amount < .01);
  }
});

test('不同帧率的静止适应一致，跨越方位角零点与微小呼吸摆动不会误判', () => {
  const settle = fps => { const s = createNightObservation(), p = pose(); let amount; for (let i = 0; i < fps * 30; i++) amount = s.update(1 / fps, p); return amount; };
  assert.ok(Math.abs(settle(30) - settle(120)) < .001);
  const state = createNightObservation(), p = pose(); p.yaw = Math.PI * 2 - .00001;
  for (let i = 0; i < 300; i++) state.update(.1, p);
  p.yaw = .00001; p.position[1] += .001;
  assert.ok(state.update(.1, p) > .98);
  assert.equal(state.update(.1, p, false), 0);
  assert.equal(state.update(.1, p), 0);
});

test('后台大时间间隔不跳到长曝光，重置和白天退出可重新从肉眼层次开始', () => {
  const state = createNightObservation(), p = pose();
  assert.equal(state.update(3600, p), 0);
  for (let i = 0; i < 300; i++) state.update(.1, p);
  state.reset(); assert.equal(state.update(.1, p), 0);
  assert.deepEqual(nightObservationAppearance(10), { limitingMagnitude: 7.3, starGain: 1.2, galaxyGain: 1.3 });
});
