// 整秒用 uint 传入 GPU，小数秒单独保留，避免运行数天后 float 丢失逐帧增量。
// 周期计算用 32 位定点相位，整数乘法的自然环绕恰好对应完整周期。
export const ANIMATION_TIME_PERIOD = 2 ** 32;
export const wrap = (value, period) => ((value % period) + period) % period;

export function splitAnimationTime(seconds) {
  const whole = Math.floor(seconds);
  return { whole: whole >>> 0, fraction: seconds - whole };
}

// CPU 侧的镜头细摆、花瓣引导轨迹和云侵蚀也使用相同的周期语义。
export function animationPhase(seconds, rate, period, offset = 0) {
  const { whole, fraction } = splitAnimationTime(seconds), cycles = rate / period;
  const step = Math.floor(wrap(cycles, 1) * ANIMATION_TIME_PERIOD) >>> 0;
  const base = (Math.imul(whole, step) >>> 0) / ANIMATION_TIME_PERIOD;
  return wrap(base + fraction * cycles + offset / period, 1) * period;
}

export function advanceWindOffset(offset, dt, angle, speed, period) {
  const distance = Math.max(0, dt) * speed;
  offset[0] = wrap(offset[0] + Math.cos(angle) * distance, period);
  offset[1] = wrap(offset[1] + Math.sin(angle) * distance, period);
}

export function advanceFireflyOffset(offset, dt, angle, strength, box = 60) {
  advanceWindOffset(offset, dt, angle, .12 * strength, box);
}

export const ANIMATION_GLSL = `
uniform highp uint uTimeWhole;
uniform highp float uTimeFraction;
// rate 的单位为每秒位移；输出始终处于 [0, period)，不构造大浮点时间。
float animationPhase(float rate, float period, float offset){
  float cycles = rate / period;
  uint step = uint(fract(cycles) * 4294967296.0);
  float base = float(uTimeWhole * step) * (1.0 / 4294967296.0);
  return fract(base + uTimeFraction * cycles + offset / period) * period;
}
float animationAngle(float rate, float offset){ return animationPhase(rate, 6.28318530718, offset); }
`;
