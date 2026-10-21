export const WEATHER_CACHE_TTL = 3 * 60 * 60 * 1000;
export const weatherCacheKey = loc => `wallpaper.weather.${loc.lat.toFixed(3)},${loc.lon.toFixed(3)}.${loc.tz}`;
export function readWeatherCache(storage, loc, now = Date.now()) {
  try {
    const value = JSON.parse(storage.getItem(weatherCacheKey(loc)));
    if (!value || !Number.isFinite(value.fetchedAt) || now - value.fetchedAt < 0 || now - value.fetchedAt > WEATHER_CACHE_TTL) return null;
    if (!['cloud_cover','wind_speed_10m','wind_direction_10m','weather_code'].every(key => Number.isFinite(value[key]))) return null;
    if (value.cloud_cover < 0 || value.cloud_cover > 100 || value.wind_speed_10m < 0) return null;
    return { ...value, cached: true };
  } catch { return null; }
}
export function saveWeatherCache(storage, loc, weather) {
  try { storage.setItem(weatherCacheKey(loc), JSON.stringify(weather)); } catch {}
}
