// 宏观云体与细节侵蚀分开计时；原地解锁不会追赶暂停期间的位移。
export function advanceCloudOffset(offset, dt, wind, angle, locked) {
  if (locked) return;
  const distance = wind / 1000 * dt;
  offset[0] += Math.cos(angle) * distance;
  offset[1] += dt * .0025;
  offset[2] += Math.sin(angle) * distance;
  for (let i = 0; i < 3; i++) if (Math.abs(offset[i]) > 1e9) offset[i] %= 1e9;
}

// 风向改变后逐渐调整云层的高度剪切，解锁时不会突然跳到另一方向。
export function advanceCloudAngle(current, target, dt, locked) {
  if (locked) return current;
  const delta = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  const next = current + delta * (1 - Math.exp(-dt / 20));
  return Math.atan2(Math.sin(next), Math.cos(next));
}
