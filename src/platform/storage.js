const WALLPAPER_PREFIX = 'hanagoyomi.wallpaper.';
const MIGRATION_KEY = `${WALLPAPER_PREFIX}migration.v1`;
const LEGACY_KEYS = [
  'meadow.settings.v1', 'meadow.loc', 'meadow.trail.v1',
  'hanagoyomi.components.v1', 'hanagoyomi.gallery.v2',
  'hanagoyomi.language.v1', 'hanagoyomi.panelOnStartup.v1',
  'hanagoyomi.host-properties.v1',
];

export const wallpaperStorageKey = key => `${WALLPAPER_PREFIX}${key}`;

// WE 的 file:// 壁纸在同一显示器上共享 origin。旧花暦仍会写 wallpaper.*，
// 因此只迁移一次，之后读写应用专属键，保留旧键供旧版本继续使用。
export function migrateWallpaperStorage(storage) {
  try {
    if (!storage || storage.getItem(MIGRATION_KEY) === '1') return;
    for (const key of LEGACY_KEYS) {
      const target = wallpaperStorageKey(key);
      if (storage.getItem(target) !== null) continue;
      const value = storage.getItem(`wallpaper.${key}`);
      if (value !== null) storage.setItem(target, value);
    }
    storage.setItem(MIGRATION_KEY, '1');
  } catch {
    // 存储不可用时仍可启动；失败后下次重试，已迁移的值始终优先。
  }
}
