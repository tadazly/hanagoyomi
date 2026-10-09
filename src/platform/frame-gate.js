// 用时间戳限帧；暂停或改变帧率时重置，不把等待时间当作渲染负载。
export function createFrameGate() {
  let next = 0, previousFPS = 0;
  return {
    reset() { next = 0; },
    ready(now, fps) {
      if (Number.isFinite(fps) && fps <= 0) { next = 0; previousFPS = 0; return true; }
      const rate = Number.isFinite(fps) ? Math.max(1, Math.min(240, fps)) : 30;
      if (rate !== previousFPS) { previousFPS = rate; next = 0; }
      if (now + 0.5 < next) return false;
      const interval = 1000 / rate;
      next = next && now - next < interval ? next + interval : now + interval;
      return true;
    },
  };
}
