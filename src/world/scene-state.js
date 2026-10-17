import { WX_TYPES, WX_KEYS, wxPreset } from './weather-presets.js';
import { localTimeToUTC } from './clock.js';

// 作品只保存稳定的构图和风景；画质、语言、城市、组件及交互权限属于本机偏好。
export const SCENE_VERSION = 1;
export const SCENE_SETTINGS = Object.freeze({
  auto: false, god: true, petals: true, sway: false, constel: false, flies: true,
  flowerGlow: false, bloom: true, streamScale: false, infMem: false, lensDrops: true,
  lowSaturation: false, streamDist: 'near', bloomR: 4, sunAz: 317, dof: .6,
  wxMode: 'manual', wxType: 'clear', coverage: .16, density: .8, wind: 18,
  breeze: .3, fogVisS: 1000, rainAmt: 0, snowAmt: 0, boltFreq: 0, puddle: 0, snowMax: 0,
});
export const WEATHER_SETTINGS = Object.freeze(['wxMode', 'wxType', 'coverage', 'density', 'wind', 'breeze', 'fogVisS', 'rainAmt', 'snowAmt', 'boltFreq', 'puddle', 'snowMax']);
const RANGES = { bloomR: [1.5, 10], sunAz: [0, 360], dof: [0, 1], coverage: [0, 1], density: [.3, 2.5], wind: [0, 200], breeze: [0, 1], fogVisS: [0, 1000], rainAmt: [0, 1], snowAmt: [0, 1], boltFreq: [0, 4], puddle: [0, 1], snowMax: [0, 1] };
const ENUMS = { streamDist: ['near', 'mid', 'far'], wxMode: ['follow', 'dynamic', 'manual', 'off'], wxType: Object.keys(WX_TYPES) };
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const validTimezones = new Set();
function skyLocation(value) {
  if (!object(value) || !Number.isFinite(value.lat) || !Number.isFinite(value.lon)
    || typeof value.tz !== 'string' || !/^[A-Za-z][A-Za-z0-9_+\/-]{0,63}$/.test(value.tz)) throw new TypeError('无效的场景天空位置');
  if (!validTimezones.has(value.tz)) {
    new Intl.DateTimeFormat('en', { timeZone: value.tz });
    // 只缓存少量已验证时区，避免不可信导入让模块缓存无限增长。
    if (validTimezones.size < 128) validTimezones.add(value.tz);
  }
  return { lat: number(value.lat, undefined, -90, 90), lon: number(value.lon, undefined, -180, 180), tz: value.tz };
}
function motionSnapshot(value) {
  if (!object(value) || !Number.isFinite(value.time) || !Number.isFinite(value.windAngle)
    || value.time < 0 || value.time > 1e9 || Math.abs(value.windAngle) > 1000
    || !Array.isArray(value.windOffset) || value.windOffset.length !== 2
    || ![0, 1].every(index => Number.isFinite(value.windOffset[index]) && Math.abs(value.windOffset[index]) <= 1e9)) throw new TypeError('无效的场景运动相位');
  // 秒、弧度、公里；上限覆盖多年持续运行，同时拒绝会破坏 GPU 运算的无界值。
  return { time: value.time, windAngle: value.windAngle, windOffset: [...value.windOffset] };
}
function number(value, fallback, min, max) {
  if (value === undefined) return fallback;
  // 天气插值 exp(log(30000)) 会产生 30000.000000000007；只容忍边界的浮点舍入误差。
  const minError = Math.max(1, Math.abs(min)) * 1e-9, maxError = Math.max(1, Math.abs(max)) * 1e-9;
  if (!Number.isFinite(value) || value < min - minError || value > max + maxError) throw new RangeError('无效的场景数值');
  return Math.min(max, Math.max(min, value));
}
function boolean(value, fallback) {
  if (value === undefined) return fallback;
  if (typeof value !== 'boolean') throw new TypeError('无效的场景开关');
  return value;
}

export function validateScene(input) {
  try {
    if (!object(input) || input.version !== SCENE_VERSION) return null;
    for (const key of ['settings', 'camera', 'environment', 'freeze']) if (input[key] !== undefined && !object(input[key])) return null;
    const settings = {};
    for (const [key, fallback] of Object.entries(SCENE_SETTINGS)) {
      const value = input.settings?.[key];
      if (ENUMS[key]) {
        if (value !== undefined && !ENUMS[key].includes(value)) return null;
        settings[key] = value ?? fallback;
      } else settings[key] = typeof fallback === 'boolean' ? boolean(value, fallback) : number(value, fallback, ...RANGES[key]);
    }
    const c = input.camera || {};
    const camera = { x: number(c.x, -2801.597137599582, -1e8, 1e8), z: number(c.z, 4700.742448387173, -1e8, 1e8),
      agl: number(c.agl, 2.2, 1.2, 6501.2), yaw: number(c.yaw, 3.9269908169872414, -1e9, 1e9),
      pitch: number(c.pitch, .04, -1.5, 1.5), roll: number(c.roll, 0, -Math.PI, Math.PI), fov: number(c.fov, 60, 28, 95) };
    if (c.y !== undefined) camera.y = number(c.y, undefined, -1e6, 1e6);
    if (c.focus !== undefined) camera.focus = number(c.focus, undefined, 1.5, 600);
    const e = input.environment || {};
    for (const key of ['time', 'weather', 'skyLocation', 'motion']) if (e[key] !== undefined && !object(e[key])) return null;
    const tm = e.time || {}, w = e.weather || {};
    if (w.current !== undefined && !object(w.current)) return null;
    const time = { ms: number(tm.ms, Date.parse('2026-10-18T06:00:00Z'), Date.parse('1900-01-01'), Date.parse('2200-01-01')),
      followNow: boolean(tm.followNow, false), speedIndex: number(tm.speedIndex, 0, 0, 7) };
    if (!Number.isInteger(time.speedIndex)) return null;
    if (tm.localHour !== undefined) time.localHour = number(tm.localHour, undefined, 0, 24);
    const type = w.type ?? settings.wxType;
    if (!Object.hasOwn(WX_TYPES, type)) return null;
    const preset = wxPreset(type), current = {};
    for (const key of WX_KEYS) current[key] = number(w.current?.[key], preset[key], key === 'vis' ? 60 : 0, key === 'vis' ? 30000 : key === 'wind' ? 200 : key === 'dens' ? 2.5 : key === 'bolt' ? 4 : 1);
    const weather = { type, current, wet: number(w.wet, current.wet, 0, 1), snowCover: number(w.snowCover, current.snowCov, 0, 1) };
    const freeze = { time: boolean(input.freeze?.time, true), weather: boolean(input.freeze?.weather, true) };
    const environment = { time, weather };
    // 天空位置只服务作品的天文绘制，不包含城市名称或实时天气请求偏好。
    if (e.skyLocation !== undefined) environment.skyLocation = skyLocation(e.skyLocation);
    // 保存自然运动的起始相位，载入后视觉时钟仍继续流动。
    if (e.motion !== undefined) environment.motion = motionSnapshot(e.motion);
    return { version: SCENE_VERSION, settings, camera, environment, freeze };
  } catch { return null; }
}

// 精选作品按当前城市的当地时刻展示；捕获后的收藏只有绝对毫秒，不随城市重新解释。
export function resolveSceneTime(input, timezone, now = Date.now()) {
  const scene = validateScene(input);
  if (!scene) return null;
  const time = scene.environment.time;
  if (time.localHour !== undefined) {
    time.ms = localTimeToUTC(scene.environment.skyLocation?.tz || timezone, now, time.localHour);
    delete time.localHour;
  }
  return scene;
}

// 定格环境不会影响草花、云风、镜头雨滴等视觉动画的时钟。
export function sceneFrameTiming(elapsedMs, { time = false, weather = false } = {}) {
  const elapsed = Math.max(0, elapsedMs), visualDt = Math.min(.1, elapsed / 1000);
  return { clockElapsed: time ? 0 : elapsed, visualDt, weatherDt: weather ? 0 : visualDt };
}

export function renderSize(width, height, { dpr = 1, maxWidth = 16384, maxHeight = 16384, maxPixels = Infinity } = {}) {
  const w = Math.max(1, Number(width) || 1), h = Math.max(1, Number(height) || 1);
  const scale = Math.min(Math.max(.01, Number(dpr) || 1), maxWidth / w, maxHeight / h, Math.sqrt(maxPixels / (w * h)));
  return { width: Math.max(1, Math.floor(w * scale)), height: Math.max(1, Math.floor(h * scale)) };
}
