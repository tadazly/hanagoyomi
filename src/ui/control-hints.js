import { setMessage } from '../i18n/index.js';
import { populateIcons } from './icons.js';

export function renderControlHint({ stargazing = false, coarse = false, document: doc = document } = {}) {
  const hint = doc.getElementById('hintText'), icon = doc.getElementById('hintIcon');
  hint.closest('footer').dataset.stargazing = String(stargazing);
  doc.getElementById('exitStargazing').hidden = !stargazing;
  icon.dataset.icon = coarse ? 'hand' : 'mouse'; populateIcons(icon);
  if (stargazing || coarse) { setMessage(hint, stargazing ? 'sky.hint' : 'hint.touch'); return; }
  delete hint.dataset.i18n; delete hint.dataset.i18nParams;
  hint.replaceChildren();
  const key = label => { const element = doc.createElement('kbd'); element.textContent = label; if (label === 'space') element.className = 'key-space'; return element; };
  const message = label => { const element = doc.createElement('span'); setMessage(element, label); return element; };
  const keys = doc.createElement('span'), auto = doc.createElement('span');
  auto.className = 'hint-action'; keys.className = 'control-keys';
  keys.append(...[...'WASD'].map(key));
  auto.append(key('space'), message('camera.auto'));
  hint.append(keys, doc.createTextNode('·'), auto);
}
