import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLightingTimeline } from '../src/rendering/lighting-timeline.js';

const lighting = ms => ({ lightDir: [1, ms / 1000, 0], lightGround: [ms / 1000, 2, 3],
  exposure: Math.exp(ms / 1000), pe: Math.exp(ms / 1000), grade: { sat: ms / 1000, sh: [ms / 1000, 1, 2] } });

test('模拟时刻连续驱动光照、曝光和嵌套调色，跨采样边界无阶梯', () => {
  const sample = createLightingTimeline(lighting);
  for (const ms of [0, 16, 32, 48, 64, 999, 1000, 1001, 1016]) {
    const { value } = sample(ms, 1000, '晴');
    assert.ok(Math.abs(value.lightGround[0] - ms / 1000) < 1e-12);
    assert.ok(Math.abs(Math.log(value.exposure) - ms / 1000) < 1e-12);
    assert.equal(value.grade.sat, value.lightGround[0]);
    assert.equal(value.grade.sh[0], value.lightGround[0]);
    assert.ok(Math.abs(Math.hypot(...value.lightDir) - 1) < 1e-12);
  }
});

test('帧间复用积分结果，跨区间仅新增一个端点，天气变化与倒退清除旧样本', () => {
  const calls = [];
  const sample = createLightingTimeline(ms => { calls.push(ms); return lighting(ms); });
  for (const ms of [0, 16, 32, 48, 64, 999, 1000, 1016]) sample(ms, 1000, '晴');
  assert.deepEqual(calls, [0, 1000, 2000]);
  sample(1016, 1000, '阴');
  assert.deepEqual(calls.slice(-2), [1000, 2000]);
  sample(0, 1000, '阴');
  assert.deepEqual(calls.slice(-2), [0, 1000]);
  sample(10000, 2000, '阴');
  assert.deepEqual(calls.slice(-2), [10000, 12000]);
});
