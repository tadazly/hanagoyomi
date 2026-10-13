import { test } from 'node:test';
import assert from 'node:assert/strict';
import { weatherFogDensity } from '../src/rendering/weather-fog.js';
import { wxPreset } from '../src/world/weather-presets.js';

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
