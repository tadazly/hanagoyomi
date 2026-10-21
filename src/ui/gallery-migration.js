import { migrateLegacyGallery } from '../world/gallery-store.js';
import { g } from '../i18n/gallery-messages.js';
import { onLanguageChange } from '../i18n/index.js';

export async function prepareGalleryStorage(store, key) {
  if (!await store.open()) return false;
  let dialog, retry, unsubscribe, failed = false;
  const localize = () => {
    if (!dialog) return;
    dialog.querySelector('h2').textContent = g(failed ? 'migrationFailed' : 'migrationUpdating');
    dialog.querySelector('p').textContent = g(failed ? 'migrationRetryNote' : 'migrationWait');
    dialog.querySelector('button').textContent = g('retry');
  };
  const show = () => {
    if (!dialog) {
      dialog = document.createElement('dialog'); dialog.id = 'galleryMigration';
      dialog.className = 'gallery-dialog gallery-migration chrome';
      dialog.setAttribute('aria-labelledby', 'galleryMigrationTitle');
      dialog.setAttribute('aria-describedby', 'galleryMigrationNote');
      dialog.innerHTML = '<span class="gallery-spinner" aria-hidden="true"></span><h2 id="galleryMigrationTitle" role="status" tabindex="-1"></h2><p id="galleryMigrationNote"></p><button type="button" hidden></button>';
      dialog.addEventListener('cancel', event => event.preventDefault());
      dialog.querySelector('button').addEventListener('click', () => retry?.());
      document.body.append(dialog); unsubscribe = onLanguageChange(localize);
    }
    dialog.classList.toggle('has-error', failed);
    dialog.setAttribute('aria-busy', String(!failed));
    dialog.querySelector('button').hidden = !failed;
    localize(); if (!dialog.open) dialog.showModal();
    dialog.querySelector(failed ? 'button' : 'h2').focus();
  };
  for (;;) {
    try {
      await migrateLegacyGallery({ store, key, storage: localStorage, onStart: async () => {
        failed = false; show();
        // 留出首帧绘制机会，让旧集合的解码不遮住加载提示。
        await new Promise(resolve => setTimeout(resolve, 40));
      } });
      dialog?.close(); dialog?.remove(); unsubscribe?.(); return true;
    } catch {
      failed = true; show();
      await new Promise(resolve => { retry = resolve; });
      retry = null;
    }
  }
}
