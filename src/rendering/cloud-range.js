const EARTH_RADIUS_KM = 6371;
const LEGACY_LIMIT_KM = 95;

// 地面切线两侧的距离之和覆盖地面尚未遮住的云段；单位与云着色器一致。
export function cloudRayLimit(cameraHeightKm, cloudBaseKm, atmosphere, realistic = false) {
  if (atmosphere >= 1 && !realistic) return LEGACY_LIMIT_KM;
  const tangent = height => Math.sqrt(Math.max(0, height) * (2 * EARTH_RADIUS_KM + Math.max(0, height)));
  const visibleLimit = Math.max(LEGACY_LIMIT_KM, (tangent(cameraHeightKm) + tangent(cloudBaseKm)) * 1.02);
  return LEGACY_LIMIT_KM + (visibleLimit - LEGACY_LIMIT_KM) * (realistic ? 1 : 1 - Math.max(0, atmosphere));
}
