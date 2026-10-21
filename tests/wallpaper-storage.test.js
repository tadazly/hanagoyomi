import { test } from 'node:test';
import assert from 'node:assert/strict';
import { migrateWallpaperStorage, wallpaperStorageKey } from '../src/platform/storage.js';

function memoryStorage(entries = []) {
  const values = new Map(entries);
  return {
    values,
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  };
}

test('旧版花暦启动覆盖旧键后，新版世界和收藏仍保持迁移值', () => {
  const world = JSON.stringify({ dof: 0, world: { camera: { y: 24 } } });
  const gallery = JSON.stringify([{ id: 'saved-moment' }]);
  const storage = memoryStorage([
    ['wallpaper.meadow.settings.v1', world],
    ['wallpaper.hanagoyomi.gallery.v2', gallery],
    ['meadow.settings.v1', 'website'],
    ['other-wallpaper', 'unrelated'],
  ]);
  migrateWallpaperStorage(storage);
  storage.setItem('wallpaper.meadow.settings.v1', JSON.stringify({ dof: 0.6 }));
  storage.removeItem('wallpaper.hanagoyomi.gallery.v2');
  migrateWallpaperStorage(storage);
  assert.equal(storage.getItem(wallpaperStorageKey('meadow.settings.v1')), world);
  assert.equal(storage.getItem(wallpaperStorageKey('hanagoyomi.gallery.v2')), gallery);
  assert.equal(storage.getItem('meadow.settings.v1'), 'website');
  assert.equal(storage.getItem('other-wallpaper'), 'unrelated');
});

test('组件、位置、语言、轨迹、启动面板和宿主快照一起迁移，保留旧值', () => {
  const keys = ['meadow.loc', 'meadow.trail.v1', 'hanagoyomi.components.v1',
    'hanagoyomi.language.v1', 'hanagoyomi.panelOnStartup.v1', 'hanagoyomi.host-properties.v1'];
  const storage = memoryStorage(keys.map(key => [`wallpaper.${key}`, key]));
  migrateWallpaperStorage(storage);
  for (const key of keys) {
    assert.equal(storage.getItem(wallpaperStorageKey(key)), key);
    assert.equal(storage.getItem(`wallpaper.${key}`), key);
  }
});

test('迁移后删除语言选择不会在下次启动被旧值复活', () => {
  const storage = memoryStorage([['wallpaper.hanagoyomi.language.v1', 'ja']]);
  migrateWallpaperStorage(storage);
  storage.removeItem(wallpaperStorageKey('hanagoyomi.language.v1'));
  migrateWallpaperStorage(storage);
  assert.equal(storage.getItem(wallpaperStorageKey('hanagoyomi.language.v1')), null);
});

test('迁移中断后可重试，已写入的新世界优先于旧版本', () => {
  const storage = memoryStorage([
    ['wallpaper.meadow.settings.v1', 'old-world'], ['wallpaper.meadow.loc', 'old-location'],
  ]);
  const write = storage.setItem;
  storage.setItem = (key, value) => {
    if (key === wallpaperStorageKey('meadow.loc')) throw new Error('quota');
    write(key, value);
  };
  assert.doesNotThrow(() => migrateWallpaperStorage(storage));
  storage.setItem = write;
  storage.setItem(wallpaperStorageKey('meadow.settings.v1'), 'new-world');
  migrateWallpaperStorage(storage);
  assert.equal(storage.getItem(wallpaperStorageKey('meadow.settings.v1')), 'new-world');
  assert.equal(storage.getItem(wallpaperStorageKey('meadow.loc')), 'old-location');
  assert.doesNotThrow(() => migrateWallpaperStorage(undefined));
});

test('壁纸环境初始化时先迁移；普通网页保留原有键且不触发迁移', async () => {
  const locationDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'location');
  const storageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  try {
    const storage = memoryStorage([['wallpaper.meadow.settings.v1', 'world']]);
    Object.defineProperty(globalThis, 'location', { configurable: true, value: { search: '?wallpaper=1' } });
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
    const wallpaper = await import('../src/platform/environment.js?storage-wallpaper');
    assert.equal(wallpaper.WALLPAPER_MODE, true);
    assert.equal(storage.getItem(wallpaper.storageKey('meadow.settings.v1')), 'world');
    const language = await import('../src/i18n/index.js');
    language.setLanguage('ja');
    language.setLanguage('auto');
    assert.equal(storage.getItem(wallpaper.storageKey('hanagoyomi.language.v1')), 'auto');
    const websiteStorage = memoryStorage([['wallpaper.meadow.settings.v1', 'legacy']]);
    Object.defineProperty(globalThis, 'location', { configurable: true, value: { search: '' } });
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: websiteStorage });
    const website = await import('../src/platform/environment.js?storage-website');
    assert.equal(website.WALLPAPER_MODE, false);
    assert.equal(website.storageKey('meadow.settings.v1'), 'meadow.settings.v1');
    assert.equal(websiteStorage.values.size, 1);
  } finally {
    if (locationDescriptor) Object.defineProperty(globalThis, 'location', locationDescriptor);
    else delete globalThis.location;
    if (storageDescriptor) Object.defineProperty(globalThis, 'localStorage', storageDescriptor);
    else delete globalThis.localStorage;
  }
});

test('迁移标记失败后，自动语言和清空轨迹的显式值不会被旧数据复活', () => {
  const storage = memoryStorage([
    ['wallpaper.hanagoyomi.language.v1', 'ja'], ['wallpaper.meadow.trail.v1', '[1,2,3,4]'],
  ]);
  const write = storage.setItem;
  storage.setItem = (key, value) => {
    if (key.endsWith('migration.v1')) throw new Error('quota');
    write(key, value);
  };
  migrateWallpaperStorage(storage);
  storage.setItem(wallpaperStorageKey('hanagoyomi.language.v1'), 'auto');
  storage.setItem(wallpaperStorageKey('meadow.trail.v1'), '[]');
  storage.setItem = write;
  migrateWallpaperStorage(storage);
  assert.equal(storage.getItem(wallpaperStorageKey('hanagoyomi.language.v1')), 'auto');
  assert.equal(storage.getItem(wallpaperStorageKey('meadow.trail.v1')), '[]');
});
