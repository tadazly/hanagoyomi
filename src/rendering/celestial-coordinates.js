// J2000 赤道向量到本地天空；银河、恒星和星座线共用 CPU double 三角函数。
// 不能把自 J2000 累计的约 6 万弧度角先转成 GPU float 再求 sin/cos。
export function equatorialToWorld(lst, latitude, rotation = 0, target = new Float32Array(9)) {
  const a = rotation * Math.PI / 180, p = latitude * Math.PI / 180;
  const sa = Math.sin(a), ca = Math.cos(a), sp = Math.sin(p), cp = Math.cos(p);
  const pole = [cp * sa, sp, cp * ca], south = [-sp * sa, cp, -sp * ca], west = [-ca, 0, sa];
  const c = Math.cos(lst), s = Math.sin(lst);
  for (let i = 0; i < 3; i++) {
    target[i] = c * south[i] + s * west[i];
    target[i + 3] = s * south[i] - c * west[i];
    target[i + 6] = pole[i];
  }
  return target;
}

export const EQUATORIAL_TO_GALACTIC = Object.freeze([
  [-.05487556, -.87343709, -.48383502],
  [.49410943, -.44482963, .74698224],
  [-.86766615, -.19807637, .45598378],
]);

export function equatorialToGalactic(direction) {
  return EQUATORIAL_TO_GALACTIC.map(row => row.reduce((v, c, i) => v + c * direction[i], 0));
}
