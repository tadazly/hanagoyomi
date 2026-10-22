import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitAnimationTime, animationPhase, advanceWindOffset, advanceFireflyOffset, ANIMATION_TIME_PERIOD, wrap } from '../src/rendering/animation-time.js';

test('一天及多年运行后仍保留小数秒，整秒在 uint 周期边界准确衔接', () => {
  for (const time of [86400, 604800, 1e9, ANIMATION_TIME_PERIOD - 1]) {
    const a = splitAnimationTime(time + .125), b = splitAnimationTime(time + .125 + 1 / 60);
    assert.equal(a.whole, time >>> 0);
    assert.ok(Math.abs(b.fraction - a.fraction - 1 / 60) < 1e-6);
  }
  assert.deepEqual(splitAnimationTime(ANIMATION_TIME_PERIOD + .125), { whole: 0, fraction: .125 });
});

test('风向和风力变化只影响新一帧位移，不重算之前的累计路程', () => {
  const offset = [10, 20];
  advanceFireflyOffset(offset, 1 / 60, Math.PI / 2, .8);
  assert.ok(Math.abs(offset[0] - 10) < 1e-12);
  assert.ok(Math.abs(offset[1] - 20 - .12 * .8 / 60) < 1e-12);
  const before = [...offset];
  advanceFireflyOffset(offset, 1 / 60, Math.PI, 0);
  assert.deepEqual(offset, before);
});

test('不同帧率得到相同风位移，跨盒边界保持周期连续', () => {
  const slow = [59.99, .01], fast = [...slow];
  for (let i = 0; i < 30; i++) advanceFireflyOffset(slow, 1 / 30, -.2, .9);
  for (let i = 0; i < 144; i++) advanceFireflyOffset(fast, 1 / 144, -.2, .9);
  for (let i = 0; i < 2; i++) assert.ok(Math.abs(slow[i] - fast[i]) < 1e-10);
  assert.ok(slow[0] < 1 && slow[1] > 59);
  assert.equal(wrap(-960.125, 960), 959.875);
});

test('运行多年后风浪平流仍只响应新一帧转向，不改变既有遮罩位置', () => {
  const offset = [.712, .998];
  advanceWindOffset(offset, 0, .600001, 1.8 / 230, 1);
  assert.deepEqual(offset, [.712, .998]);
  const before = [...offset];
  advanceWindOffset(offset, 1 / 60, .600001, 1.8 / 230, 1);
  assert.ok(Math.hypot(...offset.map((v, i) => v - before[i])) < .00014);
});

test('云侵蚀与镜头/轨迹相位跨整数秒及整时钟环绕均保持连续', () => {
  for (const [rate, period] of [[.004, .7], [.53, 2 * Math.PI], [1.31, 2 * Math.PI], [2.4, 2 * Math.PI]]) {
    for (const time of [86400.999, 1e9 + .999, ANIMATION_TIME_PERIOD - .001]) {
      const a = animationPhase(time, rate, period), b = animationPhase((time + 1 / 60) % ANIMATION_TIME_PERIOD, rate, period);
      const delta = wrap(b - a + period / 2, period) - period / 2;
      assert.ok(Math.abs(delta - rate / 60) < 2e-6);
    }
  }
});
