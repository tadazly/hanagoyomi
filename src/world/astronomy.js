import { zonedDayStart, zonedHours, fmtTime } from './clock.js';

const RAD = Math.PI / 180, E_OBL = 23.4397 * RAD;
const toDays = (ms) => ms / 86400000 - 10957.5;
const raOf = (l, b) => Math.atan2(Math.sin(l) * Math.cos(E_OBL) - Math.tan(b) * Math.sin(E_OBL), Math.cos(l));
const decOf = (l, b) => Math.asin(Math.sin(b) * Math.cos(E_OBL) + Math.cos(b) * Math.sin(E_OBL) * Math.sin(l));
function sunCoords(d) {
  const M = RAD * (357.5291 + 0.98560028 * d), C = RAD * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  const l = M + C + RAD * 102.9372 + Math.PI;
  return { ra: raOf(l, 0), dec: decOf(l, 0), lon: l };
}
function moonCoords(d) {
  const L = RAD * (218.316 + 13.176396 * d), M = RAD * (134.963 + 13.064993 * d), F = RAD * (93.272 + 13.22935 * d);
  const l = L + RAD * 6.289 * Math.sin(M), b = RAD * 5.128 * Math.sin(F);
  return { ra: raOf(l, b), dec: decOf(l, b), lon: l };
}
const sidereal = (d, loc) => RAD * (280.16 + 360.9856235 * d) + loc.lon * RAD;
function horizontal(H, dec, phi) {
  return {
    alt: Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H)),
    az: Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi)) + Math.PI,
  };
}
export function getAstronomy(ms, loc, rotation = 0) {
  const d = toDays(ms), st = sidereal(d, loc), phi = loc.lat * RAD;
  const s = sunCoords(d), m = moonCoords(d);
  const hs = horizontal(st - s.ra, s.dec, phi), hm = horizontal(st - m.ra, m.dec, phi);
  const direction = ({ az, alt }) => {
    const a = az + rotation * RAD;
    return [Math.cos(alt) * Math.sin(a), Math.sin(alt), Math.cos(alt) * Math.cos(a)];
  };
  const phase = ((m.lon - s.lon) / (2 * Math.PI) % 1 + 1) % 1;
  const alpha = Math.PI * Math.abs(1 - 2 * phase);
  return {
    sun: direction(hs), moon: direction(hm), sunAlt: hs.alt, sunAz: hs.az,
    moonAz: hm.az, phase, moonBright: ((1 + Math.cos(alpha)) / 2) ** 3, lst: st,
  };
}
const PHASE_NAMES = ['新月', '娥眉月', '上弦月', '盈凸月', '满月', '亏凸月', '下弦月', '残月'];
export const phaseName = (phase) => PHASE_NAMES[Math.floor(((phase + 1 / 16) % 1) * 8)];

const eventCache = new Map();
export function getSunEvents(ms, loc) {
  const start = zonedDayStart(loc.tz, ms);
  const key = `${loc.lat},${loc.lon}|${loc.tz}|${start}`;
  if (eventCache.has(key)) return eventCache.get(key);
  const altitude = (t) => {
    const d = toDays(t), s = sunCoords(d);
    return horizontal(sidereal(d, loc) - s.ra, s.dec, loc.lat * RAD).alt + 0.833 * RAD;
  };
  let rise = null, set = null, prev = altitude(start), prevTime = start, max = prev;
  // 下一当地午夜可能相距 23 / 25 小时，不假设所有当地日都为 24 小时。
  const nextDay = zonedDayStart(loc.tz, start + 36 * 3600000);
  const steps = Math.ceil((nextDay - start) / 600000);
  for (let i = 1; i <= steps; i++) {
    const t = Math.min(start + i * 600000, nextDay), v = altitude(t);
    max = Math.max(max, v);
    if ((prev < 0 && v >= 0) || (prev >= 0 && v < 0)) {
      const crossing = prevTime + (t - prevTime) * (-prev) / (v - prev);
      if (prev < 0 && rise === null) rise = crossing;
      if (prev >= 0 && set === null) set = crossing;
    }
    prev = v; prevTime = t;
  }
  const result = { rise, set, polar: rise === null && set === null ? (max > 0 ? 'day' : 'night') : null };
  if (eventCache.size > 32) eventCache.clear();
  eventCache.set(key, result);
  return result;
}
export function sunEventsText(ms, loc) {
  const { rise, set, polar } = getSunEvents(ms, loc);
  if (polar) return polar === 'day' ? '今天是极昼，太阳整天不落' : '今天是极夜，太阳整天不升';
  const format = (t) => t === null ? '--' : fmtTime(zonedHours(loc.tz, t));
  return `日出 ${format(rise)}，日落 ${format(set)}`;
}
