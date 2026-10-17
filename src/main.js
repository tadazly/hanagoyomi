import './styles/app.css';
import { initShell, updateObservation } from './ui/shell.js';
import { startWorld } from './rendering/world.js';
import { initI18n, setMessage } from './i18n/index.js';
import { WALLPAPER_MODE } from './platform/environment.js';
import { attachWallpaper } from './platform/wallpaper.js';
import { initGallery } from './ui/gallery.js';

export let world;

if (WALLPAPER_MODE) document.body.dataset.wallpaper = 'true';
initI18n();
const shell = initShell();
try {
  world = startWorld(updateObservation);
  initGallery(world, shell);
  attachWallpaper(world, shell);
} catch (error) {
  console.error('Hanagoyomi 初始化失败', error);
  setMessage(document.getElementById('errorText'), 'error.initialization');
  document.getElementById('error').classList.add('show');
  document.getElementById('loader').classList.add('done');
}
