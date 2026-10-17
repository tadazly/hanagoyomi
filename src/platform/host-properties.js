// 将宿主启动时重发的旧值与用户后来真正改变的原生属性区分开。
export function createHostPropertySnapshot(storage, key) {
  let values = {}, restored = false;
  const scalar = value => typeof value === 'boolean' || typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value));
  try {
    const saved = JSON.parse(storage?.getItem(key) || 'null');
    if (saved?.version === 1 && saved.values && typeof saved.values === 'object' && !Array.isArray(saved.values)
      && Object.values(saved.values).every(scalar)) {
      values = { ...saved.values }; restored = true;
    }
  } catch { /* 无有效快照时由适配器区分首次安装与旧设置迁移。 */ }
  return {
    restored,
    get: name => values[name],
    changed(properties, force = false) {
      return Object.fromEntries(Object.entries(properties).filter(([name, property]) => property
        && Object.hasOwn(property, 'value') && scalar(property.value)
        && (force || !Object.hasOwn(values, name) || !Object.is(values[name], property.value))));
    },
    remember(properties) {
      for (const [name, property] of Object.entries(properties)) {
        if (property && Object.hasOwn(property, 'value') && scalar(property.value)) values[name] = property.value;
      }
      try { storage?.setItem(key, JSON.stringify({ version: 1, values })); } catch {}
    },
  };
}
