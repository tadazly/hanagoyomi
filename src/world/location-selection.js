import { catalogCityLocation, compatibleTimeZone } from '../data/location-catalog.js';

export function locationIsSelected(location, city) {
  if (Number.isSafeInteger(location.id) && location.id > 0) return location.id === city.id;
  return location.lat === city.lat && location.lon === city.lon && city.names.includes(location.name);
}

// 旧版快捷地点不必等待地点库才能使用；列表打开后解析对应 ID 与行政区，保持勾号一致。
export function catalogSelectionLocation(catalog, location) {
  const city = location.id ? catalog.citiesById.get(location.id) : catalog.preset(location.name);
  return city && city.lat === location.lat && city.lon === location.lon ? catalogCityLocation(city) : location;
}

// getCurrentPosition 不能取消，使用代次阻止旧回调提交，并中止可取消的时区请求。
export function createLocationRequestGate() {
  let generation = 0, controller;
  const cancel = () => { generation++; controller?.abort(); controller = null; };
  return {
    cancel,
    begin() {
      cancel(); controller = new AbortController();
      const version = generation, signal = controller.signal;
      return { signal, isCurrent: () => version === generation && !signal.aborted };
    },
  };
}

export async function resolveCoordinateTimeZone(lat, lon, { fetcher = fetch, signal, timeoutMs = 10000 } = {}) {
  if (!Number.isFinite(lat) || Math.abs(lat) > 90 || !Number.isFinite(lon) || Math.abs(lon) > 180) throw new RangeError('无效的定位坐标');
  const controller = new AbortController(), abort = () => controller.abort();
  if (signal?.aborted) abort(); else signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, timeoutMs);
  try {
    if (controller.signal.aborted) throw new DOMException('定位请求已取消', 'AbortError');
    // Open-Meteo 的 timezone=auto 按请求坐标解析 IANA 时区，不采用设备系统时区。
    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.search = new URLSearchParams({ latitude: String(lat), longitude: String(lon), timezone: 'auto', current: 'temperature_2m', forecast_days: '1' });
    const response = await fetcher(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`时区请求 HTTP ${response.status}`);
    const data = await response.json();
    if (controller.signal.aborted) throw new DOMException('定位请求已取消', 'AbortError');
    if (typeof data.timezone !== 'string' || !data.timezone) throw new Error('时区数据缺失');
    return compatibleTimeZone(data.timezone);
  } finally {
    clearTimeout(timer); signal?.removeEventListener('abort', abort);
  }
}
