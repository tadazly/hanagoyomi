// 桌面宿主中的原生滚动条不可依赖，通过鼠标移动和点击显式更新 scrollTop。
// 滚轮处理用于浏览器预览；宿主未传入的滚轮事件无法由页面恢复。
export function bindWallpaperScroll({ viewport, track, thumb, eventTarget = window }) {
  let drag = null;
  const metrics = () => {
    const height = track.clientHeight, max = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
    const thumbHeight = Math.min(height, Math.max(32, height * viewport.clientHeight / Math.max(1, viewport.scrollHeight)));
    return { max, thumbHeight, travel: Math.max(0, height - thumbHeight) };
  };
  const refresh = () => {
    const { max, thumbHeight, travel } = metrics();
    const hidden = max <= 0 || viewport.clientHeight <= 0;
    if (track.hidden !== hidden) track.hidden = hidden;
    thumb.style.height = `${thumbHeight}px`;
    thumb.style.transform = `translateY(${max ? viewport.scrollTop / max * travel : 0}px)`;
    track.setAttribute('aria-valuemax', String(max));
    track.setAttribute('aria-valuenow', String(Math.round(viewport.scrollTop)));
  };
  const scroll = value => {
    viewport.scrollTop = Math.max(0, Math.min(metrics().max, value));
    refresh();
  };
  const wheel = event => {
    if (event.ctrlKey || !Number.isFinite(event.deltaY) || !event.deltaY) return;
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewport.clientHeight : 1;
    event.preventDefault();
    event.stopPropagation();
    scroll(viewport.scrollTop + event.deltaY * unit);
  };
  const start = event => {
    if (event.button !== 0 || track.hidden) return;
    event.preventDefault();
    const { max, travel, thumbHeight } = metrics();
    if (!max || !travel) return;
    track.focus({ preventScroll: true });
    if (!thumb.contains(event.target)) {
      scroll((event.clientY - track.getBoundingClientRect().top - thumbHeight / 2) / travel * max);
    }
    drag = { y: event.clientY, top: viewport.scrollTop, pointerId: event.pointerId };
    if (event.pointerId !== undefined) {
      try { track.setPointerCapture(event.pointerId); } catch {}
    }
  };
  const move = event => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const { max, travel } = metrics();
    if (travel) scroll(drag.top + (event.clientY - drag.y) / travel * max);
  };
  const end = () => {
    const pointerId = drag?.pointerId;
    drag = null;
    if (pointerId !== undefined) {
      try { track.releasePointerCapture(pointerId); } catch {}
    }
  };
  viewport.addEventListener('scroll', refresh);
  viewport.parentElement.addEventListener('wheel', wheel, { passive: false });
  track.addEventListener('mousedown', event => { if (drag?.pointerId === undefined) start(event); });
  eventTarget.addEventListener('mousemove', move);
  eventTarget.addEventListener('mouseup', end);
  eventTarget.addEventListener('blur', end);
  track.addEventListener('pointerdown', start);
  eventTarget.addEventListener('pointermove', move);
  eventTarget.addEventListener('pointerup', event => { if (event.pointerId === drag?.pointerId) end(); });
  eventTarget.addEventListener('pointercancel', end);
  track.addEventListener('lostpointercapture', end);
  track.addEventListener('keydown', event => {
    const steps = { ArrowUp: -40, ArrowDown: 40, PageUp: -viewport.clientHeight, PageDown: viewport.clientHeight };
    if (event.key === 'Home') scroll(0);
    else if (event.key === 'End') scroll(metrics().max);
    else if (Object.hasOwn(steps, event.key)) scroll(viewport.scrollTop + steps[event.key]);
    else return;
    event.preventDefault();
    event.stopPropagation();
  });
  return refresh;
}

export function initWallpaperScrolling() {
  const viewport = document.getElementById('panelBody');
  const region = document.createElement('div');
  region.className = 'wallpaper-scroll-region';
  viewport.before(region);
  region.append(viewport);
  const track = document.createElement('div'), thumb = document.createElement('div');
  track.className = 'wallpaper-scrollbar';
  thumb.className = 'wallpaper-scroll-thumb';
  track.tabIndex = 0;
  track.setAttribute('role', 'scrollbar');
  track.setAttribute('aria-controls', viewport.id);
  track.setAttribute('aria-orientation', 'vertical');
  track.setAttribute('aria-valuemin', '0');
  track.setAttribute('data-i18n-aria-label', 'panel.title');
  track.append(thumb);
  region.append(track);
  const refresh = bindWallpaperScroll({ viewport, track, thumb });
  const resize = new ResizeObserver(refresh);
  resize.observe(viewport);
  resize.observe(track);
  for (const section of viewport.children) resize.observe(section);
  // 切换标签、展开高级设置、切换语言或开关面板时同步滚动范围。
  const changes = new MutationObserver(() => { refresh(); });
  changes.observe(document.getElementById('panel'), { subtree: true, childList: true, characterData: true,
    attributes: true, attributeFilter: ['hidden', 'open'] });
  refresh();
}
