import { airQualityLevel, formatTemperature } from '../world/weather.js';
import { getLocale, t } from '../i18n/index.js';

export function updateWeatherDetails(element, { live, airQuality, temperatureUnit = 'celsius', simulated = false, compact = false } = {}) {
  const metric = name => element.querySelector(`[data-weather-metric="${name}"]`);
  const unavailable = t(simulated ? 'weather.simulatedData' : 'weather.noData');
  metric('temperature').textContent = formatTemperature(live?.temperature_2m, temperatureUnit, getLocale());
  metric('temperatureNote').textContent = Number.isFinite(live?.temperature_2m) ? t('weather.currentTemperature') : unavailable;
  const precipitation = live?.precipitation;
  metric('precipitation').textContent = Number.isFinite(precipitation)
    ? new Intl.NumberFormat(getLocale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(precipitation) + ' mm' : '—';
  metric('precipitationNote').textContent = Number.isFinite(precipitation)
    ? (live.interval ? t('weather.precipitationPeriod', { minutes: new Intl.NumberFormat(getLocale(), { maximumFractionDigits: 1 }).format(live.interval / 60) }) : t('weather.periodUnknown')) : unavailable;
  const level = airQualityLevel(airQuality?.us_aqi);
  metric('airQuality').textContent = level ? String(Math.round(airQuality.us_aqi)) : '—';
  metric('airQuality').dataset.level = level || 'unknown';
  const airDescription = level ? `${t('weather.usAqi')} · ${t(`weather.aqi.${level}`)}` : unavailable;
  metric('airQualityNote').textContent = compact ? (level ? ' · ' + t(`weather.aqi.${level}`) : '') : airDescription;
  metric('temperature').parentElement.title = `${t('weather.temperature')} · ${metric('temperature').textContent} · ${metric('temperatureNote').textContent}`;
  metric('precipitation').parentElement.title = `${t('weather.precipitation')} · ${metric('precipitation').textContent} · ${metric('precipitationNote').textContent}`;
  metric('airQuality').parentElement.title = `${t('weather.airQuality')} · ${metric('airQuality').textContent} · ${airDescription}`;
}
