import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createObservationStore, realObservationState } from '../src/world/observation.js';
const tokyo = { name: '东京', lat: 35.6762, lon: 139.6503, tz: 'Asia/Tokyo' };
const london = { name: '伦敦', lat: 51.5074, lon: -0.1278, tz: 'Europe/London' };
const live = { type: 'clear', fetchedAt: 1000, cloud_cover: 20, wind_speed_10m: 3, temperature_2m: 18 };

test('真实组件保留天气城市，与模拟时刻、手动天气和画廊地点无关', () => {
  const now = Date.parse('2026-10-14T03:00:00Z');
  const scene = { loc: tokyo, sceneLoc: london, ms: 12345, speed: 300, followNow: false, weather: 'snow', simulatedWeather: true, weatherDisplay: { show: true } };
  const result = realObservationState(scene, { live, airQuality: null, status: 'live' }, now);
  assert.equal(result.loc, tokyo); assert.equal(result.ms, now);
  assert.equal(result.speed, 1); assert.equal(result.followNow, true);
  assert.equal(result.weather, 'clear'); assert.equal(result.coverage, 0.2);
  assert.equal(result.wind, 3); assert.equal(result.simulatedWeather, false);
  assert.equal(result.weatherDisplay, scene.weatherDisplay);
  assert.equal(scene.ms, 12345); assert.equal(scene.weather, 'snow');
});

test('没有实况时不冒充晴天或零风速，真实组件明确缺失', () => {
  const result = realObservationState({ loc: tokyo, weather: 'clear', wind: 99 }, { live: null, status: 'unavailable' }, 1000);
  assert.equal(result.weather, null); assert.equal(result.coverage, null); assert.equal(result.wind, null);
  assert.equal(result.weatherSource, 'weather.unavailable');
});

test('手动场景仍独立获取真实天气，空气质量失败不阻断天气', async () => {
  let calls = 0;
  const store = createObservationStore({ now: () => 1000, weather: async () => { calls++; return live; }, airQuality: async () => { throw Error('offline'); } });
  await store.refresh(tokyo);
  assert.equal(store.read().live, live); assert.equal(store.read().airQuality, null);
  await store.refresh(tokyo);
  assert.equal(calls, 1);
});

test('切换城市后丢弃旧城市迟到的数据并立即清空旧观测', async () => {
  const resolve = new Map();
  const store = createObservationStore({ now: () => 1000, weather: loc => new Promise(r => resolve.set(loc.name, r)), airQuality: async () => null });
  const first = store.refresh(tokyo), second = store.refresh(london);
  assert.equal(store.read().live, null);
  resolve.get('伦敦')({ ...live, temperature_2m: 8 }); await second;
  resolve.get('东京')(live); await first;
  assert.equal(store.read().live.temperature_2m, 8);
});

test('已有实况可以复用，旧的场景观测不会覆盖较新数据', async () => {
  let calls = 0;
  const store = createObservationStore({ now: () => 2000, weather: async () => { calls++; return live; }, airQuality: async () => null });
  await store.refresh(tokyo, { live: { ...live, fetchedAt: 1900, temperature_2m: 23 } });
  await store.refresh(tokyo, { live });
  assert.equal(calls, 0); assert.equal(store.read().live.temperature_2m, 23);
});

test('失败后限速重试，成功后恢复实况标记', async () => {
  let now = 1000, calls = 0;
  const store = createObservationStore({ now: () => now, weather: async () => { if (++calls === 1) throw Error('offline'); return { ...live, fetchedAt: now }; }, airQuality: async () => null });
  await store.refresh(tokyo); assert.equal(store.read().status, 'unavailable');
  await store.refresh(tokyo); assert.equal(calls, 1);
  now += 61000;
  await store.refresh(tokyo); assert.equal(store.read().status, 'live'); assert.equal(calls, 2);
});

test('壁纸缓存可在手动或锁定场景中独立读写，超过三小时后清空且失败限流', async () => {
  let now = 3600000, calls = 0, writes = 0;
  const store = createObservationStore({ now: () => now,
    cache: { read: () => ({ ...live, fetchedAt: 0 }), write: () => writes++ },
    weather: async () => { calls++; if (calls > 1) throw Error('offline'); return { ...live, fetchedAt: now }; },
    airQuality: async () => { throw Error('offline'); } });
  const pending = store.refresh(tokyo);
  assert.equal(store.read().live.cached, true);
  await pending; assert.equal(writes, 1);
  now += 4 * 3600000;
  await store.refresh(tokyo); assert.equal(store.read().live, null);
  assert.equal(store.read().status, 'unavailable');
  await store.refresh(tokyo); assert.equal(calls, 2);
  await store.refresh(tokyo, { force: true }); assert.equal(calls, 3);
});
