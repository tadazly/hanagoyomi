// 部分 Safari 会忽略 viewport 的缩放限制，补充取消浏览器的缩放默认行为。
// 不停止事件传播，也不取消单指操作；世界设置中的界面缩放独立工作。
export function initPageZoomGuard(doc = document) {
  const preventGestureZoom = event => { if (event.cancelable) event.preventDefault(); };
  const preventTouchZoom = event => { if (event.touches.length > 1) preventGestureZoom(event); };
  for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
    doc.addEventListener(type, preventGestureZoom, { capture: true, passive: false });
  }
  for (const type of ['touchstart', 'touchmove']) {
    doc.addEventListener(type, preventTouchZoom, { capture: true, passive: false });
  }
}
