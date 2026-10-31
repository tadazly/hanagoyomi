export const FLIGHT_SPEED_MIN = .25, FLIGHT_SPEED_MAX = 3, FLIGHT_SPEED_DEFAULT = 1;

export function flightSpeed(value) {
  return Number.isFinite(value) ? Math.max(FLIGHT_SPEED_MIN, Math.min(FLIGHT_SPEED_MAX, value)) : FLIGHT_SPEED_DEFAULT;
}
