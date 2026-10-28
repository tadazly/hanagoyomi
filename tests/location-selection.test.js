import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CITIES } from '../src/data/cities.js';
import { decodeLocationCatalog } from '../src/data/location-catalog.js';
import { catalogSelectionLocation, createLocationRequestGate, locationIsSelected, resolveCoordinateTimeZone } from '../src/world/location-selection.js';

const catalog = decodeLocationCatalog(readFileSync(new URL('../src/assets/locations.bin', import.meta.url)));

test('同坐标不同 ID 的地点只能选中当前 ID，不退回按坐标选中其他地点', () => {
  const daman = catalog.citiesById.get(1273618), nani = catalog.citiesById.get(13665129);
  assert.deepEqual([daman.lat, daman.lon], [nani.lat, nani.lon]);
  const location = { id: nani.id, name: nani.names[0], lat: nani.lat, lon: nani.lon };
  assert.equal(locationIsSelected(location, nani), true);
  assert.equal(locationIsSelected(location, daman), false);
  assert.equal(locationIsSelected({ ...location, id: 99999999 }, nani), false);
});

test('90 个旧版快捷地点解析同一稳定 ID、国家与行政区，打开列表前不要求完整地点库', () => {
  for (const city of CITIES) {
    const legacy = { name: city[0], lat: city[2], lon: city[3], tz: city[4] };
    const snapshot = structuredClone(legacy), full = catalogSelectionLocation(catalog, legacy), expected = catalog.preset(city[0]);
    assert.equal(full.id, expected.id, legacy.name);
    assert.equal(full.country, expected.region.country.code);
    assert.equal(full.region, expected.region.id);
    assert.equal(locationIsSelected(full, expected), true);
    assert.deepEqual(legacy, snapshot, '不修改原地点或提前切换世界');
  }
});

test('旧地点匹配保留名称约束，自定义坐标与损坏记录不会冒充内置地点', () => {
  const city = catalog.preset('上海');
  assert.equal(locationIsSelected({ name: '上海', lat: city.lat, lon: city.lon }, city), true);
  assert.equal(locationIsSelected({ name: '我的位置', lat: city.lat, lon: city.lon }, city), false);
  const custom = { name: '上海', lat: city.lat + 1, lon: city.lon, tz: city.tz };
  assert.equal(catalogSelectionLocation(catalog, custom), custom);
});

test('后发定位和手动地点变更使旧请求失效，并中止未完成的网络请求', () => {
  const gate = createLocationRequestGate(), first = gate.begin(), second = gate.begin();
  assert.equal(first.isCurrent(), false); assert.equal(first.signal.aborted, true);
  assert.equal(second.isCurrent(), true);
  gate.cancel();
  assert.equal(second.isCurrent(), false); assert.equal(second.signal.aborted, true);
  const third = gate.begin(); assert.equal(third.isCurrent(), true); gate.cancel();
});

test('设备定位时区按原坐标请求 auto，并使用响应的 IANA 时区', async () => {
  let called = false;
  const zone = await resolveCoordinateTimeZone(39.80172, -89.64371, { fetcher: async (url, options) => {
    called = true;
    assert.equal(url.origin, 'https://api.open-meteo.com');
    assert.equal(url.searchParams.get('latitude'), '39.80172');
    assert.equal(url.searchParams.get('longitude'), '-89.64371');
    assert.equal(url.searchParams.get('timezone'), 'auto');
    assert.equal(options.signal.aborted, false);
    return { ok: true, json: async () => ({ timezone: 'America/Chicago' }) };
  } });
  assert.ok(called); assert.equal(zone, 'America/Chicago');
});

test('时区请求失败或返回无效时区时明确失败，不回退设备时区或 UTC', async () => {
  await assert.rejects(resolveCoordinateTimeZone(39, -89, { fetcher: async () => ({ ok: false, status: 503 }) }), /503/);
  for (const data of [{}, { timezone: null }, { timezone: '' }, { timezone: 'not/a-zone' }]) {
    await assert.rejects(resolveCoordinateTimeZone(39, -89, { fetcher: async () => ({ ok: true, json: async () => data }) }));
  }
  let called = false;
  await assert.rejects(resolveCoordinateTimeZone(91, 0, { fetcher: async () => { called = true; } }), RangeError);
  assert.equal(called, false);
});

test('取消定位后忽略迟到的时区响应，即使底层 fetcher 没有响应取消', async () => {
  const controller = new AbortController(); let deliver;
  const result = resolveCoordinateTimeZone(39, -89, { signal: controller.signal, fetcher: () => new Promise(resolve => { deliver = resolve; }) });
  controller.abort(); deliver({ ok: true, json: async () => ({ timezone: 'America/Chicago' }) });
  await assert.rejects(result, { name: 'AbortError' });
  let called = false;
  await assert.rejects(resolveCoordinateTimeZone(39, -89, { signal: controller.signal, fetcher: async () => { called = true; } }), { name: 'AbortError' });
  assert.equal(called, false);
});

test('时区查询超时会中止请求，防止定位一直处于等待状态', async () => {
  await assert.rejects(resolveCoordinateTimeZone(39, -89, { timeoutMs: 5, fetcher: (_, { signal }) => new Promise((_, reject) => {
    signal.addEventListener('abort', () => reject(new DOMException('超时', 'AbortError')));
  }) }), { name: 'AbortError' });
});
