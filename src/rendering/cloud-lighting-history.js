// 切片非每帧更新，响应按视觉时钟经过的秒数计算，而非按刷新次数累计平均。
export function cloudLightBlend(elapsedSeconds, weatherChanging = false) {
  const responseSeconds = weatherChanging ? .08 : .25;
  return -Math.expm1(-Math.max(0, elapsedSeconds) / responseSeconds);
}

// [主光方向, 主光RGB, 上/下环境光RGB]；缓存刷新标记不等于光照发生跳变。
export function cloudLightTemporalChange(previous, current) {
  if (!previous) return 0;
  let dot=0;
  for(let i=0;i<3;i++)dot+=current[i]*previous[i];
  let change=2*Math.acos(Math.max(-1,Math.min(1,dot)));
  for(let start=3;start<current.length;start+=3){
    let scale=1e-6;
    for(let i=start;i<start+3;i++)scale=Math.max(scale,Math.abs(current[i]),Math.abs(previous[i]));
    for(let i=start;i<start+3;i++)change=Math.max(change,2*Math.abs(current[i]-previous[i])/scale);
  }
  return Math.min(.25,change);
}
