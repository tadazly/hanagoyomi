import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGalleryStore, GALLERY_LIMIT, GALLERY_TITLE_LIMIT, normalizeGalleryTitle } from '../src/world/gallery-store.js';

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
test('收藏改名保留场景、封面、创建时间与排列位置', () => {
  const { store } = setup();
  const first = store.add(scene, '初始标题');
  store.setThumbnail(first.id, 'data:image/jpeg;base64,AAAA');
  store.add(scene, '第二幅');
  const before = store.read()[1];
  const changed = store.rename(first.id, '  午后 🌸\n花海  ');
  assert.deepEqual(changed, { ...before, title: '午后 🌸 花海' });
  assert.deepEqual(store.read()[1], changed);
  assert.equal(store.rename('missing', '不存在'), null);
});
test('名称限制按 Unicode 字符生效，拒绝空文本并清理控制字符', () => {
  assert.equal(normalizeGalleryTitle('e\u0301\u202e\u0000 日文 🌸'), 'é 日文 🌸');
  assert.equal(normalizeGalleryTitle('🌸'.repeat(100)), '🌸'.repeat(GALLERY_TITLE_LIMIT));
  assert.throws(() => normalizeGalleryTitle(' \u202e\t '), /gallery.invalidTitle/);
  assert.throws(() => normalizeGalleryTitle({ title: '文字' }), /gallery.invalidTitle/);
  assert.throws(() => normalizeGalleryTitle('x'.repeat(4097)), /gallery.invalidTitle/);
});
test('改名配额失败不会破坏已有收藏，非法名称不会写入', () => {
  const { store, data, block } = setup();
  const entry = store.add(scene, '原来的作品'), before = data.get('gallery');
  assert.throws(() => store.rename(entry.id, ''), /gallery.invalidTitle/);
  assert.equal(data.get('gallery'), before);
  block();
  assert.throws(() => store.rename(entry.id, '新标题'), /quota/);
  assert.equal(data.get('gallery'), before);
  assert.equal(store.read()[0].title, '原来的作品');
});
