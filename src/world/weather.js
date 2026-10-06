// WMO interpretation: https://open-meteo.com/en/docs
export const WMO_TYPE = (c) => c === 0 ? 'clear' : c === 1 ? 'fewcloud' : c === 2 ? 'cloudy' : c === 3 ? 'overcast' : (c === 45 || c === 48) ? 'fog'
  : (c >= 51 && c <= 55) ? 'lightrain' : (c === 56 || c === 57 || c === 66 || c === 67) ? 'sleet' : c === 61 ? 'lightrain' : c === 63 ? 'rain' : c === 65 ? 'heavyrain'
  : (c === 71 || c === 77 || c === 85) ? 'lightsnow' : (c === 73 || c === 86) ? 'snow' : c === 75 ? 'blizzard' : c === 80 ? 'lightrain' : c === 81 ? 'rain' : c === 82 ? 'downpour'
  : c === 95 ? 'tshower' : (c === 96 || c === 99) ? 'tstorm' : 'cloudy';

export async function fetchWeather(loc, { signal, fetcher = fetch } = {}) {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.search = new URLSearchParams({
    latitude: loc.lat.toFixed(3), longitude: loc.lon.toFixed(3),
    current: 'cloud_cover,wind_speed_10m,wind_direction_10m,weather_code', wind_speed_unit: 'ms',
  });
  const response = await fetcher(url, { signal });
  if (!response.ok) throw new Error(`天气服务返回 HTTP ${response.status}`);
  const data = await response.json(), current = data.current;
  if (!current || !['cloud_cover', 'wind_speed_10m', 'wind_direction_10m', 'weather_code'].every(k => Number.isFinite(current[k]))) {
    throw new Error('天气服务返回了不完整的数据');
  }
  if (current.cloud_cover < 0 || current.cloud_cover > 100 || current.wind_speed_10m < 0) throw new Error('天气数据超出有效范围');
  return { ...current, fetchedAt: Date.now(), time: current.time, type: WMO_TYPE(current.weather_code) };
}
