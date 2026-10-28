import { gunzipSync, strFromU8 } from 'fflate';

const nameIndex = language => ({ en: 0, zh: 1, ja: 2 })[language] ?? 0;
export const localizedName = (names, language = 'en') => names[nameIndex(language)] || names[0];
export const normalizeLocationSearch = value => value.normalize('NFKC').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[’']/g, '').trim();
// 用户常输入“普陀区”，源数据可能只写“普陀”。仅汉字地区采用后缀回退，
// 保留两字地名（如“沙市”），且优先排列原名完全匹配的结果。
const administrativeStem = value => /^[\u3400-\u4dbf\u4e00-\u9fff]{3,}$/.test(value) ? value.replace(/[省市区區县縣]$/, '') : value;
const zoneCache = new Map();
export function compatibleTimeZone(zone) {
  if (zoneCache.has(zone)) return zoneCache.get(zone);
  let value = zone;
  try { new Intl.DateTimeFormat('en', { timeZone: zone }); }
  catch {
    // IANA 2025b：Aysén 自 2025-03-20 起全年 UTC-3；旧 CEF/ICU 尚无该名称。
    // https://data.iana.org/time-zones/tzdb/NEWS
    value = ({ 'America/Coyhaique': 'Etc/GMT+3', 'Europe/Kyiv': 'Europe/Kiev' })[zone];
    if (!value) throw new RangeError(`不支持的地点时区：${zone}`);
    new Intl.DateTimeFormat('en', { timeZone: value });
  }
  zoneCache.set(zone, value);
  return value;
}

export function decodeLocationCatalog(bytes) {
  return createLocationCatalog(JSON.parse(strFromU8(gunzipSync(bytes))));
}

export function createLocationCatalog(data) {
  if (data.version !== 1 || !Array.isArray(data.cities) || !Array.isArray(data.regions) || !Array.isArray(data.countries)) throw new Error('地点数据格式无效');
  const countries = data.countries.map(([code, ...names]) => ({ code, names }));
  const countriesByCode = new Map(countries.map(country => [country.code, country]));
  const regions = data.regions.map(([id, country, ...names]) => ({ id, country: countriesByCode.get(country), names, cities: [] }));
  const regionsById = new Map(regions.map(region => [region.id, region]));
  const countriesWithRegions = new Map(countries.map(country => [country.code, []]));
  for (const region of regions) countriesWithRegions.get(region.country.code).push(region);
  const cities = data.cities.map(([id, en, zh, ja, lat, lon, zone, region, aliases], rank) => {
    const city = { id, names: [en, zh, ja], lat, lon, tz: data.zones[zone], region: regions[region], aliases, rank };
    city.region.cities.push(city);
    return city;
  });
  const citiesById = new Map(cities.map(city => [city.id, city]));
  let searchIndex;
  const sortByName = (items, language) => {
    const collator = new Intl.Collator(({ en: 'en', zh: 'zh-CN', ja: 'ja' })[language] || 'en');
    return [...items].sort((a, b) => collator.compare(localizedName(a.names, language), localizedName(b.names, language)) || String(a.id ?? a.code).localeCompare(String(b.id ?? b.code)));
  };
  function search(query, limit = 20) {
    const normalized = normalizeLocationSearch(query);
    if (!normalized) return { cities: [], total: 0 };
    if (!searchIndex) searchIndex = cities.map(city => {
      const names = [...city.names, ...city.aliases].filter(Boolean).map(normalizeLocationSearch);
      const context = [...city.region.names, ...city.region.country.names, city.region.country.code].filter(Boolean).map(normalizeLocationSearch).join('\n');
      return { city, names, text: names.join('\n') + '\n' + context, chineseRegion: ['CN', 'TW', 'HK', 'MO'].includes(city.region.country.code) };
    });
    const tokens = normalized.split(/\s+/);
    const stems = tokens.map(administrativeStem);
    const groups = [[], [], []];
    let total = 0;
    for (const entry of searchIndex) {
      if (!tokens.every((token, index) => entry.text.includes(token) || (entry.chineseRegion && stems[index] !== token && entry.text.includes(stems[index])))) continue;
      total++;
      const foldedName = entry.chineseRegion ? administrativeStem(normalized) : normalized;
      const group = entry.names.includes(normalized) ? 0 : entry.names.some(name => name.startsWith(normalized) || name === foldedName) ? 1 : 2;
      if (groups[group].length < limit) groups[group].push(entry.city);
    }
    return { cities: groups.flat().slice(0, limit), total };
  }
  return {
    cities, countries, regions, citiesById, regionsById,
    countryList: language => sortByName(countries, language),
    regionList: (code, language) => sortByName(countriesWithRegions.get(code) || [], language),
    cityList: (region, language) => sortByName(regionsById.get(region)?.cities || [], language),
    preset: name => citiesById.get(data.presets[name]),
    search,
  };
}

export function catalogCityLocation(city) {
  return {
    id: city.id, name: city.names[1] || city.names[0], names: [...city.names],
    lat: city.lat, lon: city.lon, tz: compatibleTimeZone(city.tz),
    country: city.region.country.code, countryNames: [...city.region.country.names],
    region: city.region.id, regionNames: [...city.region.names],
  };
}
