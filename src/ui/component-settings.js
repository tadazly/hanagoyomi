import { onLanguageChange, setMessage, t } from '../i18n/index.js';

export const COMPONENTS_KEY = 'hanagoyomi.components.v1';
export const POSITIONS = ['top-left', 'top-center', 'top-right', 'middle-left', 'middle-center', 'middle-right', 'bottom-left', 'bottom-center', 'bottom-right'];
const COMPONENTS = ['logo', 'observation', 'hint'];
const ARROWS = ['↖', '↑', '↗', '←', '●', '→', '↙', '↓', '↘'];

export function componentPreferences(saved) {
  return Object.fromEntries(COMPONENTS.map(name => [name, {
    visible: typeof saved?.[name]?.visible === 'boolean' ? saved[name].visible : true,
    ...(name === 'observation' ? { position: POSITIONS.includes(saved?.[name]?.position) ? saved[name].position : 'default' } : {}),
  }]));
}

// 同一格内从上到下排列，顶端组件避开工具栏，所有位置限制在屏幕安全区。
export function layoutComponents(items, bounds, toolbar, reserved = []) {
  const groups = new Map(), placements = {}, placed = [...reserved];
  for (const item of items) {
    if (!groups.has(item.position)) groups.set(item.position, []);
    groups.get(item.position).push(item);
  }
  for (const [position, group] of groups) {
    const [row, column] = position.split('-');
    const height = group.reduce((sum, item) => sum + item.height, 0) + (group.length - 1) * 16;
    let y = row === 'top' ? bounds.top : row === 'middle' ? bounds.top + (bounds.height - height) / 2 : bounds.bottom - height;
    const horizontal = width => column === 'left' ? bounds.left : column === 'center' ? bounds.left + (bounds.width - width) / 2 : bounds.right - width;
    if (toolbar && group.some(item => {
      const x = horizontal(item.width);
      return x < toolbar.right + 12 && x + item.width > toolbar.left - 12 && y < toolbar.bottom + 16 && y + height > toolbar.top - 12;
    })) y = toolbar.bottom + 16;
    y = Math.max(bounds.top, Math.min(y, bounds.bottom - height));
    // 小屏幕中相邻格也可能相交，优先保持横向对齐并沿竖直方向避让。
    for (let attempt = 0; attempt < items.length + reserved.length; attempt++) {
      const collisions = placed.filter(rect => {
        let offset = 0;
        return group.some(item => {
          const x = horizontal(item.width), top = y + offset;
          offset += item.height + 16;
          return x < rect.right + 12 && x + item.width > rect.left - 12
            && top < rect.bottom + 12 && top + item.height > rect.top - 12;
        });
      });
      if (!collisions.length) break;
      const below = Math.max(...collisions.map(rect => rect.bottom)) + 16;
      const above = Math.min(...collisions.map(rect => rect.top)) - height - 16;
      if (row === 'bottom' && above >= bounds.top) y = above;
      else if (below + height <= bounds.bottom) y = below;
      else if (above >= bounds.top) y = above;
      else break;
    }
    for (const item of group) {
      const x = Math.max(bounds.left, horizontal(item.width));
      placements[item.name] = { x, y, column };
      placed.push({ left: x, top: y, right: x + item.width, bottom: y + item.height });
      y += item.height + 16;
    }
  }
  return placements;
}

export function initComponentSettings() {
  let saved;
  try { saved = JSON.parse(localStorage.getItem(COMPONENTS_KEY)); } catch {}
  let preferences = componentPreferences(saved), queued = false;
  const elements = Object.fromEntries(COMPONENTS.map(name => [name, document.querySelector(`[data-ui-component="${name}"]`)]));
  const boundsElement = document.getElementById('componentBounds');
  const layout = () => {
    queued = false;
    const bounds = boundsElement.getBoundingClientRect(), toolbar = document.querySelector('.toolbar').getBoundingClientRect();
    const defaults = { logo: 'top-left', observation: 'bottom-left', hint: innerWidth <= 700 ? 'bottom-right' : innerWidth <= 1100 ? 'bottom-left' : 'bottom-center' };
    const items = COMPONENTS.filter(name => preferences[name].visible).map(name => {
      const element = elements[name], rect = element.getBoundingClientRect();
      const position = preferences[name].position;
      return { name, width: rect.width, height: rect.height, position: !position || position === 'default' ? defaults[name] : position };
    });
    // LOGO 和操作提示保持原有自适应位置；仅时间天气避让它们。
    const fixed = items.filter(item => item.name !== 'observation');
    const placements = layoutComponents(fixed, bounds, toolbar);
    const reserved = fixed.map(item => {
      const { x, y } = placements[item.name];
      return { left: x, top: y, right: x + item.width, bottom: y + item.height };
    });
    Object.assign(placements, layoutComponents(items.filter(item => item.name === 'observation'), bounds, toolbar, reserved));
    for (const [name, placement] of Object.entries(placements)) {
      const element = elements[name];
      element.dataset.uiColumn = placement.column;
      element.style.left = `${Math.round(placement.x)}px`; element.style.top = `${Math.round(placement.y)}px`;
    }
  };
  const requestLayout = () => { if (!queued) { queued = true; requestAnimationFrame(layout); } };
  const save = () => { try { localStorage.setItem(COMPONENTS_KEY, JSON.stringify(preferences)); } catch {} };
  const refresh = () => {
    for (const name of COMPONENTS) {
      const preference = preferences[name], card = document.querySelector(`[data-component-settings="${name}"]`);
      elements[name].hidden = !preference.visible;
      card.querySelector('[data-component-visible]').checked = preference.visible;
      card.querySelectorAll('[data-component-position]').forEach(input => { input.checked = input.value === preference.position; });
      const current = card.querySelector('[data-component-current]');
      if (current) setMessage(current, `components.position.${preference.position}`);
    }
    requestLayout();
  };
  for (const name of COMPONENTS) {
    const card = document.querySelector(`[data-component-settings="${name}"]`), grid = card.querySelector('.position-grid');
    if (grid) POSITIONS.forEach((position, index) => {
      const label = document.createElement('label'), input = document.createElement('input'), icon = document.createElement('span');
      input.type = 'radio'; input.name = `component-position-${name}`; input.value = position; input.dataset.componentPosition = '';
      input.setAttribute('data-i18n-aria-label', `components.position.${position}`);
      input.setAttribute('aria-label', t(`components.position.${position}`));
      label.setAttribute('data-i18n-title', `components.position.${position}`);
      label.title = t(`components.position.${position}`);
      icon.textContent = ARROWS[index]; icon.setAttribute('aria-hidden', 'true');
      label.append(input, icon); grid.append(label);
      input.addEventListener('change', () => { if (input.checked) { preferences[name].position = position; save(); refresh(); } });
    });
    card.querySelector('[data-component-visible]').addEventListener('change', event => {
      preferences[name].visible = event.target.checked; save(); refresh();
    });
    card.querySelector('[data-component-default]')?.addEventListener('click', () => {
      preferences[name].position = 'default'; save(); refresh();
    });
  }
  document.getElementById('resetComponents').addEventListener('click', () => {
    preferences = componentPreferences(); save(); refresh();
  });
  onLanguageChange(refresh);
  window.addEventListener('resize', requestLayout);
  document.addEventListener('fullscreenchange', requestLayout);
  const observer = new ResizeObserver(requestLayout);
  Object.values(elements).forEach(element => observer.observe(element));
  observer.observe(document.querySelector('.toolbar'));
  refresh();
}
