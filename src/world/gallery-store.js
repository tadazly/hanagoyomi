export const GALLERY_LIMIT = 100;
export const GALLERY_TITLE_LIMIT = 80;

// 名称作为纯文本显示；按 Unicode 字符截断，避免拆开代理对或保留不可见控制字符。
export function normalizeGalleryTitle(value) {
  if (typeof value !== 'string' || value.length > 4096) throw new Error('gallery.invalidTitle');
  const title = Array.from(value.normalize('NFC').replace(/\s+/gu, ' ')
    .replace(/[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/gu, '').trim())
    .slice(0, GALLERY_TITLE_LIMIT).join('').trim();
  if (!title) throw new Error('gallery.invalidTitle');
  return title;
}

function validEntry(entry) {
  return entry && typeof entry.id === 'string' && typeof entry.title === 'string'
    && entry.scene?.version === 1 && entry.scene.environment && entry.scene.camera
    && Number.isFinite(entry.createdAt);
}

export const GALLERY_DATABASE = 'hanagoyomi.gallery';

// 所有转换在事务外完成，不能因等待异步转换使写事务提前提交。
export function decodeLegacyGallery(raw) {
  const entries = JSON.parse(raw);
  if (!Array.isArray(entries)) throw new Error('gallery.invalid');
  const ids = new Set();
  return entries.map(entry => {
    if (!validEntry(entry) || ids.has(entry.id)) throw new Error('gallery.invalid');
    ids.add(entry.id);
    const { id, title, createdAt, scene, thumbnail } = entry;
    let blob;
    if (thumbnail !== undefined) {
      if (typeof thumbnail !== 'string' || !/^data:image\/jpeg;base64,[A-Za-z0-9+/]*={0,2}$/.test(thumbnail)) throw new Error('gallery.invalid');
      const bytes = Uint8Array.from(atob(thumbnail.slice(thumbnail.indexOf(',') + 1)), c => c.charCodeAt(0));
      if (!bytes.length) throw new Error('gallery.invalid');
      blob = new Blob([bytes], { type: 'image/jpeg' });
    }
    return { id, title, createdAt, scene, blob, source: JSON.stringify(entry) };
  });
}

// 唯一的旧存储入口；写入失败、源数据改变或清理失败都保留旧键供重试。
export async function migrateLegacyGallery({ store, storage, key, onStart = () => {} }) {
  const raw = storage.getItem(key);
  if (raw === null) return;
  await onStart();
  const entries = decodeLegacyGallery(raw);
  for (const entry of entries) {
    // 内容指纹区分提交后又被旧页面修改的同一作品；不覆盖或丢弃任一版本。
    const source = entry.source;
    if (globalThis.crypto?.subtle) {
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source));
      entry.signature = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    } else entry.signature = source;
    delete entry.source;
  }
  await store.importLegacy(entries, key);
  if (storage.getItem(key) !== raw) throw new Error('gallery.migrationChanged');
  storage.removeItem(key);
}

function transaction(db, names, mode, body) {
  return new Promise((resolve, reject) => {
    let tx, result, failure;
    try {
      try { tx = db.transaction(names, mode, { durability: 'strict' }); }
      catch { tx = db.transaction(names, mode); }
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(failure || tx.error || new Error('gallery.storageError'));
      const fail = error => { failure = error; tx.abort(); };
      body(tx, value => { result = value; }, fail);
    } catch (error) {
      if (tx) { failure = error; tx.abort(); } else reject(error);
    }
  });
}
const publicEntry = ({ _order, ...entry }) => entry;

// 收藏元数据与 JPEG 分开存储，读取列表不复制图片；成功反馈以事务完成为准。
export function createGalleryStore({ database = GALLERY_DATABASE, factory = () => globalThis.indexedDB,
  now = Date.now, uid = () => crypto.randomUUID(), openTimeout = 5000 } = {}) {
  let db = null;
  const run = (names, mode, body) => {
    if (!db) return Promise.reject(new Error('gallery.unavailable'));
    return transaction(db, names, mode, body);
  };
  return {
    async open() {
      try {
        db = await new Promise((resolve, reject) => {
          const request = factory()?.open(database, 1);
          if (!request) { reject(new Error('gallery.unavailable')); return; }
          let expired = false;
          const timer = setTimeout(() => { expired = true; reject(new Error('gallery.unavailable')); }, openTimeout);
          request.onupgradeneeded = () => {
            for (const name of ['scenes', 'thumbnails', 'meta']) request.result.createObjectStore(name, { keyPath: 'id' });
          };
          request.onerror = () => { clearTimeout(timer); expired = true; reject(request.error || new Error('gallery.unavailable')); };
          request.onblocked = () => { clearTimeout(timer); expired = true; reject(new Error('gallery.unavailable')); };
          request.onsuccess = () => { clearTimeout(timer); if (expired) request.result.close(); else resolve(request.result); };
        });
        db.onversionchange = () => { db?.close(); db = null; };
        // 用字节存封面，避开 WebKit 对持久化 Blob 的兼容问题；仍验证写、读、删除和提交。
        await run(['meta'], 'readwrite', (tx, done, fail) => {
          const meta = tx.objectStore('meta'), bytes = new Uint8Array([255, 216, 255, 217]).buffer;
          meta.put({ id: 'probe', bytes });
          const request = meta.get('probe');
          request.onsuccess = () => {
            const saved = request.result?.bytes;
            if (!(saved instanceof ArrayBuffer) || new Uint8Array(saved).some((byte, i) => byte !== new Uint8Array(bytes)[i]) || saved.byteLength !== bytes.byteLength) { fail(new Error('gallery.unavailable')); return; }
            meta.delete('probe'); done(true);
          };
        });
        return true;
      } catch { db?.close(); db = null; return false; }
    },
    close() { db?.close(); db = null; },
    read() {
      return run(['scenes'], 'readonly', (tx, done) => {
        const request = tx.objectStore('scenes').getAll();
        request.onsuccess = () => done(request.result.sort((a, b) => b._order - a._order).map(publicEntry));
      });
    },
    add(scene, title) {
      const entry = { id: uid(), title: normalizeGalleryTitle(title), createdAt: now(), scene };
      if (!validEntry(entry)) return Promise.reject(new Error('gallery.invalid'));
      return run(['scenes', 'meta'], 'readwrite', (tx, done, fail) => {
        const scenes = tx.objectStore('scenes'), meta = tx.objectStore('meta');
        const count = scenes.count();
        count.onsuccess = () => {
          if (count.result >= GALLERY_LIMIT) { fail(new Error('gallery.full')); return; }
          const sequence = meta.get('sequence');
          sequence.onsuccess = () => {
            const order = (sequence.result?.value || 0) + 1;
            scenes.add({ ...entry, _order: order }); meta.put({ id: 'sequence', value: order }); done(entry);
          };
        };
      });
    },
    rename(id, title) {
      const normalized = normalizeGalleryTitle(title);
      return run(['scenes'], 'readwrite', (tx, done) => {
        const scenes = tx.objectStore('scenes'), request = scenes.get(id);
        request.onsuccess = () => {
          if (!request.result) { done(null); return; }
          const entry = { ...request.result, title: normalized };
          scenes.put(entry); done(publicEntry(entry));
        };
      });
    },
    async getThumbnail(id) {
      const saved = await run(['thumbnails'], 'readonly', (tx, done) => {
        const request = tx.objectStore('thumbnails').get(id);
        request.onsuccess = () => done(request.result);
      });
      // 保留旧版 Blob 的读取能力，并在事务结束后重建内存 Blob。
      const bytes = saved?.bytes || (saved?.blob ? await saved.blob.arrayBuffer() : null);
      return bytes?.byteLength ? new Blob([bytes], { type: 'image/jpeg' }) : null;
    },
    async setThumbnail(id, blob) {
      if (!(blob instanceof Blob) || blob.type !== 'image/jpeg' || !blob.size || blob.size > 135000) return false;
      const bytes = await blob.arrayBuffer();
      return run(['scenes', 'thumbnails'], 'readwrite', (tx, done) => {
        const scenes = tx.objectStore('scenes'), request = scenes.get(id);
        request.onsuccess = () => {
          if (!request.result) { done(false); return; }
          scenes.put({ ...request.result, hasThumbnail: true });
          tx.objectStore('thumbnails').put({ id, bytes }); done(true);
        };
      });
    },
    remove(id) {
      return run(['scenes', 'thumbnails'], 'readwrite', tx => {
        tx.objectStore('scenes').delete(id); tx.objectStore('thumbnails').delete(id);
      });
    },
    async importLegacy(entries, source) {
      const prepared = await Promise.all(entries.map(async ({ blob, ...entry }) => ({ ...entry, bytes: blob ? await blob.arrayBuffer() : null })));
      return run(['scenes', 'thumbnails', 'meta'], 'readwrite', (tx, done, fail) => {
        const scenes = tx.objectStore('scenes'), images = tx.objectStore('thumbnails'), meta = tx.objectStore('meta');
        prepared.forEach(({ bytes, signature, ...entry }, index) => {
          const marker = `legacy:${source}:${entry.id}`, migrated = meta.get(marker);
          migrated.onsuccess = () => {
            if (migrated.result) {
              if (migrated.result.signature !== signature) fail(new Error('gallery.migrationConflict'));
              return;
            }
            const existing = scenes.get(entry.id);
            existing.onsuccess = () => {
              if (!existing.result) {
                scenes.add({ ...entry, _order: -index, hasThumbnail: Boolean(bytes) });
                if (bytes) images.put({ id: entry.id, bytes });
              }
              meta.put({ id: marker, signature });
            };
          };
        });
      });
    },
  };
}
