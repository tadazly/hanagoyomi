const LOCATION_KEY = 'meadow.loc';
const listeners = new Set();

// 启动面板与世界渲染使用同一份校验，损坏的记录不会被当作已设置地点。
export function getSavedLocation() {
  try {
    const loc = JSON.parse(localStorage.getItem(LOCATION_KEY) || 'null');
    if (!loc || !Number.isFinite(loc.lat) || Math.abs(loc.lat) > 90 || !Number.isFinite(loc.lon) || Math.abs(loc.lon) > 180 || typeof loc.name !== 'string' || typeof loc.tz !== 'string') return null;
    new Intl.DateTimeFormat('en-US', { timeZone: loc.tz });
    return { name: loc.name.slice(0, 80), lat: loc.lat, lon: loc.lon, tz: loc.tz };
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
