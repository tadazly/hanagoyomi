import { populateIcons } from './icons.js';
import { initTimeControls } from './time-controls.js';
import { fmtTime, zonedHours } from '../world/clock.js';
import { CITIES, locationName } from '../data/cities.js';
import { airQualityPageUrl, weatherPageUrl } from '../world/weather.js';
import { updateWeatherDetails } from './weather-details.js';
import { initComponentSettings } from './component-settings.js';
import { initWallpaperScrolling } from './wallpaper-scroll.js';
import { bindDragScroll, cancelDragScroll } from './drag-scroll.js';
import { HEIGHT_PRESETS, sliderFromAgl } from '../world/view-preferences.js';
import { getSavedLocation, onLocationChange } from '../world/location.js';
import { getLanguage, getLocale, onLanguageChange, setLanguage, setMessage, t, translateDocument } from '../i18n/index.js';
import { WALLPAPER_MODE, storageKey } from '../platform/environment.js';
const $ = (id) => document.getElementById(id);
let toastTimer, lastDateKey = '', lastSourceKey = '', dateFormatter, lastObservation;
let revealWeatherSource = () => {};

function initLanguageControls() {
  const select = $('languageSelect');
  select.addEventListener('change', event => setLanguage(event.target.value));
  if (!WALLPAPER_MODE) return;
  // CEF 离屏渲染在显示原生 select 时会崩溃；保留其状态桥接，使用普通按钮绘制选项。
  select.hidden = true;
  select.parentElement.classList.add('wallpaper-language-field');
  const group = document.createElement('div');
  group.className = 'seg wallpaper-language-options';
  group.setAttribute('role', 'group');
  group.setAttribute('data-i18n-aria-label', 'language.label');
  group.setAttribute('aria-label', t('language.label'));
  for (const option of select.options) {
    const button = document.createElement('button');
    button.type = 'button'; button.dataset.languageOption = option.value;
    if (option.lang) button.lang = option.lang;
    if (option.dataset.i18n) setMessage(button, option.dataset.i18n);
    else button.textContent = option.textContent;
    button.addEventListener('click', () => setLanguage(option.value));
    group.append(button);
  }
  const refresh = () => group.querySelectorAll('button').forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.languageOption === select.value));
  });
  select.after(group);
  onLanguageChange(refresh);
  refresh();
}

function initToolbarVisibility() {
  const toolbar = document.querySelector('.toolbar');
  const zone = document.createElement('div'); zone.id = 'toolbarZone';
  zone.setAttribute('aria-hidden', 'true');
  document.body.append(zone);
  let timer, wakeTouchPointer = null;
  const hovered = new Set();
  const held = () => hovered.size > 0 || document.body.dataset.galleryOpen === 'true' || !$('panel').hidden || !$('timePopover').hidden || $('helpDialog').open || Boolean(toolbar.querySelector(':focus-visible'));
  const positionZone = () => {
    const rect = toolbar.getBoundingClientRect();
    const top = WALLPAPER_MODE ? Math.max(0, window.innerHeight - 160) : 0;
    Object.assign(zone.style, {
      left: `${Math.max(0, WALLPAPER_MODE ? window.innerWidth - 260 : rect.left - 16)}px`,
      top: `${top}px`,
      height: `${WALLPAPER_MODE ? window.innerHeight - top : rect.bottom + 16}px`,
    });
  };
  const hideLater = () => {
    clearTimeout(timer);
    if (!held()) timer = setTimeout(() => { if (!held()) toolbar.dataset.visible = 'false'; }, 4000);
  };
  const reveal = () => { toolbar.dataset.visible = 'true'; hideLater(); };
  for (const element of [zone, toolbar]) {
    element.addEventListener('pointerenter', event => {
      if (event.pointerType === 'touch') return;
      hovered.add(element); reveal();
    });
    element.addEventListener('pointerleave', event => {
      if (event.pointerType === 'touch') return;
      hovered.delete(element); hideLater();
    });
    element.addEventListener('pointerdown', event => {
      // 手机隐藏后的第一次触摸只唤出工具栏。
      if (event.pointerType === 'touch' && event.target === zone) {
        event.preventDefault();
        zone.setPointerCapture(event.pointerId);
        wakeTouchPointer = event.pointerId;
      }
      reveal();
    });
  }
  document.addEventListener('pointerdown', event => {
    wakeTouchPointer = null;
    // 触屏操纵时不让透明唤醒区挡住风景；同一次触摸仍能唤出工具栏。
    if (event.pointerType === 'touch' && document.body.dataset.sceneInteractive === 'true' && event.target === $('view')) {
      const rect = zone.getBoundingClientRect();
      if (event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom) {
        wakeTouchPointer = event.pointerId;
        reveal();
      }
    }
  }, true);
  document.addEventListener('pointercancel', () => { wakeTouchPointer = null; }, true);
  document.addEventListener('click', event => {
    if (wakeTouchPointer === null) return;
    const inToolbar = toolbar.contains(event.target) || event.target === zone;
    const wakeClick = inToolbar && (event.pointerId === wakeTouchPointer || (event.pointerId === undefined && event.detail > 0));
    wakeTouchPointer = null;
    // 取消 pointerdown 仍可能产生 click，必须在按钮收到前拦住这次唤出点击。
    if (wakeClick) { event.preventDefault(); event.stopImmediatePropagation(); }
  }, true);
  toolbar.addEventListener('focusin', reveal);
  toolbar.addEventListener('focusout', () => queueMicrotask(hideLater));
  const changes = new MutationObserver(records => {
    if (document.body.dataset.immersive === 'true') {
      hovered.clear(); clearTimeout(timer);
      return;
    }
    if (records.some(record => record.attributeName === 'data-immersive') || held()) reveal();
    else hideLater();
  });
  changes.observe(document.body, { attributes: true, attributeFilter: ['data-panel-open', 'data-immersive', 'data-gallery-open'] });
  changes.observe($('timePopover'), { attributes: true, attributeFilter: ['hidden'] });
  changes.observe($('helpDialog'), { attributes: true, attributeFilter: ['open'] });
  new ResizeObserver(positionZone).observe(toolbar);
  window.addEventListener('resize', positionZone);
  document.addEventListener('fullscreenchange', positionZone);
  positionZone();
  reveal();
}

function initWeatherSource() {
  const group = $('observerWeatherGroup'), weather = $('observerWeather'), source = $('weatherSource');
  let hideTimer, hovered = false;
  const held = () => hovered || Boolean(group.querySelector(':focus-visible'));
  const position = () => {
    if (source.dataset.visible !== 'true' || group.hidden) return;
    const anchor = group.getBoundingClientRect(), observation = group.closest('.observation');
    const viewport = window.visualViewport;
    const safe = $('componentBounds').getBoundingClientRect();
    const viewportLeft = viewport?.offsetLeft || 0, viewportTop = viewport?.offsetTop || 0;
    const leftEdge = Math.max(viewportLeft + 12, safe.left), topEdge = Math.max(viewportTop + 12, safe.top);
    const rightEdge = Math.min(viewportLeft + (viewport?.width || innerWidth) - 12, safe.right);
    const bottomEdge = Math.min(viewportTop + (viewport?.height || innerHeight) - 12, safe.bottom);
    const maxWidth = `${Math.max(24, Math.min(380, rightEdge - leftEdge))}px`;
    if (source.style.maxWidth !== maxWidth) source.style.maxWidth = maxWidth;
    const width = source.offsetWidth, height = source.offsetHeight, column = observation.dataset.uiColumn;
    const aligned = column === 'right' ? anchor.right - width : column === 'center' ? (anchor.left + anchor.right - width) / 2 : anchor.left;
    const clampX = x => Math.max(leftEdge, Math.min(x, rightEdge - width));
    const clampY = y => Math.max(topEdge, Math.min(y, bottomEdge - height));
    const rect = observation.getBoundingClientRect();
    const obstacles = [rect, ...['.toolbar', '.hint', '.masthead'].map(selector => document.querySelector(selector)).filter(element => element && !element.hidden).map(element => element.getBoundingClientRect())];
    const candidates = [
      [clampX(aligned), anchor.bottom + 8], [clampX(aligned), rect.top - height - 8],
      [rect.right + 8, clampY(anchor.top)], [rect.left - width - 8, clampY(anchor.top)],
      [leftEdge, topEdge], [rightEdge - width, topEdge],
      [leftEdge, bottomEdge - height], [rightEdge - width, bottomEdge - height],
    ];
    const fits = ([x, y]) => x >= leftEdge && y >= topEdge && x + width <= rightEdge && y + height <= bottomEdge
      && !obstacles.some(r => r.width && r.height && x < r.right + 8 && x + width > r.left - 8 && y < r.bottom + 8 && y + height > r.top - 8);
    const [left, top] = candidates.find(fits) || [clampX(aligned), clampY(anchor.bottom + 8)];
    if (source.style.left !== `${left}px`) source.style.left = `${left}px`;
    if (source.style.top !== `${top}px`) source.style.top = `${top}px`;
  };
  const setVisible = (visible) => {
    source.dataset.visible = String(visible);
    source.setAttribute('aria-hidden', String(!visible));
    weather.setAttribute('aria-expanded', String(visible));
    if (visible) position();
  };
  const scheduleHide = () => {
    clearTimeout(hideTimer);
    if (!held()) hideTimer = setTimeout(() => { if (!held()) setVisible(false); }, 4000);
  };
  const reveal = () => {
    setVisible(true);
    scheduleHide();
  };
  // 来源行属于同一悬停区域，鼠标移到链接上时仍可阅读、点击。
  group.addEventListener('pointerenter', event => {
    if (event.pointerType === 'touch') return;
    hovered = true;
    reveal();
  });
  group.addEventListener('pointerleave', event => {
    if (event.pointerType === 'touch') return;
    hovered = false;
    scheduleHide();
  });
  group.addEventListener('focusin', reveal);
  group.addEventListener('focusout', event => {
    if (!group.contains(event.relatedTarget)) queueMicrotask(scheduleHide);
  });
  weather.addEventListener('click', reveal);
  const observer = new ResizeObserver(position);
  observer.observe(source); observer.observe(group);
  document.addEventListener('componentlayout', position);
  window.addEventListener('resize', position);
  window.visualViewport?.addEventListener('resize', position);
  window.visualViewport?.addEventListener('scroll', position);
  return reveal;
}

function initRestoreButton() {
  const zone = $('restoreZone'), button = $('restoreBtn');
  let hideTimer, hovered = false;
  const held = () => hovered || button.matches(':focus-visible');
  const setVisible = visible => {
    button.dataset.visible = String(visible);
    button.setAttribute('aria-hidden', String(!visible));
    if (!visible && document.activeElement === button) $('view').focus({ preventScroll: true });
    button.inert = !visible;
  };
  const scheduleHide = () => {
    clearTimeout(hideTimer);
    if (!zone.hidden && button.dataset.visible === 'true' && !held()) {
      hideTimer = setTimeout(() => { if (!held()) setVisible(false); }, 4000);
    }
  };
  const reveal = () => {
    if (zone.hidden) return;
    setVisible(true);
    scheduleHide();
  };
  zone.addEventListener('pointerenter', event => {
    if (event.pointerType === 'touch') return;
    hovered = true;
    reveal();
  });
  zone.addEventListener('pointerleave', event => {
    if (event.pointerType === 'touch') return;
    hovered = false;
    scheduleHide();
  });
  zone.addEventListener('pointerdown', event => {
    if (event.pointerType !== 'touch') return;
    // 隐藏时的第一次触摸只唤出按钮，第二次点击按钮才返回界面。
    if (event.target === zone) event.preventDefault();
    reveal();
  });
  button.addEventListener('focusin', reveal);
  button.addEventListener('focusout', scheduleHide);
  window.addEventListener('keydown', event => {
    if (event.key === 'Tab' && !event.ctrlKey && !event.metaKey && !event.altKey && !zone.hidden && button.dataset.visible !== 'true') {
      event.preventDefault();
      reveal();
      button.focus();
    }
  });
  return active => {
    clearTimeout(hideTimer);
    hovered = false;
    zone.hidden = !active;
    setVisible(active);
    if (active) scheduleHide();
  };
}

export function showToast(key) {
  clearTimeout(toastTimer);
  setMessage($('toast'), key);
  $('toast').hidden = false;
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 3500);
}

export function bindTimePopoverPosition({ popover, trigger, wallpaper = WALLPAPER_MODE, eventTarget = window, resizeObserver = globalThis.ResizeObserver }) {
  const setStyle = (name, value) => { if (popover.style[name] !== value) popover.style[name] = value; };
  const position = () => {
    if (popover.hidden) return;
    if (!trigger.getClientRects().length) {
      popover.hidden = true;
      if (trigger.getAttribute('aria-expanded') !== 'false') trigger.setAttribute('aria-expanded', 'false');
      return;
    }
    const anchor = trigger.getBoundingClientRect();
    // 壁纸浮层的可用高度只取决于工具栏位置，避免高度与 top 相互反馈。
    const maxHeight = Math.max(0, wallpaper ? anchor.top - 24 : eventTarget.innerHeight - anchor.bottom - 24);
    setStyle('maxHeight', `${maxHeight}px`);
    const left = Math.max(12, Math.min(anchor.right - popover.offsetWidth, eventTarget.innerWidth - popover.offsetWidth - 12));
    const top = wallpaper ? Math.max(12, anchor.top - popover.offsetHeight - 12) : anchor.bottom + 12;
    setStyle('left', `${left}px`); setStyle('top', `${top}px`);
  };
  popover.addEventListener('toggle', position, true);
  eventTarget.addEventListener('resize', position);
  (popover.ownerDocument || eventTarget.document)?.addEventListener('fullscreenchange', position);
  if (resizeObserver) {
    const observer = new resizeObserver(position);
    observer.observe(popover); observer.observe(trigger);
  }
  return position;
}

export function bindShellContentScrolling({ document: doc = globalThis.document, eventTarget = globalThis.window, wallpaper = WALLPAPER_MODE, mutationObserver = globalThis.MutationObserver } = {}) {
  const surfaces = [
    { name: 'panel', viewport: doc.getElementById('panelBody'), container: doc.getElementById('panel') },
    { name: 'help', viewport: doc.querySelector('.help-body'), container: doc.getElementById('helpDialog') },
    { name: 'time', viewport: doc.getElementById('quickTimeControls'), container: doc.getElementById('timePopover') },
  ];
  // WE 初始化器已绑定相同 viewport；网站只补内容手势，保留原生滚轮和滚动条。
  const nativeBindings = wallpaper ? [] : surfaces.map(({ viewport }) => bindDragScroll({ viewport, axis: 'y', eventTarget }));
  const cancel = name => surfaces.filter(surface => !name || surface.name === name).forEach(({ viewport }) => cancelDragScroll(viewport));
  const cancelAll = () => cancel();
  const closeHandlers = surfaces.map(({ name, container }) => {
    const close = () => cancel(name); container.addEventListener('close', close);
    return () => container.removeEventListener('close', close);
  });
  doc.addEventListener('worldpanelopen', cancelAll);
  doc.addEventListener('galleryopen', cancelAll);
  let observer;
  if (!wallpaper && mutationObserver) {
    observer = new mutationObserver(() => {
      for (const { name, container } of surfaces) if (container.hidden || container.inert || !container.getClientRects().length) cancel(name);
    });
    for (const { container } of surfaces) observer.observe(container, { attributes: true, attributeFilter: ['hidden', 'open', 'inert'] });
  }
  return {
    cancel,
    destroy() {
      cancelAll(); nativeBindings.forEach(binding => binding.destroy()); observer?.disconnect();
      closeHandlers.forEach(remove => remove());
      doc.removeEventListener('worldpanelopen', cancelAll); doc.removeEventListener('galleryopen', cancelAll);
    },
  };
}

export function initShell() {
  setMessage($('helpVersion'), 'help.version', { version: __APP_VERSION__ });
  initTimeControls();
  populateIcons();
  if (WALLPAPER_MODE) {
    initWallpaperScrolling();
    initWallpaperScrolling({ viewport: document.querySelector('.help-body'), container: $('helpDialog') });
    initWallpaperScrolling({ viewport: $('quickTimeControls'), container: $('timePopover') });
  }
  const contentScrolling = bindShellContentScrolling();
  translateDocument();
  const components = initComponentSettings();
  // 壁纸 LOGO 的位置控件由组件模块克隆，移动已有节点以保留绑定与存储合同。
  const logoPlacement = document.querySelector('[data-component-settings="logo"] .component-placement');
  if (logoPlacement && !logoPlacement.closest('details')) {
    const details = document.createElement('details'), summary = document.createElement('summary'), title = document.createElement('span'), body = document.createElement('div');
    details.className = 'advanced'; body.className = 'settings-detail-body';
    setMessage(title, 'components.position'); summary.append(title);
    summary.insertAdjacentHTML('beforeend', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>');
    logoPlacement.before(details); body.append(logoPlacement); details.append(summary, body);
  }
  revealWeatherSource = initWeatherSource();
  const setRestoreButton = initRestoreButton();
  const timePopover = $('timePopover'), timeTrigger = $('liveStatus');
  const positionTimePopover = bindTimePopoverPosition({ popover: timePopover, trigger: timeTrigger });
  const setTimePopover = (open, restoreFocus = false) => {
    contentScrolling.cancel('time');
    timePopover.hidden = !open;
    timeTrigger.setAttribute('aria-expanded', String(open));
    if (open) {
      document.dispatchEvent(new CustomEvent('worldpanelopen', { detail: { panel: 'time' } }));
      positionTimePopover();
      (document.querySelector('#quickTimeControls [data-time-action="lock"]') || $('quick-time')).focus({ preventScroll: true });
    } else if (restoreFocus) timeTrigger.focus({ preventScroll: true });
  };
  timeTrigger.addEventListener('click', () => setTimePopover(timePopover.hidden));
  $('timePopoverClose').addEventListener('click', () => setTimePopover(false, true));
  const dismissTimePopover = event => {
    if (!timePopover.hidden && !timePopover.contains(event.target) && !timeTrigger.contains(event.target)) setTimePopover(false);
  };
  document.addEventListener('pointerdown', dismissTimePopover);
  document.addEventListener('focusin', dismissTimePopover);
  initLanguageControls();
  const refreshLabels = () => {
    $('panelToggle').setAttribute('aria-label', t($('panel').hidden ? 'panel.open' : 'panel.close'));
    $('fullscreenBtn').setAttribute('aria-label', t(document.fullscreenElement ? 'fullscreen.exit' : 'fullscreen.enter'));
  };
  // 这些标签依赖运行状态，语言变化时不能仅恢复 HTML 中的初始文案。
  $('panelToggle').removeAttribute('data-i18n-aria-label');
  $('fullscreenBtn').removeAttribute('data-i18n-aria-label');
  onLanguageChange(() => {
    refreshLabels();
    if (lastObservation) updateObservation(lastObservation);
    positionTimePopover();
  });
  const setPanel = (open, restoreFocus = false) => {
    contentScrolling.cancel('panel');
    if (open) {
      setTimePopover(false);
      document.dispatchEvent(new CustomEvent('worldpanelopen', { detail: { panel: 'world' } }));
    }
    document.body.dataset.panelOpen = String(open);
    $('panel').hidden = !open;
    $('panel').dataset.open = String(open);
    $('panelToggle').setAttribute('aria-expanded', String(open));
    refreshLabels();
    if (restoreFocus) $('panelToggle').focus();
  };
  document.addEventListener('galleryopen', () => {
    setTimePopover(false); setPanel(false);
    if ($('helpDialog').open) $('helpDialog').close();
  });
  let saveUnavailable = false;
  document.addEventListener('worldsettingssaved', event => {
    const saved = event.detail?.saved === true;
    if (!saved && !saveUnavailable) showToast('panel.saveUnavailable');
    saveUnavailable = !saved;
  });
  const selectTab = (name, focus = false) => {
    contentScrolling.cancel('panel');
    document.querySelectorAll('[data-tab]').forEach(btn => {
      const selected = btn.dataset.tab === name;
      btn.setAttribute('aria-selected', String(selected));
      btn.tabIndex = selected ? 0 : -1;
      $(`pane-${btn.dataset.tab}`).hidden = !selected;
      if (selected && focus) btn.focus();
    });
    $('panelBody').scrollTop = 0;
  };
  document.querySelectorAll('[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => selectTab(btn.dataset.tab));
    btn.addEventListener('keydown', e => {
      const tabs = [...document.querySelectorAll('[data-tab]')].map(tab => tab.dataset.tab);
      let idx = tabs.indexOf(btn.dataset.tab);
      if (e.key === 'ArrowRight') idx = (idx + 1) % tabs.length;
      else if (e.key === 'ArrowLeft') idx = (idx + tabs.length - 1) % tabs.length;
      else if (e.key === 'Home') idx = 0;
      else if (e.key === 'End') idx = tabs.length - 1;
      else return;
      e.preventDefault(); selectTab(tabs[idx], true);
    });
  });
  const narrow = matchMedia('(max-width: 700px)');
  const savedLocation = getSavedLocation(), startupOption = $('startupPanelOption'), startupToggle = $('openPanelOnStartup');
  let openOnStartup = false;
  try { openOnStartup = localStorage.getItem(storageKey('hanagoyomi.panelOnStartup.v1')) === 'true'; } catch {}
  startupToggle.checked = openOnStartup;
  startupOption.hidden = !savedLocation;
  onLocationChange(() => { startupOption.hidden = false; });
  startupToggle.addEventListener('change', () => {
    try { localStorage.setItem(storageKey('hanagoyomi.panelOnStartup.v1'), String(startupToggle.checked)); } catch {}
  });
  // 初次访问沿用原来的布局；设置过地点后才按用户保存的启动选项展开。
  setPanel(WALLPAPER_MODE ? openOnStartup : savedLocation ? openOnStartup : !narrow.matches);
  $('panelToggle').addEventListener('click', () => setPanel($('panel').hidden));
  $('panelClose').addEventListener('click', () => setPanel(false, true));
  $('placeBtn').addEventListener('click', () => {
    setPanel(true); selectTab('now'); $('locationPicker').open = true;
    if (!WALLPAPER_MODE) $('citySearch').focus();
  });
  const heightInput = $('height'), heightPresets = [...document.querySelectorAll('[data-height-preset]')];
  const refreshHeightPresets = () => heightPresets.forEach(button => {
    button.setAttribute('aria-pressed', String(Math.abs(Number(heightInput.value) - sliderFromAgl(HEIGHT_PRESETS[button.dataset.heightPreset])) < .5));
  });
  heightInput.addEventListener('input', refreshHeightPresets);
  document.addEventListener('worldscenechange', refreshHeightPresets);
  refreshHeightPresets();
  const setImmersive = (active) => {
    if (active) contentScrolling.cancel();
    if (active) setTimePopover(false);
    document.body.dataset.immersive = String(active);
    document.querySelectorAll('.chrome').forEach(el => { el.inert = active; });
    // 初始焦点放到风景，避免按钮被程序聚焦后一直无法自动隐藏。
    if (active) $('view').focus({ preventScroll: true });
    setRestoreButton(active);
    if (!active) $('immersiveBtn').focus();
  };
  $('immersiveBtn').addEventListener('click', () => setImmersive(true));
  $('restoreBtn').addEventListener('click', () => setImmersive(false));
  const fullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
      else showToast('fullscreen.unsupported');
    } catch { showToast('fullscreen.unavailable'); }
  };
  $('fullscreenBtn').addEventListener('click', fullscreen);
  document.addEventListener('fullscreenchange', refreshLabels);
  const openHelp = () => {
    setTimePopover(false);
    document.dispatchEvent(new CustomEvent('worldpanelopen', { detail: { panel: 'help' } }));
    $('helpDialog').showModal();
  };
  $('helpBtn').addEventListener('click', openHelp);
  $('panelHelpBtn').addEventListener('click', openHelp);
  $('helpClose').addEventListener('click', () => $('helpDialog').close());
  $('helpDialog').addEventListener('click', e => { if (e.target === $('helpDialog')) $('helpDialog').close(); });
  $('reloadBtn').addEventListener('click', () => location.reload());
  window.addEventListener('keydown', e => {
    // 快捷面板里的滑块聚焦时，Esc 也只关闭快捷面板。
    if (e.key === 'Escape' && !timePopover.hidden) {
      e.preventDefault();
      setTimePopover(false, true);
      return;
    }
    if (e.target.closest('input, textarea, select') || e.ctrlKey || e.metaKey || e.altKey || $('helpDialog').open) return;
    if (document.body.dataset.sceneInteractive === 'false' && e.key !== 'Escape') return;
    if (e.key === 'Escape') {
      if (document.body.dataset.immersive === 'true') setImmersive(false);
      else setPanel(false);
    }
    if (e.key.toLowerCase() === 'h') setImmersive(document.body.dataset.immersive !== 'true');
    if (e.key.toLowerCase() === 'f') fullscreen();
  });
  if (WALLPAPER_MODE) {
    $('fullscreenBtn').hidden = true;
    document.querySelector('.github-button').hidden = true;
    document.querySelector('.workshop-button').hidden = true;
    $('geoBtn').hidden = true;
    if (window.hanagoyomiWallpaper) {
      $('citySearch').closest('.search-field').hidden = true;
      $('cityResults').hidden = true;
    }
    // 仍保留署名和完整设置，去除桌面宿主无法可靠完成的页面跳转。
    document.querySelectorAll('[data-about-link]').forEach(link => {
      if (link.classList.contains('wordmark')) {
        const name = document.createElement('span'); name.className = 'wordmark'; name.textContent = link.textContent; link.replaceWith(name);
      } else link.closest('p')?.remove();
    });
    document.querySelectorAll('a[href]').forEach(link => {
      const text = document.createElement('span');
      text.className = link.className; text.textContent = link.textContent; text.hidden = link.hidden;
      if (link.dataset.i18n) setMessage(text, link.dataset.i18n);
      link.replaceWith(text);
    });
    document.querySelector('.help-controls').hidden = true;
    document.querySelector('.touch-help').hidden = true;
    const help = document.createElement('p'); setMessage(help, 'wallpaper.help');
    document.querySelector('.help-body').prepend(help);
    const interactionNote = document.querySelector('[data-i18n="components.interactionDescription"]');
    if (interactionNote) setMessage(interactionNote, 'wallpaper.interactionDescription');
    $('immersiveBtn').dataset.i18nTitle = 'immersive.enter';
    $('immersiveBtn').title = t('immersive.enter');
  }
  initToolbarVisibility();
  return { components, setPanel, setTimePopover };
}

export function updateObservation(state) {
  lastObservation = state;
  const { loc, ms, live, weather, coverage, wind, followNow, speed } = state;
  $('observerCity').textContent = locationName(loc);
  $('observerEnglish').textContent = (CITIES.find(c => c[0] === loc.name)?.[1] || '').toUpperCase();
  $('observerEnglish').hidden = getLanguage() === 'en' || !$('observerEnglish').textContent;
  $('observerTime').textContent = fmtTime(zonedHours(loc.tz, ms));
  $('observerTime').dateTime = new Date(ms).toISOString();
  const dateKey = `${getLocale()}|${loc.tz}`;
  if (dateKey !== lastDateKey) {
    dateFormatter = new Intl.DateTimeFormat(getLocale(), { timeZone: loc.tz, month: 'long', day: 'numeric', weekday: 'long' });
    lastDateKey = dateKey;
  }
  $('observerDate').textContent = dateFormatter.format(ms);
  const condition = $('observerCondition'), group = $('observerWeatherGroup'), display = state.weatherDisplay || {};
  delete condition.dataset.i18n;
  condition.textContent = weather ? t(`weather.${weather}`) : '—';
  group.hidden = display.show === false;
  group.querySelectorAll('[data-weather-field]').forEach(field => { field.hidden = display[field.dataset.weatherField] === false; });
  $('observerClouds').textContent = Number.isFinite(live?.cloud_cover) ? Math.round(live.cloud_cover) + '%' : '—';
  $('observerWind').textContent = Number.isFinite(live?.wind_speed_10m) ? live.wind_speed_10m.toFixed(1) + ' m/s' : '—';
  $('observerWind').parentElement.title = Number.isFinite(live?.wind_speed_10m) ? t('weather.windValue', { value: live.wind_speed_10m.toFixed(1) }) : t('weather.noData');
  updateWeatherDetails(group, { live, airQuality: state.airQuality, temperatureUnit: state.temperatureUnit, simulated: state.simulatedWeather, compact: true, hideUnavailable: state.hideUnavailableWeather, display });
  $('observerWeatherMetrics').hidden = ![...$('observerWeatherMetrics').children].some(field => !field.hidden);
  const source = $('weatherSource');
  const sourceKey = `${getLocale()}|${loc.lat},${loc.lon}|${loc.tz}|${state.temperatureUnit}|${state.airQuality?.fetchedAt}|${live ? `live:${live.fetchedAt}:${Boolean(live.cached)}` : state.weatherSource}`;
  // 每半秒的观测刷新不重置隐藏计时，也不重建正在聚焦的来源链接。
  if (sourceKey !== lastSourceKey) {
    lastSourceKey = sourceKey;
    if (live && WALLPAPER_MODE) {
      source.textContent = `${t(live.cached ? 'weather.source.cached' : 'weather.data')} Open-Meteo${state.airQuality ? ` · ${t('weather.airQuality')} Open-Meteo / CAMS` : ''}`;
      source.title = t('weather.fetched', { time: new Date(live.fetchedAt).toLocaleTimeString(getLocale(), { timeZone: loc.tz }) });
    } else if (live) {
      let link = source.querySelector('a');
      if (!link) {
        link = document.createElement('a');
        link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = 'Open-Meteo';
        source.replaceChildren(document.createTextNode(''), link);
      }
      source.firstChild.textContent = t(live.cached ? 'weather.source.cached' : 'weather.data') + ' ';
      link.href = weatherPageUrl(loc, state.temperatureUnit);
      let airSource = source.querySelector('[data-air-source]');
      if (state.airQuality) {
        if (!airSource) {
          airSource = document.createElement('span'); airSource.dataset.airSource = '';
          const airLink = document.createElement('a');
          airLink.target = '_blank'; airLink.rel = 'noopener noreferrer'; airLink.textContent = 'Open-Meteo / CAMS';
          airSource.append(document.createTextNode(''), airLink); source.append(airSource);
        }
        airSource.firstChild.textContent = ' · ' + t('weather.airQuality') + ' ';
        airSource.querySelector('a').href = airQualityPageUrl(loc);
      } else airSource?.remove();
      source.title = t('weather.fetched', { time: new Date(live.fetchedAt).toLocaleTimeString(getLocale(), { timeZone: loc.tz }) });
    } else {
      source.textContent = t(state.weatherSource);
      source.title = '';
    }
    revealWeatherSource();
  }
  const sceneFollow = state.sceneFollowNow ?? followNow, sceneSpeed = state.sceneSpeed ?? speed;
  const timeState = state.sceneTimeLocked ? 'locks.timeLocked' : sceneFollow && sceneSpeed === 1 ? 'time.live' : sceneSpeed === 0 ? 'time.still' : 'time.roaming';
  setMessage($('liveLabel'), timeState);
  $('liveStatus').setAttribute('aria-label', `${t(timeState)} · ${t('time.settings')}`);
  $('liveStatus').dataset.live = String(!state.sceneTimeLocked && sceneFollow && sceneSpeed === 1);
  document.body.dataset.daylight = String((state.sceneSunAltitude ?? state.sunAltitude) > 8);
}
