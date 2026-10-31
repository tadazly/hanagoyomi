import { bindDragScroll } from './drag-scroll.js';

export function rangeValueAtPosition(input, clientX, rtl = false) {
  const min = Number(input.min || 0), max = Number(input.max || 100);
  const rect = input.getBoundingClientRect();
  if (!(rect.width > 0) || max <= min) return min;
  let ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  if (rtl) ratio = 1 - ratio;
  const step = input.step === 'any' ? 0 : Number(input.step || 1);
  const raw = min + ratio * (max - min);
  const value = step > 0 ? min + Math.round((raw - min) / step) * step : raw;
  return Math.max(min, Math.min(max, Number(value.toPrecision(12))));
}

// 点击在抬起后定位；横拖超过 5px 后从原值相对调整，复用画廊的拖动与惯性。
// 连续位置独立于步进取整；填充层用 transform 绘制，避免视觉反馈卡在离散刻度上。
export function bindWallpaperRanges(doc) {
  const view = doc.defaultView, entries = new Map();
  const send = (input, type) => input.dispatchEvent(new view.Event(type, { bubbles: true }));
  const ratio = input => {
    const min = Number(input.min || 0), span = Number(input.max || 100) - min;
    return span > 0 ? Math.max(0, Math.min(1, (input.valueAsNumber - min) / span)) : 1;
  };
  const paint = (entry, fraction = ratio(entry.input)) => {
    entry.fill.style.transform = `scaleX(${Math.max(0, Math.min(1, fraction))})`;
  };
  const settle = entry => {
    delete entry.input.dataset.rangeAdjusting;
    paint(entry);
    if (entry.input.value !== entry.startValue) {
      entry.startValue = entry.input.value; send(entry.input, 'change');
    }
  };
  const register = input => {
    if (entries.has(input)) return entries.get(input);
    const surface = doc.createElement('div'), track = doc.createElement('div'), fill = doc.createElement('span');
    surface.className = 'wallpaper-range'; track.className = 'wallpaper-range-track'; track.setAttribute('aria-hidden', 'true');
    track.append(fill); input.before(surface); surface.append(track, input);
    const entry = { input, surface, fill, width: 0, position: 0, startValue: input.value };
    const scroll = () => {
      if (input.disabled || !input.isConnected || !(input.getBoundingClientRect().width > 0)) { entry.binding.cancel(); return; }
      const fraction = entry.width > 0 ? entry.position / entry.width : ratio(input);
      const rect = input.getBoundingClientRect(), before = input.value;
      input.value = rangeValueAtPosition(input, rect.left + fraction * rect.width);
      if (input.value !== before) send(input, 'input');
      paint(entry, fraction);
    };
    entry.binding = bindDragScroll({ viewport: input, axis: 'x', eventTarget: view,
      ignoreSelector: '[data-no-range-drag]', direction: -1, allowTouch: true,
      getLimit: () => entry.width, getPosition: () => entry.position, setPosition: value => { entry.position = value; },
      onScroll: scroll, onSettle: () => settle(entry) });
    entry.click = event => {
      if (event.detail === 0 || input.disabled) return;
      event.preventDefault();
      const before = input.value;
      input.value = rangeValueAtPosition(input, event.clientX, view.getComputedStyle(input).direction === 'rtl');
      if (input.value !== before) { send(input, 'input'); send(input, 'change'); }
      entry.startValue = input.value; paint(entry);
    };
    entry.key = () => entry.binding.cancel();
    input.addEventListener('click', entry.click); input.addEventListener('keydown', entry.key);
    entry.bounds = `${input.min}|${input.max}|${input.step}|${input.disabled}`;
    entries.set(input, entry); paint(entry);
    return entry;
  };
  const down = event => {
    if (event.button !== undefined && event.button !== 0 || event.isPrimary === false) return;
    const input = event.target.closest?.('input[type="range"]');
    if (!input || input.disabled) return;
    const entry = register(input);
    // 必须在捕获阶段取消原生滑条按下动作，不能让 CEF 先跳值再进入横拖。
    event.preventDefault(); input.focus({ preventScroll: true });
    entry.width = input.getBoundingClientRect().width;
    if (entry.binding.active) return;
    entry.position = ratio(input) * entry.width; entry.startValue = input.value;
    input.dataset.rangeAdjusting = 'true';
  };
  doc.querySelectorAll('input[type="range"]').forEach(register);
  doc.addEventListener('pointerdown', down, true); doc.addEventListener('mousedown', down, true);
  const observer = new view.MutationObserver(records => {
    for (const record of records) {
      const entry = entries.get(record.target);
      if (!entry) continue;
      const input = entry.input, bounds = `${input.min}|${input.max}|${input.step}|${input.disabled}`;
      if (bounds !== entry.bounds || !(input.getBoundingClientRect().width > 0)) { entry.bounds = bounds; entry.binding.cancel(); }
      if (!entry.binding.active) paint(entry);
    }
  });
  observer.observe(doc.body, { subtree: true, attributes: true, attributeFilter: ['style', 'min', 'max', 'step', 'disabled'] });
  return { destroy() {
    observer.disconnect(); doc.removeEventListener('pointerdown', down, true); doc.removeEventListener('mousedown', down, true);
    for (const entry of entries.values()) {
      entry.binding.destroy(); entry.input.removeEventListener('click', entry.click); entry.input.removeEventListener('keydown', entry.key);
      entry.surface.before(entry.input); entry.surface.remove();
    }
    entries.clear();
  } };
}
