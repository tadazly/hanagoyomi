export const FLOWER_PETALS = 6;
export const FLOWER_CURVE_RADIUS = 8;
export const FLOWER_CURVE_GRID = FLOWER_CURVE_RADIUS * 2 + 2;

// 同一花瓣内复用网格顶点；近处沿长、宽两个方向分段，远处保留四角。
export function flowerMesh(segments = 1) {
  if (!Number.isInteger(segments) || segments < 1 || segments > 8) throw new RangeError('无效的花瓣分段');
  const columns = segments === 1 ? 2 : 3;
  const petalVertices = columns * (segments + 1);
  const indices = [0, 1, 3, 0, 3, 2];
  for (let petal = 0; petal < FLOWER_PETALS; petal++) {
    const base = 4 + petal * petalVertices;
    for (let row = 0; row < segments; row++) for (let column = 0; column < columns - 1; column++) {
      const a = base + row * columns + column, b = a + 1, c = a + columns, d = c + 1;
      // 法线朝向花朵上方，与参数曲面的 cross(沿长方向, 沿宽方向) 一致。
      indices.push(a, d, b, a, c, d);
    }
  }
  const centre = 4 + FLOWER_PETALS * petalVertices;
  indices.push(centre, centre + 1, centre + 3, centre, centre + 3, centre + 2);
  return { segments, columns, vertexCount: centre + 4, indices: new Uint16Array(indices) };
}
