// 只给可见区域和相邻卡片设置 src；原生 lazy loading 对横向展架的预加载距离过大。
export function createGalleryThumbnails({ root, eventTarget = globalThis, preload = 240 }) {
  const pending = new Map();
  let active = false, frame = null;
  const load = image => {
    const source = pending.get(image);
    if (!source) return;
    pending.delete(image); observer?.unobserve(image);
    image.src = source;
  };
  const Observer = eventTarget.IntersectionObserver;
  const observer = typeof Observer === 'function' ? new Observer(entries => {
    if (!active) return;
    for (const entry of entries) if (entry.isIntersecting) load(entry.target);
  }, { root, rootMargin: `0px ${preload}px`, threshold: 0 }) : null;
  // Safari 的缩放/动态插入可能漏发交叉通知；打开、插入和滚动时也按视口检查。
  // 不支持 IntersectionObserver 的宿主共用这条路径，不退回全量请求。
  const check = () => {
    frame = null;
    if (!active) return;
    const view = root.getBoundingClientRect();
    if (view.width <= 0 || view.height <= 0) return;
    for (const image of pending.keys()) {
      const bounds = image.getBoundingClientRect();
      if (bounds.width > 0 && bounds.height > 0 && bounds.right >= view.left - preload
        && bounds.left <= view.right + preload && bounds.bottom > view.top && bounds.top < view.bottom) load(image);
    }
  };
  const schedule = () => {
    if (active && frame === null) frame = eventTarget.requestAnimationFrame(check);
  };
  root.addEventListener('scroll', schedule, { passive: true });
  eventTarget.addEventListener('resize', schedule);
  return {
    observe(image, source) {
      pending.set(image, source);
      if (active) { observer?.observe(image); schedule(); }
    },
    unobserve(image) { pending.delete(image); observer?.unobserve(image); },
    setActive(value) {
      active = Boolean(value);
      observer?.disconnect();
      if (frame !== null) { eventTarget.cancelAnimationFrame(frame); frame = null; }
      if (active) { if (observer) for (const image of pending.keys()) observer.observe(image); schedule(); }
    },
    dispose() {
      this.setActive(false); pending.clear();
      root.removeEventListener('scroll', schedule); eventTarget.removeEventListener('resize', schedule);
    },
  };
}
