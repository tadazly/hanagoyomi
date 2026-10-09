// 网站和壁纸各自保存偏好，避免导入壁纸改变浏览器中的设置。
export const WALLPAPER_MODE = import.meta.env?.MODE === 'wallpaper';
export const storageKey = key => WALLPAPER_MODE ? `wallpaper.${key}` : key;
