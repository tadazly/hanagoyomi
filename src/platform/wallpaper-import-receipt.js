import { storageKey } from './environment.js';

// WE 不提供网页反向清空原生输入框的接口。只记录用户已处理的当前输入；
// 未处理的链接重启后仍应提示，清空或更换输入后可再次导入相同链接。
export const WALLPAPER_IMPORT_RECEIPT_KEY = storageKey('hanagoyomi.scene-import-receipt.v1');

export function createWallpaperImportReceipt(storage) {
  let handled = '';
  let current;
  try { handled = storage?.getItem(WALLPAPER_IMPORT_RECEIPT_KEY) || ''; } catch {}
  const forget = () => {
    handled = '';
    try { storage?.removeItem(WALLPAPER_IMPORT_RECEIPT_KEY); } catch {}
  };
  return {
    receive(link) {
      if (!link || (current !== undefined && current !== link)) forget();
      current = link;
      return !link || link !== handled;
    },
    acknowledge(link) {
      if (!link || link !== current) return;
      handled = link;
      try { storage?.setItem(WALLPAPER_IMPORT_RECEIPT_KEY, link); } catch {}
    },
  };
}
