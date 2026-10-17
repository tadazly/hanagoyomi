import { bindDragScroll } from './drag-scroll.js';

// 展架内容与世界设置共用拖动/惯性；此处只管理横向轨道、滑块与可访问状态。
export function bindGallerySwipe({ viewport, track, thumb, eventTarget = window }) {
  let drag = null, ignoreMouseUntil = 0;
  viewport.style.touchAction = 'pan-x';
  track.style.touchAction = 'none';
  track.tabIndex = 0;
  track.setAttribute('role', 'scrollbar');
  track.setAttribute('aria-orientation', 'horizontal');
  track.setAttribute('aria-valuemin', '0');
  if (viewport.id) track.setAttribute('aria-controls', viewport.id);
  const maxScroll = () => Math.max(0, viewport.scrollWidth - viewport.clientWidth);
  const metrics = () => {
    const width = Math.max(0, track.clientWidth);
    const thumbWidth = Math.min(width, Math.max(44, width * viewport.clientWidth / Math.max(1, viewport.scrollWidth)));
    return { max: maxScroll(), thumbWidth, travel: Math.max(0, width - thumbWidth) };
  };
  const refresh = () => {
    const hidden = viewport.clientWidth <= 0 || maxScroll() <= 0;
    if (track.hidden !== hidden) track.hidden = hidden;
    // 先展开轨道，再读尺寸，避免从 display:none 恢复时得到零宽滑块。
    const { max, thumbWidth, travel } = metrics();
    const left = Math.max(0, Math.min(max, viewport.scrollLeft));
    const width = `${thumbWidth}px`, transform = `translateX(${max ? left / max * travel : 0}px)`;
    if (thumb.style.width !== width) thumb.style.width = width;
    if (thumb.style.transform !== transform) thumb.style.transform = transform;
    const values = { 'aria-valuemax': String(Math.round(max)), 'aria-valuenow': String(Math.round(left)) };
    for (const [name, value] of Object.entries(values)) if (track.getAttribute(name) !== value) track.setAttribute(name, value);
  };
  const contentDrag = bindDragScroll({ viewport, axis: 'x', eventTarget, onScroll: refresh });
  const scroll = left => {
    viewport.scrollLeft = Math.max(0, Math.min(maxScroll(), left));
    refresh();
  };
  const start = (event, pointer) => {
    if (drag || event.button !== 0 || track.hidden) return;
    if (!pointer && (Date.now() < ignoreMouseUntil || event.sourceCapabilities?.firesTouchEvents)) return;
    if (pointer && event.pointerType === 'touch') ignoreMouseUntil = Date.now() + 800;
    contentDrag.cancel();
    event.preventDefault(); event.stopPropagation();
    const { max, travel, thumbWidth } = metrics();
    if (!max || !travel) return;
    track.focus({ preventScroll: true });
    if (!thumb.contains(event.target)) scroll((event.clientX - track.getBoundingClientRect().left - thumbWidth / 2) / travel * max);
    drag = { x: event.clientX, left: viewport.scrollLeft, pointerId: pointer ? event.pointerId : undefined, captured: false };
    if (drag.pointerId !== undefined) {
      try { track.setPointerCapture(drag.pointerId); drag.captured = true; } catch {}
    }
  };
  const move = event => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    event.preventDefault();
    const { max, travel } = metrics();
    if (travel) scroll(drag.left + (event.clientX - drag.x) / travel * max);
  };
  const end = event => {
    if (!drag || (event && event.type !== 'blur' && event.pointerId !== drag.pointerId)) return;
    const previous = drag; drag = null;
    if (previous.captured) { try { track.releasePointerCapture(previous.pointerId); } catch {} }
  };
  track.addEventListener('pointerdown', event => start(event, true));
  track.addEventListener('mousedown', event => start(event, false));
  track.addEventListener('lostpointercapture', end);
  eventTarget.addEventListener('pointermove', move);
  eventTarget.addEventListener('mousemove', move);
  eventTarget.addEventListener('pointerup', end);
  eventTarget.addEventListener('mouseup', end);
  eventTarget.addEventListener('pointercancel', end);
  eventTarget.addEventListener('blur', end);
  viewport.addEventListener('scroll', refresh);
  viewport.addEventListener('dragstart', event => event.preventDefault());
  track.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    contentDrag.cancel();
    if (event.key === 'ArrowLeft') scroll(viewport.scrollLeft - 40);
    else if (event.key === 'ArrowRight') scroll(viewport.scrollLeft + 40);
    else if (event.key === 'Home') scroll(0);
    else scroll(maxScroll());
    event.preventDefault(); event.stopPropagation();
  });
  if (typeof ResizeObserver !== 'undefined') {
    const resize = new ResizeObserver(refresh);
    resize.observe(viewport); resize.observe(track);
  }
  refresh.cancel = () => contentDrag.cancel();
  refresh();
  return refresh;
}
