import { storageKey } from '../platform/environment.js';

export const INTERFACE_KEY = storageKey('hanagoyomi.interface.v1');
export const UI_SCALES = [.75, 1, 1.25];
export function interfaceScale(value) { return value === 1.5 ? 1.25 : UI_SCALES.includes(value) ? value : 1; }
export function getUiScale(doc = globalThis.document) { return interfaceScale(Number(doc?.documentElement?.dataset.uiScale)); }

// DOM 矩形是屏幕坐标，定位和 scrollTop 使用缩放前的 CSS 坐标。
export function uiRect(element) {
  const rect = element.getBoundingClientRect(), scale = getUiScale(element.ownerDocument);
  return Object.fromEntries(['left', 'top', 'right', 'bottom', 'width', 'height'].map(key => [key, rect[key] / scale]));
}

export function initInterfaceScale(doc = document) {
  const view = doc.defaultView, root = doc.documentElement;
  let scale = 1;
  try {
    const saved = JSON.parse(view.localStorage.getItem(INTERFACE_KEY));
    scale = interfaceScale(saved?.scale);
    if (saved?.scale === 1.5) view.localStorage.setItem(INTERFACE_KEY, JSON.stringify({ ...saved, scale }));
  } catch {}
  const compact = () => {
    root.dataset.uiCompact = String(view.innerWidth / scale < 380);
    root.dataset.uiShort = String(view.innerHeight / scale < 500);
  };
  const apply = () => {
    root.dataset.uiScale = String(scale); root.style.setProperty('--ui-scale', scale);
    doc.querySelectorAll('input[name="uiScale"]').forEach(input => { input.checked = Number(input.value) === scale; });
    compact(); doc.dispatchEvent(new view.Event('uiscalechange'));
  };
  doc.querySelectorAll('input[name="uiScale"]').forEach(input => input.addEventListener('change', () => {
    if (!input.checked) return;
    scale = interfaceScale(Number(input.value)); apply();
    try { view.localStorage.setItem(INTERFACE_KEY, JSON.stringify({ scale })); } catch {}
  }));
  view.addEventListener('resize', compact);
  apply();
}
