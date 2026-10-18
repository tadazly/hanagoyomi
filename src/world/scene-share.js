import { resolveSceneTime, validateScene } from './scene-state.js';
import { normalizeGalleryTitle } from './gallery-store.js';
import { fmtTime, zonedHours } from './clock.js';
import { deflateSync, inflateSync } from 'fflate';

// 字段顺序属于链接协议；v2 无损压缩 v1 元组，不依赖可变的设备默认值。
// v1 旧链接继续读取；只有导入和分享时执行压缩，不进入逐帧循环。
const BOOLEAN_KEYS = ['auto', 'god', 'petals', 'sway', 'constel', 'flies', 'flowerGlow', 'bloom', 'streamScale', 'infMem', 'lensDrops', 'lowSaturation'];
const NUMBER_KEYS = ['bloomR', 'sunAz', 'dof', 'coverage', 'density', 'wind', 'breeze', 'fogVisS', 'rainAmt', 'snowAmt', 'boltFreq', 'puddle', 'snowMax'];
const CAMERA_KEYS = ['x', 'z', 'agl', 'yaw', 'pitch', 'roll', 'fov', 'y', 'focus'];
const WEATHER_KEYS = ['cov', 'dens', 'wind', 'breeze', 'vis', 'rain', 'snow', 'bolt', 'wet', 'snowCov'];
const WEATHER_TYPES = ['clear', 'fewcloud', 'cloudy', 'overcast', 'mist', 'fog', 'lightrain', 'rain', 'heavyrain', 'downpour', 'tshower', 'tstorm', 'sleet', 'lightsnow', 'snow', 'blizzard'];
const ENUMS = { streamDist: ['near', 'mid', 'far'], wxMode: ['follow', 'dynamic', 'manual', 'off'], wxType: WEATHER_TYPES };
export const MAX_SCENE_LINK_LENGTH = 8192;
export const MAX_SCENE_TOKEN_LENGTH = 4096;
export const MAX_SCENE_JSON_BYTES = 3072;
const INVALID = 'scene-link.invalid';

export class SceneLinkError extends Error {
  constructor(code = INVALID) { super(code); this.name = 'SceneLinkError'; this.code = code; }
}
const fail = () => { throw new SceneLinkError(); };
const tuple = (value, length) => Array.isArray(value) && value.length === length;
const integer = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
const finite = value => typeof value === 'number' && Number.isFinite(value);
const bit = value => value === 0 || value === 1;

function baseUrl(value) {
  try {
    const url = new URL(value ?? globalThis.location?.href);
    if (!supportedUrl(url)) fail();
    return url;
  } catch { fail(); }
}
function supportedUrl(url) {
  return !url.username && !url.password && (url.protocol === 'https:'
    || (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)));
}
function encode(value) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  if (bytes.length > MAX_SCENE_JSON_BYTES) fail();
  const compressed = deflateSync(bytes, { level: 9 });
  if (compressed.length > MAX_SCENE_JSON_BYTES) fail();
  let binary = '';
  for (const byte of compressed) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function decode(token, version) {
  if (!token || token.length > MAX_SCENE_TOKEN_LENGTH || token.length % 4 === 1 || !/^[A-Za-z0-9_-]+$/.test(token)) fail();
  try {
    const binary = atob(token.replace(/-/g, '+').replace(/_/g, '/'));
    if (binary.length > MAX_SCENE_JSON_BYTES) fail();
    if (btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') !== token) fail();
    let bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
    if (version === 'v2' || version === 'v3') {
      // out 模式只写入固定缓冲，不按解压后大小分配内存。
      // 多留一个哨兵字节，超长载荷即使被截断也无法伪装成合法前缀。
      bytes = inflateSync(bytes, { out: new Uint8Array(MAX_SCENE_JSON_BYTES + 1) });
      if (bytes.length > MAX_SCENE_JSON_BYTES) fail();
      // v2 规定 fflate 0.8.3 / level 9 的规范编码，拒绝尾随或拼接的数据。
      // 升级压缩算法时必须保留此编码器或增加链接版本，不能重解释旧链接。
      const canonical = deflateSync(bytes, { level: 9 });
      if (canonical.length !== binary.length || !canonical.every((byte, index) => byte === binary.charCodeAt(index))) fail();
    }
    const json = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return JSON.parse(json);
  } catch { fail(); }
}

function pack(scene, title) {
  const s = scene.settings, c = scene.camera, e = scene.environment;
  return [title, BOOLEAN_KEYS.reduce((mask, key, index) => mask | (+s[key] << index), 0),
    NUMBER_KEYS.map(key => s[key]), Object.entries(ENUMS).map(([key, values]) => values.indexOf(s[key])),
    CAMERA_KEYS.map(key => c[key] ?? null), [e.time.ms, +e.time.followNow, e.time.speedIndex],
    [WEATHER_TYPES.indexOf(e.weather.type), ...WEATHER_KEYS.map(key => e.weather.current[key]), e.weather.wet, e.weather.snowCover],
    +scene.freeze.time | (+scene.freeze.weather << 1) | (+scene.freeze.clouds << 2),
    e.skyLocation ? [e.skyLocation.lat, e.skyLocation.lon, e.skyLocation.tz] : null,
    e.motion ? [e.motion.time, e.motion.windAngle, ...e.motion.windOffset, ...(e.motion.cloudAngle !== undefined ? [e.motion.cloudY ?? null, e.motion.cloudAngle] : e.motion.cloudY === undefined ? [] : [e.motion.cloudY])] : null];
}
function unpack(data, version) {
  if (!(tuple(data, 9) || tuple(data, 10))) fail();
  const [title, booleans, numbers, enums, camera, time, weather, freeze, location] = data;
  const motion = data.length === 9 ? null : data[9];
  if (typeof title !== 'string' || Array.from(title).length > 80 || (title && normalizeGalleryTitle(title) !== title)
    || !integer(booleans, 0, (1 << BOOLEAN_KEYS.length) - 1)
    || !tuple(numbers, NUMBER_KEYS.length) || !numbers.every(finite)
    || !tuple(enums, 3) || !enums.every((value, index) => integer(value, 0, Object.values(ENUMS)[index].length - 1))
    || !(tuple(camera, CAMERA_KEYS.length - 1) || tuple(camera, CAMERA_KEYS.length)) || !camera.slice(0, 7).every(finite) || !camera.slice(7).every(value => value === null || finite(value))
    || !tuple(time, 3) || !finite(time[0]) || !bit(time[1]) || !integer(time[2], 0, 7)
    || !tuple(weather, WEATHER_KEYS.length + 3) || !integer(weather[0], 0, WEATHER_TYPES.length - 1) || !weather.slice(1).every(finite)
    || !integer(freeze, 0, version === 'v3' ? 7 : 3)
    || !(location === null || (tuple(location, 3) && finite(location[0]) && finite(location[1]) && typeof location[2] === 'string'))
    || !(motion === null || ((tuple(motion, 4) || (version === 'v3' && (tuple(motion, 5) || tuple(motion, 6)))) && motion.every((v, i) => finite(v) || (motion.length === 6 && i === 4 && v === null))))) fail();
  const settings = Object.fromEntries(BOOLEAN_KEYS.map((key, index) => [key, Boolean(booleans & (1 << index))]));
  NUMBER_KEYS.forEach((key, index) => { settings[key] = numbers[index]; });
  Object.entries(ENUMS).forEach(([key, values], index) => { settings[key] = values[enums[index]]; });
  const environment = {
    time: { ms: time[0], followNow: Boolean(time[1]), speedIndex: time[2] },
    weather: { type: WEATHER_TYPES[weather[0]], current: Object.fromEntries(WEATHER_KEYS.map((key, index) => [key, weather[index + 1]])), wet: weather.at(-2), snowCover: weather.at(-1) },
  };
  if (location) environment.skyLocation = { lat: location[0], lon: location[1], tz: location[2] };
  if (motion) environment.motion = { time: motion[0], windAngle: motion[1], windOffset: motion.slice(2, 4), ...(motion.length >= 5 && motion[4] !== null ? { cloudY: motion[4] } : {}), ...(motion.length === 6 ? { cloudAngle: motion[5] } : {}) };
  const scene = validateScene({ version: 1, settings,
    camera: Object.fromEntries(CAMERA_KEYS.flatMap((key, index) => camera[index] == null ? [] : [[key, camera[index]]])),
    environment, freeze: { time: Boolean(freeze & 1), weather: Boolean(freeze & 2), clouds: Boolean(freeze & 4) } });
  if (!scene) fail();
  return { scene, title };
}

/** 仅生成链接，不访问剪贴板、网络或存储。localHour 在写入前解析为绝对 UTC。 */
export function createSceneLink(input, { title = '', baseUrl: base, timeZone = 'UTC', now = Date.now() } = {}) {
  try {
    const scene = resolveSceneTime(input, timeZone, now);
    if (!scene) fail();
    const name = title === '' ? '' : normalizeGalleryTitle(title);
    const url = baseUrl(base);
    // 本机模式、语言及其他查询偏好都不随作品传播；fragment 也不会发送到服务器。
    url.search = ''; url.hash = `scene=v3.${encode(pack(scene, name))}`;
    if (url.href.length > MAX_SCENE_LINK_LENGTH) fail();
    return url.href;
  } catch (error) { if (error instanceof SceneLinkError) throw error; fail(); }
}

/** 无作品标记返回 null，损坏或不支持的作品链接抛 SceneLinkError；绝不加载远端页面。 */
export function parseSceneLink(input, { baseUrl: base } = {}) {
  if (typeof input !== 'string' || input.length > MAX_SCENE_LINK_LENGTH) fail();
  let url;
  try {
    const text = input.trim();
    if (!text) return null;
    // 完整链接不依赖宿主基址，file:// 壁纸也可以直接解析收到的 HTTPS 链接。
    try { url = new URL(text); }
    catch { url = new URL(text, baseUrl(base)); }
  } catch { fail(); }
  if (!supportedUrl(url)) fail();
  if (!url.hash.startsWith('#scene=')) return null;
  const version = url.hash.slice('#scene='.length, '#scene=v1'.length);
  if (!['v1', 'v2', 'v3'].includes(version) || url.hash['#scene=v1'.length] !== '.') throw new SceneLinkError('scene-link.version');
  try { return unpack(decode(url.hash.slice('#scene=v1.'.length), version), version); }
  catch (error) { if (error instanceof SceneLinkError) throw error; fail(); }
}

/** 返回文案所需的语义，具体三语天气名称由 UI 翻译。 */
export function describeScene(input, { timeZone = 'UTC' } = {}) {
  const scene = validateScene(input);
  if (!scene) return null;
  const time = scene.environment.time;
  let hours = time.localHour;
  if (hours === undefined) {
    try { hours = zonedHours(scene.environment.skyLocation?.tz || timeZone, time.ms); }
    catch { hours = zonedHours('UTC', time.ms); }
  }
  const timeText = fmtTime(hours);
  return { weatherKey: scene.environment.weather.type, hour: Number(timeText.slice(0, 2)), minute: Number(timeText.slice(3)), timeText };
}
