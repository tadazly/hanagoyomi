import { test } from 'node:test';
import assert from 'node:assert/strict';
import { advanceClock, zonedHours, zonedDayStart, localTimeToUTC, fmtTime } from '../src/world/clock.js';
import { getAstronomy, getSunEvents } from '../src/world/astronomy.js';
import { WMO_TYPE, fetchWeather } from '../src/world/weather.js';
import { wxPreset } from '../src/world/weather-presets.js';

const tokyo = { lat: 35.6762, lon: 139.6503, tz: 'Asia/Tokyo' };
test('同一 UTC 时刻对应观测地点的当地时刻', () => {
  const ms = Date.parse('2026-10-06T08:00:00Z');
  assert.equal(zonedHours('Asia/Tokyo', ms), 17);
  assert.equal(zonedHours('America/New_York', ms), 4);
  assert.equal(zonedHours('Asia/Kolkata', ms), 13.5);
});
test('实时钟在长时间离开页面后仍同步墙上时间', () => {
  assert.equal(advanceClock(1000, 1, 1, true, 901000), 901000);
});
test('模拟时刻保留暂停和加速语义', () => {
  assert.equal(advanceClock(1000, 5000, 0, false, 999999), 1000);
  assert.equal(advanceClock(1000, 5000, 60, false, 999999), 301000);
});
test('夏令时变化日的当地时间转换使用目标时刻偏移', () => {
  const midnight = zonedDayStart('America/New_York', Date.parse('2026-03-08T18:00:00Z'));
  assert.equal(new Date(midnight).toISOString(), '2026-03-08T05:00:00.000Z');
  assert.equal(new Date(localTimeToUTC('America/New_York', midnight, 12)).toISOString(), '2026-03-08T16:00:00.000Z');
});
test('当地午夜与半小时偏移正确', () => {
  assert.equal(new Date(zonedDayStart('Asia/Kolkata', Date.parse('2026-10-06T08:00:00Z'))).toISOString(), '2026-10-05T18:30:00.000Z');
  assert.equal(fmtTime(23.99), '23:59');
});
test('东京太阳的昼夜高度与单位方向向量一致', () => {
  const noon = getAstronomy(Date.parse('2026-10-06T03:00:00Z'), tokyo);
  const midnight = getAstronomy(Date.parse('2026-10-06T15:00:00Z'), tokyo);
  assert.ok(noon.sunAlt > 0.6);
  assert.ok(midnight.sunAlt < -0.6);
  assert.ok(Math.abs(Math.hypot(...noon.sun) - 1) < 1e-10);
  assert.ok(noon.phase >= 0 && noon.phase < 1);
});
test('日出日落符合东京秋季的时段', () => {
  const sun = getSunEvents(Date.parse('2026-10-06T03:00:00Z'), tokyo);
  const rise = zonedHours(tokyo.tz, sun.rise), set = zonedHours(tokyo.tz, sun.set);
  assert.ok(rise > 5 && rise < 7);
  assert.ok(set > 16 && set < 18);
});
test('高纬地区明确区分极昼与极夜', () => {
  const loc = { lat: 78.2232, lon: 15.6267, tz: 'Arctic/Longyearbyen' };
  assert.equal(getSunEvents(Date.parse('2026-06-21T12:00:00Z'), loc).polar, 'day');
  assert.equal(getSunEvents(Date.parse('2026-12-21T12:00:00Z'), loc).polar, 'night');
});
test('WMO 雨、雪、雷暴与未知状态映射', () => {
  assert.equal(WMO_TYPE(0), 'clear'); assert.equal(WMO_TYPE(65), 'heavyrain');
  assert.equal(WMO_TYPE(75), 'blizzard'); assert.equal(WMO_TYPE(99), 'tstorm');
  assert.equal(WMO_TYPE(999), 'cloudy');
});
test('预设值完整，未知预设有有效回退', () => {
  const unknown = wxPreset('unknown');
  assert.equal(unknown.cov, wxPreset('clear').cov);
  assert.equal(unknown.rain, 0);
});
test('天气请求使用 m/s、返回值验证且保留实际云量', async () => {
  const current = { cloud_cover: 80, wind_speed_10m: 3.2, wind_direction_10m: 180, weather_code: 3 };
  const weather = await fetchWeather(tokyo, { fetcher: async url => {
    assert.equal(url.searchParams.get('wind_speed_unit'), 'ms');
    assert.equal(url.searchParams.get('latitude'), '35.676');
    return { ok: true, json: async () => ({ current }) };
  } });
  assert.equal(weather.type, 'overcast'); assert.equal(weather.cloud_cover, 80);
});
test('天气服务 HTTP 错误、数据不完整与异常值不被当成真实天气', async () => {
  await assert.rejects(fetchWeather(tokyo, { fetcher: async () => ({ ok: false, status: 503 }) }), /HTTP 503/);
  await assert.rejects(fetchWeather(tokyo, { fetcher: async () => ({ ok: true, json: async () => ({ current: {} }) }) }), /incomplete/);
  await assert.rejects(fetchWeather(tokyo, { fetcher: async () => ({ ok: true, json: async () => ({ current: { cloud_cover: 500, wind_speed_10m: 1, wind_direction_10m: 180, weather_code: 0 } }) }) }), /valid range/);
});
