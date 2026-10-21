import { WALLPAPER_MODE } from '../platform/environment.js';
import { g } from '../i18n/gallery-messages.js';
import { onLanguageChange } from '../i18n/index.js';

// 收藏操作独立于预览按钮；不在按钮中嵌套按钮，也不依赖宿主不支持的网页键盘。
export function createGalleryActions({ store, onChange, onShare }) {
  const actions = document.createElement('dialog');
  actions.className = 'gallery-dialog gallery-options chrome'; actions.id = 'galleryOptions';
  actions.setAttribute('aria-labelledby', 'galleryOptionsTitle');
  actions.innerHTML = '<h2 id="galleryOptionsTitle"></h2><div class="gallery-option-buttons"><button type="button" data-action="rename"></button><button type="button" data-action="share"></button><button type="button" data-action="remove"></button><button type="button" data-action="cancel"></button></div><p class="gallery-dialog-status" role="status"></p>';
  const rename = document.createElement('dialog'); rename.id = 'galleryRename';
  rename.className = 'gallery-dialog gallery-rename chrome'; rename.setAttribute('aria-labelledby', 'galleryRenameTitle');
  rename.innerHTML = '<form><h2 id="galleryRenameTitle"></h2><label for="galleryName"></label><input id="galleryName" type="text" maxlength="160" autocomplete="off" aria-describedby="galleryRenameError"><p id="galleryRenameError" class="gallery-dialog-status" role="status"></p><div class="gallery-dialog-actions"><button type="button" data-action="cancel"></button><button type="submit" class="primary"></button></div></form>';
  document.body.append(actions, rename);
  let current = null, confirmDelete = false, busy = false;
  const setBusy = value => {
    busy = value;
    for (const button of [...actions.querySelectorAll('button'), ...rename.querySelectorAll('button')]) button.disabled = value;
  };
  for (const dialog of [actions, rename]) dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
  const action = key => actions.querySelector(`[data-action="${key}"]`);
  const localize = () => {
    action('rename').textContent = g('rename'); action('rename').hidden = WALLPAPER_MODE;
    action('share').textContent = g('share'); action('remove').textContent = g(confirmDelete ? 'confirmRemove' : 'remove'); action('cancel').textContent = g('cancel');
    rename.querySelector('h2').textContent = g('rename'); rename.querySelector('label').textContent = g('name');
    rename.querySelector('[data-action="cancel"]').textContent = g('cancel'); rename.querySelector('[type="submit"]').textContent = g('save');
  };
  const showRename = entry => {
    if (WALLPAPER_MODE) return;
    current = entry; actions.close();
    rename.querySelector('input').value = entry.title; rename.querySelector('[role="status"]').textContent = '';
    rename.showModal(); rename.querySelector('input').focus(); rename.querySelector('input').select();
  };
  action('rename').addEventListener('click', () => showRename(current));
  action('share').addEventListener('click', () => { const entry = current; actions.close(); onShare(entry); });
  action('remove').addEventListener('click', async () => {
    if (busy) return;
    if (!confirmDelete) { confirmDelete = true; localize(); return; }
    const entry = current; setBusy(true);
    try { const index = (await store.read()).findIndex(item => item.id === entry.id); await store.remove(entry.id); actions.close(); await onChange({ removed: entry, index }); }
    catch { actions.querySelector('[role="status"]').textContent = g('captureError'); }
    finally { setBusy(false); }
  });
  action('cancel').addEventListener('click', () => actions.close());
  rename.querySelector('[data-action="cancel"]').addEventListener('click', () => rename.close());
  rename.querySelector('form').addEventListener('submit', async event => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const entry = await store.rename(current.id, rename.querySelector('input').value);
      if (!entry) throw new Error('gallery.invalid');
      rename.close(); await onChange({ updated: entry });
    } catch (error) { rename.querySelector('[role="status"]').textContent = g(error.message === 'gallery.invalidTitle' ? 'invalidTitle' : 'captureError'); }
    finally { setBusy(false); }
  });
  onLanguageChange(localize); localize();
  return {
    rename: showRename,
    show(entry) { current = entry; confirmDelete = false; actions.querySelector('[role="status"]').textContent = ''; actions.querySelector('h2').textContent = entry.title; localize(); actions.showModal(); },
    close() { actions.close(); rename.close(); },
  };
}
