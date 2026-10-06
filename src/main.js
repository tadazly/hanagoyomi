import './styles/app.css';
import { initShell, updateObservation } from './ui/shell.js';
import { startWorld } from './rendering/world.js';

initShell();
try {
  startWorld(updateObservation);
} catch (error) {
  console.error('Hanagoyomi 初始化失败', error);
  document.getElementById('errorText').textContent = '图形初始化失败。请尝试更新浏览器、启用硬件加速，或重新加载页面。';
  document.getElementById('error').classList.add('show');
  document.getElementById('loader').classList.add('done');
}
