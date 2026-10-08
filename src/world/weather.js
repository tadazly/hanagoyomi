import { t } from '../i18n/index.js';
// WMO interpretation: https://open-meteo.com/en/docs
export const WMO_TYPE = (c) => c === 0 ? 'clear' : c === 1 ? 'fewcloud' : c === 2 ? 'cloudy' : c === 3 ? 'overcast' : (c === 45 || c === 48) ? 'fog'
  : (c >= 51 && c <= 55) ? 'lightrain' : (c === 56 || c === 57 || c === 66 || c === 67) ? 'sleet' : c === 61 ? 'lightrain' : c === 63 ? 'rain' : c === 65 ? 'heavyrain'
  : (c === 71 || c === 77 || c === 85) ? 'lightsnow' : (c === 73 || c === 86) ? 'snow' : c === 75 ? 'blizzard' : c === 80 ? 'lightrain' : c === 81 ? 'rain' : c === 82 ? 'downpour'
  : c === 95 ? 'tshower' : (c === 96 || c === 99) ? 'tstorm' : 'cloudy';

export function weatherPageUrl(loc, temperatureUnit = 'celsius') {
  const url = new URL('https://open-meteo.com/en/docs');
  url.search = new URLSearchParams({
    latitude: loc.lat.toFixed(3), longitude: loc.lon.toFixed(3), timezone: loc.tz,
    current: 'temperature_2m,precipitation,weather_code,cloud_cover,wind_speed_10m',
    wind_speed_unit: 'ms', temperature_unit: temperatureUnit === 'fahrenheit' ? 'fahrenheit' : 'celsius', precipitation_unit: 'mm',
  });
  return url.href;
}

export async function fetchWeather(loc, { signal, fetcher = fetch } = {}) {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.search = new URLSearchParams({
    latitude: loc.lat.toFixed(3), longitude: loc.lon.toFixed(3),
    current: 'temperature_2m,precipitation,cloud_cover,wind_speed_10m,wind_direction_10m,weather_code',
    wind_speed_unit: 'ms', temperature_unit: 'celsius', precipitation_unit: 'mm', timezone: loc.tz,
  });
  const response = await fetcher(url, { signal });
  if (!response.ok) throw new Error(t('weather.httpError', { status: response.status }));
  const data = await response.json(), current = data.current;
  if (!current || !['cloud_cover', 'wind_speed_10m', 'wind_direction_10m', 'weather_code'].every(k => Number.isFinite(current[k]))) {
    throw new Error(t('weather.incompleteError'));
  }
  if (current.cloud_cover < 0 || current.cloud_cover > 100 || current.wind_speed_10m < 0) throw new Error(t('weather.invalidError'));
  return {
    ...current, fetchedAt: Date.now(), type: WMO_TYPE(current.weather_code),
    temperature_2m: Number.isFinite(current.temperature_2m) ? current.temperature_2m : null,
    precipitation: Number.isFinite(current.precipitation) && current.precipitation >= 0 ? current.precipitation : null,
    interval: Number.isFinite(current.interval) && current.interval > 0 ? current.interval : null,
  };
}

export function airQualityPageUrl(loc) {
  const url = new URL('https://open-meteo.com/en/docs/air-quality-api');
  url.search = new URLSearchParams({ latitude: loc.lat.toFixed(3), longitude: loc.lon.toFixed(3), timezone: loc.tz, current: 'us_aqi' });
  return url.href;
}

export async function fetchAirQuality(loc, { signal, fetcher = fetch } = {}) {
  const url = new URL('https://air-quality-api.open-meteo.com/v1/air-quality');
  url.search = new URLSearchParams({ latitude: loc.lat.toFixed(3), longitude: loc.lon.toFixed(3), timezone: loc.tz, current: 'us_aqi' });
  const response = await fetcher(url, { signal });
  if (!response.ok) throw new Error(t('weather.airQualityHttpError', { status: response.status }));
  const { current } = await response.json();
  if (!Number.isFinite(current?.us_aqi) || current.us_aqi < 0) throw new Error(t('weather.airQualityInvalidError'));
  return { ...current, fetchedAt: Date.now() };
}

export function formatTemperature(celsius, unit = 'celsius', locale = 'en-US') {
  if (!Number.isFinite(celsius)) return '—';
  const value = unit === 'fahrenheit' ? celsius * 9 / 5 + 32 : celsius;
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value) + (unit === 'fahrenheit' ? '°F' : '°C');
}

// Open-Meteo 的 us_aqi 采用美国标准，不能当作中国 AQI 使用。
export function airQualityLevel(aqi) {
  if (!Number.isFinite(aqi) || aqi < 0) return null;
  const value = Math.round(aqi);
  return value <= 50 ? 'good' : value <= 100 ? 'moderate' : value <= 150 ? 'sensitive' : value <= 200 ? 'unhealthy' : value <= 300 ? 'veryUnhealthy' : 'hazardous';
}
