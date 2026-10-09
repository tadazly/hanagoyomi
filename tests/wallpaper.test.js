import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFrameGate } from '../src/platform/frame-gate.js';
import { componentPreferences } from '../src/ui/component-settings.js';
import { project } from '../wallpaper/project.js';
import { readWeatherCache, saveWeatherCache, WEATHER_CACHE_TTL } from '../src/world/weather-cache.js';

test('离线缓存按地点隔离，拒绝过期、未来和损坏数据，保留零天气指标', () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
  const loc = { lat: 31.23, lon: 121.47, tz: 'Asia/Shanghai' }, now = 1800000000000;
  const weather = { fetchedAt: now, cloud_cover: 0, wind_speed_10m: 0, wind_direction_10m: 0, weather_code: 0, temperature_2m: 0, precipitation: 0, type: 'clear' };
  saveWeatherCache(storage, loc, weather);
  assert.equal(readWeatherCache(storage, loc, now).cached, true);
  assert.equal(readWeatherCache(storage, loc, now).temperature_2m, 0);
  assert.equal(readWeatherCache(storage, { ...loc, lon: 0 }, now), null);
  assert.equal(readWeatherCache(storage, loc, now - 1), null);
  assert.equal(readWeatherCache(storage, loc, now + WEATHER_CACHE_TTL + 1), null);
  saveWeatherCache(storage, loc, { ...weather, cloud_cover: 101 });
  assert.equal(readWeatherCache(storage, loc, now), null);
  assert.equal(readWeatherCache({ getItem() { throw new Error('blocked'); } }, loc, now), null);
});

test('限帧不随显示器刷新率增加，改变宿主 FPS 后即时恢复', () => {
  const gate = createFrameGate();
  let frames = 0;
  for (let time = 0; time < 10000; time += 1000 / 144) if (gate.ready(time, 20)) frames++;
  assert.ok(frames >= 199 && frames <= 201, String(frames));
  assert.equal(gate.ready(10000, 60), true);
  gate.reset(); assert.equal(gate.ready(10001, 15), true);
  assert.equal(gate.ready(10002, 15), false);
  assert.equal(gate.ready(60000, 15), true);
  assert.equal(gate.ready(60001, 15), false);
  assert.equal(gate.ready(60001, 0), true);
  assert.equal(gate.ready(60002, 0), true);
});

test('壁纸默认高画质、关闭交互、自动飞行和避让图标布局', () => {
  const props = project.general.properties;
  assert.equal(props.quality.value, 'high'); assert.equal(props.interaction.value, false);
  assert.equal(props.autoflight.value, true);
  assert.equal(props.logoposition.value, 'top-right'); assert.equal(props.clockposition.value, 'bottom-center');
  const preferences = componentPreferences({ logo: { position: 'bottom-left' } }, true);
  assert.equal(preferences.logo.position, 'bottom-left');
  assert.equal(componentPreferences({}, false).logo.position, undefined);
  for (const property of Object.values(props)) {
    assert.ok(project.general.localization['zh-chs'][property.text]);
    assert.ok(project.general.localization['en-us'][property.text]);
    if (property.type === 'combo') assert.ok(property.options.some(option => option.value === property.value));
  }
});
