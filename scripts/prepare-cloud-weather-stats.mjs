import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

// 离线工具需要 Python 3 / Pillow；网页、壁纸及普通构建均不依赖它们。
// 固定原始资源版本，重复运行不会把已归一化的数据再次归一化。
const SOURCE_REF = 'b2f4171ef928e444bbd3f0d0022d2ae9db512aad';
const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(process.argv[2] || resolve(root, 'src/assets'));
const python = process.env.PYTHON || 'python3';
const W = 1024, H = 512, radius = 600, sigmaKm = 12, sigmaFloor = .06;
const hash = data => createHash('sha256').update(data).digest('hex');
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wrap = (v, period) => ((v % period) + period) % period;
function decode(bytes) {
  const raw = execFileSync(python, ['-c', 'import io,struct,sys; from PIL import Image; im=Image.open(io.BytesIO(sys.stdin.buffer.read())).convert("RGB"); sys.stdout.buffer.write(struct.pack("<II",*im.size)+im.tobytes())'], { input: bytes, maxBuffer: 256 * 1024 ** 2 });
  return { width: raw.readUInt32LE(0), height: raw.readUInt32LE(4), data: raw.subarray(8) };
}
const original = key => execFileSync('git', ['show', `${SOURCE_REF}:src/assets/eve-weather-${key}.webp`], { cwd: root, maxBuffer: 64 * 1024 ** 2 });
const canonical = decode(original('high'));
if (canonical.width !== W * 4 || canonical.height !== H * 4) throw new Error('原始天气图尺寸发生变化');
const mean = new Float64Array(W * H), moment = new Float64Array(W * H);
for (let y = 0; y < canonical.height; y++) for (let x = 0; x < canonical.width; x++) {
  const i = Math.floor(y / 4) * W + Math.floor(x / 4), r = canonical.data[(y * canonical.width + x) * 3] / 255;
  mean[i] += r / 16; moment[i] += r * r / 16;
}
function kernel(sigma) {
  const n = Math.ceil(3 * sigma), weights = Array.from({ length: n * 2 + 1 }, (_, i) => Math.exp(-.5 * ((i - n) / sigma) ** 2));
  const sum = weights.reduce((a, b) => a + b, 0);
  return weights.map(v => v / sum);
}
const rowMean = new Float64Array(W * H), rowMoment = new Float64Array(W * H);
for (let y = 0; y < H; y++) {
  const latitudeScale = Math.sin(Math.PI * (y + .5) / H);
  const weights = kernel(Math.min(W / 2, sigmaKm * W / (2 * Math.PI * radius * latitudeScale))), n = (weights.length - 1) / 2;
  for (let x = 0; x < W; x++) for (let j = -n; j <= n; j++) {
    const i = y * W + wrap(x + j, W), weight = weights[j + n];
    rowMean[y * W + x] += mean[i] * weight; rowMoment[y * W + x] += moment[i] * weight;
  }
}
const localMean = new Float64Array(W * H), localSigma = new Float64Array(W * H);
const weights = kernel(sigmaKm * H / (Math.PI * radius)), n = (weights.length - 1) / 2;
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  let m = 0, q = 0, total = 0;
  for (let j = -n; j <= n; j++) {
    let yy = y + j, xx = x;
    // 跨极点时纬度反射、经度转半圈；经度始终周期连续。
    if (yy < 0) { yy = -yy - 1; xx += W / 2; }
    if (yy >= H) { yy = 2 * H - yy - 1; xx += W / 2; }
    const i = yy * W + wrap(xx, W), weight = weights[j + n] * Math.sin(Math.PI * (yy + .5) / H);
    m += rowMean[i] * weight; q += rowMoment[i] * weight; total += weight;
  }
  m /= total; q /= total;
  localMean[y * W + x] = m; localSigma[y * W + x] = Math.sqrt(Math.max(0, q - m * m));
}
const codec = JSON.parse(execFileSync(python, ['-c', 'import json,platform,PIL; from PIL import features; print(json.dumps({"python":platform.python_version(),"pillow":PIL.__version__,"webp":features.version("webp")}))'], { encoding: 'utf8' }));
const data=Buffer.alloc(W*H*3);
for(let i=0;i<W*H;i++){data[i*3]=Math.round(clamp(localMean[i],0,1)*255);data[i*3+1]=Math.round(clamp((Math.max(localSigma[i],sigmaFloor)-sigmaFloor)/.44,0,1)*255);}
await mkdir(output,{recursive:true});
const path=resolve(output,'eve-weather-statistics.webp');
execFileSync(python,['-c','import sys; from PIL import Image; Image.frombytes("RGB",(int(sys.argv[1]),int(sys.argv[2])),sys.stdin.buffer.read()).save(sys.argv[3],format="WEBP",lossless=True,quality=100,method=6)',String(W),String(H),path],{input:data,maxBuffer:1024**2});
const encoded=await readFile(path),decoded=decode(encoded);
if(!data.equals(decoded.data))throw new Error('统计图未通过无损往返检查');
const metadata={sourceRef:SOURCE_REF,canonical:'high',sigmaKm,sigmaFloor,fieldSize:[W,H],statistics:'separable spherical approximation; periodic longitude; pole reflection; latitude area weights',codec,encoding:'R=local mean; G=(max(local sigma,0.06)-0.06)/0.44; normalized score=clamp(0.5+0.125*(sourceR-R)/(0.06+0.44*G),0,1)',sourceAssets:Object.fromEntries(['low','high','ultra'].map(key=>[key,hash(original(key))])),sha256:hash(encoded),decodedPixelSha256:hash(data),bytes:encoded.length};
await writeFile(resolve(output,'eve-weather-statistics.json'),JSON.stringify(metadata,null,2)+'\n');
console.log(JSON.stringify(metadata));
