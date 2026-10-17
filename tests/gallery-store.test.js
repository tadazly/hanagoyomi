import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGalleryStore, GALLERY_LIMIT } from '../src/world/gallery-store.js';

const scene = { version: 1, camera: { x: 0 }, environment: { time: { ms: 1800000000000 } } };
function setup() {
  const data = new Map(); let blocked = false, id = 0;
  const storage = { getItem: key => data.get(key), setItem(key, value) { if (blocked) throw new Error('quota'); data.set(key, value); } };
  const store = createGalleryStore({ storage, key: 'gallery', now: () => 1800000000000, uid: () => `scene-${++id}` });
  return { store, data, block: () => { blocked = true; } };
}
test('收藏先保存场景，封面失败仍可重新读取；不隐藏重复收藏', () => {
  const { store, block } = setup();
  const first = store.add(scene, '此刻');
  store.add(scene, '再收藏');
  block();
  assert.throws(() => store.setThumbnail(first.id, 'data:image/jpeg;base64,AAAA'), /quota/);
  assert.equal(store.read().length, 2);
  assert.deepEqual(store.read()[1].scene, scene);
  assert.equal(store.read()[1].thumbnail, undefined);
});
test('写入配额失败不破坏原收藏，拒绝非图像和超大封面', () => {
  const { store, data, block } = setup();
  const first = store.add(scene, '原场景'), before = data.get('gallery');
  assert.equal(store.setThumbnail(first.id, 'javascript:bad'), false);
  assert.equal(store.setThumbnail(first.id, 'data:image/jpeg;base64,' + 'x'.repeat(180000)), false);
  block();
  assert.throws(() => store.add(scene, '新场景'), /quota/);
  assert.equal(data.get('gallery'), before);
});
test('收藏容量有界，删除后可继续保存；损坏集合可以恢复', () => {
  const { store, data } = setup();
  data.set('gallery', '{broken'); assert.deepEqual(store.read(), []);
  for (let i = 0; i < GALLERY_LIMIT; i++) store.add(scene, String(i));
  assert.throws(() => store.add(scene, '溢出'), /gallery.full/);
  const id = store.read()[0].id; store.remove(id); store.add(scene, '替换');
  assert.equal(store.read().length, GALLERY_LIMIT);
  assert.equal(store.read().some(item => item.id === id), false);
});
