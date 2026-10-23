// Pogson 星等：相差 5 等的通量比为 100。只规定相对能量，显示曝光另行处理。
export const MAGNITUDE_EXPONENT = -0.4;
export const relativeStellarFlux = (magnitude, reference = 6) => 10 ** (MAGNITUDE_EXPONENT * (magnitude - reference));

// Hipparcos 子集：ICRS/J2000 赤经、赤纬 float32；V、B-V 为 int16 毫星等。
// B-V 的 -32768 表示原表缺测，颜色由调用方采用中性白回退。
export function decodeHipparcosStars(buffer) {
  if (buffer.byteLength % 12) throw new Error('Hipparcos 星表记录长度无效');
  const view = new DataView(buffer), count = buffer.byteLength / 12;
  const positions = new Float32Array(count * 4), colorIndices = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const offset = i * 12, ra = view.getFloat32(offset, true) * Math.PI / 180;
    const dec = view.getFloat32(offset + 4, true) * Math.PI / 180;
    positions.set([Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec), view.getInt16(offset + 8, true) / 1000], i * 4);
    const bv = view.getInt16(offset + 10, true);
    colorIndices[i] = bv === -32768 ? NaN : bv / 1000;
  }
  return { count, positions, colorIndices };
}
