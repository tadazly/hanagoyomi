import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bindLocationIndex, groupLocationItems, locationIndexName } from '../src/ui/location-index.js';
import { readFileSync } from 'node:fs';
import { decodeLocationCatalog } from '../src/data/location-catalog.js';

test('字母索引按可见的英文/罗马字名分组、消除音符，数字和非拉丁名归入 #', () => {
  const items = [
    { id: 1, names: ['Zürich', '苏黎世', 'チューリヒ'] },
    { id: 2, names: ['Beijing', '北京', '北京'] },
    { id: 3, names: ['Běihǎi', '北海', ''] },
    { id: 4, names: ['東京', '东京', '東京'], aliases: ['Tōkyō'] },
    { id: 5, names: ['123 Town', '', ''] },
    { id: 6, names: ['', '', ''] },
  ];
  const groups = groupLocationItems(items);
  assert.deepEqual(groups.map(group => group.label), ['B', 'T', 'Z', '#']);
  assert.deepEqual(groups[0].items.map(item => item.id), [3, 2]);
  assert.equal(locationIndexName(items[3]), 'Tōkyō');
  assert.equal(groups.reduce((total, group) => total + group.items.length, 0), items.length);
  assert.deepEqual(items.map(item => item.id), [1, 2, 3, 4, 5, 6]);
});

test('国家末字母定位露出列表末项，较长城市字母组仍从组首进入', () => {
  class Button extends EventTarget {
    constructor(text) { super(); this.textContent = text; this.attributes = new Map(); }
    setAttribute(name, value) { this.attributes.set(name, value); }
    removeAttribute(name) { this.attributes.delete(name); }
  }
  const buttons = [new Button('A'), new Button('Z')], rail = new EventTarget(), viewport = new EventTarget();
  const bubble = { hidden: true };
  rail.querySelectorAll = () => buttons;
  viewport.scrollHeight = 1000; viewport.clientHeight = 100; viewport.scrollTop = 0;
  viewport.getBoundingClientRect = () => ({ top: 0 });
  const sections = [
    { label: 'A', element: { getBoundingClientRect: () => ({ top: -viewport.scrollTop }) } },
    { label: 'Z', element: { getBoundingClientRect: () => ({ top: 650 - viewport.scrollTop }) } },
  ];
  const index = bindLocationIndex({ rail, bubble, viewport, cancelScroll() {}, eventTarget: new EventTarget() });
  index.update(sections, { endAtLast: true });
  buttons[1].dispatchEvent(new Event('click'));
  assert.equal(viewport.scrollTop, 900, '国家末组较高时仍滚动到底，末项完整露出');
  assert.equal(buttons[1].attributes.get('aria-current'), 'true');
  index.update(sections);
  buttons[1].dispatchEvent(new Event('click'));
  assert.equal(viewport.scrollTop, 650, '城市字母组保留组首入口');
  index.cancel();
});

test('中文国家按拼音排序和分组，处理秘鲁的多音字读法；其他级别和语言仍按原规则', () => {
  const catalog = decodeLocationCatalog(readFileSync(new URL('../src/assets/locations.bin', import.meta.url)));
  const groups = groupLocationItems(catalog.countries, { language: 'zh', countries: true });
  const groupOf = code => groups.find(group => group.items.some(item => item.code === code))?.label;
  for (const [code, initial] of [['CN', 'Z'], ['US', 'M'], ['JP', 'R'], ['GB', 'Y'], ['DE', 'D'], ['KP', 'C'], ['PE', 'B'], ['HK', 'X']]) assert.equal(groupOf(code), initial, code);
  assert.equal(groups.flatMap(group => group.items).length, 245);
  assert.ok(!groups.some(group => group.label === '#'));
  const b = groups.find(group => group.label === 'B').items.map(item => item.code);
  assert.ok(b.indexOf('PE') > b.indexOf('BE') && b.indexOf('PE') < b.indexOf('IS'));
  const a = groups.find(group => group.label === 'A').items;
  assert.equal(a[0].code, 'AL'); // 阿尔巴尼亚；英文排序的 Afghanistan 不应排首位。
  assert.ok(groups.find(group => group.label === 'Z').items.some(item => item.code === 'CN'));
  for (const language of ['en', 'ja']) {
    const other = groupLocationItems(catalog.countries, { language, countries: true });
    assert.ok(other.find(group => group.label === 'C').items.some(item => item.code === 'CN'));
  }
  assert.deepEqual(groupLocationItems(catalog.countries, { language: 'zh' }), groupLocationItems(catalog.countries));
});
