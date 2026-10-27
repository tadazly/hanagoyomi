// 这些表属于 v7 协议；顺序和值均独立于当前预设、设备偏好和场景默认值。
export const V7_PROTOCOL = Object.freeze({
  numbers: Object.freeze([4, 317, .6, .16, .8, 18, .3, 1000, 0, 0, 0, 0, 0]),
  camera: Object.freeze([-2801.597137599582, 4700.742448387173, 2.2, 3.9269908169872414, .04, 0, 60, null, null]),
  appearance: Object.freeze([1, 1, 14]),
  constellations: Object.freeze(('And Ant Aps Aqr Aql Ara Ari Aur Boo Cae Cam Cnc CVn CMa CMi Cap Car Cas Cen Cep Cet Cha Cir Col Com CrA CrB Crv Crt Cru Cyg Del Dor Dra Equ Eri For Gem Gru Her Hor Hya Hyi Ind Lac Leo LMi Lep Lib Lup Lyn Lyr Men Mic Mon Mus Nor Oct Oph Ori Pav Peg Per Phe Pic Psc PsA Pup Pyx Ret Sge Sgr Sco Scl Sct Ser Sex Tau Tel Tri TrA Tuc UMa UMi Vel Vir Vol Vul').split(' ')),
});
export const V7_MAX_BYTES = 3072;
const encoder = new TextEncoder(), decoder = new TextDecoder('utf-8', { fatal: true });
const fail = () => { throw new TypeError('scene-link.invalid'); };
const tuple = (v, n) => Array.isArray(v) && v.length === n;
const integer = (v, max) => Number.isInteger(v) && v >= 0 && v <= max;

function sparse(values, base) {
  let mask = 0;
  const changed = [];
  for (let i = 0; i < base.length; i++) if (!Object.is(values[i], base[i])) {
    mask |= 1 << i; changed.push(values[i]);
  }
  return [mask, ...changed];
}
function restore(values, base) {
  if (!Array.isArray(values) || !integer(values[0], (1 << base.length) - 1)) fail();
  const result = [...base];
  let index = 1;
  for (let i = 0; i < base.length; i++) if (values[0] & (1 << i)) {
    if (index >= values.length) fail();
    result[i] = values[index++];
  }
  if (index !== values.length) fail();
  return result;
}
function constellationCode(id) {
  if (id === null) return 0;
  const index = V7_PROTOCOL.constellations.indexOf(id);
  if (index < 0) fail();
  return index + 1;
}
function constellationId(code) {
  if (!integer(code, V7_PROTOCOL.constellations.length)) fail();
  return code ? V7_PROTOCOL.constellations[code - 1] : null;
}
const viewBase = c => [c[3], c[4], c[0], c[7], c[1], c[6]];
const weatherBase = (n, e) => [e[2], n[3], n[4], n[5], n[6], 30000, n[8], n[9], n[10], n[11], n[12], n[11], n[12]];

function compact(data) {
  if (!tuple(data, 12)) fail();
  const [title, switches, numbers, enums, camera, time, weather, freeze, location, motion, clouds, appearance] = data;
  if (!tuple(numbers, 13) || !tuple(enums, 3) || !tuple(camera, 11) || !tuple(time, 3) || !tuple(weather, 13)) fail();
  const flags = switches | (clouds << 12) | (freeze << 13) | (enums[0] << 16) | (enums[1] << 18) | (enums[2] << 20);
  let look = null;
  if (appearance !== null) {
    if (!tuple(appearance, 11)) fail();
    const a = appearance;
    look = [+(a[0] === 'realistic') | (+a[1] << 1) | (+(a[2] === 'always') << 2)
      | (+a[3] << 3) | (+a[4] << 4) | (+a[8] << 5) | (+a[9] << 6),
    sparse(a.slice(5, 8), V7_PROTOCOL.appearance), constellationCode(a[10])];
  }
  return [title, flags, sparse(numbers, V7_PROTOCOL.numbers),
    [sparse(camera.slice(0, 9), V7_PROTOCOL.camera), camera[9] === null ? null : sparse(camera[9], viewBase(camera)), constellationCode(camera[10])],
    [time[0], time[1] | (time[2] << 1)], sparse(weather, weatherBase(numbers, enums)), location, motion, look];
}
function expand(data) {
  if (!tuple(data, 9)) fail();
  const [title, flags, numberChanges, cameraData, time, weatherChanges, location, motion, look] = data;
  if (!integer(flags, 0xffffff) || !tuple(cameraData, 3) || !tuple(time, 2) || !integer(time[1], 15)) fail();
  const numbers = restore(numberChanges, V7_PROTOCOL.numbers);
  const enums = [(flags >> 16) & 3, (flags >> 18) & 3, (flags >> 20) & 15];
  const camera = restore(cameraData[0], V7_PROTOCOL.camera);
  camera.push(cameraData[1] === null ? null : restore(cameraData[1], viewBase(camera)), constellationId(cameraData[2]));
  let appearance = null;
  if (look !== null) {
    if (!tuple(look, 3) || !integer(look[0], 127)) fail();
    const [bits, changes, id] = look;
    appearance = [bits & 1 ? 'realistic' : 'default', !!(bits & 2), bits & 4 ? 'always' : 'immersive',
      !!(bits & 8), !!(bits & 16), ...restore(changes, V7_PROTOCOL.appearance), !!(bits & 32), !!(bits & 64), constellationId(id)];
  }
  return [title, flags & 4095, numbers, enums, camera, [time[0], time[1] & 1, time[1] >> 1],
    restore(weatherChanges, weatherBase(numbers, enums)), (flags >> 13) & 7, location, motion, (flags >> 12) & 1, appearance];
}

// 标量引用只指向先前的值；数值使用小整数、精确十进制或 IEEE 754 Float64。
function writeBinary(root) {
  const out = [], refs = new Map();
  let nodes = 0;
  const varint = value => {
    let n = BigInt(value);
    while (n > 127n) { out.push(Number(n & 127n) | 128); n >>= 7n; }
    out.push(Number(n));
  };
  const visit = (v, depth) => {
    if (++nodes > 256 || depth > 8) fail();
    if (v === null) { out.push(0); return; }
    if (v === false || v === true) { out.push(v ? 2 : 1); return; }
    if (Array.isArray(v)) {
      if (v.length > 63) fail();
      out.push(128 + v.length); v.forEach(x => visit(x, depth + 1)); return;
    }
    if (typeof v !== 'string' && (typeof v !== 'number' || !Number.isFinite(v))) fail();
    const negativeZero = Object.is(v, -0);
    if (typeof v === 'number' && !negativeZero && Number.isInteger(v) && v >= -16 && v <= 47) { out.push(v + 32); return; }
    const key = `${typeof v}:${negativeZero ? '-0' : v}`;
    if (refs.has(key)) { out.push(6); varint(refs.get(key)); return; }
    refs.set(key, refs.size);
    if (typeof v === 'string') {
      const bytes = encoder.encode(v);
      if (bytes.length > V7_MAX_BYTES) fail();
      if (decoder.decode(bytes) === v) { out.push(5); varint(bytes.length); out.push(...bytes); }
      else {
        // 孤立代理码元也须按原值保存，不能被 UTF-8 编码器替换。
        out.push(7); varint(v.length);
        for (let i = 0; i < v.length; i++) { const c = v.charCodeAt(i); out.push(c & 255, c >> 8); }
      }
    } else if (!negativeZero && Number.isSafeInteger(v)) {
      const n = BigInt(v); out.push(4); varint(n < 0n ? -n * 2n - 1n : n * 2n);
    } else {
      const text = String(v);
      if (!negativeZero && text.length <= 7) out.push(8, text.length, ...encoder.encode(text));
      else { const bytes = new Uint8Array(8); new DataView(bytes.buffer).setFloat64(0, v, true); out.push(3, ...bytes); }
    }
    if (out.length > V7_MAX_BYTES) fail();
  };
  visit(root, 0);
  if (out.length > V7_MAX_BYTES) fail();
  return Uint8Array.from(out);
}
function readBinary(bytes) {
  if (!(bytes instanceof Uint8Array) || !bytes.length || bytes.length > V7_MAX_BYTES) fail();
  let pos = 0, nodes = 0;
  const refs = [];
  const take = count => {
    if (!Number.isSafeInteger(count) || count < 0 || pos + count > bytes.length) fail();
    const start = pos; pos += count; return bytes.subarray(start, pos);
  };
  const byte = () => take(1)[0];
  const varint = () => {
    let n = 0n;
    for (let i = 0; i < 8; i++) { const b = byte(); n |= BigInt(b & 127) << BigInt(i * 7); if (!(b & 128)) return n; }
    fail();
  };
  const visit = depth => {
    if (++nodes > 256 || depth > 8) fail();
    const tag = byte();
    if (tag === 0) return null;
    if (tag === 1 || tag === 2) return tag === 2;
    if (tag >= 128 && tag < 192) return Array.from({ length: tag - 128 }, () => visit(depth + 1));
    if (tag >= 16 && tag <= 79) return tag - 32;
    if (tag === 6) { const index = Number(varint()); if (!integer(index, refs.length - 1)) fail(); return refs[index]; }
    let v;
    if (tag === 3) { const b = take(8); v = new DataView(b.buffer, b.byteOffset, 8).getFloat64(0, true); }
    else if (tag === 4) { const n = varint(); v = Number(n & 1n ? -(n + 1n) / 2n : n / 2n); if (!Number.isSafeInteger(v)) fail(); }
    else if (tag === 5) v = decoder.decode(take(Number(varint())));
    else if (tag === 7) {
      const b = take(Number(varint()) * 2);
      v = ''; for (let i = 0; i < b.length; i += 2) v += String.fromCharCode(b[i] | (b[i + 1] << 8));
    } else if (tag === 8) { const size = byte(); if (size < 1 || size > 7) fail(); v = Number(decoder.decode(take(size))); }
    else fail();
    if (typeof v === 'number' && !Number.isFinite(v)) fail();
    refs.push(v); return v;
  };
  const result = visit(0);
  if (pos !== bytes.length) fail();
  return result;
}

export const packSceneTupleV7 = tuple => writeBinary(compact(tuple));
export const unpackSceneTupleV7 = bytes => expand(readBinary(bytes));
