import { deflateSync, inflateSync } from 'fflate';
import { packSceneTupleV7, unpackSceneTupleV7, V7_MAX_BYTES } from './scene-share-v7-codec.js';
import { V7_DICTIONARY_DEFLATE, V7_DICTIONARY_SIZE } from './scene-share-v7-dictionary.js';

const fail = () => { throw new TypeError('scene-link.invalid'); };
let dictionary;
function fixedDictionary() {
  if (!dictionary) {
    const compressed = Uint8Array.from(atob(V7_DICTIONARY_DEFLATE), c => c.charCodeAt(0));
    const bytes = inflateSync(compressed, { out: new Uint8Array(V7_DICTIONARY_SIZE + 1) });
    if (bytes.length !== V7_DICTIONARY_SIZE) fail();
    dictionary = bytes;
  }
  return dictionary;
}

export function encodeSceneV7(tuple) {
  const raw = packSceneTupleV7(tuple);
  const candidates = [raw, deflateSync(raw, { level: 9 }), deflateSync(raw, { level: 9, dictionary: fixedDictionary() })];
  // 同长度优先原始字节，其次普通 Deflate，最后固定字典 Deflate。
  let mode = 0;
  for (let i = 1; i < candidates.length; i++) if (candidates[i].length < candidates[mode].length) mode = i;
  const result = new Uint8Array(candidates[mode].length + 1);
  if (result.length > V7_MAX_BYTES) fail();
  result[0] = mode; result.set(candidates[mode], 1);
  return result;
}

export function decodeSceneV7(payload) {
  if (!(payload instanceof Uint8Array) || payload.length < 2 || payload.length > V7_MAX_BYTES || payload[0] > 2) fail();
  const mode = payload[0], compressed = payload.subarray(1);
  // 固定输出缓冲含哨兵字节；压缩数据不能控制分配大小。
  const raw = mode === 0 ? compressed : inflateSync(compressed, {
    out: new Uint8Array(V7_MAX_BYTES + 1), ...(mode === 2 ? { dictionary: fixedDictionary() } : {}),
  });
  if (raw.length > V7_MAX_BYTES) fail();
  const tuple = unpackSceneTupleV7(raw), canonical = encodeSceneV7(tuple);
  if (canonical.length !== payload.length || !canonical.every((value, i) => value === payload[i])) fail();
  return tuple;
}
