// 昂贵的天空积分仍按采样间隔计算，帧间用模拟时刻插值，消除高倍速的光照阶梯。
export function createLightingTimeline(calculate) {
  let cacheKey, start, end, a, b;
  return (ms, interval, key) => {
    const nextStart = Math.floor(ms / interval) * interval;
    let changed = false;
    if (key !== cacheKey || nextStart !== start || nextStart + interval !== end) {
      a = key === cacheKey && nextStart === end ? b : calculate(nextStart);
      start = nextStart; end = start + interval; b = calculate(end); cacheKey = key;
      changed = true;
    }
    const t = (ms - start) / interval;
    const mix = (x, y, name) => Array.isArray(x) ? x.map((v, i) => mix(v, y[i]))
      : typeof x === 'object' ? Object.fromEntries(Object.keys(x).map(k => [k, mix(x[k], y[k], k)]))
      : name === 'exposure' || name === 'pe' ? Math.exp(Math.log(x) + (Math.log(y) - Math.log(x)) * t)
      : x + (y - x) * t;
    const value = mix(a, b);
    const length = Math.hypot(...value.lightDir);
    value.lightDir = value.lightDir.map(v => v / length);
    return { value, changed, samples: [a, b], fraction: t };
  };
}
