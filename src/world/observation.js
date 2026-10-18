import { fetchWeather, fetchAirQuality } from './weather.js';
import { getAstronomy, getSunEvents, phaseIndex } from './astronomy.js';

const REFRESH_MS = 15 * 60 * 1000;
const RETRY_MS = 60 * 1000;
const CACHE_MAX_MS = 3 * 60 * 60 * 1000;
const locationKey = loc => `${loc.lat},${loc.lon}|${loc.tz}`;

// 真实观测与场景模拟各自更新，切换场景不会把模拟值当作实况。
export function createObservationStore({ weather = fetchWeather, airQuality = fetchAirQuality, now = Date.now, onChange = () => {}, cache = null } = {}) {
  let key = '', generation = 0, controller, pending = null, nextFetch = 0;
  let value = { live: null, airQuality: null, status: 'connecting' };
  const read = () => ({ ...value });
  function refresh(loc, { live, airQuality: air, force = false } = {}) {
    const nextKey = locationKey(loc), time = now();
    if (key !== nextKey) {
      controller?.abort(); generation++; key = nextKey; pending = null; nextFetch = 0;
      value = { live: null, airQuality: null, status: 'connecting' };
      try { const saved = cache?.read(loc); if (saved && Number.isFinite(saved.fetchedAt) && time >= saved.fetchedAt && time - saved.fetchedAt <= CACHE_MAX_MS) value = { live: { ...saved, cached: true }, airQuality: null, status: 'cached' }; } catch {}
    }
    if (value.live && (time < value.live.fetchedAt || time - value.live.fetchedAt > CACHE_MAX_MS)) { value.live = null; value.status = 'unavailable'; }
    if (value.airQuality && time - value.airQuality.fetchedAt > CACHE_MAX_MS) value.airQuality = null;
    // 跟随天气模式已有同地点实况时复用，避免重复调用天气服务。
    if (live && Number.isFinite(live.fetchedAt) && time >= live.fetchedAt && time - live.fetchedAt < REFRESH_MS && (!value.live || live.fetchedAt >= value.live.fetchedAt)) {
      value.live = live; value.status = live.cached ? 'cached' : 'live';
      nextFetch = Math.max(nextFetch, live.fetchedAt + REFRESH_MS);
    }
    if (air && Number.isFinite(air.fetchedAt) && time >= air.fetchedAt && time - air.fetchedAt < REFRESH_MS && (!value.airQuality || air.fetchedAt >= value.airQuality.fetchedAt)) value.airQuality = air;
    if (pending || (!force && time < nextFetch)) return pending || Promise.resolve(read());
    const request = ++generation;
    controller = new AbortController();
    const signal = controller.signal;
    const controllerForRequest = controller;
    const timeout = setTimeout(() => controllerForRequest.abort(), 8000);
    nextFetch = time + RETRY_MS;
    const current = () => request === generation && key === nextKey;
    pending = Promise.allSettled([
      weather(loc, { signal }).then(result => {
        if (!current()) return;
        value.live = result; value.status = 'live';
        try { cache?.write(loc, result); } catch {}
        nextFetch = now() + REFRESH_MS;
        onChange();
      }, () => {
        if (!current()) return;
        value.status = value.live ? 'cached' : 'unavailable';
        if (value.live) value.live = { ...value.live, cached: true };
        onChange();
      }),
      airQuality(loc, { signal }).then(result => {
        if (!current()) return;
        value.airQuality = result; onChange();
      }, () => { if (current()) { value.airQuality = null; onChange(); } }),
    ]).finally(() => {
      clearTimeout(timeout);
      if (current()) pending = null;
    }).then(read);
    return pending;
  }
  return { read, refresh };
}

export function realObservationState(scene, observed, now = Date.now()) {
  const { loc } = scene, astronomy = getAstronomy(now, loc);
  const live = observed.live;
  return {
    ...scene, loc, ms: now, live, airQuality: observed.airQuality,
    followNow: true, speed: 1, simulatedWeather: false, hideUnavailableWeather: false,
    weather: live?.type ?? null, coverage: live ? live.cloud_cover / 100 : null,
    wind: live?.wind_speed_10m ?? null,
    weatherSource: live ? (live.cached ? 'weather.source.cached' : 'weather.data')
      : observed.status === 'connecting' ? 'weather.source.connecting' : 'weather.unavailable',
    sun: getSunEvents(now, loc), sunAltitude: astronomy.sunAlt * 180 / Math.PI,
    phase: phaseIndex(astronomy.phase),
  };
}
