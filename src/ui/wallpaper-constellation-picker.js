import { bindDragScroll } from './drag-scroll.js';
import { t } from '../i18n/index.js';

// WE 的离屏 CEF 在绘制原生 select 时可能终止渲染进程。
// 保留原 select 作为状态桥，改用可拖动和翻页的普通按钮列表。
export function initWallpaperConstellationPicker(select) {
  select.hidden = true;
  const trigger = document.createElement('button');
  trigger.type = 'button'; trigger.className = 'wallpaper-constellation-trigger';
  trigger.setAttribute('aria-haspopup', 'dialog');
  const dialog = document.createElement('dialog');
  dialog.className = 'location-dialog wallpaper-constellation-dialog chrome';
  dialog.setAttribute('aria-labelledby', 'wallpaperConstellationTitle');
  dialog.innerHTML = '<div class="panel-heading"><h2 id="wallpaperConstellationTitle"></h2><button type="button" class="plain-icon wallpaper-constellation-close">×</button></div><div class="wallpaper-constellation-list" tabindex="0"></div><div class="wallpaper-constellation-pages"><button type="button" data-direction="up">↑</button><button type="button" data-direction="down">↓</button></div>';
  select.after(trigger); document.body.append(dialog);
  const title = dialog.querySelector('h2'), close = dialog.querySelector('.wallpaper-constellation-close');
  const list = dialog.querySelector('.wallpaper-constellation-list');
  const drag = bindDragScroll({ viewport: list });
  const refresh = () => {
    const selected = select.selectedOptions[0];
    trigger.textContent = selected?.textContent || t('sky.choose');
    trigger.setAttribute('aria-label', `${t('sky.find')}: ${trigger.textContent}`);
    title.textContent = t('sky.find'); close.setAttribute('aria-label', t('panel.close'));
    dialog.querySelector('[data-direction="up"]').setAttribute('aria-label', t('wallpaper.scrollUp'));
    dialog.querySelector('[data-direction="down"]').setAttribute('aria-label', t('wallpaper.scrollDown'));
    if (!dialog.open) return;
    const top = list.scrollTop;
    list.replaceChildren(...[...select.options].map(option => {
      const button = document.createElement('button');
      button.type = 'button'; button.textContent = option.textContent;
      button.setAttribute('aria-pressed', String(option.value === select.value));
      button.addEventListener('click', () => {
        select.value = option.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        dialog.close(); refresh();
      });
      return button;
    }));
    list.scrollTop = top;
  };
  trigger.addEventListener('click', () => { dialog.showModal(); refresh(); list.scrollTop = 0; });
  close.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => { drag.cancel(); trigger.focus({ preventScroll: true }); });
  dialog.querySelectorAll('[data-direction]').forEach(button => button.addEventListener('click', () => {
    drag.cancel(); list.scrollTop += (button.dataset.direction === 'up' ? -1 : 1) * Math.max(80, list.clientHeight * .8);
  }));
  return { refresh };
}
