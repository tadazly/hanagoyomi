import { createSceneLink, parseSceneLink } from '../world/scene-share.js';
import { WALLPAPER_MODE } from '../platform/environment.js';
import { getSavedLocation } from '../world/location.js';
import { g } from '../i18n/gallery-messages.js';
import { onLanguageChange } from '../i18n/index.js';
import { bindDragScroll } from './drag-scroll.js';
import { loadQRCode } from '#scene-qr';

// 独立壁纸包运行在 file://，必须导向已部署且能解析作品的公开站。
const PUBLIC_SHARE_URL = import.meta.env.VITE_SCENE_SHARE_URL || 'https://hanagoyomi-meadow-preview.kuyami.chatgpt.site/';
const shareBase = () => /^https?:$/.test(location.protocol) ? location.href : PUBLIC_SHARE_URL;

export function initSceneSharing({ world, store, preview, onCollectionChange, feedback, saveThumbnail }) {
  const dialog = document.createElement('dialog'); dialog.id = 'galleryShare';
  dialog.className = 'gallery-dialog gallery-share chrome'; dialog.setAttribute('aria-labelledby', 'galleryShareTitle');
  dialog.innerHTML = '<button type="button" class="gallery-dialog-close" aria-label="Close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6"/></svg></button><div class="gallery-share-intro"><h2 id="galleryShareTitle"></h2><p></p></div><div class="gallery-qr"><canvas role="img"></canvas><p role="status"></p></div><div class="gallery-share-link"><label class="sr-only" for="galleryShareLink"></label><input id="galleryShareLink" type="text" readonly><button type="button"></button></div><p class="gallery-dialog-status" id="galleryShareStatus" role="status"></p>';
  const banner = document.createElement('aside'); banner.id = 'galleryIncoming'; banner.className = 'gallery-incoming chrome'; banner.hidden = true;
  banner.setAttribute('aria-labelledby', 'galleryIncomingPrompt');
  banner.innerHTML = '<div><strong id="galleryIncomingPrompt"></strong><span></span></div><div class="gallery-incoming-actions"><button type="button" class="primary"></button><button type="button"></button></div>';
  document.body.append(dialog, banner);
  bindDragScroll({ viewport: dialog });
  const closeButton = dialog.querySelector('.gallery-dialog-close'), linkInput = dialog.querySelector('input');
  const copy = dialog.querySelector('.gallery-share-link button'), qr = dialog.querySelector('canvas'), qrStatus = dialog.querySelector('.gallery-qr p');
  const status = dialog.querySelector('#galleryShareStatus'), accept = banner.querySelector('.primary'), skip = banner.querySelector('.gallery-incoming-actions button:last-child');
  let incoming = null, generation = 0, currentLink = '', statusKey = '', qrStatusKey = '', acceptBusy = false, qrModule = null, qrWidth = 0;
  const drawQR = async ticket => {
    if (!qrModule) return;
    const modules = qrModule.create(currentLink, { errorCorrectionLevel: 'L' }).modules.size + 8;
    // 长标题和完整浮点快照也至少保留双像素模块，密集作品自动扩大容器。
    const minimum = modules * 2;
    dialog.classList.toggle('qr-dense', minimum > 270);
    dialog.style.setProperty('--qr-column', `${Math.max(280, minimum)}px`);
    const width = Math.min(280, Math.floor(qr.parentElement.clientWidth));
    if (width < 1 || (width === qrWidth && !qr.hidden)) return;
    // 屏幕展示采用 L 纠错和整数像素模块，避免密集码点经缩放后粘连。
    const scale = Math.max(2, Math.floor(width / modules));
    await qrModule.toCanvas(qr, currentLink, { errorCorrectionLevel: 'L', margin: 4, scale, color: { dark: '#20251d', light: '#ffffff' } });
    if (ticket !== generation || !dialog.open) return;
    qrWidth = width; qr.hidden = false; qrStatusKey = ''; localize();
  };
  const clearHash = hash => {
    if (hash && location.hash === hash) { try { history.replaceState(history.state, '', location.pathname + location.search); } catch {} }
  };
  const localize = () => {
    closeButton.setAttribute('aria-label', g('closeDialog')); dialog.querySelector('h2').textContent = g('share');
    dialog.querySelector('.gallery-share-intro p').textContent = g(WALLPAPER_MODE ? 'shareWallpaperHelp' : 'shareHelp');
    dialog.querySelector('label').textContent = g('shareLink'); copy.textContent = g('copy');
    qr.setAttribute('aria-label', g('shareLink')); qrStatus.textContent = qrStatusKey ? g(qrStatusKey) : '';
    status.textContent = statusKey ? g(statusKey) : '';
    dialog.querySelector('.gallery-share-link').hidden = WALLPAPER_MODE;
    if (!incoming) return;
    const { mode, artwork } = incoming;
    banner.querySelector('strong').textContent = g(mode === 'invalid' ? 'invalidLink' : mode === 'pending' ? 'importPrompt' : 'receivePrompt');
    banner.querySelector('span').textContent = artwork?.title || (mode === 'invalid' ? '' : g('untitled'));
    accept.hidden = mode === 'invalid'; accept.disabled = acceptBusy;
    accept.textContent = g(mode === 'pending' ? 'importPreview' : 'add'); skip.textContent = g(mode === 'preview' ? 'skip' : 'cancel');
  };
  const dismissIncoming = () => { clearHash(incoming?.hash); incoming = null; banner.hidden = true; };
  const showIncoming = value => { incoming = value; banner.hidden = false; localize(); };
  const openArtwork = (artwork, hash) => {
    try {
      preview({ id: 'shared-link', title: artwork.title || g('untitled'), scene: artwork.scene });
      showIncoming({ mode: 'preview', artwork, hash });
    } catch { showIncoming({ mode: 'invalid', hash }); }
  };
  const receive = (link, pending, hash) => {
    try {
      const artwork = parseSceneLink(link, { baseUrl: shareBase() });
      if (!artwork) {
        if (pending && link.trim()) showIncoming({ mode: 'invalid', hash });
        else if (pending && incoming?.mode !== 'preview') dismissIncoming();
        return;
      }
      if (pending) showIncoming({ mode: 'pending', artwork });
      else openArtwork(artwork, hash);
    } catch { showIncoming({ mode: 'invalid', hash }); }
  };
  skip.addEventListener('click', dismissIncoming);
  accept.addEventListener('click', async () => {
    if (!incoming || acceptBusy) return;
    const { mode, artwork, hash } = incoming;
    if (mode === 'pending') { openArtwork(artwork, hash); return; }
    if (mode !== 'preview') return;
    acceptBusy = true; localize();
    try {
      const entry = store.add(artwork.scene, artwork.title || g('untitled'));
      // 写入场景成功即完成收藏，封面失败不撤销；回调只刷新列表。
      dismissIncoming(); onCollectionChange(); feedback('captured');
      await saveThumbnail(entry);
    } catch (error) { feedback(error.message === 'gallery.full' ? 'full' : 'captureError'); }
    finally { acceptBusy = false; localize(); }
  });
  copy.addEventListener('click', async () => {
    const link = currentLink;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable');
      await navigator.clipboard.writeText(link);
      if (currentLink === link) statusKey = 'copied';
    } catch { if (currentLink === link) { statusKey = 'copyFailed'; linkInput.focus(); linkInput.select(); } }
    localize();
  });
  closeButton.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => { generation++; });
  new ResizeObserver(() => {
    if (dialog.open && qrModule) void drawQR(generation).catch(() => { qrStatusKey = WALLPAPER_MODE ? 'qrWallpaperFailed' : 'qrFailed'; localize(); });
  }).observe(dialog.querySelector('.gallery-qr'));
  for (const event of ['worldpanelopen', 'timepopoveropen', 'galleryclose']) document.addEventListener(event, () => { dialog.close(); dismissIncoming(); });
  document.addEventListener('worldscenechange', event => { if (event.detail?.previewing === false) dismissIncoming(); });
  document.addEventListener('wallpaperscenelink', event => receive(event.detail?.link || '', true));
  window.addEventListener('hashchange', () => { if (location.hash.startsWith('#scene=')) receive(location.href, false, location.hash); });
  onLanguageChange(localize); localize();
  if (location.hash.startsWith('#scene=')) queueMicrotask(() => receive(location.href, false, location.hash));
  return {
    dismissIncoming,
    async share(entry) {
      const ticket = ++generation;
      try {
        const scene = structuredClone(entry.scene);
        scene.environment.skyLocation ||= world.captureScene().environment.skyLocation;
        currentLink = createSceneLink(scene, { title: entry.title, baseUrl: shareBase(), timeZone: getSavedLocation()?.tz || 'Asia/Tokyo' });
        linkInput.value = currentLink; statusKey = ''; qrStatusKey = 'qrLoading'; qr.hidden = true; qrModule = null; qrWidth = 0;
        localize(); dialog.showModal(); closeButton.focus();
        // 仅在用户分享时加载生成器，不增加世界启动和逐帧开销。
        const QRCode = await loadQRCode();
        if (ticket !== generation || !dialog.open) return;
        qrModule = QRCode; await drawQR(ticket);
      } catch {
        if (ticket !== generation) return;
        if (dialog.open) { qrStatusKey = WALLPAPER_MODE ? 'qrWallpaperFailed' : 'qrFailed'; localize(); }
        else feedback('shareFailed');
      }
    },
  };
}
