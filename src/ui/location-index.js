import { normalizeLocationSearch } from '../data/location-catalog.js';

export const LOCATION_LETTERS = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ', '#'];
// 国家中文名首字的拼音声母。只需收录国家表实际使用的首字，不给五万个城市引入拼音依赖。
const countryInitials = new Map(Object.entries({
  A: '阿埃爱安奥澳', B: '巴白百保北贝比冰波玻伯博不布秘', C: '朝赤', D: '丹德东多', E: '俄厄',
  F: '法梵菲斐芬佛福', G: '冈刚哥格根古瓜关圭', H: '哈海韩荷黑洪', J: '基吉几加柬捷津',
  K: '喀卡开科克肯库', L: '拉莱老黎立利列留卢罗', M: '马毛美蒙孟密缅摩莫墨', N: '纳南瑙尼纽挪诺',
  P: '帕皮葡', Q: '前', R: '日瑞', S: '萨塞沙圣史斯苏所索', T: '塔台泰坦汤特突图土托',
  W: '瓦危委文乌', X: '西希香象新匈叙', Y: '牙亚也伊以意印英约越', Z: '赞泽扎乍直智中',
}).flatMap(([letter, chars]) => [...chars].map(char => [char, letter])));

// 英文/罗马字作为排序键；中文国家的分组与排序单独按拼音处理。
export function locationIndexName(item) {
  const candidates = [item.names[0], ...(item.aliases || [])].filter(Boolean);
  return candidates.find(value => /^[a-z]/i.test(normalizeLocationSearch(value))) || candidates[0] || '';
}
export function groupLocationItems(items, { language = 'en', countries = false } = {}) {
  const pinyin = language === 'zh' && countries;
  const chineseName = item => item.names[1] || item.names[0] || '';
  const key = item => normalizeLocationSearch(locationIndexName(item));
  const letter = item => pinyin && countryInitials.has(chineseName(item)[0]) ? countryInitials.get(chineseName(item)[0]) : /^[a-z]/.test(key(item)) ? key(item)[0].toUpperCase() : '#';
  // “秘鲁”读 Bìlǔ，不能采用通用逐字排序的 mì；显示名称保持原样。
  const sortName = item => pinyin ? (item.code === 'PE' && chineseName(item) === '秘鲁' ? '比鲁' : chineseName(item)) : key(item);
  const collator = new Intl.Collator(pinyin ? 'zh-CN-u-co-pinyin' : 'en', { numeric: true, sensitivity: 'base' });
  const sorted = [...items].sort((a, b) => LOCATION_LETTERS.indexOf(letter(a)) - LOCATION_LETTERS.indexOf(letter(b)) || collator.compare(sortName(a), sortName(b)) || String(a.id ?? a.code).localeCompare(String(b.id ?? b.code)));
  return LOCATION_LETTERS.map(label => ({ label, items: sorted.filter(item => letter(item) === label) })).filter(group => group.items.length);
}

export function bindLocationIndex({ rail, bubble, viewport, cancelScroll, eventTarget = window }) {
  let sections = [], endAtLast = false, gesture, hideTimer;
  const buttons = [...rail.querySelectorAll('button')];
  const select = label => {
    for (const button of buttons) {
      if (button.textContent === label) button.setAttribute('aria-current', 'true');
      else button.removeAttribute('aria-current');
    }
  };
  const refresh = () => {
    if (!sections.length || gesture) return;
    const top = viewport.getBoundingClientRect().top;
    let current = sections[0];
    for (const section of sections) {
      if (section.element.getBoundingClientRect().top <= top + 3) current = section;
    }
    // 最后一组不足一屏时仍高亮实际到达的末尾分组。
    if (viewport.scrollTop > 0 && viewport.scrollTop + viewport.clientHeight >= viewport.scrollHeight - 2) current = sections.at(-1);
    select(current.label);
  };
  const jump = (label, preview = true) => {
    const section = sections.find(item => item.label === label);
    if (!section) return;
    cancelScroll();
    // 国家末组定位到列表底部，保证“中国”等末项可见；长城市列表仍定位到字母组首。
    if (endAtLast && section === sections.at(-1)) viewport.scrollTop = viewport.scrollHeight - viewport.clientHeight;
    else viewport.scrollTop += section.element.getBoundingClientRect().top - viewport.getBoundingClientRect().top;
    select(label);
    if (preview) {
      clearTimeout(hideTimer); bubble.textContent = label; bubble.hidden = false;
      hideTimer = setTimeout(() => { if (!gesture) bubble.hidden = true; }, 650);
    }
  };
  const at = event => {
    const enabled = buttons.filter(button => !button.disabled);
    if (!enabled.length) return;
    const nearest = enabled.reduce((best, button) => {
      const rect = button.getBoundingClientRect();
      const distance = Math.abs(event.clientY - (rect.top + rect.height / 2));
      return !best || distance < best.distance ? { button, distance } : best;
    }, null);
    jump(nearest.button.textContent);
  };
  const start = (event, source) => {
    if (source === 'mouse' && gesture?.source === 'pointer') return;
    if (event.button !== undefined && event.button !== 0) return;
    event.preventDefault();
    gesture = { source, id: event.pointerId };
    if (source === 'pointer') { try { rail.setPointerCapture(event.pointerId); } catch {} }
    at(event);
  };
  const move = (event, source) => {
    if (!gesture || gesture.source !== source || (source === 'pointer' && event.pointerId !== gesture.id)) return;
    event.preventDefault(); at(event);
  };
  const stop = () => {
    const previous = gesture; gesture = null;
    if (previous?.source === 'pointer') { try { rail.releasePointerCapture(previous.id); } catch {} }
    clearTimeout(hideTimer); bubble.hidden = true;
  };
  rail.addEventListener('pointerdown', event => start(event, 'pointer'));
  rail.addEventListener('mousedown', event => start(event, 'mouse'));
  eventTarget.addEventListener('pointermove', event => move(event, 'pointer'), { passive: false });
  eventTarget.addEventListener('mousemove', event => move(event, 'mouse'), { passive: false });
  eventTarget.addEventListener('pointerup', event => { if (gesture?.source === 'pointer' && gesture.id === event.pointerId) stop(); });
  eventTarget.addEventListener('mouseup', () => { if (gesture?.source === 'mouse') stop(); });
  eventTarget.addEventListener('blur', stop);
  rail.addEventListener('pointercancel', stop); rail.addEventListener('lostpointercapture', stop);
  for (const button of buttons) button.addEventListener('click', () => jump(button.textContent));
  rail.addEventListener('keydown', event => {
    const enabled = buttons.filter(button => !button.disabled), index = enabled.indexOf(event.target);
    let next;
    if (event.key === 'Home') next = enabled[0];
    else if (event.key === 'End') next = enabled.at(-1);
    else if (['ArrowDown', 'ArrowUp'].includes(event.key)) next = enabled[Math.max(0, Math.min(enabled.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)))];
    else return;
    event.preventDefault(); event.stopPropagation();
    next?.focus({ preventScroll: true }); if (next) jump(next.textContent);
  });
  viewport.addEventListener('scroll', refresh, { passive: true });
  return {
    update(next, options = {}) {
      stop(); sections = next; endAtLast = Boolean(options.endAtLast);
      for (const button of buttons) button.disabled = !sections.some(section => section.label === button.textContent);
      refresh();
    }, refresh, cancel: stop,
  };
}
