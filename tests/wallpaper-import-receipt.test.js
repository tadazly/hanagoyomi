import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWallpaperImportReceipt, WALLPAPER_IMPORT_RECEIPT_KEY } from '../src/platform/wallpaper-import-receipt.js';

function memoryStorage() {
  const data = new Map();
  return { data, getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) };
}

test('未处理的链接重启后仍提示，处理后不重复提示', () => {
  const storage = memoryStorage(), link = 'https://example.test/#scene=first';
  let receipt = createWallpaperImportReceipt(storage);
  assert.equal(receipt.receive(link), true);
  receipt = createWallpaperImportReceipt(storage);
  assert.equal(receipt.receive(link), true);
  receipt.acknowledge(link);
  assert.equal(storage.data.get(WALLPAPER_IMPORT_RECEIPT_KEY), link);
  receipt = createWallpaperImportReceipt(storage);
  assert.equal(receipt.receive(link), false);
});

test('清空或换成其他链接后，同一链接可由用户重新导入', () => {
  const storage = memoryStorage(), a = 'https://example.test/#scene=a', b = 'https://example.test/#scene=b';
  let receipt = createWallpaperImportReceipt(storage);
  receipt.receive(a); receipt.acknowledge(a);
  receipt = createWallpaperImportReceipt(storage);
  assert.equal(receipt.receive(a), false);
  assert.equal(receipt.receive(''), true);
  assert.equal(receipt.receive(a), true);
  receipt.acknowledge(a);
  assert.equal(receipt.receive(b), true);
  assert.equal(receipt.receive(a), true);
});

test('过期操作不会确认新链接，存储不可用时仍允许当前会话正常使用', () => {
  const denied = { getItem() { throw Error('denied'); }, setItem() { throw Error('denied'); }, removeItem() { throw Error('denied'); } };
  const receipt = createWallpaperImportReceipt(denied);
  assert.equal(receipt.receive('a'), true);
  assert.equal(receipt.receive('b'), true);
  receipt.acknowledge('a');
  assert.equal(receipt.receive('b'), true);
  receipt.acknowledge('b');
  assert.equal(receipt.receive('b'), false);
  assert.equal(receipt.receive(''), true);
  assert.equal(receipt.receive('b'), true);
});
