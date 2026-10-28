import { storageKey } from '../platform/environment.js';
const LOCATION_KEY = storageKey('meadow.loc');
const listeners = new Set();

// 启动面板与世界渲染使用同一份校验，损坏的记录不会被当作已设置地点。
export function getSavedLocation() {
  try {
    const loc = JSON.parse(localStorage.getItem(LOCATION_KEY) || 'null');
    if (!loc || !Number.isFinite(loc.lat) || Math.abs(loc.lat) > 90 || !Number.isFinite(loc.lon) || Math.abs(loc.lon) > 180 || typeof loc.name !== 'string' || typeof loc.tz !== 'string') return null;
    new Intl.DateTimeFormat('en-US', { timeZone: loc.tz });
    const result = { name: loc.name.slice(0, 100), lat: loc.lat, lon: loc.lon, tz: loc.tz };
    // 旧版记录仍可读取；新地点保留稳定 ID 和三语名称，重载无需等待完整地点库。
    if (Number.isSafeInteger(loc.id) && loc.id > 0) result.id = loc.id;
    if (typeof loc.country === 'string' && /^[A-Z]{2}$/.test(loc.country)) result.country = loc.country;
    if (typeof loc.region === 'string' && /^[A-Z]{2}\.[\w-]{1,20}$/.test(loc.region)) result.region = loc.region;
    for (const key of ['names', 'countryNames', 'regionNames']) {
      if (Array.isArray(loc[key]) && loc[key].length === 3 && loc[key].every(name => typeof name === 'string')) result[key] = loc[key].map(name => name.slice(0, 100));
    }
    return result;
  } catch { return null; }
}

export function saveLocation(loc) {
  try { localStorage.setItem(LOCATION_KEY, JSON.stringify(loc)); } catch {}
  listeners.forEach(listener => listener(loc));
}

export function onLocationChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
