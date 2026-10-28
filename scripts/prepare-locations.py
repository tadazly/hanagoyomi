"""从 GeoNames 原始快照生成离线地点库；原始下载保存在仓库外。

用法：python scripts/prepare-locations.py <下载目录>
所需文件：cities1000.zip、alternateNamesV2.zip、admin1CodesASCII.txt、countryInfo.txt。
"""
import argparse
import gzip
import hashlib
import json
import math
import re
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parents[1]
COUNT = 50000
SOURCE = 'https://download.geonames.org/export/dump/'


def normalize(value):
    return ''.join(c.lower() for c in value if c.isalnum())


def generate(folder):
    presets = json.loads((ROOT / 'src/data/city-presets.json').read_text('utf-8'))
    # 人工/代理交叉校对的本地名称独立维护，重建时不丢失；名称不改变地点身份和坐标。
    supplements = []
    for filename, language in [('location-names-cn.json', 'zh'), ('location-names-zh-regions.json', 'zh'), ('location-names-ja.json', 'ja')]:
        path = ROOT / 'src/data' / filename
        supplements.append((filename, language, json.loads(path.read_text('utf-8'))))
    def amended_names(kind, key, values):
        values = list(values)
        for _, language, supplement in supplements:
            entry = supplement.get(kind, {}).get(str(key))
            if entry is None:
                continue
            value = entry if isinstance(entry, str) else entry.get(language) or entry.get('name')
            if not value or not re.search(r'[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]', value):
                raise ValueError(f'无效的本地名称：{kind} {key} {value}')
            if isinstance(entry, dict) and entry.get('en'):
                values[0] = entry['en']
            values[{'zh': 1, 'ja': 2}[language]] = value
        return values
    countries = {}
    for line in (folder / 'countryInfo.txt').read_text('utf-8').splitlines():
        if not line or line.startswith('#'):
            continue
        row = line.split('\t')
        countries[row[0]] = {'id': int(row[16] or 0), 'name': row[4]}
    admins = {}
    for line in (folder / 'admin1CodesASCII.txt').read_text('utf-8').splitlines():
        key, name, ascii_name, identifier = line.split('\t')
        admins[key] = {'id': int(identifier), 'name': name, 'ascii': ascii_name}
    with zipfile.ZipFile(folder / 'cities1000.zip') as archive:
        rows = [line.decode('utf-8').rstrip('\r\n').split('\t') for line in archive.open('cities1000.txt')]
    rows = [r for r in rows if r[6] == 'P' and r[7] in {'PPL', 'PPLA', 'PPLA2', 'PPLA3', 'PPLA4', 'PPLC', 'PPLG'} and r[8] in countries and r[17]]
    rows.sort(key=lambda r: (-int(r[14] or 0), int(r[0])))
    # 保留每个国家、一级行政区的最大聚居点与首都，避免只按人口截断遗漏小国。
    selected = {}
    seen_countries, seen_regions = set(), set()
    for row in rows:
        region = row[8] + '.' + (row[10] or '00')
        if row[8] not in seen_countries or region not in seen_regions or row[7] == 'PPLC':
            selected[int(row[0])] = row
        seen_countries.add(row[8])
        seen_regions.add(region)
    preset_ids = {}
    for preset in presets:
        candidates = [r for r in rows if abs(float(r[4]) - preset[2]) < .5 and abs(float(r[5]) - preset[3]) < .5]
        named = [r for r in candidates if normalize(preset[1]) in {normalize(n) for n in [r[1], r[2], *r[3].split(',')]}]
        if not candidates:
            raise ValueError('旧地点未匹配：' + preset[1])
        row = min(named or candidates, key=lambda r: (float(r[4])-preset[2])**2 + ((float(r[5])-preset[3])*math.cos(math.radians(preset[2])))**2)
        selected[int(row[0])] = row
        preset_ids[preset[0]] = int(row[0])
        print('保留', preset[1], '->', row[0], row[1], flush=True)
    for row in rows:
        if len(selected) >= COUNT:
            break
        selected[int(row[0])] = row
    if len(selected) != COUNT or len(set(preset_ids.values())) != len(presets):
        raise ValueError('地点数量或旧地点唯一性异常')
    rows = sorted(selected.values(), key=lambda r: (-int(r[14] or 0), int(r[0])))
    region_keys = sorted({r[8] + '.' + (r[10] or '00') for r in rows})
    country_codes = sorted({r[8] for r in rows})
    wanted = set(selected) | {admins[key]['id'] for key in region_keys if key in admins} | {countries[c]['id'] for c in country_codes}
    chinese_countries = {'CN', 'TW', 'HK', 'MO'}
    native_chinese_ids = {int(row[0]) for row in rows if row[8] in chinese_countries}
    native_chinese_ids.update(admins[key]['id'] for key in region_keys if key in admins and key.split('.')[0] in chinese_countries)
    native_chinese_ids.update(countries[code]['id'] for code in country_codes if code in chinese_countries)
    translations, aliases = {}, {}
    with zipfile.ZipFile(folder / 'alternateNamesV2.zip') as archive:
        for line in archive.open('alternateNamesV2.txt'):
            # 先按 ID 过滤，再解码，避免持有完整的全球别名表。
            fields = line.rstrip(b'\r\n').split(b'\t')
            identifier = int(fields[1])
            if identifier not in wanted:
                continue
            lang = fields[2].decode('utf-8').lower()
            base = lang.split('-')[0]
            if fields[7] == b'1' or (len(fields) > 9 and fields[9]):
                continue
            name = fields[3].decode('utf-8').strip()
            if not name or len(name) > 100:
                continue
            # 普陀、闵行等条目的中文别名未标语言；在汉字地区按字形补采，
            # 不将罗马化、俄文或历史名称误作中文，显式 zh 标签仍有更高优先级。
            native_chinese = not lang and identifier in native_chinese_ids and re.fullmatch(r'[\u3400-\u4dbf\u4e00-\u9fff·・（）()－\- ]+', name) and re.search(r'[\u3400-\u4dbf\u4e00-\u9fff]', name)
            if native_chinese:
                base = 'zh'
            if base not in {'en', 'zh', 'ja'}:
                continue
            aliases.setdefault(identifier, set()).add(name)
            score = (4 if lang in {'zh-cn', 'zh-hans'} else 0) + (2 if fields[4] == b'1' else 0) + (1 if fields[5] == b'1' else 0)
            if native_chinese:
                score = -1
            previous = translations.setdefault(identifier, {}).get(base)
            if previous is None or score > previous[0]:
                translations[identifier][base] = (score, name)
    def names(identifier, fallback):
        result = translations.get(identifier, {})
        return [result.get(lang, (0, fallback if lang == 'en' else ''))[1] for lang in ['en', 'zh', 'ja']]
    country_data = [[code, *names(countries[code]['id'], countries[code]['name'])] for code in country_codes]
    region_data = []
    for key in region_keys:
        admin = admins.get(key)
        region_data.append([key, key.split('.')[0], *amended_names('regions', key, names(admin['id'], admin['name']) if admin else ['', '', ''])])
    zones = sorted({r[17] for r in rows} | {p[4] for p in presets})
    zone_index = {zone: index for index, zone in enumerate(zones)}
    region_index = {key: index for index, key in enumerate(region_keys)}
    preset_by_id = {preset_ids[p[0]]: p for p in presets}
    records = []
    counts = {'en': 0, 'zh': 0, 'ja': 0}
    for row in rows:
        identifier = int(row[0])
        en, zh, ja = names(identifier, row[2] or row[1])
        lat, lon, zone = float(row[4]), float(row[5]), row[17]
        other = aliases.get(identifier, set()) | {row[1], row[2]}
        if row[8] in {'CN', 'TW', 'HK', 'MO'} and not zh:
            # GeoNames 的部分本地汉字名称未另建 zh 别名；只接受原始名称中的汉字。
            if any('\u4e00' <= c <= '\u9fff' for c in row[1]):
                zh = row[1]
        if identifier in preset_by_id:
            p = preset_by_id[identifier]
            zh, en, lat, lon, zone, ja = p
        en, zh, ja = amended_names('cities', identifier, [en, zh, ja])
        for _, _, supplement in supplements:
            entry = supplement.get('cities', {}).get(str(identifier))
            if isinstance(entry, dict):
                other.update(entry.get('aliases', []))
            other.update(supplement.get('aliases', {}).get(str(identifier), []))
            other.difference_update(supplement.get('excludeAliases', {}).get(str(identifier), []))
        for lang, name in [('en', en), ('zh', zh), ('ja', ja)]:
            counts[lang] += bool(name)
        other = sorted(name for name in other if name and len(name) <= 100 and name not in {en, zh, ja})
        records.append([identifier, en, zh, ja, round(lat, 5), round(lon, 5), zone_index[zone], region_index[row[8] + '.' + (row[10] or '00')], other])
    data = {'version': 1, 'countries': country_data, 'regions': region_data, 'zones': zones, 'presets': preset_ids, 'cities': records}
    raw = json.dumps(data, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    packed = gzip.compress(raw, compresslevel=9, mtime=0)
    output = ROOT / 'src/assets/locations.bin'
    output.write_bytes(packed)
    manifest = {
        'source': SOURCE, 'license': 'CC BY 4.0', 'credit': 'GeoNames',
        'selection': '城市/城镇；保留原有 90 个地点、各国和一级行政区最大聚居点及首都，其余按人口降序选取；共 50000 条。排除城区分片、废弃和历史聚居点。',
        'translations': 'GeoNames en/zh/ja 及未标语言汉字别名，加上独立名称表的补译与交叉校对；中文地区和日本的本地名称覆盖见 nativeCoverage；其他缺译名显示英文或原名。',
        'schema': {'city': ['geonameId', 'en', 'zh', 'ja', 'lat', 'lon', 'timezoneIndex', 'regionIndex', 'aliases'], 'region': ['key', 'countryCode', 'en', 'zh', 'ja'], 'country': ['code', 'en', 'zh', 'ja']},
        'count': len(records), 'countries': len(country_codes), 'regions': len(region_keys), 'names': counts,
        'bytes': len(raw), 'gzipBytes': len(packed), 'sha256': hashlib.sha256(packed).hexdigest(),
        'supplements': {filename: {'sha256': hashlib.sha256((ROOT / 'src/data' / filename).read_bytes()).hexdigest(), 'language': language} for filename, language, _ in supplements},
        'nativeCoverage': {code: {'language': language, 'cities': sum(region_data[r[7]][1] == code for r in records), 'namedCities': sum(region_data[r[7]][1] == code and bool(re.search(r'[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]', r[{'zh': 2, 'ja': 3}[language]])) for r in records), 'regions': sum(r[1] == code and any(r[2:]) for r in region_data), 'namedRegions': sum(r[1] == code and any(r[2:]) and bool(r[{'zh': 3, 'ja': 4}[language]]) for r in region_data)} for code, language in [('CN', 'zh'), ('TW', 'zh'), ('HK', 'zh'), ('MO', 'zh'), ('SG', 'zh'), ('JP', 'ja')]},
        'sources': {name: {'url': SOURCE + name, 'sha256': hashlib.sha256((folder / name).read_bytes()).hexdigest()} for name in ['cities1000.zip', 'alternateNamesV2.zip', 'admin1CodesASCII.txt', 'countryInfo.txt']},
    }
    (ROOT / 'src/data/location-catalog.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', 'utf-8')
    print(json.dumps({k: manifest[k] for k in ['count', 'countries', 'regions', 'names', 'bytes', 'gzipBytes']}, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('folder', type=Path)
    generate(parser.parse_args().folder)
