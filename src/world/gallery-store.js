export const GALLERY_LIMIT = 24;

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
      const entry = { id: uid(), title: String(title).slice(0, 80), createdAt: now(), scene };
      if (!validEntry(entry)) throw new Error('gallery.invalid');
      write([entry, ...entries]);
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
