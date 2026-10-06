import { TERRAIN_GLSL } from './terrain.js';
const VS_FULL = `#version 300 es
out vec2 vUv;
void main(){ vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); vUv = p; gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`;
const VS_SKY = `#version 300 es
out vec2 vUv;
void main(){ vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); vUv = p; gl_Position = vec4(p * 2.0 - 1.0, 1.0, 1.0); }`;

const PRE = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
precision highp sampler3D;
#define PI 3.14159265359
float saturate(float x){ return clamp(x, 0.0, 1.0); }
float remap(float v, float a, float b, float c, float d){ return c + (v - a) * (d - c) / (b - a); }
`;
const HEAD = PRE + `in vec2 vUv;\n`;

const NOISE_FS = HEAD + `
uniform float uSlice; uniform float uSize; uniform int uMode;
out vec4 o;
vec3 hash33(vec3 p3){ p3 = fract(p3 * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yxz + 33.33); return fract((p3.xxy + p3.yxx) * p3.zyx); }
float gradNoise(vec3 x, float freq){
  vec3 p = floor(x); vec3 w = fract(x);
  vec3 u = w * w * w * (w * (w * 6.0 - 15.0) + 10.0);
  vec3 ga = hash33(mod(p + vec3(0,0,0), freq)) * 2.0 - 1.0; vec3 gb = hash33(mod(p + vec3(1,0,0), freq)) * 2.0 - 1.0;
  vec3 gc = hash33(mod(p + vec3(0,1,0), freq)) * 2.0 - 1.0; vec3 gd = hash33(mod(p + vec3(1,1,0), freq)) * 2.0 - 1.0;
  vec3 ge = hash33(mod(p + vec3(0,0,1), freq)) * 2.0 - 1.0; vec3 gf = hash33(mod(p + vec3(1,0,1), freq)) * 2.0 - 1.0;
  vec3 gg = hash33(mod(p + vec3(0,1,1), freq)) * 2.0 - 1.0; vec3 gh = hash33(mod(p + vec3(1,1,1), freq)) * 2.0 - 1.0;
  float va = dot(ga, w - vec3(0,0,0)), vb = dot(gb, w - vec3(1,0,0)), vc = dot(gc, w - vec3(0,1,0)), vd = dot(gd, w - vec3(1,1,0));
  float ve = dot(ge, w - vec3(0,0,1)), vf = dot(gf, w - vec3(1,0,1)), vg = dot(gg, w - vec3(0,1,1)), vh = dot(gh, w - vec3(1,1,1));
  return va + u.x*(vb-va) + u.y*(vc-va) + u.z*(ve-va) + u.x*u.y*(va-vb-vc+vd) + u.y*u.z*(va-vc-ve+vg) + u.z*u.x*(va-vb-ve+vf) + u.x*u.y*u.z*(-va+vb+vc-vd+ve-vf-vg+vh);
}
float perlinFbm(vec3 p, float freq, int oct){
  float G = exp2(-0.85), amp = 1.0, n = 0.0;
  for (int i = 0; i < 8; i++){ if (i >= oct) break; n += amp * gradNoise(p * freq, freq); freq *= 2.0; amp *= G; }
  return n;
}
float worley(vec3 uv, float freq){
  vec3 id = floor(uv * freq); vec3 p = fract(uv * freq); float md = 1e4;
  for (int x = -1; x <= 1; x++) for (int y = -1; y <= 1; y++) for (int z = -1; z <= 1; z++){
    vec3 off = vec3(float(x), float(y), float(z));
    vec3 h = hash33(mod(id + off, vec3(freq))) + off; vec3 d = p - h; md = min(md, dot(d, d));
  }
  return 1.0 - md;
}
float worleyFbm(vec3 uv, float freq){ return worley(uv, freq) * 0.625 + worley(uv, freq * 2.0) * 0.25 + worley(uv, freq * 4.0) * 0.125; }
void main(){
  if (uMode == 2){
    vec3 uv = vec3(gl_FragCoord.xy / uSize, 0.37);
    float p = perlinFbm(uv, 4.0, 6) * 0.5 + 0.5;
    float w = worleyFbm(uv, 3.0);
    float cov = saturate(remap(p, 0.2, 0.8, 0.0, 1.0) * 0.65 + w * 0.5 - 0.12);
    float type = saturate(perlinFbm(uv + vec3(0.31, 0.17, 0.5), 2.0, 4) * 0.8 + 0.5);
    o = vec4(cov, type, 0.0, 1.0); return;
  }
  vec3 uv = vec3(gl_FragCoord.xy / uSize, (uSlice + 0.5) / uSize);
  if (uMode == 0){
    float pf = mix(1.0, perlinFbm(uv, 4.0, 6), 0.5); pf = abs(pf * 2.0 - 1.0);
    float g = worleyFbm(uv, 4.0), b = worleyFbm(uv, 8.0), a = worleyFbm(uv, 16.0);
    o = vec4(remap(pf, 0.0, 1.0, g, 1.0), g, b, a);
  } else {
    o = vec4(worleyFbm(uv, 4.0), worleyFbm(uv, 8.0), worleyFbm(uv, 16.0), 1.0);
  }
}`;

/* ---------- clouds / atmosphere (shared) ---------- */
const COMMON = `
const float R_EARTH = 6371.0;
const vec3 PC = vec3(0.0, -6371.0, 0.0);
const float SHAPE_FREQ = 1.0 / 7.5;
const float DETAIL_FREQ = 1.0 / 0.7;
const float WEATHER_FREQ = 1.0 / 64.0;
const float SIGMA = 60.0;
const float SHAPE_TEXEL = 7.5 / 128.0;
const float DETAIL_TEXEL = 0.7 / 64.0;
uniform sampler3D uShape; uniform sampler3D uDetail; uniform sampler2D uWeather; uniform sampler2D uSkyLut;
uniform vec3 uCamPos; uniform vec3 uSunDir; uniform vec2 uLayer;
uniform float uCoverage; uniform float uDensity;
uniform vec3 uWind; uniform vec3 uWindDetail; uniform vec2 uWindDir;
vec2 raySphere(vec3 ro, vec3 rd, float r){
  vec3 oc = ro - PC; float b = dot(oc, rd); float c = dot(oc, oc) - r * r; float d = b * b - c;
  if (d < 0.0) return vec2(-1.0); float s = sqrt(d); return vec2(-b - s, -b + s);
}
vec2 skyUV(vec3 d){
  float el = asin(clamp(d.y, -1.0, 1.0)); float az = atan(d.x, d.z);
  return vec2(az / (2.0 * PI) + 0.5, 0.5 + 0.5 * sign(el) * sqrt(abs(el) / (PI * 0.5)));
}
vec3 skyLookup(vec3 d){ return textureLod(uSkyLut, skyUV(d), 0.0).rgb; }
float heightGradient(float h, float type){ float top = mix(0.5, 1.0, type); return smoothstep(0.0, 0.07, h) * (1.0 - smoothstep(top * 0.4, top, h)); }
float lodOf(float fp, float texel){ return max(0.0, log2(max(fp, 1e-6) / texel)); }
float cloudBase(vec3 pw, float h01, float fp){
  if (h01 <= 0.0 || h01 >= 1.0) return 0.0;
  vec3 ps = pw + uWind; ps.xz += uWindDir * (h01 * 0.6);
  vec2 wt = textureLod(uWeather, ps.xz * WEATHER_FREQ, 0.0).rg;
  float cov = saturate(uCoverage + (wt.r - 0.6) * 1.2);
  if (cov <= 0.002) return 0.0;
  vec4 n = textureLod(uShape, ps * SHAPE_FREQ, lodOf(fp, SHAPE_TEXEL));
  float wf = n.g * 0.625 + n.b * 0.25 + n.a * 0.125;
  float shape = saturate(remap(remap(n.r, wf - 1.0, 1.0, 0.0, 1.0), 0.62, 0.95, 0.0, 1.0));
  shape *= heightGradient(h01, wt.g);
  return saturate(remap(shape, 1.0 - cov, 1.0, 0.0, 1.0)) * cov;
}
float erode(float c, vec3 pw, float h01, float fp){
  vec3 dn = textureLod(uDetail, (pw + uWindDetail) * DETAIL_FREQ, lodOf(fp, DETAIL_TEXEL)).rgb;
  float df = dn.r * 0.625 + dn.g * 0.25 + dn.b * 0.125;
  float dm = mix(df, 1.0 - df, saturate(h01 * 4.0));
  return saturate(remap(c, dm * 0.45, 1.0, 0.0, 1.0));
}
float hg(float g, float c){ float g2 = g * g; return (1.0 - g2) / (4.0 * PI * pow(max(1.0 + g2 - 2.0 * g * c, 1e-4), 1.5)); }
float ign(vec2 p){ return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
`;

const SKYLUT_FS = HEAD + COMMON + `
uniform float uSunI, uMoonI; uniform vec3 uMoonDir, uGlow, uMS;
out vec4 o;
const vec3 BR = vec3(5.802e-3, 13.558e-3, 33.1e-3); const float BM = 3.996e-3, BME = 4.40e-3;
const vec3 BO = vec3(0.650e-3, 1.881e-3, 0.085e-3); const float RA = 6471.0;
vec3 dens(float h){ return vec3(exp(-h / 8.0), exp(-h / 1.2), max(0.0, 1.0 - abs(h - 25.0) / 15.0)); }
vec3 scatterFrom(vec3 ro, vec3 rd, float tmax, vec3 L, float I){
  const int N = 20; float dt = tmax / float(N);
  vec3 sumR = vec3(0.0), sumM = vec3(0.0), odv = vec3(0.0);
  for (int i = 0; i < N; i++){
    vec3 p = ro + rd * ((float(i) + 0.5) * dt);
    vec3 dd = dens(max(length(p - PC) - R_EARTH, 0.0)) * dt;
    vec3 odm = odv + dd * 0.5; odv += dd;
    vec2 gl = raySphere(p, L, R_EARTH);
    if (gl.x > 0.0 && dot(p - PC, L) < 0.0) continue;
    float dl = raySphere(p, L, RA).y / 8.0; vec3 odl = vec3(0.0);
    for (int j = 0; j < 8; j++){ vec3 q = p + L * ((float(j) + 0.5) * dl); odl += dens(max(length(q - PC) - R_EARTH, 0.0)) * dl; }
    vec3 att = exp(-(BR * (odm.x + odl.x) + BME * (odm.y + odl.y) + BO * (odm.z + odl.z)));
    sumR += dd.x * att; sumM += dd.y * att;
  }
  float mu = dot(rd, L); float pr = 3.0 / (16.0 * PI) * (1.0 + mu * mu);
  float gg = 0.8, g2 = gg * gg; float pm = 3.0 / (8.0 * PI) * ((1.0 - g2) * (1.0 + mu * mu)) / ((2.0 + g2) * pow(1.0 + g2 - 2.0 * gg * mu, 1.5));
  return I * (sumR * BR * pr + sumM * BM * pm);
}
void main(){
  float x = vUv.y * 2.0 - 1.0; float el = sign(x) * x * x * PI * 0.5; float az = (vUv.x - 0.5) * 2.0 * PI;
  vec3 rd = vec3(cos(el) * sin(az), sin(el), cos(el) * cos(az));
  vec3 ro = vec3(0.0, max(uCamPos.y, 0.001), 0.0);
  float tmax = raySphere(ro, rd, RA).y; vec2 g = raySphere(ro, rd, R_EARTH); if (g.x > 0.0) tmax = g.x;
  vec3 col = scatterFrom(ro, rd, tmax, uSunDir, uSunI);
  if (uMoonI > 0.0) col += scatterFrom(ro, rd, tmax, uMoonDir, uMoonI);
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  float hw = pow(1.0 - abs(rd.y), 5.0) * mix(0.15, 0.75, smoothstep(0.03, 0.35, uSunDir.y));
  col = mix(col, l * vec3(0.90, 0.99, 1.13), hw);
  /* airglow + unresolved starlight, brighter toward the horizon (van Rhijn) */
  col += uGlow * (1.0 + 0.6 * pow(1.0 - abs(rd.y), 4.0));
  /* light scattered more than once: keeps the sky blue after sunset while the upper air is still sunlit */
  col += uMS * (0.6 + 0.4 * (1.0 - abs(rd.y)));
  o = vec4(col, 1.0);
}`;

const CSHADOW_FS = HEAD + COMMON + `
uniform vec3 uShadowP;
out vec4 o;
void main(){
  vec2 xz = uShadowP.xy + (vUv - 0.5) * uShadowP.z;
  float sy = max(uSunDir.y, 0.04); float od = 0.0;
  for (int i = 0; i < 6; i++){
    float hf = (float(i) + 0.5) / 6.0; float hh = mix(uLayer.x, uLayer.y, hf);
    vec2 q = xz + uSunDir.xz * ((hh - 0.05) / sy);
    od += cloudBase(vec3(q.x, hh, q.y), hf, 0.1);
  }
  od *= (uLayer.y - uLayer.x) / 6.0 / sy * uDensity * SIGMA * 0.07;
  o = vec4(mix(0.16, 1.0, exp(-od)), 0.0, 0.0, 1.0);
}`;

const CLOUD_FS = HEAD + COMMON + `
uniform vec3 uRight, uUp, uFwd; uniform vec2 uTan;
uniform vec3 uSunColor; uniform vec3 uAmbTop, uAmbBottom;
uniform int uSteps, uLightSteps; uniform float uFrame, uPixAngle, uFogK, uFwdScat, uAmbOcc;
uniform vec4 uFlashP; uniform vec3 uFlashC;
layout(location = 0) out vec4 oColor;
layout(location = 1) out vec4 oDepth;
float lightOD(vec3 pr, float fp){
  float od = 0.0, prev = 0.0, n = float(uLightSteps);
  for (int i = 0; i < 8; i++){
    if (i >= uLightSteps) break;
    float fr = (float(i) + 1.0) / n; float tt = 1.3 * fr * fr;
    vec3 sp = pr + uSunDir * (0.5 * (prev + tt));
    float h = length(sp - PC) - R_EARTH; float h01 = (h - uLayer.x) / (uLayer.y - uLayer.x);
    if (h01 >= 1.0) break;
    vec3 pw = vec3(sp.x + uCamPos.x, h, sp.z + uCamPos.z);
    float fpi = max(fp, (tt - prev) * 0.5);
    float c = cloudBase(pw, h01, fpi);
    if (c > 0.0 && i < 3) c = erode(c, pw, h01, fpi);
    od += c * (tt - prev); prev = tt;
  }
  return od;
}
void main(){
  vec3 rd = normalize(uFwd + (vUv.x * 2.0 - 1.0) * uTan.x * uRight + (vUv.y * 2.0 - 1.0) * uTan.y * uUp);
  vec3 ro = vec3(0.0, uCamPos.y, 0.0); float hc = uCamPos.y;
  vec2 iB = raySphere(ro, rd, R_EARTH + uLayer.x), iT = raySphere(ro, rd, R_EARTH + uLayer.y), iG = raySphere(ro, rd, R_EARTH);
  float t0 = -1.0, t1 = -1.0; bool inside = false;
  if (hc < uLayer.x){ if (!(iG.x > 0.0)){ t0 = iB.y; t1 = iT.y; } }
  else if (hc < uLayer.y){ inside = true; t0 = 0.0; t1 = iB.x > 0.0 ? iB.x : iT.y; }
  else if (iT.x > 0.0){ t0 = iT.x; t1 = iB.x > 0.0 ? iB.x : iT.y; }
  const float FAR = 95.0;
  if (t0 < 0.0 || t0 > FAR){ oColor = vec4(0.0, 0.0, 0.0, 1.0); oDepth = vec4(FAR); return; }
  t1 = min(t1, t0 + 60.0); float seg = t1 - t0;
  float jit = fract(ign(gl_FragCoord.xy) + uFrame * 0.61803398875);
  float cosT = dot(rd, uSunDir);
  float ph0 = mix(hg(0.80 * uFwdScat, cosT), hg(-0.25, cosT), 0.30), ph1 = mix(hg(0.40 * uFwdScat, cosT), hg(-0.125, cosT), 0.30);
  float ph2 = mix(hg(0.20, cosT), hg(-0.06, cosT), 0.30), ph3 = 1.0 / (4.0 * PI);
  float baseDt = max(seg / float(uSteps), 0.022);
  float t = t0 + (inside ? 0.02 : baseDt) * jit;
  vec3 L = vec3(0.0); float T = 1.0, wsum = 0.0, dsum = 0.0;
  for (int i = 0; i < 160; i++){
    if (i >= uSteps || t > t1) break;
    float dt = inside ? clamp(t * 0.04, 0.02, max(baseDt, 0.02)) : baseDt;
    vec3 p = ro + rd * t;
    float h = length(p - PC) - R_EARTH; float h01 = (h - uLayer.x) / (uLayer.y - uLayer.x);
    float fp = t * uPixAngle;
    vec3 pw = vec3(p.x + uCamPos.x, h, p.z + uCamPos.z);
    float c = cloudBase(pw, h01, fp);
    if (c > 0.0){
      float d = erode(c, pw, h01, fp);
      if (d > 0.002){
        float sigE = d * uDensity * SIGMA;
        float od = lightOD(p, fp) * uDensity * SIGMA;
        float sun = 1.5 * (ph0 * exp(-od) + 0.65 * ph1 * exp(-od * 0.3) + 0.42 * ph2 * exp(-od * 0.09) + 0.27 * ph3 * exp(-od * 0.027));
        sun *= mix(1.0, 1.0 - exp(-sigE * 0.35), 0.45 * (1.0 - saturate(cosT)));
        vec3 amb = mix(uAmbBottom, uAmbTop, saturate(h01 * 1.25)) * mix(0.55, 1.0, saturate(h01 * 1.6));
        /* skylight reaching deep inside a cloud is occluded, so thin eroded edges stay brighter than the core */
        amb *= mix(1.0, exp(-od * 0.18), uAmbOcc);
        float Ts = exp(-sigE * dt);
        L += T * (uSunColor * sun + amb) * (1.0 - Ts) * 0.985;
        vec3 fd = pw - uFlashP.xyz; L += T * (1.0 - Ts) * uFlashC * exp(-dot(fd, fd) / (uFlashP.w * uFlashP.w));
        float Tn = T * Ts; dsum += (T - Tn) * t; wsum += T - Tn; T = Tn;
        if (T < 0.008) break;
      }
    }
    t += dt;
  }
  T = saturate((T - 0.008) / 0.992);
  float depth = wsum > 1e-4 ? dsum / wsum : t0 + min(seg, 6.0) * 0.5;
  float e = exp(-depth * uFogK);
  L = L * e + skyLookup(rd) * (1.0 - T) * (1.0 - e);
  oColor = vec4(L, T); oDepth = vec4(depth, 0.0, 0.0, 1.0);
}`;

const TAA_FS = HEAD + `
uniform sampler2D uCur, uCurDepth, uHist;
uniform vec3 uRight, uUp, uFwd; uniform vec2 uTan; uniform vec3 uPRight, uPUp, uPFwd; uniform vec2 uPTan;
uniform vec3 uCamDelta; uniform float uBlend; uniform int uReset; uniform vec2 uTexel;
out vec4 o;
void main(){
  vec4 cur = textureLod(uCur, vUv, 0.0);
  if (uReset == 1){ o = cur; return; }
  float dep = textureLod(uCurDepth, vUv, 0.0).r;
  vec3 rd = normalize(uFwd + (vUv.x * 2.0 - 1.0) * uTan.x * uRight + (vUv.y * 2.0 - 1.0) * uTan.y * uUp);
  vec3 p = rd * dep + uCamDelta; float w = dot(p, uPFwd);
  vec2 puv = vec2(dot(p, uPRight) / (w * uPTan.x), dot(p, uPUp) / (w * uPTan.y)) * 0.5 + 0.5;
  if (w <= 0.0 || any(lessThan(puv, vec2(0.0))) || any(greaterThan(puv, vec2(1.0)))){ o = cur; return; }
  vec4 hist = textureLod(uHist, puv, 0.0);
  vec4 mn = cur, mx = cur, m1 = vec4(0.0), m2 = vec4(0.0);
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++){
    vec4 s = textureLod(uCur, vUv + vec2(float(x), float(y)) * uTexel, 0.0);
    mn = min(mn, s); mx = max(mx, s); m1 += s; m2 += s * s;
  }
  m1 /= 9.0; m2 /= 9.0; vec4 sd = sqrt(max(m2 - m1 * m1, 0.0));
  vec4 lo = max(mn, m1 - sd * 1.6), hi = min(mx, m1 + sd * 1.6);
  hist = clamp(hist, lo - (hi - lo) * 0.15, hi + (hi - lo) * 0.15);
  o = mix(hist, cur, uBlend);
}`;

/* ---------- display transform used by every scene shader (grading + vignette happen in post) ---------- */
const DISPLAY = `
uniform float uExposure; uniform vec2 uRes;
vec3 aces(vec3 x){
  const mat3 I = mat3(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777);
  const mat3 O = mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602);
  x = I * x; vec3 a = x * (x + 0.0245786) - 0.000090537; vec3 b = x * (0.983729 * x + 0.4329510) + 0.238081;
  return clamp(O * (a / b), 0.0, 1.0);
}
vec3 srgbOut(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
vec3 toDisplay(vec3 c){
  c *= uExposure;
  c *= vec3(0.96, 1.0, 1.05);
  return srgbOut(aces(c)) + (fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) - 0.5) / 255.0;
}`;

/* ---------- scene helpers (vertex + fragment) ---------- */
const SCENE = TERRAIN_GLSL + `
uniform vec3 uCamM;
uniform vec3 uR, uU, uF; uniform vec2 uTanS; uniform vec2 uDepthAB;
uniform float uTime; uniform vec2 uWindDirG; uniform float uWindStr;
uniform sampler2D uCShadow; uniform vec3 uShadowP;
vec4 project(vec3 p){ vec3 v = vec3(dot(p, uR), dot(p, uU), dot(p, uF)); return vec4(v.x / uTanS.x, v.y / uTanS.y, v.z * uDepthAB.x + uDepthAB.y, v.z); }
/* travelling gust bands across the field: 0 calm .. 1 crest of a wave */
float windWave(vec2 w){
  vec2 d = uWindDirG, dp = vec2(-d.y, d.x);
  float along = dot(w, d), across = dot(w, dp);
  float warp = tn(vec2(along * (1.0 / 75.0), across * (1.0 / 170.0)) + vec2(0.2, 0.9));
  float mask = smoothstep(-0.45, 0.3, tn(w * (1.0 / 230.0) + vec2(0.5, 0.5)));
  float band = 0.5 + 0.5 * sin((along - uTime * 9.0) * (6.2831853 / 32.0) + warp * 3.2);
  band *= band * band;
  float rip = 0.5 + 0.5 * sin((along * 0.7 + across * 0.3 - uTime * 6.5) * (6.2831853 / 11.0) + warp * 2.0);
  return saturate(band * mask * 1.15 + rip * rip * 0.22 * mask);
}
uniform float uCShadowAmt;
float cshadow(vec2 wKm){ return mix(1.0, textureLod(uCShadow, (wKm - uShadowP.xy) / uShadowP.z + 0.5, 0.0).r, uCShadowAmt); }
/* top-down glow map: light from flowers, petals and fireflies splatted around the camera */
uniform sampler2D uGlowMap; uniform vec4 uGlowP4;
vec3 glowAt(vec2 w){
  if (uGlowP4.w <= 0.0) return vec3(0.0);
  vec2 uv = (w - uGlowP4.xy) / uGlowP4.z + 0.5;
  if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) return vec3(0.0);
  return textureLod(uGlowMap, uv, 0.0).rgb * uGlowP4.w;
}
/* touch map: 1 where the petal stream has passed (fading over minutes); w = 1 makes every flower count as awake */
uniform sampler2D uTouch; uniform vec4 uTouchP;
float touchLit(vec2 w){
  if (uTouchP.w > 0.5) return 1.0;
  vec2 uv = (w - uTouchP.xy) / uTouchP.z + 0.5;
  if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) return 0.0;
  return textureLod(uTouch, uv, 0.0).g;
}
uniform float uBloomAnim;
float bloomOpen(vec2 w){
  if (uBloomAnim < 0.5) return 1.0;
  vec2 uv = (w - uTouchP.xy) / uTouchP.z + 0.5;
  if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) return 0.0;
  float y = textureLod(uTouch, uv, 0.0).a - 1.0;
  return 1.0 + 2.70158 * y * y * y + 1.70158 * y * y;   /* easeOutBack: 0 -> 1 with a soft overshoot */
}
/* weather: wetness/puddles, lightning fill light, exponential height fog */
uniform float uWet, uRainNow, uSnowCov; uniform vec3 uFlashAmb; uniform vec4 uFogW; uniform vec3 uFogCol;
uniform sampler2D uPud; uniform vec3 uPudP; uniform float uPudTh;
const vec3 SNOW_ALB = vec3(0.86, 0.89, 0.93);
/* where rain pools (cf. Lagarde 2012): the dips of the terrain's own small octaves, a regional wet/dry pattern,
   and domain-warped multi-scale noise so puddles vary from tiny beads to small ponds with ragged shores */
float pudM(vec2 w){
  float hollow = -(tn(rot2(w, -0.6, 0.8) * (1.0 / 420.0) + vec2(0.19, 0.53)) * 0.55 + tn(rot2(w, 0.96, -0.28) * (1.0 / 150.0) + vec2(0.61, 0.83)) * 0.45);
  float region = tn(w * (1.0 / 190.0) + vec2(0.31, 0.47));
  vec2 wp = w + vec2(tn(w * (1.0 / 23.0) + vec2(0.7, 0.2)), tn(w * (1.0 / 23.0) + vec2(0.1, 0.9))) * 7.0;
  float shape = tn(wp * (1.0 / 15.0) + vec2(0.12, 0.77)) * 0.65 + tn(wp * (1.0 / 4.7) + vec2(0.5, 0.31)) * 0.25 + tn(wp * (1.0 / 1.6) + vec2(0.83, 0.17)) * 0.1;
  return hollow * 0.6 + shape * 0.55 + region * 0.4;
}
/* pooling field (map near the camera, analytic beyond); the water line is a threshold that sinks as the ground gets wetter */
float puddleM(vec2 w){
  vec2 uv = (w - uPudP.xy) / uPudP.z + 0.5;
  return (all(greaterThan(uv, vec2(0.01))) && all(lessThan(uv, vec2(0.99)))) ? textureLod(uPud, uv, 0.0).r : pudM(w);
}
float puddleTh(){ return uPudTh; }
float puddleMask(vec2 w){
  if (uWet <= 0.02 || uSnowCov > 0.98) return 0.0;
  float th = puddleTh();
  return smoothstep(th, th + 0.14, puddleM(w)) * (1.0 - uSnowCov);
}
float wxFogF(vec3 rel){
  if (uFogW.x <= 0.0) return 0.0;
  float d = length(rel), k = 1.0 / uFogW.y, dy = rel.y;
  float hf = exp(-k * uFogW.z) * (abs(dy * k) > 1e-3 ? (1.0 - exp(-k * dy)) / (k * dy) : 1.0);
  return 1.0 - exp(-uFogW.x * d * hf);
}
vec3 wxFog(vec3 c, vec3 rel){ return mix(c, uFogCol, wxFogF(rel)); }
vec4 hash42(vec2 p){ vec4 p4 = fract(vec4(p.xyxy) * vec4(0.1031, 0.1030, 0.0973, 0.1099)); p4 += dot(p4, p4.wzxy + 33.33); return fract((p4.xxyz + p4.yzzw) * p4.zywx); }
const vec3 G_BASE = vec3(0.05, 0.13, 0.02);
vec3 grassTip(float p1, float p2){
  vec3 tip = mix(vec3(0.32, 0.64, 0.08), vec3(0.50, 0.70, 0.10), smoothstep(0.15, 0.7, p1));
  tip = mix(tip, vec3(0.10, 0.44, 0.13), smoothstep(0.1, 0.6, -p1) * 0.75);
  return tip * (0.88 + 0.22 * p2);
}
vec3 grassAlbedo(float p1, float p2, float t){ return mix(G_BASE, grassTip(p1, p2), pow(saturate(t), 0.65)); }
vec3 waveSheen(vec3 alb, float wave){ return mix(alb, alb * 1.4 + vec3(0.025, 0.05, 0.02), wave * 0.6 * uWindStr); }
const vec3 PAL[5] = vec3[5](vec3(0.85, 0.05, 0.07), vec3(0.94, 0.92, 0.88), vec3(1.0, 0.66, 0.05), vec3(0.95, 0.36, 0.58), vec3(0.46, 0.26, 0.88));
vec3 paletteAt(float k){ return PAL[int(clamp(floor(k * 5.0), 0.0, 4.0))]; }
`;
const SCENE_FS = SCENE + DISPLAY + `
uniform vec3 uSunGround; uniform vec3 uSkyIrr; uniform float uFogKG;
vec3 litGrass(vec3 alb, vec3 n, vec3 V, float t, float sh, float ao){
  alb *= 1.0 - 0.3 * uWet;
  float ndl = dot(n, uSunDir);
  vec3 sun = uSunGround * sh;
  vec3 c = alb / PI * (sun * saturate(ndl * 0.6 + 0.4) * mix(0.45, 1.0, ao) + uSkyIrr * ao);
  float back = pow(saturate(dot(-V, uSunDir)), 3.0);
  c += alb * vec3(1.2, 1.25, 0.45) * sun * (back * 1.5 + saturate(-ndl) * 0.25) * (0.25 + 0.75 * t) / PI;
  float rim = pow(1.0 - abs(dot(n, V)), 3.0);
  c += alb * vec3(1.1, 1.15, 0.6) * sun * rim * (0.08 + 0.35 * back) * t / PI;
  vec3 H = normalize(uSunDir + V);
  c += sun * pow(saturate(dot(n, H)), 28.0) * 0.05 * t;
  c += sun * pow(saturate(dot(n, H)), 90.0) * 0.4 * uWet * t;
  c += alb / PI * uFlashAmb * (0.5 + 0.5 * n.y);
  return c;
}
vec3 litPetal(vec3 alb, vec3 n, vec3 V, float sh){
  float ndl = dot(n, uSunDir);
  vec3 sun = uSunGround * sh;
  vec3 c = alb / PI * (sun * saturate(ndl * 0.7 + 0.3) + uSkyIrr * 0.9);
  c += alb * sun * (pow(saturate(dot(-V, uSunDir)), 3.0) * 0.6 + saturate(-ndl) * 0.25) / PI;
  c += alb / PI * uFlashAmb * 0.8;
  return c;
}
vec3 applyFog(vec3 c, vec3 rel){
  float d = length(rel); vec3 rd = rel / d;
  vec3 haze = skyLookup(normalize(vec3(rd.x, max(rd.y, 0.0) + 0.012, rd.z)));
  float e = exp(-d * 0.001 * uFogKG);
  return wxFog(c * e + haze * (1.0 - e), rel);
}
/* raindrop rings on puddles: expanding ripples in two jittered cell layers */
vec2 rippleN(vec2 w, float t){
  vec2 nn = vec2(0.0);
  for (int k = 0; k < 2; k++){
    float sc = k == 0 ? 2.0 : 3.3;
    vec2 g = w * sc + float(k) * 7.31;
    vec2 id = floor(g), f = fract(g) - 0.5;
    vec4 h = hash42(mod(id, 4096.0) + float(k) * 13.7);
    float ph = fract(t * (0.8 + 0.5 * h.x) + h.y);
    vec2 d = f - (h.zw - 0.5) * 0.4; float r = length(d) + 1e-4, rr = r - ph * 0.42;
    nn += d / r * sin(rr * 55.0) * exp(-rr * rr * 300.0) * (1.0 - ph) * 0.35;
  }
  return nn;
}
float petalMask(vec2 uv){
  float half_ = 0.5 * pow(sin(PI * pow(saturate(uv.y), 0.72)), 0.75);
  float d = abs(uv.x) - half_; float aa = fwidth(uv.x) * 1.3 + 1e-4;
  return 1.0 - smoothstep(-aa, aa, d);
}
`;

const VPRE = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
#define PI 3.14159265359
float saturate(float x){ return clamp(x, 0.0, 1.0); }
`;

/* ---------- terrain: polar grid around the camera, shaded as a grass canopy ---------- */
const TERRAIN_VS = VPRE + SCENE + `
uniform float uNA, uNR; uniform vec2 uRadAB;
out vec3 vRel; out vec3 vN; out vec2 vW;
void main(){
  int na = int(uNA + 0.5) + 1;
  int ring = gl_VertexID / na; int seg = gl_VertexID - ring * na;
  float t = float(ring) / uNR; float ex = exp(uRadAB.y * t);
  float r = uRadAB.x * (ex - 1.0);
  float ang = float(seg) / uNA * 6.28318530718;
  vec2 rel = vec2(cos(ang), sin(ang)) * r;
  float sp = max(uRadAB.x * uRadAB.y * ex / uNR, r * 6.2832 / uNA);
  vec2 w = uCamM.xz + rel;
  float h = terrainH(w, sp);
  float e = max(sp * 0.5, 0.25);
  vN = normalize(vec3(h - terrainH(w + vec2(e, 0.0), sp), e, h - terrainH(w + vec2(0.0, e), sp)));
  vec3 p = vec3(rel.x, h - uCamM.y, rel.y);
  vRel = p; vW = w;
  gl_Position = project(p);
}`;
const TERRAIN_FS = PRE + COMMON + SCENE_FS + `
in vec3 vRel; in vec3 vN; in vec2 vW;
uniform float uNearR, uPixAng, uCloudOver; uniform vec2 uShellR;
uniform sampler2D uCloud, uCloudDepth;
out vec4 o;
void main(){
  float dist = length(vRel); vec3 V = -vRel / dist;
  vec3 n = normalize(vN);
  float p1 = tn(vW * (1.0 / 310.0) + vec2(0.37, 0.11)), p2 = tn(vW * (1.0 / 85.0) + vec2(0.71, 0.43));
  vec3 tip = grassTip(p1, p2);
  /* seen at a grazing angle a meadow shows its tips; from above more of the darker stems */
  float graze = 1.0 - saturate(dot(V, n));
  vec3 alb = mix(mix(G_BASE, tip, 0.45), tip * 0.78, graze * graze);
  /* blade-scale streaks and clumps, faded out once smaller than a pixel */
  float fp = dist * uPixAng;
  vec2 wd = uWindDirG; vec2 lw = vec2(dot(vW, wd), dot(vW, vec2(-wd.y, wd.x)));
  float streak = tn(lw * vec2(1.0 / 2.2, 1.0 / 9.0) + vec2(0.3, 0.1)) * (1.0 - smoothstep(0.25, 1.0, fp));
  float clump = tn(vW * (1.0 / 7.0) + vec2(0.6, 0.2)) * (1.0 - smoothstep(1.0, 4.0, fp));
  float tuft = tn(vW * (1.0 / 26.0) + vec2(0.9, 0.4)) * (1.0 - smoothstep(4.0, 14.0, fp));
  alb *= 1.0 + 0.16 * streak + 0.18 * clump + 0.14 * tuft;
  alb = waveSheen(alb, windWave(vW));
  float under = 1.0 - smoothstep(uNearR * 0.35, uNearR * 0.95, dist);
  float canopy = smoothstep(uShellR.y * 0.55, uShellR.y * 0.95, dist);
  alb *= mix(mix(0.6, 0.45, under), 0.84, canopy);
  alb = mix(alb, SNOW_ALB, smoothstep(0.02, 0.4, uSnowCov) * mix(0.6, 1.0, smoothstep(0.55, 0.85, n.y)));
  vec3 N = normalize(mix(n, vec3(0.0, 1.0, 0.0), 0.25));
  /* ahead of the water line the soil just darkens, so puddles grow out of damp patches rather than appearing */
  if (uWet > 0.02){ float pth = puddleTh(); alb *= 1.0 - 0.35 * smoothstep(pth - 0.35, pth, puddleM(vW)) * (1.0 - uSnowCov); }
  vec3 c = litGrass(alb, N, V, mix(0.42, 0.4, under), cshadow(vW * 0.001), mix(0.9, 0.6, under));
  /* puddles: Fresnel mirror of the sky and the cloud buffer (projected reflected ray), rain ripples on top */
  float pm = puddleMask(vW) * smoothstep(0.8, 0.95, n.y);
  if (pm > 0.001){
    vec2 rp = rippleN(vW, uTime) * uRainNow;
    vec3 Nw = normalize(vec3(rp.x, 1.0, rp.y));
    vec3 Rr = reflect(-V, Nw);
    vec3 refl = skyLookup(normalize(vec3(Rr.x, max(Rr.y, 0.01), Rr.z)));
    float rw = dot(Rr, uF);
    if (rw > 0.0){
      vec2 ruv = vec2(dot(Rr, uR) / (rw * uTanS.x), dot(Rr, uU) / (rw * uTanS.y)) * 0.5 + 0.5;
      if (all(greaterThan(ruv, vec2(0.0))) && all(lessThan(ruv, vec2(1.0)))){ vec4 rc = texture(uCloud, ruv); refl = refl * rc.a + rc.rgb; }
    }
    refl = mix(refl, uFogCol * 1.1, max(0.75 * uRainNow, saturate(uFogW.x * 300.0)));
    refl += uSunGround * pow(saturate(dot(Rr, uSunDir)), 600.0) * 3.0 * (1.0 - uRainNow) + uFlashAmb * 0.12;
    float fres = 0.02 + 0.98 * pow(1.0 - saturate(dot(Nw, V)), 5.0);
    vec3 bed = alb * 0.3 / PI * (uSkyIrr + uSunGround * max(uSunDir.y, 0.0));
    c = mix(c, mix(bed, refl, max(fres, 0.3)), pm);
  }
  if (uSnowCov > 0.1){   /* sparse sun glints on the snow crust */
    vec4 sg = hash42(mod(floor(vW * 24.0), 4096.0));
    c += uSunGround * step(0.985, sg.x) * pow(saturate(dot(reflect(-V, n), uSunDir)), 20.0) * 1.5 * smoothstep(0.1, 0.5, uSnowCov) * (1.0 - smoothstep(30.0, 80.0, dist));
  }
  c += alb * glowAt(vW) * 0.65;
  c = applyFog(c, vRel);
  if (uCloudOver > 0.5){
    vec2 suv = gl_FragCoord.xy / uRes;
    vec4 cl = texture(uCloud, suv);
    if (texture(uCloudDepth, suv).r < dist * 0.001) c = c * cl.a + cl.rgb;
  }
  o = vec4(toDisplay(c), 1.0);
}`;

/* ---------- grass blades: one shader, three LOD layers, drawn per visible tile ---------- */
const GRASS_VS = VPRE + SCENE + `
uniform float uTileN, uCell; uniform vec2 uTile, uGridBase, uGridOrig;
uniform vec3 uLayerR; uniform float uWidthMul, uFarLayer; uniform int uSegs;
uniform vec4 uPush[6];
out float vT; out vec3 vN; out vec3 vRel; out vec3 vAlb; out float vSh; out vec3 vGlow;
void cull(){ gl_Position = vec4(0.0, 0.0, -2.0, 1.0); vT = 0.0; vN = vec3(0.0, 1.0, 0.0); vRel = vec3(1.0); vAlb = vec3(0.0); vSh = 1.0; vGlow = vec3(0.0); }
void main(){
  float fi = float(gl_InstanceID);
  float lz = floor((fi + 0.5) / uTileN); float lx = fi - lz * uTileN;
  vec2 ij = uTile + vec2(lx, lz);
  vec2 cellW = mod(uGridBase + ij, 4096.0);
  vec4 h = hash42(cellW), h2 = hash42(cellW + 71.37);
  vec2 rel = uGridOrig + (ij + h.xy) * uCell;
  float d = length(rel);
  float keep = smoothstep(uLayerR.x, uLayerR.y, d) * (1.0 - smoothstep(uLayerR.z * 0.78, uLayerR.z, d));
  if (h2.x >= keep){ cull(); return; }
  vec2 w = uCamM.xz + rel;
  float pmG = puddleMask(w);
  if (pmG > 0.97){ cull(); return; }
  float gy = terrainH(w, 0.0) - uCamM.y;
  vec3 c0 = vec3(rel.x, gy + 0.4, rel.y);
  float vz = dot(c0, uF), m = 0.9 + uCell * 2.0;
  if (vz < -m || abs(dot(c0, uR)) > vz * uTanS.x + m || abs(dot(c0, uU)) > vz * uTanS.y + m){ cull(); return; }
  float p1 = tn(w * (1.0 / 310.0) + vec2(0.37, 0.11));
  float H = mix(0.45, 0.92, h.z) * (0.86 + 0.3 * tn(w * (1.0 / 120.0) + vec2(0.23, 0.61)));
  H *= 1.0 - 0.85 * smoothstep(0.15, 0.97, pmG);   /* submerged: only the tips stand out of the water */
  if (H < 0.55 * uSnowCov * 0.85){ cull(); return; }
  float Wd = mix(0.026, 0.046, h.w) * uWidthMul;
  float face = h2.y * 6.2831853; vec2 fdir = vec2(cos(face), sin(face)); vec2 sideV = vec2(-fdir.y, fdir.x);
  float wave = windWave(w);
  float flutter = sin(uTime * (2.2 + h2.z) + h.x * 6.28 + dot(w, uWindDirG) * 0.4);
  vec2 bend = uWindDirG * uWindStr * (0.1 + 1.25 * wave) + uWindDirG * flutter * 0.09 * uWindStr + (h2.zw - 0.5) * 0.38;
  /* the petal stream combs the grass apart as it passes low over it */
  for (int i = 0; i < 6; i++){
    vec2 dv = rel - uPush[i].xy; float d2 = dot(dv, dv);
    bend += dv * inversesqrt(d2 + 0.02) * uPush[i].w * exp(-d2 / (uPush[i].z * uPush[i].z));
  }
  int v = gl_VertexID; int seg = v / 2; float side = float(v - seg * 2);
  if (v >= 2 * uSegs){ seg = uSegs; side = 0.5; }
  float t = float(seg) / float(uSegs);
  float b2 = min(dot(bend, bend), 1.6);
  vec2 off = bend * H * t * t;
  float y = H * t * (1.0 - 0.34 * b2 * t);
  vec2 xz = rel + off + sideV * (side - 0.5) * Wd * (1.0 - pow(t, 1.5));
  vec3 p = vec3(xz.x, gy + y, xz.y);
  vec3 tang = normalize(vec3(bend.x * 2.0 * H * t, H * (1.0 - 0.68 * b2 * t), bend.y * 2.0 * H * t));
  vec3 sv3 = vec3(sideV.x, 0.0, sideV.y);
  vN = normalize(normalize(cross(sv3, tang)) + sv3 * (side - 0.5) * 1.4);
  vT = t; vRel = p;
  vAlb = waveSheen(grassAlbedo(p1, (h.w - 0.5) * 1.2, t), wave * t);
  /* far LODs: shade toward the canopy colour the terrain shows, fully converged where they thin out, so nothing pops */
  float gz = 1.0 - saturate(abs(normalize(p).y));
  vec3 can = waveSheen(grassTip(p1, tn(w * (1.0 / 85.0) + vec2(0.71, 0.43))), wave) * mix(0.8, 0.95, gz);
  float conv = uFarLayer * (0.5 + 0.5 * smoothstep(uLayerR.z * 0.4, uLayerR.z, d));
  vAlb = mix(vAlb, can * mix(0.9, 1.1, t), conv);
  /* snow: the buried part of the blade reads white, tips get a light dusting; short blades vanish under deep snow */
  float sDepth = 0.55 * uSnowCov;
  float lumA = dot(vAlb, vec3(0.2126, 0.7152, 0.0722));
  vAlb = mix(vAlb, vec3(lumA) * vec3(0.92, 0.98, 1.0), 0.45 * uSnowCov);          /* cold, desaturated grass */
  vAlb = mix(vAlb, SNOW_ALB, uSnowCov * max(1.0 - smoothstep(sDepth / H - 0.1, sDepth / H + 0.05, t), 0.45 * smoothstep(0.55, 1.0, t)));
  vAlb = mix(vAlb, SNOW_ALB, 0.18 * uSnowCov);                                       /* frost over the whole blade */
  vSh = cshadow(w * 0.001);
  vGlow = glowAt(w) * (0.5 + 0.5 * t);
  gl_Position = project(p);
}`;
const GRASS_FS = PRE + COMMON + SCENE_FS + `
in float vT; in vec3 vN; in vec3 vRel; in vec3 vAlb; in float vSh; in vec3 vGlow;
uniform float uFarLayer;
out vec4 o;
void main(){
  vec3 V = -normalize(vRel); vec3 n = normalize(vN);
  if (dot(n, V) < 0.0) n = -n;
  vec3 c = litGrass(vAlb, n, V, vT, vSh, mix(mix(0.45, 1.0, smoothstep(0.0, 0.75, vT)), 0.95, uFarLayer));
  c += vAlb * vGlow * 0.85;
  o = vec4(toDisplay(applyFog(c, vRel)), 1.0);
}`;

const FLOWER_VS = VPRE + SCENE + `
uniform float uFGrid, uFCell; uniform vec2 uFBase, uFOrig;
out vec2 vUv; out vec3 vN; out vec3 vRel; out vec3 vAlb; out float vSh; out float vKind; out float vEmit; out float vGlowN;
const int NP = 6;
void cull(){ gl_Position = vec4(0.0, 0.0, -2.0, 1.0); vUv = vec2(0.0); vN = vec3(0.0, 1.0, 0.0); vRel = vec3(1.0); vAlb = vec3(0.0); vSh = 1.0; vKind = 0.0; vEmit = 0.0; vGlowN = 0.0; }
vec2 corner(int i){ i = i - (i / 6) * 6; return i == 0 ? vec2(-0.5, 0.0) : i == 1 ? vec2(0.5, 0.0) : i == 2 ? vec2(0.5, 1.0) : i == 3 ? vec2(-0.5, 0.0) : i == 4 ? vec2(0.5, 1.0) : vec2(-0.5, 1.0); }
void main(){
  float fi = float(gl_InstanceID);
  float iz = floor((fi + 0.5) / uFGrid); float ix = fi - iz * uFGrid;
  vec2 cellW = mod(uFBase + vec2(ix, iz), 4096.0);
  vec4 h = hash42(cellW * 1.37 + 11.1), h2 = hash42(cellW + 53.7);
  vec2 rel = uFOrig + (vec2(ix, iz) + 0.15 + h.xy * 0.7) * uFCell;
  float d = length(rel);
  vec2 w = uCamM.xz + rel;
  float R = uFGrid * uFCell * 0.5;
  float dens = (smoothstep(-0.15, 0.3, tn(w * (1.0 / 48.0) + vec2(0.83, 0.27))) * 0.85 + 0.05) * (1.0 - smoothstep(R * 0.75, R, d));
  if (h.z >= dens * (1.0 - smoothstep(0.45, 0.85, uSnowCov)) || puddleMask(w) > 0.8){ cull(); return; }
  float gy = terrainH(w, 0.0) - uCamM.y;
  vec3 c0 = vec3(rel.x, gy + 0.8, rel.y);
  float vz = dot(c0, uF), m = 1.2;
  if (vz < -m || abs(dot(c0, uR)) > vz * uTanS.x + m || abs(dot(c0, uU)) > vz * uTanS.y + m){ cull(); return; }
  float lit = touchLit(w), op = bloomOpen(w), opc = saturate(op);
  float stemH = mix(0.74, 1.08, h.w);
  float wave = windWave(w);
  float flutter = sin(uTime * (2.2 + h2.z) + h.x * 6.28 + dot(w, uWindDirG) * 0.4);
  vec2 bend = uWindDirG * uWindStr * (0.08 + 0.7 * wave) + uWindDirG * flutter * 0.07 * uWindStr + (h2.xy - 0.5) * 0.25;
  vec3 root = vec3(rel.x, gy, rel.y);
  vec3 head = root + vec3(bend.x * stemH, stemH * (1.0 - 0.3 * min(dot(bend, bend), 1.0)), bend.y * stemH);
  vec3 hn = normalize(vec3(bend.x * 1.3 + (h2.x - 0.5) * 0.7, 1.0, bend.y * 1.3 + (h2.y - 0.5) * 0.7));
  vec3 tx = normalize(cross(hn, vec3(0.0, 0.0, 1.0))); vec3 ty = cross(hn, tx);
  float kind = tn(w * (1.0 / 160.0) + vec2(0.05, 0.55)) * 0.55 + 0.5 + (h2.w - 0.5) * 0.3;
  vec3 col = paletteAt(saturate(kind)) * mix(0.8, 1.1, h2.z);
  col = mix(mix(col, vec3(dot(col, vec3(0.2126, 0.7152, 0.0722))), 0.35 * uSnowCov), SNOW_ALB, 0.3 * uSnowCov);
  int v = gl_VertexID; vec2 q = corner(v); vec3 p;
  if (v < 6){
    vec3 sideB = normalize(vec3(-root.z, 0.0, root.x) + 1e-4);
    p = mix(root, head, q.y) + sideB * q.x * 0.011;
    vN = normalize(cross(sideB, head - root)); vAlb = vec3(0.06, 0.18, 0.03); vKind = 0.0; vUv = q; vGlowN = 0.0;
  } else if (v < 6 + 6 * NP){
    int k = (v - 6) / 6;
    float a = float(k) * 6.2831853 / float(NP) + h.x * 6.2831853;
    vec3 dir = cos(a) * tx + sin(a) * ty; vec3 ex = cross(hn, dir);
    /* bud: petals folded up into a narrow cone; open: spread out and cupped (op overshoots a little past 1) */
    float PL = mix(0.07, 0.11, h2.z) * mix(0.72, 1.0, opc);
    float phi = mix(1.35, 0.22, op);
    vec3 axis = dir * cos(phi) + hn * sin(phi);
    p = head + dir * 0.006 * opc + axis * (q.y * PL) + hn * (q.y * q.y * PL * 0.4 * opc) + ex * q.x * PL * mix(0.5, 0.85, opc);
    vN = normalize(mix(dir + hn * 0.2, hn - dir * q.y * 0.5, opc)); vAlb = mix(col * vec3(0.62, 0.75, 0.55), col, opc); vKind = 1.0; vUv = q; vGlowN = lit;
  } else {
    p = head + hn * 0.008 + (tx * q.x + ty * (q.y - 0.5)) * 0.04 * opc;
    vN = hn; vAlb = mix(vec3(0.78, 0.48, 0.02), vec3(0.12, 0.06, 0.02), step(0.5, fract(kind * 7.0))); vKind = 2.0; vUv = vec2(q.x, q.y - 0.5); vGlowN = 0.7 * lit;
  }
  vRel = p; vSh = cshadow(w * 0.001); vEmit = 0.0;
  gl_Position = project(p);
}`;
const PETAL_VS = VPRE + SCENE + `
uniform float uPBox;
out vec2 vUv; out vec3 vN; out vec3 vRel; out vec3 vAlb; out float vSh; out float vKind; out float vEmit; out float vGlowN;
vec2 corner(int i){ return i == 0 ? vec2(-0.5, 0.0) : i == 1 ? vec2(0.5, 0.0) : i == 2 ? vec2(0.5, 1.0) : i == 3 ? vec2(-0.5, 0.0) : i == 4 ? vec2(0.5, 1.0) : vec2(-0.5, 1.0); }
void main(){
  float id = float(gl_InstanceID);
  vec4 h = hash42(vec2(id * 1.731, 17.17)), h2 = hash42(vec2(id * 0.917 + 5.3, 3.1));
  float spd = (1.6 + 2.6 * h.w) * (0.35 + uWindStr);
  vec2 wp = (h.xy - 0.5) * uPBox + uWindDirG * uTime * spd + vec2(sin(uTime * 0.5 + h2.x * 30.0), cos(uTime * 0.43 + h2.y * 30.0)) * 3.0;
  vec2 rel = mod(wp - uCamM.xz + 0.5 * uPBox, uPBox) - 0.5 * uPBox;
  float edge = min(0.5 * uPBox - abs(rel.x), 0.5 * uPBox - abs(rel.y));
  float fade = smoothstep(0.0, 6.0, edge);
  vec2 w = uCamM.xz + rel;
  float y = terrainH(w, 0.0) - uCamM.y + 0.5 + h.z * h.z * 4.5 + sin(uTime * (0.9 + h2.z) + h2.w * 20.0) * 0.5;
  vec3 c = vec3(rel.x, y, rel.y);
  float a1 = uTime * (1.2 + 2.2 * h2.x) + h.x * 30.0, a2 = uTime * (0.8 + 1.6 * h2.y) + h.y * 30.0;
  vec3 ax = vec3(cos(a1), sin(a1) * cos(a2), sin(a1) * sin(a2));
  vec3 ay = normalize(cross(ax, abs(ax.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
  float a3 = a2 * 1.3; ay = ay * cos(a3) + cross(ax, ay) * sin(a3);
  vec2 q = corner(gl_VertexID);
  float L = mix(0.035, 0.06, h2.z) * fade;
  vec3 p = c + ax * (q.y - 0.4) * L + ay * q.x * L * 0.8;
  vUv = q; vN = cross(ax, ay); vRel = p; vKind = 1.0; vEmit = 0.0; vGlowN = 0.8;
  vAlb = paletteAt(h2.w) * 1.05; vSh = cshadow(w * 0.001);
  gl_Position = project(p);
}`;
/* the stream of petals that leads the camera, like the swarm the wind carries in Flower */
const STREAM_VS = VPRE + SCENE + `
uniform vec4 uTrail[40]; uniform float uStreamScale;
out vec2 vUv; out vec3 vN; out vec3 vRel; out vec3 vAlb; out float vSh; out float vKind; out float vEmit; out float vGlowN;
vec2 corner(int i){ return i == 0 ? vec2(-0.5, 0.0) : i == 1 ? vec2(0.5, 0.0) : i == 2 ? vec2(0.5, 1.0) : i == 3 ? vec2(-0.5, 0.0) : i == 4 ? vec2(0.5, 1.0) : vec2(-0.5, 1.0); }
void main(){
  vec4 tr = uTrail[gl_InstanceID];
  float fk = tr.w;
  vec4 h = hash42(vec2(fk * 1.37 + 3.1, 9.7)), h2 = hash42(vec2(fk * 0.71 + 1.9, 4.3));
  float a1 = uTime * (1.6 + 2.0 * h2.x) + h.x * 30.0, a2 = uTime * (1.1 + 1.4 * h2.y) + h.y * 30.0;
  vec3 ax = vec3(cos(a1), sin(a1) * cos(a2), sin(a1) * sin(a2));
  vec3 ay = normalize(cross(ax, abs(ax.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
  float a3 = a2 * 1.3; ay = ay * cos(a3) + cross(ax, ay) * sin(a3);
  vec2 q = corner(gl_VertexID);
  float L = mix(0.08, 0.12, h2.z) * uStreamScale;
  vec3 p = tr.xyz + ax * (q.y - 0.4) * L + ay * q.x * L * 0.8;
  vUv = q; vN = cross(ax, ay); vRel = p; vKind = 1.0; vEmit = 0.35; vGlowN = 1.0;
  vAlb = paletteAt(fract(fk * 0.618 + 0.13)) * 1.05; vSh = 1.0;
  gl_Position = project(p);
}`;
const PETAL_FS = PRE + COMMON + SCENE_FS + `
in vec2 vUv; in vec3 vN; in vec3 vRel; in vec3 vAlb; in float vSh; in float vKind; in float vEmit; in float vGlowN;
uniform float uNightGlow;
out vec4 o;
void main(){
  float a = 1.0; vec3 alb = vAlb;
  if (vKind > 1.5){ float r = length(vUv); float aa = fwidth(r) * 1.3 + 1e-4; a = 1.0 - smoothstep(0.45 - aa, 0.45 + aa, r); }
  else if (vKind > 0.5){ a = petalMask(vUv); alb *= mix(0.55, 1.12, smoothstep(0.0, 0.75, vUv.y)); }
  if (a < 0.02) discard;
  vec3 V = -normalize(vRel); vec3 n = normalize(vN); if (dot(n, V) < 0.0) n = -n;
  vec3 c = vKind < 0.5 ? litGrass(alb, n, V, 0.6, vSh, 0.7) : litPetal(alb, n, V, vSh);
  vec3 ea = max(mix(vec3(dot(alb, vec3(0.2126, 0.7152, 0.0722))), alb, 1.45), 0.0);
  c += alb * vEmit * dot(uSkyIrr, vec3(0.2126, 0.7152, 0.0722)) * 0.6 + ea * vGlowN * uNightGlow * 2.1;
  o = vec4(toDisplay(applyFog(c, vRel)), a);
}`;

const SKYPASS_FS = HEAD + COMMON + DISPLAY + `
uniform sampler2D uCloud; uniform vec2 uCloudSize;
uniform vec3 uRight, uUp, uFwd; uniform vec2 uTan;
uniform vec3 uSunTrue, uMoonDir, uSunDisk, uMoonDisk;
uniform vec3 uPole, uSouthEq, uWestEq; uniform float uSidereal, uStarI, uPixAngS, uTimeS;
uniform vec4 uFogW; uniform vec3 uFogCol, uFlashSky, uFlashDir;
out vec4 o;
vec4 catmullRom(sampler2D tex, vec2 uv, vec2 size){
  vec2 sp = uv * size; vec2 t1 = floor(sp - 0.5) + 0.5; vec2 fr = sp - t1;
  vec2 w0 = fr * (-0.5 + fr * (1.0 - 0.5 * fr)), w1 = 1.0 + fr * fr * (-2.5 + 1.5 * fr);
  vec2 w2 = fr * (0.5 + fr * (2.0 - 1.5 * fr)), w3 = fr * fr * (-0.5 + 0.5 * fr);
  vec2 w12 = w1 + w2; vec2 t12 = (t1 + w2 / w12) / size; vec2 t0 = (t1 - 1.0) / size; vec2 t3 = (t1 + 2.0) / size;
  return textureLod(tex, vec2(t0.x, t0.y), 0.0) * w0.x * w0.y + textureLod(tex, vec2(t12.x, t0.y), 0.0) * w12.x * w0.y + textureLod(tex, vec2(t3.x, t0.y), 0.0) * w3.x * w0.y
       + textureLod(tex, vec2(t0.x, t12.y), 0.0) * w0.x * w12.y + textureLod(tex, vec2(t12.x, t12.y), 0.0) * w12.x * w12.y + textureLod(tex, vec2(t3.x, t12.y), 0.0) * w3.x * w12.y
       + textureLod(tex, vec2(t0.x, t3.y), 0.0) * w0.x * w3.y + textureLod(tex, vec2(t12.x, t3.y), 0.0) * w12.x * w3.y + textureLod(tex, vec2(t3.x, t3.y), 0.0) * w3.x * w3.y;
}
vec4 hashS(vec2 p){ vec4 p4 = fract(vec4(p.xyxy) * vec4(0.1031, 0.1030, 0.0973, 0.1099)); p4 += dot(p4, p4.wzxy + 33.33); return fract((p4.xxyz + p4.yzzw) * p4.zywx); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hashS(i).x, hashS(i + vec2(1.0, 0.0)).x, f.x), mix(hashS(i + vec2(0.0, 1.0)).x, hashS(i + vec2(1.0, 1.0)).x, f.x), f.y);
}
/* stars fixed on the celestial sphere, turning about the pole with sidereal time */
vec3 starField(vec3 rd){
  float sd = dot(rd, uPole);
  float dec = asin(clamp(sd, -1.0, 1.0));
  vec3 e = rd - uPole * sd; float el = length(e);
  if (el < 1e-4) return vec3(0.0);
  e /= el;
  float ra = uSidereal - atan(dot(e, uWestEq), dot(e, uSouthEq));
  float raU = fract(ra / 6.2831853);
  const float CELL = 0.0085;
  float dC = floor(dec / CELL), dcen = (dC + 0.5) * CELL;
  float nRa = max(1.0, floor(6.2831853 * cos(dcen) / CELL));
  float rC = floor(raU * nRa);
  vec4 hs = hashS(vec2(rC, dC + 500.0));
  vec3 c = vec3(0.0);
  if (false){
    float sRa = (rC + 0.2 + 0.6 * hs.x) / nRa, sDec = (dC + 0.2 + 0.6 * hs.y) * CELL;
    float dRa = fract(raU - sRa + 0.5) - 0.5;
    vec2 dv = vec2(dRa * 6.2831853 * cos(dec), dec - sDec);
    float rad = max(uPixAngS * 0.9, 0.0005);
    float g = exp(-dot(dv, dv) / (rad * rad));
    float tw = 0.7 + 0.3 * sin(uTimeS * (2.0 + 6.0 * hs.x) + hs.y * 50.0);
    c = mix(vec3(1.0, 0.8, 0.62), vec3(0.72, 0.84, 1.0), hs.x) * g * (0.05 + pow(hs.w, 7.0) * 4.0) * tw;
  }
  vec3 cd = vec3(cos(dec) * cos(ra), sin(dec), cos(dec) * sin(ra));
  float band = dot(cd, vec3(-0.8677, 0.4560, -0.1981));  /* galactic north pole, J2000 */
  float mw = exp(-band * band / 0.03) * (0.35 + 0.65 * vnoise(vec2(ra * 6.0, dec * 9.0)) * vnoise(vec2(ra * 17.0, dec * 23.0) + 3.0));
  c += vec3(0.78, 0.82, 1.0) * mw * (0.05 + 0.12 * exp((dot(cd, vec3(-0.0549, -0.4838, -0.8734)) - 1.0) * 2.5));  /* brighter toward the galactic centre */
  return c * uStarI * exp(-0.22 / max(rd.y, 0.035));
}
/* moon: lit by the true sun direction, so the phase and terminator come out right */
vec3 moonDiskCol(vec3 rd){
  const float MR = 0.0115;
  if (dot(rd, uMoonDir) < cos(MR * 1.08)) return vec3(0.0);
  vec3 mR = normalize(cross(vec3(0.0, 1.0, 0.0), uMoonDir) + vec3(1e-5, 0.0, 0.0)); vec3 mU = cross(uMoonDir, mR);
  vec2 q = vec2(dot(rd, mR), dot(rd, mU)) / MR;
  float r = length(q), aa = uPixAngS / MR * 1.2;
  float edge = 1.0 - smoothstep(1.0 - aa, 1.0 + aa, r);
  if (edge <= 0.0) return vec3(0.0);
  vec3 n = mR * q.x + mU * q.y - uMoonDir * sqrt(max(1.0 - r * r, 0.0));
  float lit = smoothstep(-0.04, 0.12, dot(n, uSunTrue));
  float maria = vnoise(q * 2.3 + 4.1) * 0.6 + vnoise(q * 5.1 + 1.7) * 0.4;
  /* the disk is capped at 'very bright' so cloud transmittance can hide it; earthshine stays a faint ash-grey */
  float ml = dot(uMoonDisk, vec3(0.2126, 0.7152, 0.0722));
  vec3 mc = uMoonDisk * (min(ml, 4.0) / max(ml, 1e-6));
  return mc * (lit * mix(1.0, 0.62, smoothstep(0.45, 0.75, maria)) + 0.012) * edge;
}
void main(){
  vec3 rd = normalize(uFwd + (vUv.x * 2.0 - 1.0) * uTan.x * uRight + (vUv.y * 2.0 - 1.0) * uTan.y * uUp);
  vec3 col;
  if (rd.y < 0.0) col = skyLookup(normalize(vec3(rd.x, 0.012, rd.z)));
  else {
    col = skyLookup(rd) + starField(rd) + moonDiskCol(rd);
    float cs = dot(rd, uSunTrue), r = 0.0095, cr = cos(r);
    if (cs > cr - 2e-5){
      float x = saturate(acos(min(cs, 1.0)) / r);
      col += min(uSunDisk, vec3(60.0)) * (1.0 - 0.55 * (1.0 - sqrt(max(1.0 - x * x, 0.0)))) * smoothstep(cr - 2e-5, cr + 2e-5, cs);
    }
  }
  vec4 cl = catmullRom(uCloud, vUv, uCloudSize);
  col = col * saturate(cl.a) + max(cl.rgb, vec3(0.0));
  col += uFlashSky * (0.35 + 0.65 * exp((dot(rd, uFlashDir) - 1.0) * 6.0));
  if (uFogW.x > 0.0){ float k = 1.0 / uFogW.y; col = mix(col, uFogCol, 1.0 - exp(-uFogW.x * exp(-k * uFogW.z) / (k * max(rd.y, 0.002)))); }
  o = vec4(toDisplay(col), 1.0);
}`;
const GOD_FS = HEAD + `
uniform sampler2D uCloud; uniform vec2 uSunUV; uniform float uGod, uAspect, uExposure; uniform vec3 uSunCam;
uniform vec3 uRight, uUp, uFwd; uniform vec2 uTan; uniform vec3 uSunDir;
out vec4 o;
float ign(vec2 p){ return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
float hg(float g, float c){ float g2 = g * g; return (1.0 - g2) / (4.0 * PI * pow(max(1.0 + g2 - 2.0 * g * c, 1e-4), 1.5)); }
void main(){
  vec3 rd = normalize(uFwd + (vUv.x * 2.0 - 1.0) * uTan.x * uRight + (vUv.y * 2.0 - 1.0) * uTan.y * uUp);
  vec2 dv = uSunUV - vUv; const int NG = 24; vec2 stp = dv / float(NG);
  vec2 c = vUv + stp * ign(gl_FragCoord.xy);
  float acc = 0.0, w = 1.0, ws = 0.0;
  for (int i = 0; i < NG; i++){ acc += textureLod(uCloud, clamp(c, vec2(0.0), vec2(1.0)), 0.0).a * w; ws += w; w *= 0.955; c += stp; }
  acc /= ws;
  float fall = exp(-length(dv * vec2(uAspect, 1.0)) * 2.2);
  vec3 rays = uSunCam * acc * acc * fall * uGod * (0.0035 + 0.01 * hg(0.7, dot(rd, uSunDir)));
  o = vec4(1.0 - exp(-rays * uExposure * 0.9), 1.0);
}`;

/* ---------- post: depth of field, bloom, grading ---------- */
const POSTCOMMON = `
uniform vec2 uDepthAB; uniform float uFocus, uFocusR, uCocK, uCocMaxN, uCocMaxF, uSkyCoc;
float linZ(float d){ return uDepthAB.y / ((d * 2.0 - 1.0) - uDepthAB.x); }
/* in focus from the subject out to uFocusR times its distance, then the background softens */
float cocOf(float z){
  z = max(z, 1e-3);
  float c = z < uFocus ? uCocK * (z - uFocus) / (z * uFocus) : uCocK * max(z - uFocus * uFocusR, 0.0) / (z * uFocus * uFocusR);
  return clamp(c, -uCocMaxN, uCocMaxF);
}
`;
const DOFPREP_FS = HEAD + POSTCOMMON + `
uniform sampler2D uScene, uDepth; uniform vec2 uSrcTexel;
out vec4 o;
void main(){
  vec2 e = uSrcTexel * 0.5;
  vec3 c = (texture(uScene, vUv + vec2(-e.x, -e.y)).rgb + texture(uScene, vUv + vec2(e.x, -e.y)).rgb
          + texture(uScene, vUv + vec2(-e.x, e.y)).rgb + texture(uScene, vUv + vec2(e.x, e.y)).rgb) * 0.25;
  float d = min(min(texture(uDepth, vUv + vec2(-e.x, -e.y)).r, texture(uDepth, vUv + vec2(e.x, -e.y)).r),
                min(texture(uDepth, vUv + vec2(-e.x, e.y)).r, texture(uDepth, vUv + vec2(e.x, e.y)).r));
  o = vec4(c, cocOf(linZ(d)) * (d > 0.9999999 ? uSkyCoc : 1.0));
}`;
/* single-pass scatter-as-gather bokeh on a golden-angle spiral */
const DOF_FS = HEAD + `
uniform sampler2D uSrc; uniform vec2 uTexel; uniform float uMaxR, uRadStep;
out vec4 o;
void main(){
  vec4 c0 = textureLod(uSrc, vUv, 0.0);
  float cs = abs(c0.a);
  vec3 col = c0.rgb; float tot = 1.0, spread = cs;
  float r = uRadStep, ang = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) * 6.2831853;
  for (int i = 0; i < 128; i++){
    if (r >= uMaxR) break;
    vec4 s = textureLod(uSrc, vUv + vec2(cos(ang), sin(ang)) * uTexel * r, 0.0);
    float ss = abs(s.a);
    if (s.a > c0.a) ss = min(ss, cs * 2.0);
    float m = smoothstep(r - 0.5, r + 0.5, ss);
    col += mix(col / tot, s.rgb, m);
    if (s.a < c0.a) spread = max(spread, ss * m);
    tot += 1.0; ang += 2.39996323; r += uRadStep / r;
  }
  o = vec4(col / tot, spread);
}`;
const BLOOMPRE_FS = HEAD + `
uniform sampler2D uSrc; uniform vec2 uSrcTexel; uniform float uThresh;
out vec4 o;
void main(){
  vec2 e = uSrcTexel * 0.5;
  vec3 c = (texture(uSrc, vUv + vec2(-e.x, -e.y)).rgb + texture(uSrc, vUv + vec2(e.x, -e.y)).rgb
          + texture(uSrc, vUv + vec2(-e.x, e.y)).rgb + texture(uSrc, vUv + vec2(e.x, e.y)).rgb) * 0.25;
  float l = max(max(c.r, c.g), c.b);
  float k = 0.18, s = clamp(l - uThresh + k, 0.0, 2.0 * k); s = s * s / (4.0 * k);
  o = vec4(c * max(s, l - uThresh) / max(l, 1e-4), 1.0);
}`;
const DOWN_FS = HEAD + `
uniform sampler2D uSrc; uniform vec2 uSrcTexel;
out vec4 o;
void main(){
  vec2 e = uSrcTexel;
  o = vec4((texture(uSrc, vUv).rgb * 4.0 + texture(uSrc, vUv + vec2(-e.x, -e.y)).rgb + texture(uSrc, vUv + vec2(e.x, -e.y)).rgb
          + texture(uSrc, vUv + vec2(-e.x, e.y)).rgb + texture(uSrc, vUv + vec2(e.x, e.y)).rgb) / 8.0, 1.0);
}`;
const UP_FS = HEAD + `
uniform sampler2D uSrc, uBase; uniform vec2 uSrcTexel;
out vec4 o;
void main(){
  vec2 e = uSrcTexel;
  vec3 up = (texture(uSrc, vUv + vec2(-e.x, 0.0)).rgb + texture(uSrc, vUv + vec2(e.x, 0.0)).rgb
           + texture(uSrc, vUv + vec2(0.0, -e.y)).rgb + texture(uSrc, vUv + vec2(0.0, e.y)).rgb) * 0.1667
          + (texture(uSrc, vUv + vec2(-e.x, -e.y)).rgb + texture(uSrc, vUv + vec2(e.x, -e.y)).rgb
           + texture(uSrc, vUv + vec2(-e.x, e.y)).rgb + texture(uSrc, vUv + vec2(e.x, e.y)).rgb) * 0.0833;
  o = vec4(texture(uBase, vUv).rgb + up, 1.0);
}`;
const FINAL_FS = HEAD + POSTCOMMON + `
uniform sampler2D uScene, uDepth, uDof, uBloom;
uniform float uDofOn, uBloomI, uNight, uFrameN, uSat, uDrops, uTimeD;
uniform sampler2D uLens; uniform vec2 uRes; uniform vec3 uShTint, uHiTint, uLift;
out vec4 o;
float ign(vec2 p){ return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
vec4 hashD(vec2 p){ vec4 p4 = fract(vec4(p.xyxy) * vec4(0.1031, 0.1030, 0.0973, 0.1099)); p4 += dot(p4, p4.wzxy + 33.33); return fract((p4.xxyz + p4.yzzw) * p4.zywx); }

void main(){
  /* lens water map from the drop simulation: rg = surface slope (blended, so un-premultiply), b = thickness, a = coverage */
  vec2 uv = vUv; float dropShade = 0.0, glint = 0.0, wet = 0.0;
  if (uDrops > 0.5){
    vec4 lw = texture(uLens, vUv);
    wet = lw.a;
    if (wet > 0.004){
      vec2 n = clamp((lw.rg * 2.0 - 1.0) / max(wet, 0.05), -1.0, 1.0);
      uv = clamp(vUv - n * vec2(uRes.y / uRes.x, 1.0) * 0.05, 0.0, 1.0);   /* a drop is a tiny lens: it flips what lies behind */
      dropShade = wet * smoothstep(0.6, 1.0, length(n));
      glint = wet * pow(max(dot(normalize(vec3(n, 0.55)), normalize(vec3(-0.45, 0.6, 1.0))), 0.0), 40.0);
    }
  }
  vec3 col = texture(uScene, uv).rgb;
  if (wet > 0.004){   /* the water sits on the lens, so what it shows is out of focus */
    vec2 bo = vec2(0.003 * uRes.y / uRes.x, 0.003);
    vec3 blur = (col + texture(uScene, uv + bo).rgb + texture(uScene, uv - bo).rgb + texture(uScene, uv + vec2(bo.x, -bo.y)).rgb + texture(uScene, uv + vec2(-bo.x, bo.y)).rgb) * 0.2;
    col = mix(texture(uScene, vUv).rgb, blur, wet);
  }
  if (uDofOn > 0.5){
    float dS = texture(uDepth, uv).r;
    float cf = abs(cocOf(linZ(dS))) * (dS > 0.9999999 ? uSkyCoc : 1.0);
    vec4 dof = texture(uDof, uv);
    col = mix(col, dof.rgb, smoothstep(0.35, 1.3, max(cf, dof.a)));
  }
  col += texture(uBloom, uv).rgb * uBloomI;
  col = col * (1.0 - 0.32 * dropShade) + glint * 0.5;
  /* grading: lush saturation, cool shade, warm light, lifted blacks */
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(l), col, uSat + (1.3 - uSat) * smoothstep(0.5, 0.85, l) * uNight);
  col *= mix(uShTint, uHiTint, smoothstep(0.15, 0.85, l));
  col = col * 0.955 + uLift;
  /* night vision: rods take over, so colour drains toward a cool blue and the image gets grainier
     (Jensen et al. 2001 night sky model; Thompson, Shirley & Ferwerda 2002) */
  float ln = dot(col, vec3(0.2126, 0.7152, 0.0722));
  /* mesopic vision: rods drain colour from the dark, cones still see the lights in colour */
  col = mix(col, ln * vec3(0.62, 0.78, 1.15), uNight * 0.55 * (1.0 - smoothstep(0.45, 0.8, ln)));
  col += (ign(gl_FragCoord.xy + vec2(uFrameN * 5.588, uFrameN * 3.271)) - 0.5) * 0.03 * uNight;
  vec2 q = vUv - 0.5;
  col *= 1.0 - 0.32 * dot(q * vec2(uRes.x / uRes.y, 1.0), q * vec2(uRes.x / uRes.y, 1.0)) * 0.9;
  col += (ign(gl_FragCoord.xy + 17.0) - 0.5) / 255.0;
  o = vec4(col, 1.0);
}`;

/* mid-range grass as stacked translucent slices over the terrain (geometry near, volume slices mid, texture far:
   the hybrid LOD of Boulanger, Pattanaik & Bouatouch 2009; shell/volumetric grass as surveyed by Habel 2009) */
const SHELL_VS = VPRE + SCENE + `
uniform float uNA, uNR; uniform vec2 uRadAB;
uniform float uShellS; uniform vec2 uShellR;
uniform vec3 uSunDir, uSunGround, uSkyIrr; uniform float uFogKG;
uniform sampler2D uSkyLut;
out vec3 vRel; out vec2 vW; out vec3 vTipLit; out vec3 vBaseLit; out vec4 vFog; out vec2 vOff; out float vFade;
vec2 skyUVv(vec3 d){ float el = asin(clamp(d.y, -1.0, 1.0)); float az = atan(d.x, d.z); return vec2(az / (2.0 * PI) + 0.5, 0.5 + 0.5 * sign(el) * sqrt(abs(el) / (PI * 0.5))); }
vec3 litV(vec3 alb, vec3 n, vec3 V, float t, float sh, float ao){
  alb *= 1.0 - 0.3 * uWet;
  float ndl = dot(n, uSunDir); vec3 sun = uSunGround * sh;
  vec3 c = alb / PI * (sun * saturate(ndl * 0.6 + 0.4) * mix(0.45, 1.0, ao) + uSkyIrr * ao);
  float back = pow(saturate(dot(-V, uSunDir)), 3.0);
  c += alb * vec3(1.2, 1.25, 0.45) * sun * (back * 1.5 + saturate(-ndl) * 0.25) * (0.25 + 0.75 * t) / PI;
  c += alb / PI * uFlashAmb * 0.7;
  return c;
}
void main(){
  int na = int(uNA + 0.5) + 1;
  int ring = gl_VertexID / na; int seg = gl_VertexID - ring * na;
  float t = float(ring) / uNR; float ex = exp(uRadAB.y * t);
  float r = uRadAB.x * (ex - 1.0);
  float ang = float(seg) / uNA * 6.28318530718;
  vec2 rel = vec2(cos(ang), sin(ang)) * r;
  float sp = max(uRadAB.x * uRadAB.y * ex / uNR, r * 6.2832 / uNA);
  vec2 w = uCamM.xz + rel;
  float h = terrainH(w, sp);
  float e = max(sp * 0.5, 0.25);
  vec3 n = normalize(vec3(h - terrainH(w + vec2(e, 0.0), sp), e, h - terrainH(w + vec2(0.0, e), sp)));
  float Hc = 0.68 * (0.86 + 0.3 * tn(w * (1.0 / 120.0) + vec2(0.23, 0.61)));
  vec3 p = vec3(rel.x, h - uCamM.y + Hc * uShellS, rel.y);
  float d = length(rel);
  vFade = smoothstep(uShellR.x * 0.5, uShellR.x, d) * (1.0 - smoothstep(uShellR.y * 0.65, uShellR.y, d)) * (1.0 - smoothstep(0.15, 0.9, puddleMask(w)));
  float p1 = tn(w * (1.0 / 310.0) + vec2(0.37, 0.11)), p2 = tn(w * (1.0 / 85.0) + vec2(0.71, 0.43));
  float wave = windWave(w);
  vec3 V = -normalize(p); vec3 N = normalize(mix(n, vec3(0.0, 1.0, 0.0), 0.5));
  float sh = cshadow(w * 0.001);
  vTipLit = litV(mix(waveSheen(grassTip(p1, p2), wave), SNOW_ALB, uSnowCov * 0.75), N, V, 1.0, sh, 1.0);
  vBaseLit = litV(mix(mix(G_BASE, grassTip(p1, p2), 0.6), SNOW_ALB, uSnowCov * 0.9), N, V, 0.3, sh, mix(0.6, 0.9, uShellS));
  vec3 gw = glowAt(w);
  vTipLit += waveSheen(grassTip(p1, p2), wave) * gw * 0.7; vBaseLit += mix(G_BASE, grassTip(p1, p2), 0.35) * gw * 0.42;
  float dist = length(p); vec3 rd = p / dist;
  vec3 hzF = textureLod(uSkyLut, skyUVv(normalize(vec3(rd.x, max(rd.y, 0.0) + 0.012, rd.z))), 0.0).rgb;
  float eF = exp(-dist * 0.001 * uFogKG), fw = wxFogF(p), aN = eF * (1.0 - fw);
  vFog = vec4((hzF * (1.0 - eF) * (1.0 - fw) + uFogCol * fw) / max(1.0 - aN, 1e-4), aN);
  vOff = uWindDirG * uWindStr * (0.1 + 1.25 * wave) * 0.45 * uShellS * uShellS;
  vRel = p; vW = w;
  gl_Position = project(p);
}`;
const SHELL_FS = PRE + DISPLAY + `
in vec3 vRel; in vec2 vW; in vec3 vTipLit; in vec3 vBaseLit; in vec4 vFog; in vec2 vOff; in float vFade;
uniform float uShellS, uShellCell, uPixAng;
out vec4 o;
vec4 hash42(vec2 p){ vec4 p4 = fract(vec4(p.xyxy) * vec4(0.1031, 0.1030, 0.0973, 0.1099)); p4 += dot(p4, p4.wzxy + 33.33); return fract((p4.xxyz + p4.yzzw) * p4.zywx); }
void main(){
  if (vFade <= 0.003) discard;
  float dist = length(vRel);
  vec2 g = (vW - vOff) / uShellCell; vec2 id = floor(g); vec2 f = fract(g);
  vec4 hh = hash42(mod(id, 4096.0));
  float bh = mix(0.45, 1.0, hh.z);
  float rad = mix(0.26, 0.42, hh.w) * saturate(1.0 - uShellS / bh);
  float dd = length(f - (0.2 + hh.xy * 0.6));
  float aa = fwidth(dd) + 1e-3;
  float hit = 1.0 - smoothstep(rad - aa, rad + aa, dd);
  /* once a blade cell is smaller than a pixel, switch to its expected coverage instead of aliasing */
  float far = smoothstep(0.6, 2.5, dist * uPixAng / uShellCell);
  float a = mix(hit, 0.42 * pow(saturate(1.0 - uShellS), 2.2), far) * vFade;
  if (a < 0.02) discard;
  float t = mix(saturate(uShellS / bh), saturate(uShellS / 0.72), far);
  vec3 c = mix(vBaseLit, vTipLit, pow(t, 0.65)) * mix(0.86 + 0.28 * hh.x, 1.0, far);
  c = c * vFog.a + vFog.rgb * (1.0 - vFog.a);
  o = vec4(toDisplay(c), a);
}`;

/* real sky: naked-eye stars (mag <= 6.0), planets, constellation lines, all in J2000 equatorial coordinates */
const STAR_VS = `#version 300 es
precision highp float; precision highp sampler2D;
layout(location = 0) in vec4 aStar;
layout(location = 1) in vec3 aCol;
uniform mat3 uEq; uniform vec3 uR, uU, uF; uniform vec2 uTan;
uniform float uStarI, uPxScale, uTimeS;
uniform sampler2D uCloud;
out vec3 vCol; out float vI;
void main(){
  vec3 d = uEq * aStar.xyz;
  vec4 clip = vec4(dot(d, uR) / uTan.x, dot(d, uU) / uTan.y, 0.0, dot(d, uF));
  clip.z = clip.w;
  gl_Position = clip; vCol = aCol; vI = 0.0; gl_PointSize = 1.0;
  if (d.y < -0.01 || clip.w <= 0.0) return;
  float T = textureLod(uCloud, clamp(clip.xy / clip.w * 0.5 + 0.5, 0.0, 1.0), 0.0).a;
  float mag = aStar.w;
  float ext = exp(-0.28 / max(d.y, 0.035));
  float low = 1.0 - smoothstep(0.05, 0.45, d.y);
  float tw = 1.0 + 0.45 * low * sin(uTimeS * (6.0 + fract(mag * 13.7) * 10.0) + aStar.x * 97.0 + aStar.y * 53.0);
  vI = uStarI * pow(10.0, -0.248 * (mag - 6.0)) * ext * T * tw;
  gl_PointSize = uPxScale * clamp(1.5 + 0.5 * (6.0 - mag), 1.5, 7.0);
}`;
const STAR_FS = `#version 300 es
precision highp float;
in vec3 vCol; in float vI; out vec4 o;
void main(){
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  float a = exp(-dot(q, q) * 3.5);
  if (vI * a < 2e-4) discard;
  o = vec4(1.0 - exp(-vCol * vI * a), 1.0);
}`;
const LINE_VS = `#version 300 es
precision highp float;
layout(location = 0) in vec3 aDir;
uniform mat3 uEq; uniform vec3 uR, uU, uF; uniform vec2 uTan;
out float vA;
void main(){
  vec3 d = uEq * aDir;
  vec4 clip = vec4(dot(d, uR) / uTan.x, dot(d, uU) / uTan.y, 0.0, dot(d, uF));
  clip.z = clip.w; gl_Position = clip;
  vA = smoothstep(-0.02, 0.08, d.y) * exp(-0.15 / max(d.y, 0.05));
}`;
const LINE_FS = `#version 300 es
precision highp float;
in float vA; uniform float uLineA; out vec4 o;
void main(){ o = vec4(vec3(0.45, 0.6, 0.95) * uLineA * vA, 1.0); }`;
/* 5044 stars brighter than mag 6.0 (d3-celestial, from the Yale Bright Star / Hipparcos data), 6 bytes each:
   RA u16, Dec u16, magnitude u8, B-V u8 */

/* 743 constellation line segments (d3-celestial), endpoints as RA u16 / Dec u16 */


/* fireflies: drifting, clustered over the meadow, each flashing on its own Photinus-like rhythm */
const FIREFLY_VS = VPRE + SCENE + `
uniform float uFBox, uFlyI, uPxScale;
out vec3 vCol; out float vI;
void main(){
  float id = float(gl_InstanceID), t = uTime;
  vec4 h = hash42(vec2(id * 3.17 + 1.3, 7.7)), h2 = hash42(vec2(id * 1.91 + 9.1, 2.3));
  vec2 wander = vec2(sin(t * (0.21 + 0.17 * h2.x) + h.z * 30.0) + 0.5 * sin(t * (0.53 + 0.3 * h2.y) + h.w * 20.0),
                     cos(t * (0.19 + 0.15 * h2.y) + h.w * 25.0) + 0.5 * cos(t * (0.47 + 0.3 * h2.x) + h.z * 17.0)) * 2.2;
  vec2 wp = (h.xy - 0.5) * uFBox + wander + uWindDirG * t * 0.12 * uWindStr;
  vec2 rel = mod(wp - uCamM.xz + 0.5 * uFBox, uFBox) - 0.5 * uFBox;
  float edge = min(0.5 * uFBox - abs(rel.x), 0.5 * uFBox - abs(rel.y));
  vec2 w = uCamM.xz + rel;
  float hgt = 0.35 + h2.z * h2.z * 2.2 + 0.25 * sin(t * (0.7 + h.x) + h2.w * 40.0);
  vec3 p = vec3(rel.x, terrainH(w, 0.0) - uCamM.y + hgt, rel.y);
  float period = 2.2 + 3.5 * h2.x, ph = fract(t / period + h.z);
  float flash = smoothstep(0.0, 0.06, ph) * (1.0 - smoothstep(0.06, 0.06 + 0.7 / period, ph));
  float breathe = 0.3 + 0.12 * sin(t * (1.3 + h2.y) + h.x * 40.0);
  float patchy = smoothstep(-0.25, 0.35, tn(w * (1.0 / 60.0) + vec2(0.3, 0.8)));
  vI = uFlyI * (breathe + flash) * smoothstep(0.0, 5.0, edge) * patchy * (1.0 - 0.8 * wxFogF(p));
  vCol = mix(vec3(0.62, 1.0, 0.28), vec3(1.0, 0.88, 0.35), h.w);
  gl_Position = project(p);
  float dist = length(p);
  gl_PointSize = vI < 1e-3 ? 0.0 : clamp(uPxScale * 70.0 / max(dist, 0.5), 3.0 * uPxScale, 28.0 * uPxScale);
}`;
const FIREFLY_FS = `#version 300 es
precision highp float;
in vec3 vCol; in float vI; out vec4 o;
void main(){
  vec2 q = gl_PointCoord * 2.0 - 1.0; float r2 = dot(q, q);
  if (r2 > 1.0) discard;
  vec3 c = vCol * vI * (exp(-r2 * 18.0) * 2.0 + exp(-r2 * 3.5) * 0.35);
  o = vec4(1.0 - exp(-c), 1.0);
}`;
const FLY_COUNT = {low: 160, med: 280, high: 450, ultra: 600};

/* splats each light-emitting thing as a soft disc into the top-down glow map (same placement/motion as its visible shader) */
const GLOW_VS = VPRE + SCENE + `
uniform int uMode; uniform float uGlowI, uFlyMul;
uniform float uFGrid, uFCell; uniform vec2 uFBase, uFOrig;
uniform float uFBox, uPBox; uniform vec4 uTrail[40];
out vec2 vQ; out vec3 vC;
vec2 cornerG(int i){ return i == 0 ? vec2(-1.0, -1.0) : i == 1 ? vec2(1.0, -1.0) : i == 2 ? vec2(1.0, 1.0) : i == 3 ? vec2(-1.0, -1.0) : i == 4 ? vec2(1.0, 1.0) : vec2(-1.0, 1.0); }
void main(){
  float id = float(gl_InstanceID), t = uTime;
  vec2 rel = vec2(0.0); vec3 col = vec3(0.0); float I = 0.0, R = 1.0;
  if (uMode == 0){
    float iz = floor((id + 0.5) / uFGrid); float ix = id - iz * uFGrid;
    vec2 cellW = mod(uFBase + vec2(ix, iz), 4096.0);
    vec4 h = hash42(cellW * 1.37 + 11.1), h2 = hash42(cellW + 53.7);
    rel = uFOrig + (vec2(ix, iz) + 0.15 + h.xy * 0.7) * uFCell;
    vec2 w = uCamM.xz + rel; float Rr = uFGrid * uFCell * 0.5;
    float dens = (smoothstep(-0.15, 0.3, tn(w * (1.0 / 48.0) + vec2(0.83, 0.27))) * 0.85 + 0.05) * (1.0 - smoothstep(Rr * 0.75, Rr, length(rel)));
    if (h.z < dens){
      float kind = tn(w * (1.0 / 160.0) + vec2(0.05, 0.55)) * 0.55 + 0.5 + (h2.w - 0.5) * 0.3;
      col = paletteAt(saturate(kind)) * mix(0.8, 1.1, h2.z); I = 1.4 * touchLit(w); R = 1.5;
    }
  } else if (uMode == 1){
    vec4 h = hash42(vec2(id * 3.17 + 1.3, 7.7)), h2 = hash42(vec2(id * 1.91 + 9.1, 2.3));
    vec2 wander = vec2(sin(t * (0.21 + 0.17 * h2.x) + h.z * 30.0) + 0.5 * sin(t * (0.53 + 0.3 * h2.y) + h.w * 20.0),
                       cos(t * (0.19 + 0.15 * h2.y) + h.w * 25.0) + 0.5 * cos(t * (0.47 + 0.3 * h2.x) + h.z * 17.0)) * 2.2;
    vec2 wp = (h.xy - 0.5) * uFBox + wander + uWindDirG * t * 0.12 * uWindStr;
    rel = mod(wp - uCamM.xz + 0.5 * uFBox, uFBox) - 0.5 * uFBox;
    float edge = min(0.5 * uFBox - abs(rel.x), 0.5 * uFBox - abs(rel.y));
    vec2 w = uCamM.xz + rel;
    float hgt = 0.35 + h2.z * h2.z * 2.2;
    float period = 2.2 + 3.5 * h2.x, ph = fract(t / period + h.z);
    float flash = smoothstep(0.0, 0.06, ph) * (1.0 - smoothstep(0.06, 0.06 + 0.7 / period, ph));
    float breathe = 0.3 + 0.12 * sin(t * (1.3 + h2.y) + h.x * 40.0);
    float patchy = smoothstep(-0.25, 0.35, tn(w * (1.0 / 60.0) + vec2(0.3, 0.8)));
    col = mix(vec3(0.62, 1.0, 0.28), vec3(1.0, 0.88, 0.35), h.w);
    I = uFlyMul * 1.6 * (breathe + flash) * smoothstep(0.0, 5.0, edge) * patchy / (1.0 + hgt * hgt * 0.6); R = 1.2 + hgt * 0.5;
  } else if (uMode == 2){
    vec4 h = hash42(vec2(id * 1.731, 17.17)), h2 = hash42(vec2(id * 0.917 + 5.3, 3.1));
    float spd = (1.6 + 2.6 * h.w) * (0.35 + uWindStr);
    vec2 wp = (h.xy - 0.5) * uPBox + uWindDirG * t * spd + vec2(sin(t * 0.5 + h2.x * 30.0), cos(t * 0.43 + h2.y * 30.0)) * 3.0;
    rel = mod(wp - uCamM.xz + 0.5 * uPBox, uPBox) - 0.5 * uPBox;
    float edge = min(0.5 * uPBox - abs(rel.x), 0.5 * uPBox - abs(rel.y)), y = 0.5 + h.z * h.z * 4.5;
    col = paletteAt(h2.w); I = 0.7 * smoothstep(0.0, 6.0, edge) / (1.0 + y * y * 0.35); R = 0.8 + 0.3 * y;
  } else {
    vec4 tr = uTrail[gl_InstanceID]; rel = tr.xz;
    float y = max(tr.y + uCamM.y - terrainH(uCamM.xz + tr.xz, 0.0), 0.0);
    col = paletteAt(fract(tr.w * 0.618 + 0.13)); I = 0.12 / (1.0 + y * y * 0.35); R = 1.4 + 0.3 * y;
  }
  vC = max(mix(vec3(dot(col, vec3(0.2126, 0.7152, 0.0722))), col, 1.5), 0.0) * I * uGlowI;
  vec2 q = cornerG(gl_VertexID); vQ = q;
  vec2 uv = (uCamM.xz + rel + q * R - uGlowP4.xy) / uGlowP4.z;
  gl_Position = I > 0.0 ? vec4(uv * 2.0, 0.0, 1.0) : vec4(2.0, 2.0, 2.0, 1.0);
}`;
const GLOW_FS = `#version 300 es
precision highp float;
in vec2 vQ; in vec3 vC; out vec4 o;
void main(){ o = vec4(vC * exp(-dot(vQ, vQ) * 3.0), 1.0); }`;
const GLOW_N = 256, GLOW_EXT = 64;
/* touch map update: scroll with the camera, fade slowly, stamp where the stream passes; g eases toward r so flowers bloom in */
const TOUCH_FS = HEAD + `
uniform sampler2D uPrev; uniform vec2 uShift, uCenter; uniform float uExt, uDecay, uRamp, uRampB, uStampR;
uniform vec4 uStamp[20]; uniform int uStampN;
out vec4 o;
void main(){
  vec2 ou = vUv + uShift;
  vec4 old = (any(lessThan(ou, vec2(0.0))) || any(greaterThan(ou, vec2(1.0)))) ? vec4(0.0) : texture(uPrev, ou);
  float r = old.x * uDecay;
  vec2 w = uCenter + (vUv - 0.5) * uExt;
  float st = 0.0;
  for (int i = 0; i < 20; i++){
    if (i >= uStampN) break;
    st = max(st, uStamp[i].w * (1.0 - smoothstep(uStampR * 0.45, uStampR, length(w - uStamp[i].xy))));
  }
  r = max(r, st);
  float b = max(old.z, st);
  o = vec4(r, old.y + (r - old.y) * uRamp, b, old.w + (b - old.w) * uRampB);
}`;
const RESTAMP_VS = `#version 300 es
precision highp float;
layout(location = 0) in vec4 aP;
uniform float uExt, uStampR;
out vec2 vQ; out vec2 vV;
vec2 cornerR(int i){ return i == 0 ? vec2(-1.0, -1.0) : i == 1 ? vec2(1.0, -1.0) : i == 2 ? vec2(1.0, 1.0) : i == 3 ? vec2(-1.0, -1.0) : i == 4 ? vec2(1.0, 1.0) : vec2(-1.0, 1.0); }
void main(){
  vec2 q = cornerR(gl_VertexID); vQ = q; vV = aP.zw;
  gl_Position = vec4((aP.xy + q * uStampR) / uExt * 2.0, 0.0, 1.0);
}`;
const RESTAMP_FS = `#version 300 es
precision highp float;
in vec2 vQ; in vec2 vV; out vec4 o;
void main(){
  float k = vV.y * (1.0 - smoothstep(0.45, 1.0, length(vQ)));
  if (k <= 0.0) discard;
  o = vec4(vV.x * k, vV.x * k, k, k);
}`;
const TOUCH_N = 1024, TOUCH_EXT = 512;
/* puddle map: the (wetness-independent) pooling field around the camera, rebuilt only after moving a few metres */
const PUD_FS = HEAD + TERRAIN_GLSL + `
uniform vec3 uPudP;
out vec4 o;
vec2 rot2b(vec2 w, float c, float s){ return vec2(c * w.x - s * w.y, s * w.x + c * w.y); }

/* where rain pools (cf. Lagarde 2012): the dips of the terrain's own small octaves, a regional wet/dry pattern,
   and domain-warped multi-scale noise so puddles vary from tiny beads to small ponds with ragged shores */
float pudM(vec2 w){
  float hollow = -(tn(rot2b(w, -0.6, 0.8) * (1.0 / 420.0) + vec2(0.19, 0.53)) * 0.55 + tn(rot2b(w, 0.96, -0.28) * (1.0 / 150.0) + vec2(0.61, 0.83)) * 0.45);
  float region = tn(w * (1.0 / 190.0) + vec2(0.31, 0.47));
  vec2 wp = w + vec2(tn(w * (1.0 / 23.0) + vec2(0.7, 0.2)), tn(w * (1.0 / 23.0) + vec2(0.1, 0.9))) * 7.0;
  float shape = tn(wp * (1.0 / 15.0) + vec2(0.12, 0.77)) * 0.65 + tn(wp * (1.0 / 4.7) + vec2(0.5, 0.31)) * 0.25 + tn(wp * (1.0 / 1.6) + vec2(0.83, 0.17)) * 0.1;
  return hollow * 0.6 + shape * 0.55 + region * 0.4;
}
void main(){ vec2 w = uPudP.xy + (vUv - 0.5) * uPudP.z; o = vec4(pudM(w), 0.0, 0.0, 1.0); }`;
const PUD_N = 512, PUD_EXT = 200;
/* rain: motion-blurred streaks in a box that wraps around the camera, slanted by the wind */
const RAIN_VS = VPRE + SCENE + `
uniform float uRainBox, uRainH, uRainA;
out float vA; out vec2 vQ;
void main(){
  float id = float(gl_InstanceID);
  vec4 h = hash42(vec2(id * 0.731 + 0.1, 3.3)), h2 = hash42(vec2(id * 1.37 + 0.7, 9.1));
  float fallV = 8.5 * (0.85 + 0.3 * h.z);
  vec2 wv = uWindDirG * (1.0 + 4.0 * uWindStr);
  vec3 vel = vec3(wv.x, -fallV, wv.y);
  float y = uRainH * 0.7 - mod(uTime * fallV + h.w * uRainH, uRainH);
  vec2 rel = mod((h.xy - 0.5) * uRainBox + wv * uTime - uCamM.xz + 0.5 * uRainBox, uRainBox) - 0.5 * uRainBox;
  vec3 p = vec3(rel.x, y, rel.y), dir = normalize(vel);
  vec3 side = normalize(cross(dir, normalize(p + 1e-4))) * 0.008 * (0.7 + 0.6 * h2.x) * max(1.0, length(p) * 0.05);
  int v = gl_VertexID;
  vec2 q = v == 0 ? vec2(-1.0, 0.0) : v == 1 ? vec2(1.0, 0.0) : v == 2 ? vec2(1.0, 1.0) : v == 3 ? vec2(-1.0, 0.0) : v == 4 ? vec2(1.0, 1.0) : vec2(-1.0, 1.0);
  float dist = length(p);
  vQ = q;
  vA = uRainA * smoothstep(0.4, 1.6, dist) * (1.0 - smoothstep(uRainBox * 0.3, uRainBox * 0.5, dist)) * (0.45 + 0.55 * h2.y) * (1.0 - 0.7 * wxFogF(p));
  gl_Position = project(p + dir * (q.y * length(vel) * 0.03) + side * q.x);
}`;
const RAIN_FS = PRE + DISPLAY + `
in float vA; in vec2 vQ; uniform vec3 uRainCol; out vec4 o;
void main(){
  float a = vA * (1.0 - vQ.x * vQ.x) * smoothstep(0.0, 0.25, vQ.y) * smoothstep(1.0, 0.6, vQ.y);
  if (a < 0.003) discard;
  o = vec4(toDisplay(uRainCol), a);
}`;
/* lightning: each channel segment is a screen-space ribbon of fixed pixel width, additive, bloom does the glow */
const BOLT_VS = VPRE + SCENE + `
layout(location = 0) in vec3 aA; layout(location = 1) in vec3 aB; layout(location = 2) in float aW;
uniform vec2 uResB;
out float vT;
void main(){
  int v = gl_VertexID;
  float sx = (v == 1 || v == 2 || v == 4) ? 1.0 : -1.0, sy = (v == 2 || v == 4 || v == 5) ? 1.0 : 0.0;
  vec4 ca = project(aA), cb = project(aB);
  vT = sx;
  if (ca.w <= 0.1 || cb.w <= 0.1){ gl_Position = vec4(0.0, 0.0, -2.0, 1.0); return; }
  vec2 ds = normalize((cb.xy / cb.w - ca.xy / ca.w) * uResB + vec2(1e-6, 0.0));
  vec4 c = mix(ca, cb, sy);
  c.xy += vec2(-ds.y, ds.x) * sx * aW * 2.0 / uResB * c.w;
  gl_Position = c;
}`;
const BOLT_FS = `#version 300 es
precision highp float;
in float vT; uniform float uBoltI; out vec4 o;
void main(){ float a = 1.0 - vT * vT; o = vec4(vec3(0.82, 0.86, 1.0) * uBoltI * a, 1.0); }`;
const RAIN_N = {low: 1800, med: 3000, high: 4500, ultra: 6500}, BOLT_MAX = 400;
/* snow: soft camera-facing flakes, slow fall with a swirl, driven sideways by the wind (a blizzard goes nearly horizontal) */
const SNOW_VS = VPRE + SCENE + `
uniform float uSnowBox, uSnowH, uSnowA;
out float vA; out vec2 vQ;
void main(){
  float id = float(gl_InstanceID);
  vec4 h = hash42(vec2(id * 0.913 + 0.3, 5.1)), h2 = hash42(vec2(id * 1.71 + 0.2, 7.7));
  float fallV = 1.0 + 0.7 * h.z;
  vec2 wv = uWindDirG * (0.5 + 7.0 * uWindStr * uWindStr);
  float y = uSnowH * 0.7 - mod(uTime * fallV + h.w * uSnowH, uSnowH);
  vec2 sw = vec2(sin(uTime * (0.7 + h2.x) + h.x * 40.0), cos(uTime * (0.6 + h2.y) + h.y * 40.0)) * 0.35;
  vec2 rel = mod((h.xy - 0.5) * uSnowBox + wv * uTime + sw - uCamM.xz + 0.5 * uSnowBox, uSnowBox) - 0.5 * uSnowBox;
  vec3 p = vec3(rel.x, y, rel.y);
  float dist = length(p), sz = mix(0.014, 0.034, h2.z * h2.z) * max(1.0, dist * 0.04);
  int v = gl_VertexID;
  vec2 q = v == 0 ? vec2(-1.0, -1.0) : v == 1 ? vec2(1.0, -1.0) : v == 2 ? vec2(1.0, 1.0) : v == 3 ? vec2(-1.0, -1.0) : v == 4 ? vec2(1.0, 1.0) : vec2(-1.0, 1.0);
  vQ = q;
  vA = uSnowA * smoothstep(0.3, 1.0, dist) * (1.0 - smoothstep(uSnowBox * 0.3, uSnowBox * 0.5, dist)) * (0.5 + 0.5 * h2.w) * (1.0 - 0.7 * wxFogF(p));
  gl_Position = project(p + (uR * q.x + uU * q.y) * sz);
}`;
const SNOW_FS = PRE + DISPLAY + `
in float vA; in vec2 vQ; uniform vec3 uSnowCol; out vec4 o;
void main(){ float a = vA * (1.0 - smoothstep(0.3, 1.0, length(vQ))); if (a < 0.003) discard; o = vec4(toDisplay(uSnowCol), a); }`;
const SNOW_N = {low: 2500, med: 4000, high: 6000, ultra: 8000};
/* lens drop sprite: a dome with a seam-free ragged rim; sliding drops stretch a tail upward behind them */
const DROP_VS = `#version 300 es
precision highp float;
layout(location = 0) in vec4 aD;      /* centre u, v (0..1), radius (screen heights), stretch */
layout(location = 1) in float aS;     /* seed */
uniform float uAsp;
out vec2 vQ; out float vSt; out float vSeed;
void main(){
  int i = gl_VertexID;
  vec2 q = i == 0 ? vec2(-1.0, -1.0) : i == 1 ? vec2(1.0, -1.0) : i == 2 ? vec2(1.0, 1.0) : i == 3 ? vec2(-1.0, -1.0) : i == 4 ? vec2(1.0, 1.0) : vec2(-1.0, 1.0);
  vec2 local = vec2(q.x * 1.15, mix(-1.2, 1.2 + 1.7 * aD.w, q.y * 0.5 + 0.5));
  vQ = local; vSt = aD.w; vSeed = aS;
  gl_Position = vec4((aD.xy + local * aD.z * vec2(1.0 / uAsp, 1.0)) * 2.0 - 1.0, 0.0, 1.0);
}`;
const DROP_FS = `#version 300 es
precision highp float;
in vec2 vQ; in float vSt; in float vSeed; out vec4 o;
void main(){
  vec2 d = vQ;
  if (d.y > 0.0) d.y /= 1.0 + 1.6 * vSt;
  d.y *= d.y < 0.0 ? 1.12 : 1.0;
  float q = dot(d, d) + 1e-6;
  float rr = 1.0 + 0.07 * sin(vSeed * 40.0) * (d.x * d.x - d.y * d.y) / q + 0.05 * cos(vSeed * 23.0) * 2.0 * d.x * d.y / q;
  float x = sqrt(q) / rr;
  if (x > 1.0) discard;
  o = vec4(d / rr * 0.5 + 0.5, 1.0 - x * x, smoothstep(1.0, 0.82, x));
}`;   /* 0.5 m per texel; WebGL2 guarantees 2048, so this fits every device */


export { VS_FULL, VS_SKY, PRE, HEAD, NOISE_FS, COMMON, SKYLUT_FS, CSHADOW_FS, CLOUD_FS, TAA_FS, DISPLAY, SCENE, SCENE_FS, VPRE, TERRAIN_VS, TERRAIN_FS, GRASS_VS, GRASS_FS, FLOWER_VS, PETAL_VS, STREAM_VS, PETAL_FS, SKYPASS_FS, GOD_FS, POSTCOMMON, DOFPREP_FS, DOF_FS, BLOOMPRE_FS, DOWN_FS, UP_FS, FINAL_FS, SHELL_VS, SHELL_FS, STAR_VS, STAR_FS, LINE_VS, LINE_FS, FIREFLY_VS, FIREFLY_FS, FLY_COUNT, GLOW_VS, GLOW_FS, GLOW_N, TOUCH_FS, RESTAMP_VS, RESTAMP_FS, TOUCH_N, PUD_FS, PUD_N, RAIN_VS, RAIN_FS, BOLT_VS, BOLT_FS, RAIN_N, SNOW_VS, SNOW_FS, SNOW_N, DROP_VS, DROP_FS, GLOW_EXT, TOUCH_EXT, PUD_EXT, BOLT_MAX };
