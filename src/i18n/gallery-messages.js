import { getLanguage } from './index.js';

const copy = {
  title: ['Gallery', '风景画廊', '風景ギャラリー'],
  open: ['Open landscape gallery', '打开风景画廊', '風景ギャラリーを開く'],
  close: ['Close gallery and restore world', '关闭画廊并还原世界', 'ギャラリーを閉じて元の世界に戻る'],
  curated: ['Selected', '精选风景', 'おすすめ'],
  saved: ['My collection', '我的收藏', 'コレクション'],
  capture: ['Save moment', '收藏此刻', '今の風景を保存'],
  preview: ['Previewing · {name}', '正在预览 · {name}', 'プレビュー · {name}'],
  choose: ['A little change of scenery', '选一处风景，走进去看看', '気になる風景を選んでください'],
  restoreNote: ['Closing returns to your world', '关闭画廊将回到原来的世界', '閉じると元の世界に戻ります'],
  chooseNote: ['Preview a scene before making it yours', '先预览，喜欢再应用到世界', 'プレビューしてから世界に反映できます'],
  freezeTime: ['Hold time', '定格时间', '時刻を固定'],
  freezeWeather: ['Hold weather', '定格天气', '天気を固定'],
  restore: ['Restore', '还原', '元に戻す'],
  apply: ['Apply to world', '应用到世界', '世界に反映'],
  applied: ['This scene is now your world', '已应用到世界', '風景を世界に反映しました'],
  applyError: ['Could not save this world. You can still restore it.', '世界保存失败，仍可还原；请检查存储空间', '世界を保存できませんでした。元の世界に戻すことができます'],
  captured: ['Moment saved to your collection', '已保存到我的收藏', 'コレクションに保存しました'],
  captureError: ['Could not save. Your collection is unchanged.', '保存失败，请检查存储空间；原收藏未改变', '保存できませんでした。元のコレクションは保護されています'],
  full: ['Collection is full (24). Remove a scene first.', '收藏已满（24 个），请先移除不需要的风景', '保存上限（24件）です。不要な風景を削除してください'],
  emptyTitle: ['Keep a moment you love', '把喜欢的此刻留下', 'お気に入りの瞬間を残そう'],
  empty: ['Save a view to find it here next time.', '点击“收藏此刻”，下次还可以回到这里。', '「今の風景を保存」で、またこの風景に戻れます。'],
  local: ['Saved on this device', '保存在此设备', 'このデバイスに保存'],
  moment: ['Moment · {time}', '此刻 · {time}', 'この瞬間 · {time}'],
  remove: ['Remove saved scene', '删除收藏', '保存した風景を削除'],
  confirmRemove: ['Click again to remove', '再次点击删除', 'もう一度クリックで削除'],
  browse: ['Drag to browse scenes', '左右滑动浏览风景', '左右にスワイプして風景を見る'],
  error: ['This scene could not be opened', '暂时无法打开这处风景', 'この風景を開けませんでした'],
};
export function g(key, values = {}) {
  const index = { en: 0, zh: 1, ja: 2 }[getLanguage()] ?? 0;
  return (copy[key]?.[index] || key).replace(/\{(\w+)\}/g, (match, name) => values[name] ?? match);
}
