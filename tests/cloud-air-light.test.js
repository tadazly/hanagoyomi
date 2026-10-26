import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cloudAirLight } from '../src/rendering/cloud-air-light.js';

const glow = [.55, .7, 1];
const day = { pe: 2, moonI: .01, airglow: 1, ms: [.3, .5, 1], sourceCloud: [50, 50, 50] };
test('云前空气保留实际双光源，不随云的主光选择或艺术增益改变', () => {
  const air = cloudAirLight(day, null, 20, glow);
  assert.deepEqual(air.sources, [40, .02]);
  assert.deepEqual(air, cloudAirLight({ ...day, sourceCloud: [0, .001, 100] }, null, 20, glow));
});

test('星图零太阳强度不被默认值恢复，天空渐变按预曝光端点能量混合', () => {
  const chart = { ...day, sunI: 0, moonI: 0, pe: 100, airglow: 3, ms: [0, 0, 0] };
  assert.deepEqual(cloudAirLight(chart, null, 20, glow).sources, [0, 0]);
  const a = cloudAirLight(day, null, 20, glow), b = cloudAirLight(chart, null, 20, glow);
  for (const fraction of [0, .1, .5, .9, 1]) {
    const air = cloudAirLight(day, { samples: [day, chart], fraction }, 20, glow);
    for (const key of ['sources', 'glow', 'ms']) air[key].forEach((v, i) => {
      assert.ok(Math.abs(v - (a[key][i] * (1 - fraction) + b[key][i] * fraction)) < 1e-12);
    });
  }
});
