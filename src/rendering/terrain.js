const TN = 256, TCELLS = 8;
const tnData = (() => {
  const hash = (i, j) => {
    let h = Math.imul(i, 374761393) + Math.imul(j, 668265263) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
  const gx = new Float32Array(TCELLS * TCELLS), gy = new Float32Array(TCELLS * TCELLS);
  for (let j = 0; j < TCELLS; j++) for (let i = 0; i < TCELLS; i++){
    const a = hash(i + 17, j + 31) * Math.PI * 2;
    gx[j * TCELLS + i] = Math.cos(a); gy[j * TCELLS + i] = Math.sin(a);
  }
  const q = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const out = new Float32Array(TN * TN);
  for (let y = 0; y < TN; y++) for (let x = 0; x < TN; x++){
    const px = (x + 0.5) / TN * TCELLS, py = (y + 0.5) / TN * TCELLS;
    const i0 = Math.floor(px), j0 = Math.floor(py), fx = px - i0, fy = py - j0;
    const g = (i, j, dx, dy) => { const k = (j % TCELLS) * TCELLS + (i % TCELLS); return gx[k] * dx + gy[k] * dy; };
    const a = g(i0, j0, fx, fy), b = g(i0 + 1, j0, fx - 1, fy), c = g(i0, j0 + 1, fx, fy - 1), d = g(i0 + 1, j0 + 1, fx - 1, fy - 1);
    const u = q(fx), v = q(fy);
    out[y * TN + x] = 1.45 * ((a + (b - a) * u) + ((c + (d - c) * u) - (a + (b - a) * u)) * v);
  }
  return out;
})();
function tnSample(u, v){
  const x = u * TN - 0.5, y = v * TN - 0.5;
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const xa = ((x0 % TN) + TN) % TN, xb = (xa + 1) % TN, ya = ((y0 % TN) + TN) % TN, yb = (ya + 1) % TN;
  const a = tnData[ya * TN + xa], b = tnData[ya * TN + xb], c = tnData[yb * TN + xa], d = tnData[yb * TN + xb];
  return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
}
// amplitude (m), period (m), rotation cos, sin, offset u, v, feature size (m)
const OCT = [
  [70.0, 12000, 1.0, 0.0, 0.13, 0.71, 1500],
  [58.0, 2800, 0.8, 0.6, 0.41, 0.07, 350],
  [19.0, 1100, 0.28, 0.96, 0.77, 0.29, 137],
  [4.5, 420, -0.6, 0.8, 0.19, 0.53, 52],
  [0.8, 150, 0.96, -0.28, 0.61, 0.83, 19],
];
function groundH(x, z){
  let h = 0;
  for (const [amp, per, c, s, ou, ov] of OCT){
    const rx = c * x - s * z, rz = s * x + c * z;
    h += amp * tnSample(rx / per + ou, rz / per + ov);
  }
  return h;
}
const f = (v) => { const s = Number(v).toPrecision(8); return /[.e]/.test(s) ? s : s + '.0'; };
const TERRAIN_GLSL = `
uniform sampler2D uTerr;
float tn(vec2 p){ return textureLod(uTerr, p, 0.0).r; }
float octFade(float feat, float sp){ return 1.0 - smoothstep(feat * 0.2, feat * 0.5, sp); }
vec2 rot2(vec2 w, float c, float s){ return vec2(c * w.x - s * w.y, s * w.x + c * w.y); }
float terrainH(vec2 w, float sp){
  float h = 0.0;
${OCT.map(o => `  h += ${f(o[0])} * tn(rot2(w, ${f(o[2])}, ${f(o[3])}) * ${f(1 / o[1])} + vec2(${f(o[4])}, ${f(o[5])})) * octFade(${f(o[6])}, sp);`).join('\n')}
  return h;
}`;


export { TN, tnData, tnSample, groundH, TERRAIN_GLSL };
