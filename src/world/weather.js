import { t } from '../i18n/index.js';
// WMO interpretation: https://open-meteo.com/en/docs
export const WMO_TYPE = (c) => c === 0 ? 'clear' : c === 1 ? 'fewcloud' : c === 2 ? 'cloudy' : c === 3 ? 'overcast' : (c === 45 || c === 48) ? 'fog'
  : (c >= 51 && c <= 55) ? 'lightrain' : (c === 56 || c === 57 || c === 66 || c === 67) ? 'sleet' : c === 61 ? 'lightrain' : c === 63 ? 'rain' : c === 65 ? 'heavyrain'
  : (c === 71 || c === 77 || c === 85) ? 'lightsnow' : (c === 73 || c === 86) ? 'snow' : c === 75 ? 'blizzard' : c === 80 ? 'lightrain' : c === 81 ? 'rain' : c === 82 ? 'downpour'
  : c === 95 ? 'tshower' : (c === 96 || c === 99) ? 'tstorm' : 'cloudy';

export function weatherPageUrl(loc) {
  const url = new URL('https://open-meteo.com/en/docs');
  url.search = new URLSearchParams({
    latitude: loc.lat.toFixed(3), longitude: loc.lon.toFixed(3), timezone: loc.tz,
    current: 'temperature_2m,weather_code,cloud_cover,wind_speed_10m',
    hourly: 'temperature_2m,precipitation_probability,cloud_cover,wind_speed_10m', wind_speed_unit: 'ms',
  });
  return url.href;
}

export async function fetchWeather(loc, { signal, fetcher = fetch } = {}) {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.search = new URLSearchParams({
    latitude: loc.lat.toFixed(3), longitude: loc.lon.toFixed(3),
    current: 'cloud_cover,wind_speed_10m,wind_direction_10m,weather_code', wind_speed_unit: 'ms',
  });
  const response = await fetcher(url, { signal });
  if (!response.ok) throw new Error(t('weather.httpError', { status: response.status }));
  const data = await response.json(), current = data.current;
  if (!current || !['cloud_cover', 'wind_speed_10m', 'wind_direction_10m', 'weather_code'].every(k => Number.isFinite(current[k]))) {
    throw new Error(t('weather.incompleteError'));
  }
  if (current.cloud_cover < 0 || current.cloud_cover > 100 || current.wind_speed_10m < 0) throw new Error(t('weather.invalidError'));
  return { ...current, fetchedAt: Date.now(), time: current.time, type: WMO_TYPE(current.weather_code) };
}
