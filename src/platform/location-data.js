import catalogUrl from '../assets/locations.bin?url&no-inline';

// 网页打开搜索或手动选择时再下载；天气请求不依赖地点库加载。
export async function loadLocationData() {
  const response = await fetch(catalogUrl);
  if (!response.ok) throw new Error(`地点数据 HTTP ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}
