import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

// 输入为原始 VOTable，运行时不查询外部星表。
const query = 'SELECT hip_number,ra_deg,dec_deg,vmag,bv_color,pm_ra,pm_dec FROM hipparcos WHERE vmag <= 7.3 ORDER BY hip_number';
const sourceUrl = 'https://heasarc.gsfc.nasa.gov/xamin/vo/tap/sync?' + new URLSearchParams({ REQUEST: 'doQuery', LANG: 'ADQL', MAXREC: '50000', QUERY: query });
const input = process.argv[2];
if (!input) throw new Error('用法：node scripts/prepare-hipparcos.mjs <HEASARC 原始 VOTable.xml>');
const source = await readFile(input), xml = source.toString('utf8');
if (!xml.includes('value="OK"') || xml.includes('value="OVERFLOW"') || xml.includes('value="ERROR"')) throw new Error('星表查询未完整成功');
const fields = [...xml.matchAll(/<FIELD\b([^>]+)>/g)].map(match => Object.fromEntries([...match[1].matchAll(/([\w:]+)="([^"]*)"/g)].map(value => [value[1], value[2]])));
if (fields.map(field => field.name).join(',') !== 'hip_number,ra_deg,dec_deg,vmag,bv_color,pm_ra,pm_dec') throw new Error('星表字段与预期不符');
const stream = xml.match(/<STREAM encoding="base64">([\s\S]*?)<\/STREAM>/)?.[1];
if (!stream) throw new Error('缺少 VOTable BINARY 数据');
const binary = Buffer.from(stream.replace(/\s/g, ''), 'base64'), rows = []; let cursor = 0;
while (cursor < binary.length) {
  const row = {};
  for (const field of fields) {
    if (field.datatype === 'int') { row[field.name] = binary.readInt32BE(cursor); cursor += 4; }
    else if (field.datatype === 'double') { row[field.name] = binary.readDoubleBE(cursor); cursor += 8; }
    else if (field.datatype === 'char' && field.arraysize === '*') {
      const length = binary.readUInt32BE(cursor); cursor += 4;
      if (length > 100 || cursor + length > binary.length) throw new Error('VOTable 可变长度字段损坏');
      const value = binary.toString('ascii', cursor, cursor + length).trim(); cursor += length;
      row[field.name] = value ? Number(value) : NaN;
    } else throw new Error('不支持的 VOTable 字段类型');
  }
  rows.push(row);
}
if (cursor !== binary.length || rows.length < 10000 || rows.length >= 50000) throw new Error('星表记录数量异常或数据被截断');
const stars = [], skipped = [], missingColor = [], anchors = [];
const anchorNames = new Map([[32349, 'Sirius'], [30438, 'Canopus'], [69673, 'Arcturus'], [91262, 'Vega'], [102098, 'Deneb'], [80763, 'Antares']]);
const radians = Math.PI / 180, motionFactor = 8.75 / 3600000 * radians;
for (const row of rows) {
  const { hip_number: hip, ra_deg: ra, dec_deg: dec, vmag: magnitude } = row;
  if (![ra, dec, magnitude].every(Number.isFinite) || ra < 0 || ra >= 360 || Math.abs(dec) > 90 || magnitude < -2 || magnitude > 7.3) { skipped.push(hip); continue; }
  const a = ra * radians, d = dec * radians, muA = Number.isFinite(row.pm_ra) ? row.pm_ra * motionFactor : 0, muD = Number.isFinite(row.pm_dec) ? row.pm_dec * motionFactor : 0;
  // pmRA 已乘 cos(dec)；在球面切平面推进到 J2000，不再重复乘除 cos(dec)。
  const x = Math.cos(d) * Math.cos(a) - muA * Math.sin(a) - muD * Math.sin(d) * Math.cos(a);
  const y = Math.cos(d) * Math.sin(a) + muA * Math.cos(a) - muD * Math.sin(d) * Math.sin(a);
  const z = Math.sin(d) + muD * Math.cos(d), length = Math.hypot(x, y, z);
  const j2000Ra = (Math.atan2(y, x) / radians + 360) % 360, j2000Dec = Math.asin(z / length) / radians;
  const bv = Number.isFinite(row.bv_color) && row.bv_color >= -.5 && row.bv_color <= 4.5 ? row.bv_color : null;
  if (bv === null) missingColor.push(hip);
  const star = { hip, ra: j2000Ra, dec: j2000Dec, magnitude, bv };
  if (anchorNames.has(hip)) anchors.push({ name: anchorNames.get(hip), index: stars.length, ...star });
  stars.push(star);
}
const output = Buffer.alloc(stars.length * 12);
for (let i = 0; i < stars.length; i++) {
  const star = stars[i], offset = i * 12;
  output.writeFloatLE(star.ra, offset); output.writeFloatLE(star.dec, offset + 4);
  output.writeInt16LE(Math.round(star.magnitude * 1000), offset + 8); output.writeInt16LE(star.bv === null ? -32768 : Math.round(star.bv * 1000), offset + 10);
}
const metadata = { catalogue: 'ESA 1997, Hipparcos Main Catalogue (I/239)', provider: 'NASA HEASARC', sourceUrl, query, sourceSha256: createHash('sha256').update(source).digest('hex'), binarySha256: createHash('sha256').update(output).digest('hex'), sourceEpoch: 'J1991.25', outputEpoch: 'J2000.0', properMotion: '球面切平面推进 8.75 年，pmRA 已包含 cos(dec)', format: '每条 12 字节：RA float32 deg、Dec float32 deg、V int16 毫星等、B-V int16 毫星等；均为 little-endian；缺失 B-V = -32768', inputRecords: rows.length, count: stars.length, nakedEyeCount: stars.filter(star => star.magnitude <= 6.5).length, shortExposureCount: stars.filter(star => star.magnitude > 6.5).length, skippedPositions: skipped, missingColor, anchors };
await writeFile(new URL('../src/assets/hipparcos-v7.3.bin', import.meta.url), output);
await writeFile(new URL('../src/data/hipparcos-catalog.json', import.meta.url), JSON.stringify(metadata, null, 2) + '\n');
console.log(JSON.stringify({ count: stars.length, nakedEyeCount: metadata.nakedEyeCount, extraFaintStars: metadata.shortExposureCount, bytes: output.length, skipped, anchors }, null, 2));
