const DEG = Math.PI / 180;
const angularDistance = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

// 模拟静止观察时的弱星/短曝光层次，不累积画面像素，不改变地表或全局曝光。
export function createNightObservation() {
  let previous = null, stillTime = 0, amount = 0;
  return {
    reset() { previous = null; stillTime = 0; amount = 0; },
    update(elapsed, pose, enabled = true) {
      const seconds = Math.max(0, elapsed), step = Math.min(.1, seconds);
      if (!enabled) { previous = null; stillTime = 0; amount = 0; return 0; }
      let moving = false;
      if (previous && seconds > 0) {
        const speed = Math.hypot(...pose.position.map((v, i) => v - previous.position[i])) / seconds;
        const turn = Math.max(angularDistance(pose.yaw, previous.yaw), Math.abs(pose.pitch - previous.pitch), angularDistance(pose.roll, previous.roll)) / seconds;
        const zoom = Math.abs(pose.fov - previous.fov) / seconds;
        // 忽略轻微呼吸式摆动；判定来自实际镜头运动，包含自动飞行和缩放。
        moving = speed > .15 || turn > .08 * DEG || zoom > .08;
      }
      previous = { ...pose, position: [...pose.position] };
      stillTime = moving ? 0 : stillTime + step;
      const target = !moving && stillTime > 1.5 ? 1 : 0;
      // 上升约 20–30 秒接近上限；移动后约 2–3 秒自然退回肉眼层次。
      amount += (target - amount) * -Math.expm1(-step / (target > amount ? 7 : .8));
      return amount;
    },
  };
}

export function nightObservationAppearance(amount) {
  const value = Math.max(0, Math.min(1, amount));
  return { limitingMagnitude: 6.5 + .8 * value, starGain: 1 + .2 * value, galaxyGain: 1 + .3 * value };
}
