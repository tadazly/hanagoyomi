import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { CITIES, locationName } from '../src/data/cities.js';
import { catalogCityLocation, compatibleTimeZone, createLocationCatalog, decodeLocationCatalog, localizedName } from '../src/data/location-catalog.js';
import { getSavedLocation, saveLocation } from '../src/world/location.js';
import { fetchWeather } from '../src/world/weather.js';
import { gunzipSync, strFromU8 } from 'fflate';

const bytes = readFileSync(new URL('../src/assets/locations.bin', import.meta.url));
const manifest = JSON.parse(readFileSync(new URL('../src/data/location-catalog.json', import.meta.url)));
const catalog = decodeLocationCatalog(bytes);

test('中文地区和日本名称覆盖完整，仅保留用户指定的 Wushipai 原名；补译表哈希一致', () => {
  for (const [code, language] of [['CN', 'zh'], ['TW', 'zh'], ['HK', 'zh'], ['MO', 'zh'], ['SG', 'zh'], ['JP', 'ja']]) {
    const names = catalog.cities.filter(city => city.region.country.code === code);
    const missing = names.filter(city => !/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(city.names[language === 'zh' ? 1 : 2]));
    assert.deepEqual(missing.map(city => city.id), code === 'CN' ? [13308755] : [], code);
    const regions = catalog.regions.filter(region => region.country.code === code && region.id !== `${code}.00`);
    for (const region of regions) assert.match(localizedName(region.names, language), /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/, region.id);
    assert.equal(names.length, manifest.nativeCoverage[code].cities);
    assert.equal(names.length - missing.length, manifest.nativeCoverage[code].namedCities);
    assert.equal(regions.length, manifest.nativeCoverage[code].namedRegions);
  }
  assert.equal(catalog.citiesById.get(13308755).names[0], 'Wushipai');
  for (const [filename, entry] of Object.entries(manifest.supplements)) {
    const source = readFileSync(new URL(`../src/data/${filename}`, import.meta.url), 'utf8').replace(/\r\n?/g, '\n');
    assert.equal(createHash('sha256').update(source).digest('hex'), entry.sha256, filename);
  }
});

test('运行地点数据仅含紧凑字段，补译的来源和校对笔记不进入地点库', () => {
  const data = JSON.parse(strFromU8(gunzipSync(bytes)));
  assert.deepEqual(Object.keys(data).sort(), ['cities', 'countries', 'presets', 'regions', 'version', 'zones']);
  for (const row of data.cities) {
    assert.equal(row.length, 9);
    assert.ok(row[8].every(alias => typeof alias === 'string'));
  }
  assert.ok(data.regions.every(row => row.length === 5));
  assert.ok(data.countries.every(row => row.length === 4));
  const raw = JSON.stringify(data);
  for (const key of ['source', 'note', 'unresolved', 'coordinateDistanceKm', 'transliteration']) assert.equal(raw.includes(`"${key}":`), false, key);
});

test('校正明显地名错配，保留罗马字搜索，删除会误导搜索的错误别名', () => {
  for (const [id, zh] of [[1787824, '铜山'], [7328899, '邓埠'], [1796356, '沙柳河'], [6559683, '堆龙德庆']]) {
    assert.equal(catalog.citiesById.get(id).names[1], zh);
    assert.ok(catalog.search(zh).cities.some(city => city.id === id));
  }
  for (const [id, ja] of [[11468431, '松阪市'], [2128303, '三戸町'], [11209896, '湖東'], [1907242, 'ニハンマツ']]) assert.equal(catalog.citiesById.get(id).names[2], ja);
  assert.ok(!catalog.citiesById.get(2128303).aliases.includes('七戸町'));
  assert.ok(!catalog.citiesById.get(11468431).aliases.includes('松坂市'));
  assert.ok(!catalog.citiesById.get(1880574).aliases.includes('白沙'));
  assert.ok(catalog.search('Nihammatsu').cities.some(city => city.id === 1907242));
});

test('离线地点库包含 50000 个唯一城市/城镇，所有坐标、时区和国家行政区引用完整', () => {
  assert.equal(catalog.cities.length, 50000);
  assert.equal(catalog.citiesById.size, 50000);
  assert.equal(catalog.countries.length, manifest.countries);
  assert.equal(catalog.regions.length, manifest.regions);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), manifest.sha256);
  const zones = new Set();
  for (const city of catalog.cities) {
    assert.ok(city.names[0]);
    assert.ok(Number.isFinite(city.lat) && Math.abs(city.lat) <= 90, String(city.id));
    assert.ok(Number.isFinite(city.lon) && Math.abs(city.lon) <= 180, String(city.id));
    assert.ok(city.region.country.code);
    assert.ok(city.region.cities.includes(city));
    zones.add(city.tz);
  }
  for (const zone of zones) assert.doesNotThrow(() => new Intl.DateTimeFormat('en', { timeZone: compatibleTimeZone(zone) }));
  for (const country of catalog.countries) assert.ok(catalog.regionList(country.code, 'zh').length);
});

test('原有 90 个地点全部保留，坐标、时区和中英日名称不变', () => {
  for (const original of CITIES) {
    const city = catalog.preset(original[0]);
    assert.ok(city, original[0]);
    assert.deepEqual(city.names, [original[1], original[0], original[5]]);
    assert.deepEqual([city.lat, city.lon, city.tz], [original[2], original[3], original[4]]);
  }
});

test('跨中英日、全角与带音符名称搜索，重名地点按国家和行政区筛选', () => {
  const tokyo = catalog.preset('东京');
  for (const query of ['东京', '東京', 'TOKYO', 'Ｔｏｋｙｏ']) assert.equal(catalog.search(query).cities[0].id, tokyo.id);
  assert.equal(catalog.search('ロンドン').cities[0].id, catalog.preset('伦敦').id);
  assert.equal(catalog.search('zurich').cities[0].id, catalog.preset('苏黎世').id);
  assert.ok(catalog.search('大理').cities.some(city => city.names[0] === 'Dali'));
  assert.ok(catalog.search('神戸').cities.some(city => city.names[0] === 'Kobe'));
  const all = catalog.search('Springfield').cities.filter(city => city.names[0] === 'Springfield');
  assert.ok(new Set(all.map(city => city.region.id)).size > 2);
  for (const query of ['Springfield Illinois', '斯普林菲尔德 伊利诺伊', 'スプリングフィールド イリノイ']) {
    const result = catalog.search(query);
    assert.equal(result.total, 1);
    assert.equal(result.cities[0].region.id, 'US.IL');
  }
  assert.deepEqual(catalog.search(''), { cities: [], total: 0 });
  assert.equal(catalog.search('no-such-place-123456').total, 0);
  assert.equal(catalog.search('China', 7).cities.length, 7);
});

test('国家到行政区再到城市的分级引用一致，缺失译名回退英文', () => {
  const china = catalog.countries.find(country => country.code === 'CN');
  const yunnan = catalog.regionList(china.code, 'zh').find(region => region.names[0] === 'Yunnan');
  assert.ok(yunnan);
  const dali = catalog.cityList(yunnan.id, 'zh').find(city => city.names[0] === 'Dali');
  assert.ok(dali);
  assert.equal(dali.region.country.code, 'CN');
  assert.equal(localizedName(['Example', '', ''], 'ja'), 'Example');
  assert.deepEqual(catalog.regionList('invalid', 'en'), []);
  assert.deepEqual(catalog.cityList('invalid', 'en'), []);
});

test('未标语言的中国汉字别名可搜索，普陀、闵行、徐汇支持带区后缀及上海限定', () => {
  for (const [en, zh] of [['Putuo', '普陀'], ['Minhang', '闵行'], ['Xuhui', '徐汇'], ['Jiading', '嘉定'], ['Qibao', '七宝']]) {
    const city = catalog.search(`${en} Shanghai`).cities.find(item => item.names[0] === en && item.region.id === 'CN.23');
    assert.ok(city, en);
    assert.ok(city.names[1].includes(zh), `${en} 中文显示名称`);
    assert.ok(catalog.search(zh).cities.some(item => item.id === city.id), zh);
    if (en !== 'Qibao') assert.ok(catalog.search(`${zh}区 上海`).cities.some(item => item.id === city.id), zh + '区');
  }
  assert.ok(catalog.search('普陀区').cities.some(city => city.id === 1798439));
});

test('行政区后缀回退保留两字地名，且原名完全匹配优先', () => {
  const sample = createLocationCatalog({ version: 1, countries: [['CN', 'China', '中国', '中国']], regions: [['CN.23', 'CN', 'Shanghai', '上海市', '上海']], zones: ['Asia/Shanghai'], presets: {}, cities: [
    [1, 'Shashi', '沙市', '', 30, 120, 0, 0, []],
    [2, 'Shawan', '沙湾', '', 30, 120, 0, 0, []],
    [3, 'Putuo', '普陀', '', 30, 120, 0, 0, []],
    [4, 'Putuo District', '普陀区', '', 30, 120, 0, 0, []],
  ] });
  assert.deepEqual(sample.search('沙市').cities.map(city => city.id), [1]);
  assert.deepEqual(sample.search('普陀区').cities.map(city => city.id), [4, 3]);
  assert.deepEqual(sample.search('普陀区 上海市').cities.map(city => city.id), [3, 4]);
});

test('新地点与旧记录可重载，重名地点保存 ID、名称、坐标和行政区，并请求对应天气', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  let stored;
  try {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => stored, setItem: (_, value) => { stored = value; } } });
    const city = catalog.search('Springfield Illinois').cities[0], loc = catalogCityLocation(city);
    saveLocation(loc);
    assert.deepEqual(getSavedLocation(), loc);
    assert.equal(locationName(getSavedLocation(), 'ja'), 'スプリングフィールド');
    await fetchWeather(getSavedLocation(), { fetcher: async url => {
      assert.equal(url.searchParams.get('latitude'), city.lat.toFixed(3));
      assert.equal(url.searchParams.get('longitude'), city.lon.toFixed(3));
      assert.equal(url.searchParams.get('timezone'), city.tz);
      return { ok: true, json: async () => ({ current: { cloud_cover: 0, wind_speed_10m: 0, wind_direction_10m: 0, weather_code: 0 } }) };
    } });
    const old = { name: '东京', lat: 35.6762, lon: 139.6503, tz: 'Asia/Tokyo' };
    saveLocation(old); assert.deepEqual(getSavedLocation(), old);
    assert.equal(locationName(getSavedLocation(), 'en'), 'Tokyo');
    stored = JSON.stringify({ ...loc, id: -1, names: [null], country: 'bad', region: 'bad' });
    assert.equal('id' in getSavedLocation(), false);
    assert.equal('names' in getSavedLocation(), false);
    assert.equal('country' in getSavedLocation(), false);
    assert.equal('region' in getSavedLocation(), false);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor); else delete globalThis.localStorage;
  }
});
