import { migrateWallpaperStorage, wallpaperStorageKey } from './storage.js';

export function isWallpaperMode({ mode, search = '', plash = false } = {}) {
  return mode === 'wallpaper' || new URLSearchParams(search).get('wallpaper') === '1' || plash;
}

// 公开预览链接、Plash 与独立壁纸包共用行为和独立偏好。
export const WALLPAPER_MODE = isWallpaperMode({
  mode: import.meta.env?.MODE,
  search: globalThis.location?.search,
  plash: globalThis.document?.documentElement?.classList?.contains('is-plash-app') || false,
});
export const storageKey = key => WALLPAPER_MODE ? wallpaperStorageKey(key) : key;

// 在依赖本模块的世界、语言和组件首次读取偏好前完成同步迁移。
if (WALLPAPER_MODE) {
  try { migrateWallpaperStorage(globalThis.localStorage); } catch {}
}
