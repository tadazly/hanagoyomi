import { test } from 'node:test';
import assert from 'node:assert/strict';
import { weatherFogDensity, groundStormFogBlend } from '../src/rendering/weather-fog.js';
import { wxPreset } from '../src/world/weather-presets.js';

test('地平线补偿只作用于贴地雷暴，15米以上与其他天气完全禁用', () => {
  assert.equal(groundStormFogBlend('tstorm', 1.2), 1);
  assert.equal(groundStormFogBlend('tstorm', 5), 1);
  assert.equal(groundStormFogBlend('tstorm', 10), .5);
  for (const altitude of [15, 100, 1400, 1500, 2000, 4000, 50000]) assert.equal(groundStormFogBlend('tstorm', altitude), 0);
  for (const type of ['fog', 'mist', 'cloudy', 'overcast', 'rain', 'snow', 'clear']) {
    for (const altitude of [1.2, 5, 10, 1500]) assert.equal(groundStormFogBlend(type, altitude), 0);
  }
});

test('雷暴补偿升降连续且有界，不在5米或15米处突然切换', () => {
  let previous = 1;
  for (let altitude = 0; altitude <= 20; altitude += .01) {
    const weight = groundStormFogBlend('tstorm', altitude);
    assert.ok(weight >= 0 && weight <= previous);
    previous = weight;
  }
  for (const altitude of [5, 15]) assert.ok(Math.abs(groundStormFogBlend('tstorm', altitude - 1e-5) - groundStormFogBlend('tstorm', altitude + 1e-5)) < 1e-10);
});

test('晴朗不重复叠加雾，多云保留额外衰减，大雾仍能遮蔽远景', () => {
  assert.equal(weatherFogDensity(wxPreset('clear').vis), 0);
  const cloudy = weatherFogDensity(wxPreset('cloudy').vis);
  assert.ok(cloudy > 0 && cloudy < 3.912 / 25000);
  // At 220 m visibility, at least 97% of the original weather extinction remains.
  const fog = weatherFogDensity(wxPreset('fog').vis);
  assert.ok(fog / (3.912 / 220) > 0.97);
  assert.ok(Math.exp(-fog * 1000) < 1e-7);
});

test('能见度跨过 29 和 30 公里时连续，不再触发雾层开关', () => {
  for (const boundary of [29000, 30000]) {
    const a = weatherFogDensity(boundary - 0.01);
    const b = weatherFogDensity(boundary + 0.01);
    assert.ok(Math.abs(a - b) < 1e-9);
  }
});

test('从晴朗到浓雾的衰减单调且有界', () => {
  let previous = 0;
  for (const visibility of [100000, 30000, 29900, 29000, 25000, 15000, 6000, 1500, 220, 60, 0]) {
    const density = weatherFogDensity(visibility);
    assert.ok(Number.isFinite(density) && density >= previous && density <= 3.912 / 60);
    previous = density;
  }
});
