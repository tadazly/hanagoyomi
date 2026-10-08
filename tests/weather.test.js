import { test } from 'node:test';
import assert from 'node:assert/strict';
import { airQualityLevel, airQualityPageUrl, fetchAirQuality, fetchWeather, formatTemperature, weatherPageUrl } from '../src/world/weather.js';

const tokyo = { lat: 35.6762, lon: 139.6503, tz: 'Asia/Tokyo' };
const current = { cloud_cover: 80, wind_speed_10m: 3.2, wind_direction_10m: 180, weather_code: 3 };
const response = value => ({ ok: true, json: async () => ({ current: value }) });

test('天气固定获取摄氏度和毫米，保留零降水及实际累计时段', async () => {
  const weather = await fetchWeather(tokyo, { fetcher: async url => {
    assert.equal(url.searchParams.get('temperature_unit'), 'celsius');
    assert.equal(url.searchParams.get('precipitation_unit'), 'mm');
    assert.equal(url.searchParams.get('timezone'), tokyo.tz);
    assert.ok(url.searchParams.get('current').split(',').includes('temperature_2m'));
    assert.ok(url.searchParams.get('current').split(',').includes('precipitation'));
    return response({ ...current, temperature_2m: -2.4, precipitation: 0, interval: 900 });
  } });
  assert.equal(weather.temperature_2m, -2.4);
  assert.equal(weather.precipitation, 0);
  assert.equal(weather.interval, 900);
});

test('缺失和无效的新增指标不伪造零值，也不丢失有效天气', async () => {
  for (const metrics of [{}, { temperature_2m: null, precipitation: null }, { temperature_2m: '20', precipitation: -1, interval: -900 }]) {
    const weather = await fetchWeather(tokyo, { fetcher: async () => response({ ...current, ...metrics }) });
    assert.equal(weather.type, 'overcast');
    assert.equal(weather.temperature_2m, null);
    assert.equal(weather.precipitation, null);
    assert.equal(weather.interval, null);
  }
});

test('温度换算覆盖冰点、负温度及两种单位相同的 -40 度', () => {
  assert.equal(formatTemperature(0), '0°C');
  assert.equal(formatTemperature(0, 'fahrenheit'), '32°F');
  assert.equal(formatTemperature(100, 'fahrenheit'), '212°F');
  assert.equal(formatTemperature(-40, 'fahrenheit'), '-40°F');
  assert.equal(formatTemperature(-5.5, 'fahrenheit'), '22.1°F');
  for (const value of [null, undefined, NaN, Infinity, '0']) assert.equal(formatTemperature(value), '—');
});

test('空气质量单独请求当地美国 AQI，并传递取消信号', async () => {
  const signal = new AbortController().signal;
  const air = await fetchAirQuality(tokyo, { signal, fetcher: async (url, options) => {
    assert.equal(url.origin, 'https://air-quality-api.open-meteo.com');
    assert.equal(url.searchParams.get('current'), 'us_aqi');
    assert.equal(url.searchParams.get('latitude'), '35.676');
    assert.equal(url.searchParams.get('longitude'), '139.650');
    assert.equal(url.searchParams.get('timezone'), tokyo.tz);
    assert.equal(options.signal, signal);
    return response({ us_aqi: 0, time: '2026-10-08T12:00' });
  } });
  assert.equal(air.us_aqi, 0);
  assert.ok(Number.isFinite(air.fetchedAt));
});

test('空气质量接口错误及缺失、负值不会被判为良好空气', async () => {
  await assert.rejects(fetchAirQuality(tokyo, { fetcher: async () => ({ ok: false, status: 503 }) }), /HTTP 503/);
  for (const us_aqi of [undefined, null, -1, '42', Infinity]) {
    await assert.rejects(fetchAirQuality(tokyo, { fetcher: async () => response({ us_aqi }) }), /invalid/);
    assert.equal(airQualityLevel(us_aqi), null);
  }
});

test('美国 AQI 分级在显示整数的边界正确切换', () => {
  for (const [aqi, level] of [[0, 'good'], [50, 'good'], [50.4, 'good'], [50.5, 'moderate'], [100, 'moderate'], [101, 'sensitive'], [150, 'sensitive'], [151, 'unhealthy'], [200, 'unhealthy'], [201, 'veryUnhealthy'], [300, 'veryUnhealthy'], [301, 'hazardous'], [500, 'hazardous']]) {
    assert.equal(airQualityLevel(aqi), level, `AQI ${aqi}`);
  }
});

test('来源链接带上对应地点、温度单位及空气质量标准', () => {
  const weatherUrl = new URL(weatherPageUrl(tokyo, 'fahrenheit'));
  assert.equal(weatherUrl.searchParams.get('temperature_unit'), 'fahrenheit');
  assert.ok(weatherUrl.searchParams.get('current').includes('precipitation'));
  const airUrl = new URL(airQualityPageUrl(tokyo));
  assert.equal(airUrl.searchParams.get('current'), 'us_aqi');
  assert.equal(airUrl.searchParams.get('timezone'), tokyo.tz);
});
