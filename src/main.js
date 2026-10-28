import './styles/app.css';
import projectLicense from '../LICENSE?raw';
import thirdPartyNotices from '../THIRD_PARTY_NOTICES.md?raw';
import { initShell, updateObservation } from './ui/shell.js';
import { startWorld } from './rendering/world.js';
import { initI18n, setMessage } from './i18n/index.js';
import { WALLPAPER_MODE } from './platform/environment.js';
import { attachWallpaper } from './platform/wallpaper.js';
import { initGallery } from './ui/gallery.js';

import moonSurfaceUrl from './assets/moon-albedo.webp?url';
import galaxyUrl from './assets/milky-way.webp?url';
import galaxyLowUrl from './assets/milky-way-low.webp?url';
import galaxyMediumUrl from './assets/milky-way-medium.webp?url';
import galaxyUltraUrl from './assets/milky-way-ultra.webp?url';
import starCatalogUrl from './assets/hipparcos-v7.3.bin?url&no-inline';
import starCatalogInline from './assets/hipparcos-v7.3.bin?url&inline';

import { loadCloudNoiseData } from '#cloud-noise';
import { loadLocationData } from '#location-data';
import cloudMapLowUrl from './assets/eve-weather-low.webp?url';
import cloudMapHighUrl from './assets/eve-weather-high.webp?url';
import cloudMapUltraUrl from './assets/eve-weather-ultra.webp?url';
import cloudStatisticsUrl from './assets/eve-weather-statistics.webp?url';

export let world;

if (WALLPAPER_MODE) document.body.dataset.wallpaper = 'true';
initI18n();
const shell = initShell({ licenseText: `${projectLicense}\n\n${thirdPartyNotices}` });
try {
  world = startWorld(updateObservation, { moonSurfaceUrl, cloudNoiseLoader: loadCloudNoiseData, locationDataLoader: loadLocationData,
    cloudMapUrls: { low: cloudMapLowUrl, high: cloudMapHighUrl, ultra: cloudMapUltraUrl }, cloudStatisticsUrl, starCatalogUrl: import.meta.env.MODE === 'wallpaper' ? starCatalogInline : starCatalogUrl,
    galaxyUrls: { low: galaxyLowUrl, med: galaxyMediumUrl, high: galaxyUrl, ultra: galaxyUltraUrl } });
  initGallery(world, shell);
  attachWallpaper(world, shell);
} catch (error) {
  console.error('Hanagoyomi 初始化失败', error);
  setMessage(document.getElementById('errorText'), 'error.initialization');
  document.getElementById('error').classList.add('show');
  document.getElementById('loader').classList.add('done');
}
