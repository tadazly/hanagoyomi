import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { browserLanguage, detectLanguage, getLanguage, getLanguagePreference, getLocale, LANGUAGE_KEY, onLanguageChange, setLanguage, t } from '../src/i18n/index.js';
import { MESSAGES } from '../src/i18n/messages.js';
import { CITIES, cityName, locationName, searchCities } from '../src/data/cities.js';
import { phaseName, sunEventsText } from '../src/world/astronomy.js';
import { WX_TYPES } from '../src/world/weather-presets.js';

test('语言优先级：保存选择、浏览器偏好顺序、时区、英语', () => {
  assert.equal(detectLanguage({ savedLanguage: 'ja', languages: ['zh-CN'], timeZone: 'Asia/Shanghai' }), 'ja');
  assert.equal(detectLanguage({ languages: ['en-GB', 'ja-JP'], timeZone: 'Asia/Tokyo' }), 'en');
  assert.equal(detectLanguage({ languages: ['fr-FR', 'ja-JP', 'en-US'] }), 'ja');
  assert.equal(detectLanguage({ savedLanguage: 'corrupt', languages: ['zh-TW'] }), 'zh');
  assert.equal(detectLanguage({ language: 'ZH_hans_CN' }), 'zh');
  assert.equal(detectLanguage({ languages: ['fr-FR'], timeZone: 'Asia/Tokyo' }), 'ja');
  for (const timeZone of ['Asia/Shanghai', 'Asia/Hong_Kong', 'Asia/Macao', 'Asia/Taipei', 'Asia/Urumqi']) {
    assert.equal(detectLanguage({ timeZone }), 'zh');
  }
  for (const timeZone of ['Europe/Paris', 'Asia/Singapore', 'UTC', 'invalid', undefined]) {
    assert.equal(detectLanguage({ languages: ['fr-FR'], timeZone }), 'en');
  }
  assert.equal(detectLanguage(), 'en');
  assert.equal(detectLanguage({ languages: null }), 'en');
});

test('浏览器语言获取失败仍可回退，整个判断不访问定位或权限', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const originalDateTimeFormat = Intl.DateTimeFormat;
  try {
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {
      get languages() { throw new Error('blocked'); },
      language: 'ja-JP',
      get geolocation() { throw new Error('must not access geolocation'); },
      get permissions() { throw new Error('must not access permissions'); },
    } });
    assert.equal(browserLanguage(), 'ja');
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {} });
    Intl.DateTimeFormat = () => ({ resolvedOptions: () => ({ timeZone: 'Asia/Shanghai' }) });
    assert.equal(browserLanguage(), 'zh');
    Intl.DateTimeFormat = () => { throw new Error('blocked'); };
    assert.equal(browserLanguage(), 'en');
  } finally {
    Intl.DateTimeFormat = originalDateTimeFormat;
    if (descriptor) Object.defineProperty(globalThis, 'navigator', descriptor);
    else delete globalThis.navigator;
  }
});

test('手动选择保存，自动模式清除选择，存储不可用时仍能切换', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const stored = new Map();
  let notifications = 0;
  const unsubscribe = onLanguageChange(() => notifications++);
  try {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
      setItem: (key, value) => stored.set(key, value), removeItem: key => stored.delete(key),
    } });
    setLanguage('ja');
    assert.equal(stored.get(LANGUAGE_KEY), 'ja');
    assert.equal(getLocale(), 'ja-JP');
    assert.equal(getLanguagePreference(), 'ja');
    setLanguage('auto');
    assert.equal(stored.has(LANGUAGE_KEY), false);
    assert.equal(getLanguagePreference(), 'auto');
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('blocked'); } });
    setLanguage('zh');
    assert.equal(t('time.paused'), '暂停');
    setLanguage('unknown');
    assert.equal(getLanguage(), 'zh');
    assert.equal(notifications, 3);
  } finally {
    unsubscribe();
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
    else delete globalThis.localStorage;
    setLanguage('en');
  }
});

test('三语词典和界面模板引用完整，插值参数一致', () => {
  for (const language of ['zh', 'ja']) {
    assert.deepEqual(Object.keys(MESSAGES[language]), Object.keys(MESSAGES.en));
    for (const [key, message] of Object.entries(MESSAGES.en)) {
      assert.ok(MESSAGES[language][key]?.trim(), `${language}: ${key}`);
      assert.deepEqual(MESSAGES[language][key].match(/\{\w+\}/g)?.sort(), message.match(/\{\w+\}/g)?.sort(), key);
    }
  }
  for (const path of ['../index.html', '../src/ui/time-controls.js']) {
    const template = readFileSync(new URL(path, import.meta.url), 'utf8');
    for (const match of template.matchAll(/data-i18n(?:-(?:aria-label|title|placeholder|content))?="([^"]+)"/g)) {
      assert.ok(Object.hasOwn(MESSAGES.en, match[1]), match[1]);
    }
  }
  for (const key of Object.keys(WX_TYPES)) assert.ok(MESSAGES.en[`weather.${key}`]);
  assert.equal(t('location.near', { city: 'Tokyo' }, 'en'), 'Near Tokyo');
  assert.equal(t('location.near', { city: '東京' }, 'ja'), '東京付近');
  assert.equal(t('time.paused', {}, 'unsupported'), 'Paused');
});

test('所有城市具备三语名称，可跨语言搜索，旧的定位记录仍可翻译', () => {
  for (const city of CITIES) assert.ok(city[5], city[1]);
  const tokyo = CITIES.find(city => city[1] === 'Tokyo');
  assert.equal(cityName(tokyo, 'zh'), '东京');
  assert.equal(cityName(tokyo, 'ja'), '東京');
  assert.equal(cityName(tokyo, 'en'), 'Tokyo');
  for (const query of ['东京', '東京', 'TOKYO', 'Ｔｏｋｙｏ']) assert.deepEqual(searchCities(query), [tokyo]);
  assert.equal(searchCities('ロンドン')[0][1], 'London');
  assert.equal(locationName({ name: '东京附近' }, 'en'), 'Near Tokyo');
  assert.equal(locationName({ name: '东京附近' }, 'ja'), '東京付近');
  assert.equal(locationName({ name: '我的位置' }, 'ja'), '現在地');
  assert.deepEqual(searchCities(''), []);
});

test('月相与极昼描述随语言切换', () => {
  const loc = { lat: 78.2232, lon: 15.6267, tz: 'Arctic/Longyearbyen' };
  try {
    for (const [language, moon, polar] of [['en', 'Full moon', 'Midnight sun'], ['zh', '满月', '极昼'], ['ja', '満月', '白夜']]) {
      setLanguage(language);
      assert.equal(phaseName(0.5), moon);
      assert.ok(sunEventsText(Date.parse('2026-06-21T12:00:00Z'), loc).includes(polar));
    }
  } finally { setLanguage('en'); }
});
