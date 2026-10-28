import packed from '../assets/locations.bin?url&inline';

// 独立 WE 包用内嵌压缩数据，兼容 file://；只在打开手动选择时解压。
export async function loadLocationData() {
  return Uint8Array.from(atob(packed.slice(packed.indexOf(',') + 1)), character => character.charCodeAt(0));
}
