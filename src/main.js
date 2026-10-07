import './styles/app.css';
import { initShell, updateObservation } from './ui/shell.js';
import { startWorld } from './rendering/world.js';
import { initI18n, setMessage } from './i18n/index.js';

initI18n();
initShell();
try {
  startWorld(updateObservation);
} catch (error) {
  console.error('Hanagoyomi 初始化失败', error);
  setMessage(document.getElementById('errorText'), 'error.initialization');
  document.getElementById('error').classList.add('show');
  document.getElementById('loader').classList.add('done');
}
