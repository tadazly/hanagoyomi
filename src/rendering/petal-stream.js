// 离地高度的艺术过渡：保留低空花田飞行，进云前将画面交还天空。
export const STREAM_FADE_START = 120, STREAM_FADE_END = 600;
export function petalStreamOpacity(height) {
  const t = Math.max(0, Math.min(1, (height - STREAM_FADE_START) / (STREAM_FADE_END - STREAM_FADE_START)));
  return 1 - t * t * (3 - 2 * t);
}
