import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flowerMesh, FLOWER_PETALS, FLOWER_CURVE_GRID, FLOWER_CURVE_RADIUS } from '../src/rendering/flower-mesh.js';

test('花朵索引完整覆盖茎、六片花瓣与花心，共享顶点且不越界', () => {
  for (const segments of [1, 2, 4, 8]) {
    const mesh = flowerMesh(segments);
    assert.equal(mesh.indices.length % 3, 0);
    assert.equal(new Set(mesh.indices).size, mesh.vertexCount);
    assert.equal(Math.max(...mesh.indices), mesh.vertexCount - 1);
    assert.equal(mesh.vertexCount, 8 + FLOWER_PETALS * mesh.columns * (segments + 1));
    assert.ok(mesh.vertexCount < mesh.indices.length);
  }
  assert.equal(flowerMesh().vertexCount, 32);
  assert.equal(flowerMesh(4).vertexCount, 98);
  assert.equal(flowerMesh().indices.length, 48);
});

test('花瓣各分段绕序一致，接缝复用相同顶点，法线不会因三角形反向翻转', () => {
  for (const segments of [1, 4]) {
    const { indices, columns } = flowerMesh(segments), vertices = columns * (segments + 1);
    for (let i = 6; i < indices.length - 6; i += 3) {
      const ids = [...indices.slice(i, i + 3)], petal = Math.floor((ids[0] - 4) / vertices);
      assert.ok(ids.every(id => Math.floor((id - 4) / vertices) === petal));
      const uv = ids.map(id => [(id - 4) % vertices % columns, Math.floor(((id - 4) % vertices) / columns)]);
      const [a, b, c] = uv;
      assert.ok((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]) < 0);
    }
  }
});

test('近处网格覆盖整个细分范围，总顶点预算仍小于原版非索引网格', () => {
  assert.ok(FLOWER_CURVE_GRID / 2 >= FLOWER_CURVE_RADIUS + .85);
  for (const grid of [50, 72, 100, 130]) {
    const vertices = grid * grid * flowerMesh().vertexCount + FLOWER_CURVE_GRID ** 2 * flowerMesh(4).vertexCount;
    assert.ok(vertices < grid * grid * 48, `画质网格 ${grid}`);
  }
});
