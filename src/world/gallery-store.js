export const GALLERY_LIMIT = 24;
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

// 收藏的场景先落盘，封面只是可选附加数据；配额失败不会覆盖原集合。
export function createGalleryStore({ storage, key, now = Date.now, uid = () => crypto.randomUUID() }) {
  const read = () => {
    try {
      const entries = JSON.parse(storage.getItem(key) || '[]');
      return Array.isArray(entries) ? entries.filter(validEntry).slice(0, GALLERY_LIMIT) : [];
    } catch { return []; }
  };
  const write = entries => { storage.setItem(key, JSON.stringify(entries)); return entries; };
  return {
    read,
    add(scene, title) {
      const entries = read();
      if (entries.length >= GALLERY_LIMIT) throw new Error('gallery.full');
      const entry = { id: uid(), title: normalizeGalleryTitle(title), createdAt: now(), scene };
      if (!validEntry(entry)) throw new Error('gallery.invalid');
      write([entry, ...entries]);
      return entry;
    },
    rename(id, title) {
      const normalized = normalizeGalleryTitle(title), entries = read();
      const entry = entries.find(item => item.id === id);
      if (!entry) return null;
      // read() 返回独立副本；写入失败时磁盘中的名称、场景与封面都保持原状。
      entry.title = normalized;
      write(entries);
      return entry;
    },
    setThumbnail(id, thumbnail) {
      if (typeof thumbnail !== 'string' || !thumbnail.startsWith('data:image/jpeg;base64,') || thumbnail.length > 180000) return false;
      const entries = read(), entry = entries.find(item => item.id === id);
      if (!entry) return false;
      entry.thumbnail = thumbnail;
      write(entries);
      return true;
    },
    remove(id) { return write(read().filter(entry => entry.id !== id)); },
  };
}
