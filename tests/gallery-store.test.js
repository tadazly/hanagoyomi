import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { createGalleryStore, migrateLegacyGallery, decodeLegacyGallery, GALLERY_LIMIT, GALLERY_TITLE_LIMIT, normalizeGalleryTitle } from '../src/world/gallery-store.js';
const scene = { version: 1, camera: { x: 0 }, environment: { time: { ms: 1800000000000 } } };
const jpeg = new Blob([new Uint8Array([255,216,255,217])], { type: 'image/jpeg' });
const legacy = [{ id: 'old-2', title: '第二幅 🌸', createdAt: 2, scene, thumbnail: 'data:image/jpeg;base64,/9j/2Q==' }, { id: 'old-1', title: '第一幅', createdAt: 1, scene }];
async function setup() {
  const factory = new IDBFactory(); let id = 0;
  const store = createGalleryStore({ factory: () => factory, now: () => 1800000000000, uid: () => `scene-${++id}` });
  assert.equal(await store.open(), true);
  return { store, factory };
}
function oldStorage() {
  const data = new Map([['gallery', JSON.stringify(legacy)]]);
  return { data, getItem: key => data.get(key) ?? null, removeItem: key => data.delete(key) };
}
test('收藏与JPEG分别保存，改名保留图片和顺序，删除同时清理图片', async () => {
  const { store } = await setup();
  const first = await store.add(scene, '此刻');
  assert.equal(await store.setThumbnail(first.id, jpeg), true);
  await store.add(scene, '再收藏');
  assert.equal(await store.setThumbnail(first.id, 'data:image/jpeg;base64,AAAA'), false);
  assert.equal(await store.setThumbnail(first.id, new Blob(['x'.repeat(135001)], { type: 'image/jpeg' })), false);
  const before = (await store.read())[1];
  const changed = await store.rename(first.id, '  午后 🌸\n花海  ');
  assert.deepEqual(changed, { ...before, title: '午后 🌸 花海' });
  assert.deepEqual(new Uint8Array(await (await store.getThumbnail(first.id)).arrayBuffer()), new Uint8Array(await jpeg.arrayBuffer()));
  assert.equal(await store.rename('missing', '不存在'), null);
  await store.remove(first.id);
  assert.equal(await store.getThumbnail(first.id), null);
  assert.equal(await store.setThumbnail(first.id, jpeg), false);
  assert.equal((await store.read()).length, 1); store.close();
});
test('并发新增的100上限在事务内生效，删除后可继续保存', async () => {
  const { store } = await setup();
  const results = await Promise.allSettled(Array.from({length:GALLERY_LIMIT+1}, (_,i) => store.add(scene,String(i))));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,GALLERY_LIMIT);
  assert.match(results.find(r=>r.status==='rejected').reason.message,/gallery.full/);
  await store.remove((await store.read())[0].id); await store.add(scene,'替换');
  assert.equal((await store.read()).length,GALLERY_LIMIT); store.close();
});
test('并发改名和封面写入不丢字段，删除后的延迟封面不能复活收藏', async () => {
  const { store } = await setup(), first = await store.add(scene,'原名');
  await Promise.all([store.rename(first.id,'新名'),store.setThumbnail(first.id,jpeg)]);
  assert.equal((await store.read())[0].title,'新名'); assert.equal((await store.read())[0].hasThumbnail,true);
  await store.remove(first.id); assert.equal(await store.setThumbnail(first.id,jpeg),false);
  assert.deepEqual(await store.read(),[]); store.close();
});
test('迁移完整保留元数据、顺序和JPEG，事务提交后才删除旧键', async () => {
  const { store } = await setup(), storage = oldStorage(); let shown=false;
  const original=store.importLegacy;
  store.importLegacy=async(...args)=>{
    assert.ok(storage.getItem('gallery')); await original(...args);
    assert.equal((await store.read()).length,2); assert.equal((await store.getThumbnail('old-2')).type,'image/jpeg');
  };
  await migrateLegacyGallery({store,storage,key:'gallery',onStart:()=>{shown=true;}});
  assert.equal(shown,true); assert.equal(storage.getItem('gallery'),null);
  assert.deepEqual((await store.read()).map(({hasThumbnail,...entry})=>entry),legacy.map(({thumbnail,...entry})=>entry));
  assert.deepEqual(new Uint8Array(await (await store.getThumbnail('old-2')).arrayBuffer()),new Uint8Array(await jpeg.arrayBuffer())); store.close();
});
test('请求成功后事务中止不能误删旧数据，也不留下半迁移集合', async () => {
  const { store }=await setup(), storage=oldStorage(), original=IDBObjectStore.prototype.add;
  IDBObjectStore.prototype.add=function(...args){const request=original.apply(this,args);if(this.name==='scenes')request.addEventListener('success',()=>this.transaction.abort());return request;};
  try {await assert.rejects(migrateLegacyGallery({store,storage,key:'gallery'}));}
  finally {IDBObjectStore.prototype.add=original;}
  assert.ok(storage.getItem('gallery')); assert.deepEqual(await store.read(),[]);
  assert.equal(await store.getThumbnail('old-2'),null); store.close();
});
test('清理旧键失败后重试不重复、不覆盖改名，也不复活已删收藏', async () => {
  const { store }=await setup(), storage=oldStorage(), remove=storage.removeItem;
  storage.removeItem=()=>{throw new Error('blocked');};
  await assert.rejects(migrateLegacyGallery({store,storage,key:'gallery'}),/blocked/);
  await store.rename('old-2','更新的标题'); await store.remove('old-1'); storage.removeItem=remove;
  await migrateLegacyGallery({store,storage,key:'gallery'});
  assert.equal(storage.getItem('gallery'),null); assert.deepEqual((await store.read()).map(e=>e.title),['更新的标题']); store.close();
});
test('损坏旧数据不静默过滤或截断，不删除源记录，无旧数据不启动迁移', async () => {
  const { store }=await setup();
  for(const raw of ['{broken','{}','[{}]',JSON.stringify([...legacy,legacy[0]]),JSON.stringify([{...legacy[0],thumbnail:'bad'}])]){
    let removed=false;
    await assert.rejects(migrateLegacyGallery({store,key:'gallery',storage:{getItem:()=>raw,removeItem:()=>{removed=true;}}}));
    assert.equal(removed,false);
  }
  let started=false;
  await migrateLegacyGallery({store,key:'gallery',storage:{getItem:()=>null},onStart:()=>{started=true;}});
  assert.equal(started,false);
  assert.equal(decodeLegacyGallery(JSON.stringify(Array.from({length:30},(_,i)=>({...legacy[1],id:String(i)})))).length,30); store.close();
});
test('IDB缺失、访问被拒绝、打开失败或被阻塞时返回不可用', async () => {
  for(const factory of [()=>undefined,()=>{throw new Error('denied');},()=>({open(){throw new Error('denied');}}),()=>({open(){const request={};queueMicrotask(()=>request.onblocked());return request;}})]){
    const store=createGalleryStore({factory,openTimeout:20}); assert.equal(await store.open(),false); await assert.rejects(store.read(),/unavailable/);
  }
});
test('名称限制按Unicode字符生效，拒绝空文本并清理控制字符',()=>{
  assert.equal(normalizeGalleryTitle('e\u0301\u202e\u0000 日文 🌸'),'é 日文 🌸');
  assert.equal(normalizeGalleryTitle('🌸'.repeat(100)),'🌸'.repeat(GALLERY_TITLE_LIMIT));
  for(const value of [' \u202e\t ',{title:'文字'},'x'.repeat(4097)])assert.throws(()=>normalizeGalleryTitle(value),/gallery.invalidTitle/);
});

test('提交后同ID旧数据变动会保留源并报冲突，不误删更新内容', async () => {
  const { store }=await setup(), storage=oldStorage(), original=store.importLegacy;
  store.importLegacy=async(...args)=>{
    await original(...args);
    storage.data.set('gallery',JSON.stringify(legacy.map((e,i)=>i===0?{...e,title:'其他页面刚更新',scene:{...e.scene,camera:{x:123}}}:e)));
  };
  await assert.rejects(migrateLegacyGallery({store,storage,key:'gallery'}),/migrationChanged/);
  store.importLegacy=original;
  await assert.rejects(migrateLegacyGallery({store,storage,key:'gallery'}),/migrationConflict/);
  assert.equal(JSON.parse(storage.getItem('gallery'))[0].title,'其他页面刚更新');
  assert.equal((await store.read())[0].title,legacy[0].title); store.close();
});
test('打开超时、异步onerror与Blob探针事务失败均降级为不可用', async () => {
  for(const factory of [()=>({open(){return {};}}),()=>({open(){const request={error:new Error('denied')};queueMicrotask(()=>request.onerror());return request;}})]){
    assert.equal(await createGalleryStore({factory,openTimeout:10}).open(),false);
  }
  const original=IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put=function(...args){if(this.name==='meta'&&args[0].id==='probe')throw new Error('Blob rejected');return original.apply(this,args);};
  try {const factory=new IDBFactory();assert.equal(await createGalleryStore({factory:()=>factory}).open(),false);}
  finally {IDBObjectStore.prototype.put=original;}
});
