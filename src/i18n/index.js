import { MESSAGES } from './messages.js';
import { storageKey } from '../platform/environment.js';

export const LANGUAGE_KEY = storageKey('hanagoyomi.language.v1');
export const LOCALES = { en: 'en-US', zh: 'zh-CN', ja: 'ja-JP' };
const CHINESE_ZONES = new Set(['Asia/Shanghai', 'Asia/Chongqing', 'Asia/Chungking', 'Asia/Harbin', 'Asia/Urumqi', 'Asia/Hong_Kong', 'Asia/Macau', 'Asia/Macao', 'Asia/Taipei', 'PRC', 'ROC']);
let currentLanguage = 'en', automatic = true;
const listeners = new Set();

export function normalizeLanguage(value) {
  if (typeof value !== 'string') return null;
  const language = value.trim().toLowerCase().split(/[-_]/)[0];
  return Object.hasOwn(LOCALES, language) ? language : null;
}

// 浏览器偏好优先于时区；不读取地理位置，不调用任何权限 API。
export function detectLanguage({ savedLanguage, languages = [], language, timeZone } = {}) {
  const saved = normalizeLanguage(savedLanguage);
  if (saved) return saved;
  for (const tag of [...(Array.isArray(languages) ? languages : []), language]) {
    const supported = normalizeLanguage(tag);
    if (supported) return supported;
  }
  if (timeZone === 'Asia/Tokyo' || timeZone === 'Japan') return 'ja';
  if (CHINESE_ZONES.has(timeZone)) return 'zh';
  return 'en';
}

function savedPreference() {
  try { return normalizeLanguage(globalThis.localStorage?.getItem(LANGUAGE_KEY)); }
  catch { return null; }
}

export function browserLanguage() {
  const options = {};
  // 分别保护各项读取：存储或语言列表被屏蔽时仍可使用其他信号。
  try { options.languages = globalThis.navigator?.languages; } catch {}
  try { options.language = globalThis.navigator?.language; } catch {}
  try { options.timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch {}
  return detectLanguage(options);
}

export const getLanguage = () => currentLanguage;
export const getLocale = () => LOCALES[currentLanguage];
export const getLanguagePreference = () => automatic ? 'auto' : currentLanguage;

export function t(key, values = {}, language = currentLanguage) {
  const message = MESSAGES[language]?.[key] ?? MESSAGES.en[key] ?? key;
  return message.replace(/\{(\w+)\}/g, (placeholder, name) => values[name] == null ? placeholder : String(values[name]));
}

export function setMessage(element, key, values = {}) {
  element.dataset.i18n = key;
  element.dataset.i18nParams = JSON.stringify(values);
  element.textContent = t(key, values);
}

export function translateDocument(root = globalThis.document) {
  if (!root) return;
  root.documentElement.lang = getLocale();
  root.querySelectorAll('[data-i18n]').forEach(element => {
    const values = element.dataset.i18nParams ? JSON.parse(element.dataset.i18nParams) : {};
    element.textContent = t(element.dataset.i18n, values);
  });
  for (const attribute of ['aria-label', 'title', 'placeholder', 'content']) {
    root.querySelectorAll(`[data-i18n-${attribute}]`).forEach(element => {
      element.setAttribute(attribute, t(element.getAttribute(`data-i18n-${attribute}`)));
    });
  }
  const select = root.getElementById('languageSelect');
  if (select) select.value = getLanguagePreference();
}

export function onLanguageChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function refreshLanguage() {
  translateDocument();
  listeners.forEach(listener => listener(currentLanguage));
}

export function setLanguage(preference) {
  if (preference !== 'auto' && !Object.hasOwn(LOCALES, preference)) return;
  automatic = preference === 'auto';
  currentLanguage = automatic ? browserLanguage() : preference;
  try {
    if (automatic) globalThis.localStorage?.removeItem(LANGUAGE_KEY);
    else globalThis.localStorage?.setItem(LANGUAGE_KEY, currentLanguage);
  } catch {}
  refreshLanguage();
}

export function initI18n() {
  const saved = savedPreference();
  automatic = !saved;
  currentLanguage = saved || browserLanguage();
  translateDocument();
  globalThis.addEventListener?.('languagechange', () => {
    if (automatic) { currentLanguage = browserLanguage(); refreshLanguage(); }
  });
}
