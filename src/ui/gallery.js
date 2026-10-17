import '../styles/gallery.css';
import { GALLERY_SCENES } from '../data/gallery-scenes.js';
import { createGalleryStore } from '../world/gallery-store.js';
import { storageKey, WALLPAPER_MODE } from '../platform/environment.js';
import { describeScene } from '../world/scene-share.js';
import { getSavedLocation } from '../world/location.js';
import { createGalleryActions } from './gallery-actions.js';
import { initSceneSharing } from './gallery-sharing.js';
import { bindGallerySwipe } from './gallery-swipe.js';
import { getLanguage, onLanguageChange, t } from '../i18n/index.js';
import { g } from '../i18n/gallery-messages.js';

const paths = {
  gallery: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.2"/><path d="m3 16 6-6 4 4 3-3 5 5"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="m5 12 4 4 10-10"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5m4-5v5"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  pencil: '<path d="m14 5 5 5M4 20l4-1 12-12a2.8 2.8 0 0 0-4-4L4 15z"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
};
const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
const textFor = value => typeof value === 'string' ? value : value?.[getLanguage()] || value?.en || '';

export function initGallery(world, shell) {
  if (!world) return;
  // 存储访问本身可能被宿主拒绝，使用延迟访问以保留浏览和还原能力。
  const storage = { getItem: key => localStorage.getItem(key), setItem: (key, value) => localStorage.setItem(key, value) };
  const store = createGalleryStore({ storage, key: storageKey('hanagoyomi.gallery.v2') });
  const trigger = document.createElement('button');
  trigger.id = 'galleryToggle'; trigger.className = 'icon-button'; trigger.type = 'button';
  trigger.innerHTML = icon('gallery'); trigger.setAttribute('aria-controls', 'gallery'); trigger.setAttribute('aria-expanded', 'false');
  document.getElementById('immersiveBtn').before(trigger);
  const sheet = document.createElement('section');
  sheet.id = 'gallery'; sheet.className = 'gallery-sheet chrome'; sheet.hidden = true;
  sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-labelledby', 'galleryTitle');
  sheet.innerHTML = `
    <div class="gallery-grip" aria-hidden="true"></div>
    <header class="gallery-header">
      <h2 id="galleryTitle"></h2>
      <div class="gallery-tabs" role="tablist" aria-label="Gallery categories">
        <button type="button" role="tab" id="galleryCurated" aria-controls="galleryList" data-collection="curated"></button>
        <button type="button" role="tab" id="gallerySaved" aria-controls="galleryList" data-collection="saved"></button>
      </div>
      <button class="gallery-capture" type="button">${icon('plus')}<span></span></button>
      <button class="gallery-collapse gallery-icon" type="button" hidden>${icon('down')}</button>
      <button class="gallery-close gallery-icon" type="button">${icon('close')}</button>
    </header>
    <div class="gallery-content" id="galleryContent">
      <div id="galleryList" class="gallery-list" role="tabpanel"></div>
      <div class="gallery-empty" hidden><span class="gallery-empty-icon">${icon('gallery')}</span><h3></h3><p></p></div>
    </div>
    <div class="gallery-scrollbar" role="scrollbar" tabindex="0" aria-controls="galleryContent" aria-orientation="horizontal" aria-valuemin="0"><span class="gallery-scroll-thumb"></span></div>
    <footer class="gallery-footer">
      <div class="gallery-status" aria-live="polite"><strong></strong><span></span></div>
      <div class="gallery-freeze">
        <label><input id="galleryFreezeTime" type="checkbox" checked><span></span></label>
        <label><input id="galleryFreezeWeather" type="checkbox" checked><span></span></label>
      </div>
      <div class="gallery-actions"><button class="gallery-restore" type="button"></button><button class="gallery-apply" type="button"></button></div>
    </footer>
    <div class="gallery-dock" hidden>
      <div class="gallery-dock-caption"><strong></strong><span></span></div>
      <button class="gallery-expand" type="button"></button>
      <div class="gallery-actions"><button class="gallery-restore" type="button"></button><button class="gallery-apply" type="button"></button></div>
    </div>
    <p class="gallery-feedback" role="status" hidden></p>`;
  document.body.append(sheet);
  const $ = selector => sheet.querySelector(selector);
  const refreshSwipe = bindGallerySwipe({ viewport: $('.gallery-content'), track: $('.gallery-scrollbar'), thumb: $('.gallery-scroll-thumb') });
  let collection = 'curated', selected = null, feedbackTimer, saving = false, collapsed = false;
  const scrollPositions = { curated: 0, saved: 0 };
  let renderedCollection = null;
  const cards = new Map();
  const items = () => collection === 'curated' ? GALLERY_SCENES : store.read();
  const freezes = () => ({ freezeTime: $('#galleryFreezeTime').checked, freezeWeather: $('#galleryFreezeWeather').checked });
  const summaryFor = item => {
    const details = describeScene(item.scene, { timeZone: getSavedLocation()?.tz || 'Asia/Tokyo' });
    return details ? `${t(`weather.${details.weatherKey}`)} · ${details.timeText}` : g('metadataUnknown');
  };
  const feedback = key => {
    clearTimeout(feedbackTimer); $('.gallery-feedback').textContent = g(key); $('.gallery-feedback').hidden = false;
    feedbackTimer = setTimeout(() => { $('.gallery-feedback').hidden = true; }, 4500);
  };
  const clearFeedback = () => { clearTimeout(feedbackTimer); $('.gallery-feedback').hidden = true; };
  const refreshFooter = () => {
    const preview = world.isPreviewing();
    $('.gallery-status strong').textContent = preview ? g('preview', { name: textFor(selected?.title) || g('scene') }) : g('choose');
    $('.gallery-status strong').title = $('.gallery-status strong').textContent;
    $('.gallery-status span').textContent = g(preview ? 'restoreNote' : 'chooseNote');
    sheet.querySelectorAll('.gallery-restore,.gallery-apply').forEach(button => { button.disabled = !preview; });
    $('.gallery-collapse').hidden = !preview;
    $('.gallery-dock strong').textContent = `${g('previewLabel')} · ${textFor(selected?.title) || g('scene')}`;
    $('.gallery-dock span').textContent = selected ? summaryFor(selected) : '';
    $('.gallery-freeze').inert = !preview;
    $('#galleryFreezeTime').disabled = !preview; $('#galleryFreezeWeather').disabled = !preview;
  };
  const focusCard = (id, options = false) => {
    if (sheet.hidden) return;
    const card = cards.get(id), target = options && card?.options ? card.options : card?.button;
    const fallback = $('.gallery-capture').disabled ? $('.gallery-close') : $('.gallery-capture');
    (target || fallback).focus({ preventScroll: true });
  };
  const setCollapsed = value => {
    refreshSwipe.cancel?.();
    if (value && !collapsed) scrollPositions[collection] = $('.gallery-content').scrollLeft;
    collapsed = value; sheet.classList.toggle('is-collapsed', value); $('.gallery-dock').hidden = !value;
    if (!value) { render(); requestAnimationFrame(() => { $('.gallery-content').scrollLeft = scrollPositions[collection]; refreshSwipe(); }); }
    else $('.gallery-expand').focus({ preventScroll: true });
  };
  const previewItem = item => {
    sharing?.dismissIncoming();
    world.previewScene(item.scene, freezes()); selected = item;
    if (sheet.hidden) open();
    render(); setCollapsed(true);
  };
  const createCard = item => {
    const tile = document.createElement('article'); tile.className = 'gallery-tile';
    const button = document.createElement('button'); button.type = 'button'; button.className = 'gallery-scene'; button.dataset.scene = item.id;
    const picture = document.createElement('div'); picture.className = 'gallery-picture';
    const check = document.createElement('span'); check.className = 'gallery-selected'; check.innerHTML = icon('check'); picture.append(check);
    const caption = document.createElement(collection === 'saved' && !WALLPAPER_MODE ? 'button' : 'span'); caption.className = 'gallery-caption';
    if (caption.tagName === 'BUTTON') { caption.type = 'button'; caption.dataset.noDragScroll = ''; }
    const title = document.createElement('span'); title.className = 'gallery-scene-title';
    const description = document.createElement('span'); description.className = 'gallery-scene-description';
    const weather = document.createElement('span'), moment = document.createElement('span');
    description.append(weather, moment);
    const captionRow = document.createElement('div'); captionRow.className = 'gallery-caption-row';
    caption.append(title, description); captionRow.append(caption); button.append(picture); tile.append(button, captionRow);
    const card = { item, tile, button, picture, title, description, weather, moment, caption, image: null, imageSource: null };
    button.addEventListener('click', () => {
      try {
        previewItem(card.item);
      } catch (error) { console.error('Gallery preview', error); feedback('error'); }
    });
    if (collection === 'saved') {
      const options = document.createElement('button'); options.type = 'button'; options.className = 'gallery-options-button gallery-icon'; options.dataset.noDragScroll = '';
      options.innerHTML = icon('more'); card.options = options; captionRow.append(options);
      options.addEventListener('click', () => { clearFeedback(); actions.show(card.item); });
      if (!WALLPAPER_MODE) {
        const pencil = document.createElement('span'); pencil.className = 'gallery-rename-icon'; pencil.innerHTML = icon('pencil'); title.append(pencil);
        caption.addEventListener('click', () => { clearFeedback(); actions.rename(card.item); });
      }
    }
    return card;
  };
  const updateCard = (card, item, previewing) => {
    card.item = item;
    const name = textFor(item.title), summary = summaryFor(item);
    card.button.setAttribute('aria-pressed', String(selected?.id === item.id && previewing));
    card.button.title = name;
    card.button.setAttribute('aria-label', `${name} · ${summary}`);
    if (card.title.dataset.name !== name) {
      card.title.textContent = name; card.title.dataset.name = name;
      if (card.caption.tagName === 'BUTTON') { const pencil = document.createElement('span'); pencil.className = 'gallery-rename-icon'; pencil.innerHTML = icon('pencil'); card.title.append(pencil); }
    }
    if (card.caption.tagName === 'BUTTON') { card.caption.title = g('renameHint'); card.caption.setAttribute('aria-label', `${g('rename')} · ${name}`); }
    if (card.options) { card.options.title = g('options'); card.options.setAttribute('aria-label', `${g('options')} · ${name}`); }
    const metadata = describeScene(item.scene, { timeZone: getSavedLocation()?.tz || 'Asia/Tokyo' });
    card.weather.textContent = metadata ? t(`weather.${metadata.weatherKey}`) : g('metadataUnknown');
    card.moment.textContent = metadata ? ` · ${metadata.timeText}` : '';
    card.description.title = summary;
    const thumbnail = item.thumbnail;
    const source = thumbnail && (collection === 'curated' || /^data:image\/jpeg;base64,/.test(thumbnail))
      ? collection === 'curated' ? new URL(`${import.meta.env.BASE_URL}${thumbnail}`, location.href).href : thumbnail : '';
    if (card.imageSource !== source) {
      card.image?.remove(); card.image = null; card.imageSource = source;
      card.picture.classList.toggle('gallery-picture-fallback', !source);
      if (source) {
        const image = document.createElement('img'); image.src = source;
        image.alt = ''; image.width = 480; image.height = 270; image.decoding = 'async';
        image.addEventListener('error', () => {
          if (card.image !== image) return;
          image.hidden = true; card.picture.classList.add('gallery-picture-fallback');
        });
        card.image = image; card.picture.prepend(image);
      }
    }
  };
  const render = ({ resetScroll = false } = {}) => {
    const all = items(), content = $('.gallery-content'), list = $('#galleryList'), left = resetScroll ? 0 : scrollPositions[collection];
    const active = document.activeElement, focused = [...cards.values()].find(card => card.tile.contains(active));
    const focusedCollection = renderedCollection, focusedControl = focused?.options === active ? 'options' : focused?.caption === active ? 'caption' : 'button';
    if (renderedCollection !== collection) { list.replaceChildren(); cards.clear(); renderedCollection = collection; }
    $('.gallery-empty').hidden = all.length > 0;
    list.hidden = !all.length;
    list.setAttribute('aria-labelledby', collection === 'curated' ? 'galleryCurated' : 'gallerySaved');
    list.dataset.collection = collection;
    const wanted = new Set(all.map(item => item.id)), previewing = world.isPreviewing();
    for (const [id, card] of cards) if (!wanted.has(id)) { card.tile.remove(); cards.delete(id); }
    let next = list.firstElementChild;
    for (const item of all) {
      let card = cards.get(item.id);
      if (!card) { card = createCard(item); cards.set(item.id, card); }
      updateCard(card, item, previewing);
      if (card.tile !== next) list.insertBefore(card.tile, next);
      next = card.tile.nextElementSibling;
    }
    sheet.querySelectorAll('[data-collection]').forEach(tab => {
      const active = tab.dataset.collection === collection;
      tab.setAttribute('aria-selected', String(active)); tab.tabIndex = active ? 0 : -1;
    });
    if (!sheet.hidden && focused && focusedCollection === collection && document.activeElement !== active) {
      cards.get(focused.item.id)?.[focusedControl]?.focus({ preventScroll: true });
    }
    scrollPositions[collection] = left;
    if (!collapsed) content.scrollLeft = left;
    requestAnimationFrame(refreshSwipe);
    refreshFooter();
  };
  const close = (restore = true) => {
    if (sheet.hidden) return;
    refreshSwipe.cancel?.();
    if (!collapsed) scrollPositions[collection] = $('.gallery-content').scrollLeft;
    actions.close();
    if (restore) world.cancelPreview();
    sheet.hidden = true; collapsed = false; sheet.classList.remove('is-collapsed'); $('.gallery-dock').hidden = true;
    document.body.dataset.galleryOpen = 'false'; trigger.setAttribute('aria-expanded', 'false'); selected = null;
    document.dispatchEvent(new Event('galleryclose'));
    trigger.focus({ preventScroll: true });
  };
  const open = () => {
    shell.setPanel(false);
    document.dispatchEvent(new Event('galleryopen'));
    sheet.hidden = false; document.body.dataset.galleryOpen = 'true'; trigger.setAttribute('aria-expanded', 'true'); render();
    $('.gallery-close').focus({ preventScroll: true });
  };
  trigger.addEventListener('click', () => sheet.hidden ? open() : collapsed ? setCollapsed(false) : close());
  $('.gallery-content').addEventListener('scroll', () => { if (!collapsed && !sheet.hidden) scrollPositions[collection] = $('.gallery-content').scrollLeft; });
  $('.gallery-expand').addEventListener('click', () => { setCollapsed(false); focusCard(selected?.id); });
  $('.gallery-collapse').addEventListener('click', () => setCollapsed(true));
  $('.gallery-close').addEventListener('click', () => close());
  sheet.querySelectorAll('.gallery-restore').forEach(button => button.addEventListener('click', () => {
    const previousId = selected?.id;
    world.cancelPreview(); selected = null; setCollapsed(false); render();
    // 还原会禁用当前按钮；将焦点留在可继续浏览的可见作品上，不改变展架位置。
    const viewport = $('.gallery-content').getBoundingClientRect();
    const visible = card => {
      const bounds = card.button.getBoundingClientRect(), center = (bounds.left + bounds.right) / 2;
      return center >= viewport.left && center <= viewport.right;
    };
    const previous = cards.get(previousId);
    const next = previous && visible(previous) ? previous : [...cards.values()].find(visible);
    focusCard(next?.item.id);
  }));
  sheet.querySelectorAll('.gallery-apply').forEach(button => button.addEventListener('click', () => {
    try { world.commitPreview(); close(false); }
    catch { feedback('applyError'); }
  }));
  sheet.querySelectorAll('[data-collection]').forEach(tab => tab.addEventListener('click', () => { refreshSwipe.cancel?.(); collection = tab.dataset.collection; render(); }));
  $('.gallery-tabs').addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const tabs = [...sheet.querySelectorAll('[data-collection]')], current = tabs.indexOf(event.target);
    if (current < 0) return;
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1
      : (current + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    event.preventDefault(); event.stopPropagation(); tabs[next].click(); tabs[next].focus({ preventScroll: true });
  });
  for (const input of sheet.querySelectorAll('.gallery-freeze input')) input.addEventListener('change', () => world.setPreviewFreeze(freezes()));
  const saveThumbnail = async entry => {
    try {
      const blob = await world.captureThumbnail();
      const thumbnail = typeof blob === 'string' ? blob : await new Promise((resolve, reject) => {
        const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(blob);
      });
      store.setThumbnail(entry.id, thumbnail);
    } catch { /* 场景已持久化；封面失败不回滚收藏。 */ }
    if (collection === 'saved' && !sheet.hidden) render();
  };
  const actions = createGalleryActions({ store, onShare: entry => sharing.share(entry), onChange: ({ updated, removed, index }) => {
    if (updated && selected?.id === updated.id) selected = updated;
    render();
    if (removed) { const remaining = items(); focusCard(remaining[Math.min(Math.max(0, index), remaining.length - 1)]?.id, true); }
  } });
  const sharing = initSceneSharing({ world, store, preview: previewItem, onCollectionChange: () => render(), feedback, saveThumbnail });
  $('.gallery-capture').addEventListener('click', async () => {
    if (saving) return;
    saving = true; $('.gallery-capture').disabled = true;
    let entry;
    try {
      entry = store.add(world.captureScene(), g('untitled'));
      feedback('captured');
      if (collection === 'saved') render();
      await saveThumbnail(entry);
    } catch (error) { feedback(error.message === 'gallery.full' ? 'full' : 'captureError'); }
    finally { saving = false; $('.gallery-capture').disabled = false; }
  });
  document.addEventListener('keydown', event => {
    if (sheet.hidden) return;
    if (document.querySelector('dialog[open]')) return;
    if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); close(); }
  }, true);
  document.addEventListener('worldpanelopen', () => close());
  document.addEventListener('timepopoveropen', () => close());
  document.addEventListener('worldscenechange', event => {
    if (event.detail?.previewing === false && !sheet.hidden) { selected = null; render(); }
  });
  const localize = () => {
    trigger.title = g('title'); trigger.setAttribute('aria-label', g('open'));
    $('#galleryTitle').textContent = g('title'); $('#galleryCurated').textContent = g('curated'); $('#gallerySaved').textContent = g('saved');
    $('.gallery-capture span').textContent = g('capture'); $('.gallery-close').setAttribute('aria-label', g('close'));
    $('.gallery-capture').setAttribute('aria-label', g('capture')); $('.gallery-capture').title = g('capture');
    $('.gallery-tabs').setAttribute('aria-label', g('title'));
    $('.gallery-empty h3').textContent = g('emptyTitle'); $('.gallery-empty p').textContent = g('empty');
    $('#galleryFreezeTime + span').textContent = g('freezeTime'); $('#galleryFreezeWeather + span').textContent = g('freezeWeather');
    sheet.querySelectorAll('.gallery-restore').forEach(button => { button.textContent = g('restore'); });
    const responsiveLabel = (button, fullKey, shortKey) => {
      const full = document.createElement('span'), compact = document.createElement('span');
      full.className = 'gallery-full-label'; compact.className = 'gallery-compact-label';
      full.textContent = g(fullKey); compact.textContent = g(shortKey); button.replaceChildren(full, compact);
      button.setAttribute('aria-label', g(fullKey));
    };
    sheet.querySelectorAll('.gallery-apply').forEach(button => responsiveLabel(button, 'apply', 'applyCompact'));
    responsiveLabel($('.gallery-expand'), 'expand', 'expandCompact');
    responsiveLabel($('#gallerySaved'), 'saved', 'savedCompact');
    $('.gallery-collapse').title = g('collapse'); $('.gallery-collapse').setAttribute('aria-label', g('collapse'));
    $('.gallery-scrollbar').setAttribute('aria-label', g('browse'));
    if (!sheet.hidden) render();
  };
  onLanguageChange(localize); localize();
  return { close };
}
