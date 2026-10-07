const DAY = 86400000;
export const TIME_SPEEDS = Object.freeze([0, 1, 10, 60, 300, 1200, 3600, 14400]);
const formatters = new Map();

// 每分钟缓存时区偏移，仍按观测地点的 IANA 时区处理夏令时。
export function timezoneOffset(tz, ms) {
  let formatter = formatters.get(tz);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric',
      day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric',
    });
    formatters.set(tz, formatter);
  }
  const parts = {};
  for (const part of formatter.formatToParts(ms)) parts[part.type] = part.value;
  return Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour % 24, +parts.minute, +parts.second) - Math.floor(ms / 1000) * 1000;
}

const offsetCache = new Map();
function cachedOffset(tz, ms) {
  const bucket = Math.floor(ms / 60000), cached = offsetCache.get(tz);
  if (cached?.bucket === bucket) return cached.offset;
  const offset = timezoneOffset(tz, ms);
  offsetCache.set(tz, { bucket, offset });
  return offset;
}

export function zonedHours(tz, ms) {
  return ((ms + cachedOffset(tz, ms)) % DAY + DAY) % DAY / 3600000;
}

export function localTimeToUTC(tz, ms, hours) {
  const wallDay = Math.floor((ms + timezoneOffset(tz, ms)) / DAY) * DAY;
  const wallTime = wallDay + hours * 3600000;
  let utc = wallTime - timezoneOffset(tz, ms);
  for (let i = 0; i < 3; i++) utc = wallTime - timezoneOffset(tz, utc);
  // 夏令时跳过的时刻归一化到相邻有效时刻；重复时刻取上述迭代得到的一次。
  return utc;
}

export const zonedDayStart = (tz, ms) => localTimeToUTC(tz, ms, 0);
export function fmtTime(hours) {
  const minutes = Math.floor(((hours % 24 + 24) % 24) * 60 + 1e-7);
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

export function advanceClock(simMs, elapsedMs, speed, followNow, now = Date.now()) {
  return followNow && speed === 1 ? now : simMs + Math.max(0, elapsedMs) * speed;
}
