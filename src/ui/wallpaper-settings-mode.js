import { setMessage } from '../i18n/index.js';

// 两种模式都保留完整编辑能力；提示原生设置只接受单向输入。
export function setWallpaperSettingsMode(document, useWorldSettings) {
  const mode = useWorldSettings ? 'world' : 'we';
  if (document.body.dataset.wallpaperSettingsMode === mode) return;
  document.body.dataset.wallpaperSettingsMode = mode;
  let note = document.getElementById('wallpaperSettingsNote');
  if (!note) {
    note = document.createElement('p'); note.id = 'wallpaperSettingsNote'; note.className = 'settings-helper';
    document.getElementById('panelBody').prepend(note);
  }
  setMessage(note, useWorldSettings ? 'wallpaper.worldSettingsNote' : 'wallpaper.weSettingsNote');
}
