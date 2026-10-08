import { TN, tnData, tnSample, groundH } from './terrain.js';
import { VS_FULL, VS_SKY, PRE, HEAD, NOISE_FS, COMMON, SKYLUT_FS, CSHADOW_FS, CLOUD_FS, TAA_FS, DISPLAY, SCENE, SCENE_FS, VPRE, TERRAIN_VS, TERRAIN_FS, GRASS_VS, GRASS_FS, FLOWER_VS, PETAL_VS, STREAM_VS, PETAL_FS, SKYPASS_FS, GOD_FS, POSTCOMMON, DOFPREP_FS, DOF_FS, BLOOMPRE_FS, DOWN_FS, UP_FS, FINAL_FS, SHELL_VS, SHELL_FS, STAR_VS, STAR_FS, LINE_VS, LINE_FS, FIREFLY_VS, FIREFLY_FS, FLY_COUNT, GLOW_VS, GLOW_FS, GLOW_N, TOUCH_FS, RESTAMP_VS, RESTAMP_FS, TOUCH_N, PUD_FS, PUD_N, RAIN_VS, RAIN_FS, BOLT_VS, BOLT_FS, RAIN_N, SNOW_VS, SNOW_FS, SNOW_N, DROP_VS, DROP_FS, GLOW_EXT, TOUCH_EXT, PUD_EXT, BOLT_MAX } from './shaders.js';
import { STAR_DATA, LINE_DATA } from '../data/stars.js';
import { CITIES, COMMON_CITIES, cityName, locationName, searchCities } from '../data/cities.js';
import { WX_TYPES, WX_KEYS, wxPreset, WX_NEXT } from '../world/weather-presets.js';
import { fetchAirQuality, fetchWeather } from '../world/weather.js';
import { updateWeatherDetails } from '../ui/weather-details.js';
import { getSavedLocation, saveLocation } from '../world/location.js';
import { zonedHours, zonedDayStart, localTimeToUTC, fmtTime, advanceClock, timezoneOffset, TIME_SPEEDS as SPEEDS } from '../world/clock.js';
import { getAstronomy, sunEventsText, phaseName, phaseIndex, getSunEvents } from '../world/astronomy.js';
import { getLocale, onLanguageChange, setMessage, t } from '../i18n/index.js';
import { bindTimeActions, updateTimeControls } from '../ui/time-controls.js';
import { bindMouseFlightInput, flightStickAxes } from './flight-input.js';

export function startWorld(onUpdate = () => {}) {

const canvas = document.getElementById('view');
const $ = (id) => document.getElementById(id);
function fail(key, values){ setMessage($('errorText'), key, values); $('error').classList.add('show'); $('loader').classList.add('done'); }

const gl = canvas.getContext('webgl2', {antialias:false, alpha:false, depth:false, stencil:false,
  powerPreference:'high-performance', preserveDrawingBuffer:false});
if (!gl){ fail('error.webgl'); return; }
if (!(gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float'))){
  fail('error.floatBuffer'); return;
}
(() => {
  let name = '';
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  try { name = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER); } catch(e) {}
  name = String(name || '').replace(/^ANGLE \((.*)\)$/, '$1').replace(/\s*Direct3D.*$/,'').replace(/,\s*$/,'');
  $('gpu').textContent = name ? 'GPU ' + name : '';
})();
const coarse = matchMedia('(pointer: coarse)').matches;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
let contextLost = false;
canvas.addEventListener('webglcontextlost', (event) => {
  event.preventDefault(); contextLost = true;
  fail('error.contextLost');
});
if (coarse) setMessage($('hintText'), 'hint.touch');

/* ================================================================== */
/*  GL helpers                                                         */
/* ================================================================== */
const shaderCache = new Map();
function compileShader(type, src, label){
  if (shaderCache.has(src)) return shaderCache.get(src);
  const s = gl.createShader(type);
  gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)){
    const log = gl.getShaderInfoLog(s); console.error(label, log); throw new Error(label + ': ' + log);
  }
  shaderCache.set(src, s);
  return s;
}
function makeProgram(vs, fs, label){
  const p = gl.createProgram();
  gl.attachShader(p, compileShader(gl.VERTEX_SHADER, vs, label + ' vs'));
  gl.attachShader(p, compileShader(gl.FRAGMENT_SHADER, fs, label + ' fs'));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(label + ' link: ' + gl.getProgramInfoLog(p));
  const u = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++){ const info = gl.getActiveUniform(p, i); u[info.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(p, info.name); }
  return {p, u, units: 0};
}
function set(P, name, ...v){
  const l = P.u[name]; if (l == null) return;
  if (v.length === 1 && typeof v[0] === 'number') gl.uniform1f(l, v[0]);
  else if (v.length === 1 && v[0].length === 2) gl.uniform2f(l, v[0][0], v[0][1]);
  else if (v.length === 1 && v[0].length === 3) gl.uniform3f(l, v[0][0], v[0][1], v[0][2]);
  else if (v.length === 2) gl.uniform2f(l, v[0], v[1]);
  else if (v.length === 3) gl.uniform3f(l, v[0], v[1], v[2]);
  else if (v.length === 4) gl.uniform4f(l, v[0], v[1], v[2], v[3]);
}
function seti(P, name, v){ const l = P.u[name]; if (l != null) gl.uniform1i(l, v); }
function use(P){ gl.useProgram(P.p); P.units = 0; }
function tex(P, name, target, t){
  const l = P.u[name]; if (l == null) return;
  const unit = P.units++;
  gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(target, t); gl.uniform1i(l, unit);
}
function makeTex2D(w, h, internal, format, type, filter, wrap, data){
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, data || null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
  return t;
}
function makeTex3D(size){
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_3D, t);
  gl.texStorage3D(gl.TEXTURE_3D, Math.log2(size) + 1, gl.RGBA8, size, size, size);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T, gl.TEXTURE_WRAP_R].forEach(k => gl.texParameteri(gl.TEXTURE_3D, k, gl.REPEAT));
  return t;
}
function makeFBO(atts){
  const fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  atts.forEach((t, i) => gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, t, 0));
  gl.drawBuffers(atts.map((_, i) => gl.COLOR_ATTACHMENT0 + i));
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('FBO incomplete');
  return fb;
}

let P;
try {
  P = {
    noise: makeProgram(VS_FULL, NOISE_FS, 'noise'),
    skyLut: makeProgram(VS_FULL, SKYLUT_FS, 'skylut'),
    cshadow: makeProgram(VS_FULL, CSHADOW_FS, 'cshadow'),
    cloud: makeProgram(VS_FULL, CLOUD_FS, 'cloud'),
    taa: makeProgram(VS_FULL, TAA_FS, 'taa'),
    terrain: makeProgram(TERRAIN_VS, TERRAIN_FS, 'terrain'),
    grass: makeProgram(GRASS_VS, GRASS_FS, 'grass'),
    flower: makeProgram(FLOWER_VS, PETAL_FS, 'flower'),
    petal: makeProgram(PETAL_VS, PETAL_FS, 'petal'),
    stream: makeProgram(STREAM_VS, PETAL_FS, 'stream'),
    shell: makeProgram(SHELL_VS, SHELL_FS, 'shell'),
    stars: makeProgram(STAR_VS, STAR_FS, 'stars'),
    flies: makeProgram(FIREFLY_VS, FIREFLY_FS, 'flies'),
    glow: makeProgram(GLOW_VS, GLOW_FS, 'glow'),
    touch: makeProgram(VS_FULL, TOUCH_FS, 'touch'),
    restamp: makeProgram(RESTAMP_VS, RESTAMP_FS, 'restamp'),
    rain: makeProgram(RAIN_VS, RAIN_FS, 'rain'),
    snow: makeProgram(SNOW_VS, SNOW_FS, 'snow'),
    pud: makeProgram(VS_FULL, PUD_FS, 'pud'),
    drop: makeProgram(DROP_VS, DROP_FS, 'drop'),
    bolt: makeProgram(BOLT_VS, BOLT_FS, 'bolt'),
    lines: makeProgram(LINE_VS, LINE_FS, 'lines'),
    dofPrep: makeProgram(VS_FULL, DOFPREP_FS, 'dofprep'),
    dof: makeProgram(VS_FULL, DOF_FS, 'dof'),
    bloomPre: makeProgram(VS_FULL, BLOOMPRE_FS, 'bloompre'),
    down: makeProgram(VS_FULL, DOWN_FS, 'down'),
    up: makeProgram(VS_FULL, UP_FS, 'up'),
    final: makeProgram(VS_FULL, FINAL_FS, 'final'),
    sky: makeProgram(VS_SKY, SKYPASS_FS, 'sky'),
    god: makeProgram(VS_FULL, GOD_FS, 'god'),
  };
} catch (e){ fail('error.shader', { message: e.message.slice(0, 400) }); return; }
const emptyVAO = gl.createVertexArray();
const draw = () => gl.drawArrays(gl.TRIANGLES, 0, 3);

/* ================================================================== */
/*  Textures                                                           */
/* ================================================================== */
const SHAPE_N = 128, DETAIL_N = 64, WEATHER_N = 512;
const shapeTex = makeTex3D(SHAPE_N), detailTex = makeTex3D(DETAIL_N);
const weatherTex = makeTex2D(WEATHER_N, WEATHER_N, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.LINEAR, gl.REPEAT);
const terrTex = makeTex2D(TN, TN, gl.R16F, gl.RED, gl.FLOAT, gl.LINEAR, gl.REPEAT, tnData);
const genFBO = gl.createFramebuffer();
const genJobs = [{mode: 2}];
for (let i = 0; i < DETAIL_N; i++) genJobs.push({mode: 1, slice: i});
for (let i = 0; i < SHAPE_N; i++) genJobs.push({mode: 0, slice: i});
const genTotal = genJobs.length;
let noiseReady = false;
function genStep(budgetMs){
  const t0 = performance.now(); let n = 0;
  gl.bindVertexArray(emptyVAO);
  use(P.noise);
  gl.bindFramebuffer(gl.FRAMEBUFFER, genFBO);
  while (genJobs.length && (n < 2 || performance.now() - t0 < budgetMs) && n < 24){
    const job = genJobs.shift(); n++;
    if (job.mode === 2){
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, weatherTex, 0);
      gl.viewport(0, 0, WEATHER_N, WEATHER_N); set(P.noise, 'uSize', WEATHER_N);
    } else {
      const sz = job.mode === 0 ? SHAPE_N : DETAIL_N;
      gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, job.mode === 0 ? shapeTex : detailTex, 0, job.slice);
      gl.viewport(0, 0, sz, sz); set(P.noise, 'uSize', sz); set(P.noise, 'uSlice', job.slice);
    }
    gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
    seti(P.noise, 'uMode', job.mode);
    draw();
  }
  const p = 1 - genJobs.length / genTotal;
  $('loadBar').style.setProperty('--p', (p * 100).toFixed(1) + '%');
  setMessage($('loadText'), 'loader.clouds', { percent: Math.round(p * 100) });
  if (!genJobs.length){
    gl.bindTexture(gl.TEXTURE_3D, shapeTex); gl.generateMipmap(gl.TEXTURE_3D);
    gl.bindTexture(gl.TEXTURE_3D, detailTex); gl.generateMipmap(gl.TEXTURE_3D);
    noiseReady = true; $('loader').classList.add('done');
  }
}
const SKY_W = 192, SKY_H = 128;
const skyTex = makeTex2D(SKY_W, SKY_H, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.LINEAR, gl.CLAMP_TO_EDGE);
gl.bindTexture(gl.TEXTURE_2D, skyTex); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
const skyFBO = makeFBO([skyTex]);
const CSH_N = 256, CSH_EXT = 24;
const cshTex = makeTex2D(CSH_N, CSH_N, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.LINEAR, gl.CLAMP_TO_EDGE);
const cshFBO = makeFBO([cshTex]);
const glowTex = makeTex2D(GLOW_N, GLOW_N, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.LINEAR, gl.CLAMP_TO_EDGE);
const glowFBO = makeFBO([glowTex]);
const touchTex = [0, 1].map(() => makeTex2D(TOUCH_N, TOUCH_N, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.NEAREST, gl.CLAMP_TO_EDGE));
const touchFBO = touchTex.map(t => makeFBO([t]));
const pudTex = makeTex2D(PUD_N, PUD_N, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.LINEAR, gl.CLAMP_TO_EDGE), pudFBO = makeFBO([pudTex]);
let pudCx = NaN, pudCz = NaN;
const stampUni = new Float32Array(80);
let touchIdx = 0, touchCx = NaN, touchCz = NaN, touchDecayAcc = 0;
/* infinite memory: the stream's path is logged (one point per ~0.7 m, wall-clock stamped, indexed in 64 m cells) and
   re-stamped into the touch map wherever it scrolls, so flowers stay open however far you roam; saved locally */
const MEM_KEY = 'meadow.trail.v1', MEM_CELL = 64, MEM_MAX = 30000;
let memPts = [], memGrid = new Map(), memDirty = false, memLastSave = 0, memLastX = NaN, memLastZ = NaN, restampCx = NaN, restampCz = NaN, restampFrame = 0;
const memKey = (x, z) => Math.floor(x / MEM_CELL) + ',' + Math.floor(z / MEM_CELL);
function memIndex(){
  memGrid = new Map();
  for (let i = 0; i < memPts.length; i += 4){ const k = memKey(memPts[i], memPts[i + 1]); let a = memGrid.get(k); if (!a){ a = []; memGrid.set(k, a); } a.push(i); }
}
try { const sv = JSON.parse(localStorage.getItem(MEM_KEY) || 'null'); if (Array.isArray(sv) && sv.length % 4 === 0){ memPts = sv; memIndex(); } } catch (e) {}
function memAdd(x, z, w){
  if (isFinite(memLastX) && Math.hypot(x - memLastX, z - memLastZ) < 0.7) return;
  memLastX = x; memLastZ = z;
  memPts.push(Math.round(x * 10) / 10, Math.round(z * 10) / 10, Math.round(Date.now() / 1000), Math.round(w * 100) / 100);
  if (memPts.length > MEM_MAX * 4){ memPts.splice(0, MEM_MAX * 0.1 * 4); memIndex(); }
  else { const k = memKey(x, z); let a = memGrid.get(k); if (!a){ a = []; memGrid.set(k, a); } a.push(memPts.length - 4); }
  memDirty = true;
}
function memSave(force){
  if (!memDirty || (!force && performance.now() - memLastSave < 15000)) return;
  memLastSave = performance.now(); memDirty = false;
  try { localStorage.setItem(MEM_KEY, JSON.stringify(memPts)); } catch (e) {}
}
const restampVAO = gl.createVertexArray(), restampBuf = gl.createBuffer();
let restampData = new Float32Array(4096 * 4);
gl.bindVertexArray(restampVAO); gl.bindBuffer(gl.ARRAY_BUFFER, restampBuf); gl.bufferData(gl.ARRAY_BUFFER, restampData.byteLength, gl.DYNAMIC_DRAW);
gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 0, 0); gl.vertexAttribDivisor(0, 1);
gl.bindVertexArray(null);
/* ---------- weather ---------- */
/* forecast-style weather presets (cloud cover/density, cloud speed, ground wind, visibility, rain, snow,
   lightning strikes per 10 s, how wet / how snowy the ground may get) */
const WXS = {fog: 0, rain: 0, snow: 0, storm: 0, wet: 0, snowCov: 0, fogDens: 0, fogH: 120, type: 'cloudy', from: null, to: null, t0: 0, dur: 1, until: 0, followOK: false, src: '', prog: 1};
const WP = wxPreset('cloudy');
WXS.from = Object.assign({}, WP); WXS.to = Object.assign({}, WP);
let covEff = WP.cov, densEff = WP.dens, wxClock = 0;   /* weather runs on its own clock: real time, sped up by the time-lapse, never paused */
function wxSetTarget(type, params, blendSec){ WXS.type = type; WXS.from = Object.assign({}, WP); WXS.to = params; WXS.t0 = wxClock; WXS.prog = 0; WXS.dur = Math.max(0.5, blendSec) * 1000; lightKey = ''; }
function wxCold(){
  const m = new Date(simMs + cityOffset(simMs)).getUTCMonth() + 1, al = Math.abs(LOC.lat), north = LOC.lat >= 0;
  const winter = north ? (m === 12 || m <= 2) : (m >= 6 && m <= 8), shoulder = north ? (m === 11 || m === 3) : (m === 5 || m === 9);
  return al > 25 && (winter || (shoulder && al > 40));
}
function wxPickNext(cur){
  const o = Object.assign({}, WX_NEXT[cur] || {cloudy: 1}), cold = wxCold(), hr = S.time;
  if (cold){
    if (o.lightrain){ o.lightsnow = (o.lightsnow || 0) + o.lightrain * 0.8; o.lightrain *= 0.2; }
    if (o.rain){ o.snow = (o.snow || 0) + o.rain * 0.7; o.rain *= 0.3; }
  }
  for (const k in o){
    const t = WX_TYPES[k];
    if (!cold && t.snow) o[k] = 0;                                   /* no snow outside the cold season */
    if (t.bolt) o[k] *= cold ? 0.15 : (hr > 13 && hr < 20 ? 2.2 : 1); /* thunder favours warm afternoons */
    if (k === 'mist' || k === 'fog') o[k] *= hr > 4 && hr < 9 ? 2.5 : (hr > 11 && hr < 17 ? 0.4 : 1);  /* morning fog */
  }
  const tot = Object.values(o).reduce((a, b) => a + b, 0);
  if (tot <= 0) return 'cloudy';
  let r = Math.random() * tot;
  for (const k in o){ r -= o[k]; if (r <= 0) return k; }
  return 'cloudy';
}
function wxStartDynamic(first){
  const nt = first ? WXS.type : wxPickNext(WXS.type);
  wxSetTarget(nt, wxPreset(nt), first ? 20 : 90 + Math.random() * 60);
  WXS.until = wxClock + (6 + Math.random() * 10) * 60000;
}
/* water line calibrated on the measured distribution of the pooling field, so the flooded area grows steadily with
   wetness (from ~0.4 % when the rain starts to ~25 % when soaked) instead of appearing late and all at once */
const PUD_Q = [[0.5, -0.009], [0.6, 0.048], [0.7, 0.108], [0.8, 0.178], [0.9, 0.274], [0.95, 0.352], [0.98, 0.44], [0.99, 0.497], [0.999, 0.62], [1.0, 0.9]];
function pudThreshold(wet){
  const f = 1 - (0.004 + 0.25 * Math.pow(Math.max(wet, 0), 1.1));
  for (let i = 1; i < PUD_Q.length; i++) if (f <= PUD_Q[i][0]){ const [f0, t0] = PUD_Q[i - 1], [f1, t1] = PUD_Q[i]; return t0 + (t1 - t0) * (f - f0) / (f1 - f0); }
  return 0.9;
}
const visFromSlider = (v) => 60 * Math.pow(500, v / 1000), sliderFromVis = (m) => 1000 * Math.log(Math.max(m, 60) / 60) / Math.log(500);
const fmtVis = (m) => m >= 1000 ? (m / 1000).toFixed(m >= 10000 ? 0 : 1) + ' km' : Math.round(m) + ' m';
const manualParams = () => ({cov: S.coverage, dens: S.density, wind: S.wind, breeze: S.breeze, vis: visFromSlider(S.fogVisS), rain: S.rainAmt, snow: S.snowAmt, bolt: S.boltFreq, wet: S.puddle, snowCov: S.snowMax});
function updateWeather(dt){
  /* the weather clock follows the time-lapse but at most 60x, so a weather spell lasts seconds, not frames */
  const dWx = dt * 1000 * Math.min(Math.max(1, SPEEDS[S.speed | 0]), 60);
  wxClock += dWx;
  if ((S.wxMode === 'dynamic' || (S.wxMode === 'follow' && !WXS.followOK)) && wxClock >= WXS.until) wxStartDynamic(false);
  /* blend progress runs on the weather clock but never faster than ~4 real seconds for a weather change */
  WXS.prog = Math.min(1, WXS.prog + Math.min(dWx / WXS.dur, WXS.dur > 10000 ? dt / 4 : 1));
  const pr = WXS.prog, e = pr * pr * (3 - 2 * pr);
  WX_KEYS.forEach(k => { WP[k] = WXS.from[k] + (WXS.to[k] - WXS.from[k]) * e; });
  WP.vis = Math.exp(Math.log(Math.max(WXS.from.vis, 60)) + (Math.log(Math.max(WXS.to.vis, 60)) - Math.log(Math.max(WXS.from.vis, 60))) * e);
  /* ground water and snow build up and go away over (simulated) time */
  const dts = Math.min(dt * Math.max(SPEEDS[S.speed | 0], 1), 30), sunUp = AST && AST.sunAlt > 0;
  WXS.rain = WP.rain; WXS.snow = WP.snow;
  WXS.storm += (Math.min(1, WP.bolt / 1.2) - WXS.storm) * (1 - Math.exp(-dt / 3));
  if (WP.rain > 0.05 && WXS.wet < WP.wet) WXS.wet = Math.min(WP.wet, WXS.wet + dts / 70 * WP.rain);
  else if (WXS.wet > WP.wet || WP.rain <= 0.05) WXS.wet = Math.max(WP.rain > 0.05 ? WP.wet : 0, WXS.wet - dts / (sunUp ? 300 : 700));
  if (WP.snow > 0.05 && WXS.snowCov < WP.snowCov) WXS.snowCov = Math.min(WP.snowCov, WXS.snowCov + dts / 45 * (0.3 + WP.snow));
  else if (WP.snow <= 0.05) WXS.snowCov = Math.max(0, WXS.snowCov - dts / (sunUp ? 500 : 1500));
  const precip = WP.rain + WP.snow;
  WXS.fogDens = WP.vis < 29000 ? 3.912 / WP.vis : 0;
  WXS.fogH = precip < 0.08 ? (WP.vis < 1000 ? 55 : 120) : 260;
  WXS.fog = clamp(1 - WP.vis / 3000, 0, 1);
  covEff = WP.cov; densEff = WP.dens;
}
const bolt = {t: 99, segs: [], pulses: [], x: 0, z: 0, dist: 0};
function boltPath(a, b, iters, rough){
  let pts = [a, b];
  for (let it = 0; it < iters; it++){
    const np = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++){
      const p0 = pts[i], p1 = pts[i + 1], L = Math.hypot(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]);
      np.push([(p0[0] + p1[0]) / 2 + (Math.random() - 0.5) * L * rough, (p0[1] + p1[1]) / 2 + (Math.random() - 0.5) * L * rough * 0.4, (p0[2] + p1[2]) / 2 + (Math.random() - 0.5) * L * rough], p1);
    }
    pts = np;
  }
  return pts;
}
function spawnBolt(camM, f){
  const ang = Math.atan2(f[0], f[2]) + (Math.random() - 0.5) * 2.0, dist = 900 + Math.random() * 3800;
  const gx = camM[0] + Math.sin(ang) * dist, gz = camM[2] + Math.cos(ang) * dist, gy = groundH(gx, gz), top = LAYER[0] * 1000 + 100;
  const main = boltPath([gx + (Math.random() - 0.5) * 400, top, gz + (Math.random() - 0.5) * 400], [gx, gy, gz], 6, 0.35);
  bolt.segs = [];
  for (let i = 0; i < main.length - 1; i++) bolt.segs.push([main[i], main[i + 1], 3.2]);
  for (let b = 0; b < 4; b++){
    const s0 = main[4 + Math.floor(Math.random() * main.length * 0.6)], L = 200 + Math.random() * 500, ba = Math.random() * 6.283;
    const br = boltPath(s0, [s0[0] + Math.sin(ba) * L * 0.6, s0[1] - L, s0[2] + Math.cos(ba) * L * 0.6], 4, 0.4);
    for (let i = 0; i < br.length - 1; i++) bolt.segs.push([br[i], br[i + 1], 1.4]);
  }
  bolt.t = 0; bolt.x = gx; bolt.z = gz; bolt.dist = dist;
  bolt.pulses = [[0, 1.0], [0.06 + Math.random() * 0.04, 0.35 + Math.random() * 0.3], [0.16 + Math.random() * 0.1, 0.6 + Math.random() * 0.4]];
  if (Math.random() < 0.5) bolt.pulses.push([0.35 + Math.random() * 0.15, 0.3]);
}
/* lens rain: a small particle simulation of water on the lens (the technique behind the well-known canvas
   "rain on glass" effects): drops land and bead up, merge on contact, and once heavy enough slide in stick-slip
   steps along wandering, often diagonal paths, shedding small beads and absorbing what they run into */
const LR = {drops: [], acc: 0, tex: null, fbo: null, w: 0, h: 0, data: new Float32Array(560 * 5), vao: null, buf: null, lastYaw: 0};
LR.vao = gl.createVertexArray(); LR.buf = gl.createBuffer();
gl.bindVertexArray(LR.vao); gl.bindBuffer(gl.ARRAY_BUFFER, LR.buf); gl.bufferData(gl.ARRAY_BUFFER, LR.data.byteLength, gl.DYNAMIC_DRAW);
gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 20, 0); gl.vertexAttribDivisor(0, 1);
gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 20, 16); gl.vertexAttribDivisor(1, 1);
gl.bindVertexArray(null);
const LR_MAX_R = 0.026, LR_SLIDE = 0.009;
function lensNewDrop(x, y, r, life, grow){
  return {x, y, r, vx: 0, vy: 0, grow: grow || 0, life, stall: 0, trail: 0, seed: Math.random(), bias: (Math.random() - 0.5) * 0.14, dead: false};
}
function lensAddDrop(x, y, r){
  for (const e of LR.drops){
    if (!e.dead && Math.hypot(e.x - x, e.y - y) < (e.r + r) * 0.9){ e.r = Math.min(LR_MAX_R, Math.sqrt(e.r * e.r + r * r)); return; }
  }
  LR.drops.push(lensNewDrop(x, y, r, 4 + Math.random() * 16, 0));
  if (LR.drops.length > 520) LR.drops.shift();
}
function lensRainUpdate(dt, inten, asp, yawRate){
  dt = Math.min(dt, 0.05);
  LR.acc += dt * inten * 22;
  while (LR.acc >= 1){
    LR.acc -= 1;
    const big = Math.random() < 0.2;
    lensAddDrop(Math.random() * asp, Math.random() * 1.1, big ? 0.006 + Math.random() * 0.006 : 0.0018 + Math.random() * 0.0035);
  }
  const D = LR.drops, CS = 0.04, grid = new Map();
  D.forEach((d, i) => { const k = Math.floor(d.x / CS) + ',' + Math.floor(d.y / CS); let a = grid.get(k); if (!a) grid.set(k, a = []); a.push(i); });
  for (let i = 0; i < D.length; i++){
    const d = D[i];
    if (d.dead) continue;
    d.grow = Math.min(1, d.grow + dt * 5);
    d.life -= dt;
    if (d.life < 0) d.r -= dt * 0.0012;                       /* evaporating */
    if (d.r < 0.0012){ d.dead = true; continue; }
    if (d.r <= LR_SLIDE) continue;
    /* heavy enough to slide: accelerate toward a size-dependent speed, catch on the glass now and then */
    if (d.stall > 0){ d.stall -= dt; d.vy *= Math.exp(-dt * 12); }
    else {
      d.vy += (-(0.08 + 22 * (d.r - LR_SLIDE)) - d.vy) * (1 - Math.exp(-dt * 3));
      if (Math.random() < dt * 1.6) d.stall = 0.08 + Math.random() * 0.45;
    }
    d.vx += ((Math.random() - 0.5) * 0.9 + (d.bias - d.vx) * 0.8 - yawRate * 0.03) * dt;
    d.x += d.vx * dt; d.y += d.vy * dt;
    d.trail += Math.hypot(d.vx, d.vy) * dt;
    if (d.trail > Math.max(0.01, d.r * 1.4) && Math.abs(d.vy) > 0.02){
      d.trail = 0;
      const tr = d.r * (0.2 + Math.random() * 0.14);
      D.push(lensNewDrop(d.x + (Math.random() - 0.5) * d.r * 0.4, d.y + d.r * 0.9, tr, 2 + Math.random() * 6, 1));
      d.r = Math.sqrt(Math.max(d.r * d.r - tr * tr * 0.5, 0));
    }
    /* contact: whatever it runs into is absorbed (area is conserved), which also wipes a clean path */
    const gx = Math.floor(d.x / CS), gy = Math.floor(d.y / CS);
    for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++){
      const a = grid.get((gx + ox) + ',' + (gy + oy));
      if (!a) continue;
      for (const j of a){
        const e = D[j];
        if (j === i || e.dead) continue;
        if (Math.hypot(e.x - d.x, e.y - d.y) < (d.r + e.r) * 0.8){ d.r = Math.min(LR_MAX_R, Math.sqrt(d.r * d.r + e.r * e.r)); e.dead = true; d.stall = 0; d.vy -= 0.03; }
      }
    }
    if (d.y < -0.06 || d.x < -0.06 || d.x > asp + 0.06) d.dead = true;
  }
  LR.drops = D.filter(d => !d.dead);
}
function lensRainDraw(asp){
  const w = Math.max(64, W >> 1), h = Math.max(64, H >> 1);
  if (!LR.tex || LR.w !== w || LR.h !== h){
    if (LR.tex){ gl.deleteTexture(LR.tex); gl.deleteFramebuffer(LR.fbo); }
    LR.tex = makeTex2D(w, h, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.LINEAR, gl.CLAMP_TO_EDGE); LR.fbo = makeFBO([LR.tex]); LR.w = w; LR.h = h;
  }
  const D = LR.drops.slice().sort((a, b) => a.r - b.r), n = Math.min(D.length, 560);
  for (let i = 0; i < n; i++){
    const d = D[i];
    LR.data.set([d.x / asp, d.y, d.r * d.grow, Math.min(1, Math.abs(d.vy) * 4), d.seed], i * 5);
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, LR.fbo); gl.viewport(0, 0, LR.w, LR.h);
  gl.clearColor(0.5, 0.5, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
  if (n){
    const Dp = P.drop; use(Dp); set(Dp, 'uAsp', asp);
    gl.enable(gl.BLEND); gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.bindVertexArray(LR.vao); gl.bindBuffer(gl.ARRAY_BUFFER, LR.buf); gl.bufferSubData(gl.ARRAY_BUFFER, 0, LR.data, 0, n * 5);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, n);
    gl.bindVertexArray(emptyVAO); gl.disable(gl.BLEND);
  }
}
const flashAt = (t) => bolt.pulses.reduce((fv, [t0, a]) => t >= t0 ? fv + a * Math.exp(-(t - t0) / 0.05) : fv, 0);
const boltVAO = gl.createVertexArray(), boltBuf = gl.createBuffer(), boltData = new Float32Array(BOLT_MAX * 7);
gl.bindVertexArray(boltVAO); gl.bindBuffer(gl.ARRAY_BUFFER, boltBuf); gl.bufferData(gl.ARRAY_BUFFER, boltData.byteLength, gl.DYNAMIC_DRAW);
gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 28, 0); gl.vertexAttribDivisor(0, 1);
gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 28, 12); gl.vertexAttribDivisor(1, 1);
gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 28, 24); gl.vertexAttribDivisor(2, 1);
gl.bindVertexArray(null);

/* ---------- real sky buffers ---------- */
const DEG = Math.PI / 180;
const b64bytes = (str) => { const bin = atob(str), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };
const eqVec = (raU16, decU16) => { const ra = raU16 / 65535 * Math.PI * 2, dec = (decU16 / 65535 * 180 - 90) * DEG; return [Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec)]; };
/* star colour from B-V: Ballesteros (2012) temperature, then a blackbody fit, softened toward white as the eye sees it */
function bvToRgb(bv){
  const T = 4600 * (1 / (0.92 * bv + 1.7) + 1 / (0.92 * bv + 0.62)), t = T / 100;
  const r = t <= 66 ? 255 : 329.698727446 * Math.pow(t - 60, -0.1332047592);
  const g = t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * Math.pow(t - 60, -0.0755148492);
  const b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  const c = [r, g, b].map(v => Math.max(0, Math.min(255, v)) / 255), m = Math.max(...c, 1e-3);
  return c.map(v => (v / m) * 0.65 + 0.35);
}
let STAR_N = 0, LINE_N = 0;
const starVAO = gl.createVertexArray(), planetVAO = gl.createVertexArray(), lineVAO = gl.createVertexArray();
const planetPos = new Float32Array(5 * 4), planetBuf = gl.createBuffer();
(() => {
  const u = b64bytes(STAR_DATA), dv = new DataView(u.buffer);
  STAR_N = u.length / 6;
  const pos = new Float32Array(STAR_N * 4), col = new Float32Array(STAR_N * 3);
  for (let i = 0; i < STAR_N; i++){
    const v = eqVec(dv.getUint16(i * 6, true), dv.getUint16(i * 6 + 2, true));
    pos.set([v[0], v[1], v[2], u[i * 6 + 4] / 255 * 8.5 - 2], i * 4);
    col.set(bvToRgb(u[i * 6 + 5] / 255 * 2.5 - 0.5), i * 3);
  }
  const attr = (vao, loc, data, size, usage) => { gl.bindVertexArray(vao); const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, usage || gl.STATIC_DRAW); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0); return b; };
  attr(starVAO, 0, pos, 4); attr(starVAO, 1, col, 3);
  gl.bindVertexArray(planetVAO);
  gl.bindBuffer(gl.ARRAY_BUFFER, planetBuf); gl.bufferData(gl.ARRAY_BUFFER, planetPos, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 0, 0);
  attr(planetVAO, 1, new Float32Array([0.95, 0.88, 0.8, 1, 0.97, 0.9, 1, 0.62, 0.42, 1, 0.93, 0.82, 1, 0.88, 0.68]), 3);
  const lu = b64bytes(LINE_DATA), ldv = new DataView(lu.buffer);
  LINE_N = lu.length / 4;
  const lp = new Float32Array(LINE_N * 3);
  for (let i = 0; i < LINE_N; i++) lp.set(eqVec(ldv.getUint16(i * 4, true), ldv.getUint16(i * 4 + 2, true)), i * 3);
  attr(lineVAO, 0, lp, 3);
  gl.bindVertexArray(null);
})();
/* planets: JPL "Approximate Positions of the Major Planets", Table 1 (valid 1800-2050) */
const PLANET_EL = [
  [[0.38709927, 0.20563593, 7.00497902, 252.2503235, 77.45779628, 48.33076593], [0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081], -0.42],
  [[0.72333566, 0.00677672, 3.39467605, 181.9790995, 131.60246718, 76.67984255], [0.0000039, -0.00004107, -0.0007889, 58517.81538729, 0.00268329, -0.27769418], -4.4],
  [[1.52371034, 0.0933941, 1.84969142, -4.55343205, -23.94362959, 49.55953891], [0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343], -1.52],
  [[5.202887, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909], [-0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106], -9.4],
  [[9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448], [-0.0012506, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794], -8.88],
];
const EARTH_EL = [[1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0], [0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0]];
function helio(el, rate, T){
  const k = el.map((v, i) => v + rate[i] * T);
  const a = k[0], e = k[1], I = k[2] * DEG, L = k[3] * DEG, wb = k[4] * DEG, Om = k[5] * DEG, w = wb - Om;
  let M = L - wb; M = ((M + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
  let E = M + e * Math.sin(M);
  for (let i = 0; i < 6; i++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  const xp = a * (Math.cos(E) - e), yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const cw = Math.cos(w), sw = Math.sin(w), cO = Math.cos(Om), sO = Math.sin(Om), cI = Math.cos(I), sI = Math.sin(I);
  return [(cw * cO - sw * sO * cI) * xp + (-sw * cO - cw * sO * cI) * yp, (cw * sO + sw * cO * cI) * xp + (-sw * sO + cw * cO * cI) * yp, sw * sI * xp + cw * sI * yp];
}
function updatePlanets(ms){
  const T = (ms / 86400000 + 2440587.5 - 2451545) / 36525, eps = 23.43928 * DEG;
  const E = helio(EARTH_EL[0], EARTH_EL[1], T);
  PLANET_EL.forEach(([el, rate, H], i) => {
    const h = helio(el, rate, T), g = [h[0] - E[0], h[1] - E[1], h[2] - E[2]];
    const r = Math.hypot(...h), dl = Math.hypot(...g);
    const x = g[0], y = g[1] * Math.cos(eps) - g[2] * Math.sin(eps), z = g[1] * Math.sin(eps) + g[2] * Math.cos(eps);
    planetPos.set([x / dl, y / dl, z / dl, H + 5 * Math.log10(r * dl)], i * 4);
  });
  gl.bindBuffer(gl.ARRAY_BUFFER, planetBuf); gl.bufferSubData(gl.ARRAY_BUFFER, 0, planetPos);
}
const eqMat = new Float32Array(9);

/* ================================================================== */
/*  Atmosphere on the CPU                                              */
/* ================================================================== */
const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const RE = 6371, RA = 6471, SUN_I = 20;
const BR = [5.802e-3, 13.558e-3, 33.1e-3], BM = 3.996e-3, BME = 4.40e-3, BO = [0.650e-3, 1.881e-3, 0.085e-3];
function rs(o, d, r){
  const cy = o[1] + RE, b = o[0] * d[0] + cy * d[1] + o[2] * d[2], c = o[0] * o[0] + cy * cy + o[2] * o[2] - r * r, disc = b * b - c;
  if (disc < 0) return null; const s = Math.sqrt(disc); return [-b - s, -b + s];
}
function opticalDepth(o, d, n){
  const g = rs(o, d, RE);
  if (g && g[0] > 0 && (o[1] + RE) * d[1] + o[0] * d[0] + o[2] * d[2] < 0) return null;
  const L = rs(o, d, RA)[1], dt = L / n; let r = 0, m = 0, oz = 0;
  for (let i = 0; i < n; i++){
    const t = (i + 0.5) * dt, h = Math.max(Math.hypot(o[0] + d[0] * t, o[1] + d[1] * t + RE, o[2] + d[2] * t) - RE, 0);
    r += Math.exp(-h / 8) * dt; m += Math.exp(-h / 1.2) * dt; oz += Math.max(0, 1 - Math.abs(h - 25) / 15) * dt;
  }
  return [r, m, oz];
}
function transmittance(h, d){
  const od = opticalDepth([0, h, 0], d, 24);
  return od ? [0, 1, 2].map(c => Math.exp(-(BR[c] * od[0] + BME * od[1] + BO[c] * od[2]))) : [0, 0, 0];
}
function skyRadiance(h, d, sun){
  const o = [0, h, 0]; let tmax = rs(o, d, RA)[1]; const g = rs(o, d, RE); if (g && g[0] > 0) tmax = g[0];
  const N = 14, dt = tmax / N, sR = [0, 0, 0], sM = [0, 0, 0]; let vr = 0, vm = 0, vo = 0;
  for (let i = 0; i < N; i++){
    const t = (i + 0.5) * dt, p = [d[0] * t, h + d[1] * t, d[2] * t];
    const hh = Math.max(Math.hypot(p[0], p[1] + RE, p[2]) - RE, 0);
    const dr = Math.exp(-hh / 8) * dt, dm = Math.exp(-hh / 1.2) * dt, dz = Math.max(0, 1 - Math.abs(hh - 25) / 15) * dt;
    const mr = vr + dr * 0.5, mm = vm + dm * 0.5, mz = vo + dz * 0.5; vr += dr; vm += dm; vo += dz;
    const l = opticalDepth(p, sun, 6); if (!l) continue;
    for (let c = 0; c < 3; c++){ const att = Math.exp(-(BR[c] * (mr + l[0]) + BME * (mm + l[1]) + BO[c] * (mz + l[2]))); sR[c] += dr * att; sM[c] += dm * att; }
  }
  const mu = d[0] * sun[0] + d[1] * sun[1] + d[2] * sun[2], pr = 3 / (16 * Math.PI) * (1 + mu * mu), gg = 0.8, g2 = gg * gg;
  const pm = 3 / (8 * Math.PI) * ((1 - g2) * (1 + mu * mu)) / ((2 + g2) * Math.pow(1 + g2 - 2 * gg * mu, 1.5));
  const col = [0, 1, 2].map(c => SUN_I * (sR[c] * BR[c] * pr + sM[c] * BM * pm));
  const k = Math.min(1, Math.max(0, (sun[1] - 0.03) / 0.32)), ks = k * k * (3 - 2 * k);
  const l = lum(col), hw = Math.pow(1 - Math.abs(d[1]), 5) * (0.15 + 0.6 * ks), tint = [0.90, 0.99, 1.13];
  return col.map((v, c) => v + (l * tint[c] - v) * hw);
}
function skyStats(h, sun){
  const avg = [0, 0, 0], irr = [0, 0, 0], NE = 5, NA = 8;
  for (let i = 0; i < NE; i++){
    const y = (i + 0.5) / NE, ce = Math.sqrt(1 - y * y);
    for (let j = 0; j < NA; j++){
      const a = (j + 0.5) / NA * Math.PI * 2, L = skyRadiance(h, [ce * Math.sin(a), y, ce * Math.cos(a)], sun);
      for (let c = 0; c < 3; c++){ avg[c] += L[c]; irr[c] += L[c] * y; }
    }
  }
  const n = NE * NA;
  return {avg: avg.map(v => v / n), irr: irr.map(v => v / n * 2 * Math.PI)};
}

/* ================================================================== */
/*  State                                                              */
/* ================================================================== */
// cloud: cloud-buffer size as a fraction of CSS px; layers: [grid cells, cell size m, blade segments]
const QUALITY = {
  low:   {cloud: 0.45, steps: 40,  light: 4, dpr: 1.5, samples: 2, layers: [[224, 0.14, 4], [192, 0.48, 2], [160, 1.5, 1]],  shell: [3, 100, 0.08],  flowers: 50,  petals: 120, terr: [150, 192], dof: [6, 1.3],  bloom: 3},
  med:   {cloud: 0.6,  steps: 56,  light: 5, dpr: 2.0, samples: 4, layers: [[320, 0.12, 4], [256, 0.4, 2], [192, 1.25, 1]],  shell: [4, 140, 0.075], flowers: 72,  petals: 240, terr: [200, 256], dof: [8, 1.15], bloom: 4},
  high:  {cloud: 0.7,  steps: 80,  light: 6, dpr: 2.0, samples: 4, layers: [[480, 0.10, 4], [448, 0.30, 2], [384, 0.85, 1]], shell: [6, 200, 0.07],  flowers: 100, petals: 420, terr: [256, 320], dof: [10, 1.0], bloom: 5},
  ultra: {cloud: 0.9,  steps: 110, light: 6, dpr: 2.5, samples: 4, layers: [[576, 0.09, 4], [512, 0.28, 2], [448, 0.8, 1]],  shell: [8, 260, 0.065], flowers: 130, petals: 600, terr: [300, 384], dof: [12, 0.9], bloom: 5},
};
const TILE = 32, LAYER_WIDTH = [1.0, 2.4, 6.0];
/* simulated clock: starts at the browser's local time and runs at a chosen multiple of real time */
let simMs = Date.now();
const S = {
  time: 0, speed: 1, wxSync: true, constel: false, flies: true, flowerGlow: false, bloom: true, streamDist: 'near', streamScale: false, infMem: false, bloomR: 4, wxMode: 'follow', wxType: 'cloudy', fogVisS: 1000, rainAmt: 0, snowAmt: 0, boltFreq: 0, puddle: 0, snowMax: 0, lensDrops: true, sunAz: 0, coverage: 0.58, density: 1.0, wind: 40, breeze: 0.65, petals: true,
  heightSlider: 0, dof: 0.6, sway: !reduceMotion, quality: coarse ? 'med' : 'high', god: !coarse, auto: !reduceMotion,
  fovY: 60, x: 0, z: 0, agl: 2.2, temperatureUnit: 'celsius',
  showWeather: true, showTemperature: true, showPrecipitation: false, showAirQuality: false, showClouds: false, showWind: false,
};
/* settings persist in this browser: everything the panel controls except the clock itself */
const SETTINGS_KEY = 'meadow.settings.v1';
const PERSIST_KEYS = ['auto', 'god', 'petals', 'sway', 'constel', 'flies', 'flowerGlow', 'bloom', 'streamScale', 'infMem', 'lensDrops', 'sunAz', 'dof',
  'heightSlider', 'agl', 'speed', 'streamDist', 'wxMode', 'wxType', 'coverage', 'density', 'wind', 'breeze', 'fogVisS', 'rainAmt', 'snowAmt', 'boltFreq',
  'puddle', 'snowMax', 'qualityUser', 'bloomR', 'temperatureUnit', 'showWeather', 'showTemperature', 'showPrecipitation', 'showAirQuality', 'showClouds', 'showWind'];
try {
  const sv = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null');
  if (sv && typeof sv === 'object'){
    for (const k of PERSIST_KEYS) if (k in sv && (S[k] === undefined || typeof sv[k] === typeof S[k])) S[k] = sv[k];
    if (!['near', 'mid', 'far'].includes(S.streamDist)) S.streamDist = 'near';
    if (!['follow', 'dynamic', 'manual', 'off'].includes(S.wxMode)) S.wxMode = 'follow';
    if (!WX_TYPES[S.wxType]) S.wxType = 'cloudy';
    if (!['celsius', 'fahrenheit'].includes(S.temperatureUnit)) S.temperatureUnit = 'celsius';
  }
} catch (e) {}
S.speed = Number.isInteger(S.speed) && S.speed >= 0 && S.speed < SPEEDS.length ? S.speed : 1;
let followNow = S.speed === 1;
let settingsSnap = '';
function saveSettings(){
  const o = {};
  for (const k of PERSIST_KEYS) if (S[k] !== undefined) o[k] = S[k];
  const j = JSON.stringify(o);
  if (j !== settingsSnap){ settingsSnap = j; try { localStorage.setItem(SETTINGS_KEY, j); } catch (e) {} }
}
setInterval(saveSettings, 1500);
window.addEventListener('pagehide', saveSettings);
const LAYER = [1.5, 4.0], windOff = [0, 0, 0];
let WIND_ANGLE = 0.6;
const aglFromSlider = (v) => 1.2 + 6500 * Math.pow(v / 1000, 2.2);
const sliderFromAgl = (a) => Math.pow(Math.max(a - 1.2, 0) / 6500, 1 / 2.2) * 1000;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
let userPickedQuality = false;
const cam = {yaw: 0, pitch: 0.04, roll: 0, yawT: 0, pitchT: 0.04, vx: 0, vz: 0, y: 0, focus: 40, fov: 60};

(() => {
  let best = null;
  for (let i = 0; i < 260; i++){
    const x = (tnSample(i * 0.0371, 0.13) * 0.5 + (i % 17) / 17 - 0.5) * 9000, z = (tnSample(0.71, i * 0.0293) * 0.5 + ((i * 7) % 13) / 13 - 0.5) * 9000;
    const h0 = groundH(x, z);
    let ring = 0, low = Infinity, lowA = 0;
    for (let k = 0; k < 16; k++){
      const a = k / 16 * Math.PI * 2;
      ring += groundH(x + Math.sin(a) * 450, z + Math.cos(a) * 450) / 16;
      const hf = groundH(x + Math.sin(a) * 1400, z + Math.cos(a) * 1400);
      if (hf < low){ low = hf; lowA = a; }
    }
    const slope = Math.abs(groundH(x + 4, z) - groundH(x - 4, z)) + Math.abs(groundH(x, z + 4) - groundH(x, z - 4));
    const score = (h0 - ring) + (h0 - low) * 0.35 - slope * 6;
    if (!best || score > best.score) best = {score, x, z, yaw: lowA};
  }
  S.x = best.x; S.z = best.z; cam.yaw = cam.yawT = best.yaw;
  /* turn the world so the afternoon sun (azimuth ~230°) sits ahead and to the left of the starting view */
  S.sunAz = (((best.yaw * 180 / Math.PI - 38 - 230) % 360) + 360) % 360;
})();
S.heightSlider = sliderFromAgl(S.agl);
cam.y = groundH(S.x, S.z) + S.agl;

/* ---------- location and the city's own clock ---------- */
const RAD = Math.PI / 180;
let LOC = getSavedLocation() || {name: '东京', lat: 35.6762, lon: 139.6503, tz: 'Asia/Tokyo'};
const cityOffset = (ms) => timezoneOffset(LOC.tz, ms);
const cityHours = (ms) => zonedHours(LOC.tz, ms);
const cityDayStart = (ms) => zonedDayStart(LOC.tz, ms);
S.time = cityHours(simMs);

/* ---------- sun and moon from latitude, longitude and UTC (low-precision almanac, as in SunCalc / Astronomical Almanac) ---------- */
const astro = (ms) => getAstronomy(ms, LOC, S.sunAz);
const azElDir = (az, el) => {
  const a = az + S.sunAz * RAD;
  return [Math.cos(el) * Math.sin(a), Math.sin(el), Math.cos(el) * Math.cos(a)];
};
const riseSetText = (ms) => sunEventsText(ms, LOC);

/* ---------- lighting: physically based where it matters, art-directed where games always are ----------
   Night is lit by an over-bright moon (or a soft night key light when the moon is down), exposure follows a
   time-of-day compensation curve instead of full physical adaptation, and grading is keyframed on sun altitude. */
const AIRGLOW = 5e-7, GLOW = [0.55, 0.7, 1.0].map(v => v * AIRGLOW);
const MOON_PHYS = 2.5e-6, MOON_ART = 6.0, NIGHT_KEY_MIN = 1.4, KEY_NIGHT = 0.36, KEY_TWILIGHT = 0.8;
const GRADE_KEYS = [
  [-14, 0.92, [0.82, 0.92, 1.15], [0.92, 0.98, 1.10], [0.015, 0.025, 0.05]],
  [-6,  1.12, [0.85, 0.93, 1.15], [1.00, 0.97, 1.05], [0.02, 0.03, 0.055]],
  [0,   1.20, [0.90, 0.92, 1.10], [1.15, 0.96, 0.80], [0.035, 0.025, 0.03]],
  [6,   1.16, [0.92, 0.96, 1.08], [1.12, 1.00, 0.84], [0.035, 0.028, 0.025]],
  [20,  1.08, [0.95, 1.00, 1.05], [1.05, 1.01, 0.92], [0.03, 0.03, 0.03]],
];
function gradeAt(altDeg){
  const K = GRADE_KEYS;
  if (altDeg <= K[0][0]) return {sat: K[0][1], sh: K[0][2], hi: K[0][3], lift: K[0][4]};
  for (let i = 1; i < K.length; i++){
    if (altDeg <= K[i][0]){
      const t = (altDeg - K[i - 1][0]) / (K[i][0] - K[i - 1][0]), a = K[i - 1], b = K[i];
      const mixv = (x, y) => x.map((v, j) => v + (y[j] - v) * t);
      return {sat: a[1] + (b[1] - a[1]) * t, sh: mixv(a[2], b[2]), hi: mixv(a[3], b[3]), lift: mixv(a[4], b[4])};
    }
  }
  const z = K[K.length - 1]; return {sat: z[1], sh: z[2], hi: z[3], lift: z[4]};
}
let light = null, lightKey = '', lastLightAt = 0, AST = astro(simMs), expo = NaN;
function updateLighting(){
  AST = astro(simMs);
  if (light && SPEEDS[S.speed | 0] > 1 && performance.now() - lastLightAt < 40) return false;
  const sunT = AST.sun, moonD = AST.moon;
  const key = sunT.map(v => v.toFixed(3)).join(',') + moonD.map(v => v.toFixed(3)).join(',') + '|' + covEff.toFixed(2) + '|' + densEff.toFixed(2) + '|' + Math.round(cam.y / 50);
  if (key === lightKey) return false;
  lightKey = key; lastLightAt = performance.now();
  const midH = (LAYER[0] + LAYER[1]) * 0.5, camKm = Math.max(cam.y / 1000, 0.002), Z = [0, 0, 0];
  const tr = (h, dir, I) => transmittance(h, dir).map(v => v * I);
  const sunCloud = tr(midH, sunT, SUN_I), sunGround = tr(0.05, sunT, SUN_I), sunCam = tr(camKm, sunT, SUN_I);
  const moonSky = SUN_I * MOON_PHYS * MOON_ART * AST.moonBright, moonUp = moonD[1] > -0.05 && moonSky > 0;
  /* night key light: the moon when it stands high enough, otherwise a soft high light from its bearing */
  const nightI = SUN_I * MOON_PHYS * Math.max(MOON_ART * AST.moonBright, NIGHT_KEY_MIN);
  const realMoon = moonD[1] > 0.1, nDir = realMoon ? moonD : azElDir(AST.moonAz, 1.1);
  const cool = [0.82, 0.93, 1.12];
  const nCloud = tr(midH, nDir, nightI).map((v, i) => v * cool[i] * (0.1 + 0.5 * AST.moonBright) * (realMoon ? 1.0 : 0.6)), nGround = tr(0.05, nDir, nightI).map((v, i) => v * cool[i] * (0.18 + 0.82 * AST.moonBright) * (realMoon ? 1.0 : 0.7)), nCam = tr(camKm, nDir, nightI).map((v, i) => v * cool[i] * (0.18 + 0.82 * AST.moonBright) * (realMoon ? 1.0 : 0.7));
  const sunWins = lum(sunCloud) >= lum(nCloud);
  const lightDir = sunWins ? sunT : nDir;
  const lightCloud = sunWins ? sunCloud : nCloud, lightGround = sunWins ? sunGround : nGround, lightCam = sunWins ? sunCam : nCam;
  /* multiple-scattering stand-in: the upper atmosphere stays sunlit well into twilight */
  const msI = SUN_I * lum(transmittance(30, sunT)) * 0.0028, MS = [0.35, 0.55, 1.0].map(v => v * msI);
  const zeroStats = {avg: Z, irr: Z};
  const stats = (h) => {
    const a = sunT[1] > -0.35 ? skyStats(h, sunT) : zeroStats;
    const b = moonUp ? skyStats(h, moonD) : zeroStats, k = moonSky / SUN_I;
    return {avg: a.avg.map((v, i) => v + b.avg[i] * k + GLOW[i] + MS[i] * 0.8), irr: a.irr.map((v, i) => v + b.irr[i] * k + (GLOW[i] + MS[i] * 0.8) * Math.PI)};
  };
  const atCloud = stats(midH), atGround = stats(0.05);
  const cov = covEff, shadowed = 1 - 0.75 * Math.pow(cov, 1.2), ly = Math.max(lightDir[1], 0);
  const groundRad = [0, 1, 2].map(c => 0.2 / Math.PI * (lightGround[c] * ly * shadowed + atGround.irr[c] * (1 - 0.3 * cov)));
  const ambTop = atCloud.avg.map(v => v * 1.25);
  const ambBottom = [0, 1, 2].map(c => atCloud.avg[c] * 0.75 + groundRad[c] * 0.35);
  const cloudRad = [0, 1, 2].map(c => lightCloud[c] * 0.085 * (0.3 + 0.7 * ly) + ambTop[c] * 0.5);
  const skyIrr = atGround.irr.map((v, c) => v * (1 - cov) + Math.PI * cloudRad[c] * cov);
  const sunR = 0.0095, sunDisk = sunCam.map(v => v / (Math.PI * sunR * sunR) * 0.02);
  const moonDisk = (moonUp ? transmittance(camKm, moonD) : Z).map(v => v * SUN_I * 0.12 / Math.PI * 1.6);
  const La = lum(atGround.avg) * 2.0 + lum(lightGround) * Math.max(lightDir[1], 0.05) * 0.05;
  const rel = Math.max(La / 0.9, 1e-10), lg = Math.log10(rel);
  /* exposure compensation curve: day 1.0, twilight 0.8, deep night 0.42 of the daytime key */
  const keyV = lg >= -0.6 ? 1 : lg >= -2.5 ? KEY_TWILIGHT + (1 - KEY_TWILIGHT) * smooth(-2.5, -0.6, lg) : KEY_NIGHT + (KEY_TWILIGHT - KEY_NIGHT) * smooth(-5.0, -2.5, lg);
  const exposure = 0.66 / (0.9 * rel) * keyV, PE = exposure;
  const nightF = smooth(-1.8, -4.5, lg);
  for (let c = 0; c < 3; c++){ ambTop[c] *= 1 - 0.8 * nightF; ambBottom[c] *= 1 - 0.9 * nightF; }
  const pe = (v) => v.map(x => x * PE);
  /* at night the cloud deck as a whole thins the moonlight and skylight reaching the ground: thicker, darker */
  const overcast = nightF * smooth(0.2, 0.95, cov) * clamp(0.55 + 0.35 * densEff, 0.6, 1.2), dimN = 1 - 0.85 * Math.min(overcast, 1);
  light = {lightDir, lightCloud: pe(lightCloud), lightGround: pe(lightGround).map(v => v * dimN), lightCam: pe(lightCam), sunT, moonD,
    moonI: moonUp ? moonSky : 0, ms: pe(MS), ambTop: pe(ambTop), ambBottom: pe(ambBottom), skyIrr: pe(skyIrr).map(v => v * dimN), sunDisk: pe(sunDisk), moonDisk: pe(moonDisk),
    exposure, pe: PE, night: nightF, glowF: Math.max(nightF, smooth(4, -5, AST.sunAlt / RAD)), fwd: sunWins ? 1 : (realMoon ? 0.8 : 0.3), ambOcc: 0.15 + 0.85 * nightF, cshAmt: 1, starCat: AIRGLOW * 2.4 * PE, starI: AIRGLOW * 14 * PE, grade: gradeAt(AST.sunAlt / RAD)};
  return true;
}

/* ================================================================== */
/*  Render targets / geometry                                          */
/* ================================================================== */
let W = 0, H = 0, CW = 0, CH = 0, HW = 0, HH = 0, cssW = 0, cssH = 0;
let cloudColor, cloudDepth, cloudFBO, hist = [], histFBO = [], histIdx = 0, needReset = true;
let msFBO, resFBO, sceneTex, depthTex, dofPrepTex, dofPrepFBO, dofTex, dofFBO;
let bloomD = [], bloomDF = [], bloomU = [], bloomUF = [], bloomSz = [];
const owned = {tex: [], fb: [], rb: []};
const T2 = (w, h, internal, format, type, filter) => { const t = makeTex2D(w, h, internal, format, type, filter, gl.CLAMP_TO_EDGE); owned.tex.push(t); return t; };
const FB = (atts) => { const fb = makeFBO(atts); owned.fb.push(fb); return fb; };
let terrainVAO = null, terrainBuffer = null, terrainCount = 0, terrainCfg = '';
function buildTerrain(NR, NA){
  const k = NR + 'x' + NA; if (k === terrainCfg) return; terrainCfg = k;
  const na = NA + 1, idx = new Uint32Array(NR * NA * 6); let o = 0;
  for (let i = 0; i < NR; i++) for (let j = 0; j < NA; j++){
    const a = i * na + j, b = a + 1, c = a + na, d = c + 1;
    idx[o++] = a; idx[o++] = c; idx[o++] = b; idx[o++] = b; idx[o++] = c; idx[o++] = d;
  }
  if (!terrainVAO) terrainVAO = gl.createVertexArray();
  gl.bindVertexArray(terrainVAO);
  if (terrainBuffer) gl.deleteBuffer(terrainBuffer);
  terrainBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, terrainBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
  gl.bindVertexArray(null);
  terrainCount = idx.length;
}
function freeTargets(){
  owned.tex.forEach(t => gl.deleteTexture(t)); owned.fb.forEach(f => gl.deleteFramebuffer(f)); owned.rb.forEach(r => gl.deleteRenderbuffer(r));
  owned.tex = []; owned.fb = []; owned.rb = [];
  hist = []; histFBO = []; bloomD = []; bloomDF = []; bloomU = []; bloomUF = []; bloomSz = [];
}
function resize(force){
  const q = QUALITY[S.quality];
  const dpr = Math.min(window.devicePixelRatio || 1, q.dpr);
  cssW = canvas.clientWidth; cssH = canvas.clientHeight;
  const w = Math.max(1, Math.floor(cssW * dpr)), h = Math.max(1, Math.floor(cssH * dpr));
  if (!force && w === W && h === H) return;
  W = w; H = h; canvas.width = W; canvas.height = H;
  HW = Math.max(8, Math.ceil(W / 2)); HH = Math.max(8, Math.ceil(H / 2));
  let cw = cssW * q.cloud, ch = cssH * q.cloud;
  const cap = 1.15e6, px = cw * ch;
  if (px > cap){ const s = Math.sqrt(cap / px); cw *= s; ch *= s; }
  CW = Math.max(16, Math.round(cw)); CH = Math.max(16, Math.round(ch));
  freeTargets();
  const RGBA16F = [gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT];
  cloudColor = T2(CW, CH, ...RGBA16F, gl.LINEAR);
  cloudDepth = T2(CW, CH, gl.R16F, gl.RED, gl.HALF_FLOAT, gl.LINEAR);
  cloudFBO = FB([cloudColor, cloudDepth]);
  for (let i = 0; i < 2; i++){ hist[i] = T2(CW, CH, ...RGBA16F, gl.LINEAR); histFBO[i] = FB([hist[i]]); }
  /* multisampled scene target, resolved into textures for post */
  const samples = Math.max(1, Math.min(q.samples, gl.getParameter(gl.MAX_SAMPLES)));
  const rbC = gl.createRenderbuffer(), rbD = gl.createRenderbuffer(); owned.rb.push(rbC, rbD);
  gl.bindRenderbuffer(gl.RENDERBUFFER, rbC); gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.RGBA8, W, H);
  gl.bindRenderbuffer(gl.RENDERBUFFER, rbD); gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.DEPTH_COMPONENT24, W, H);
  msFBO = gl.createFramebuffer(); owned.fb.push(msFBO);
  gl.bindFramebuffer(gl.FRAMEBUFFER, msFBO);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, rbC);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, rbD);
  gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
  sceneTex = T2(W, H, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.LINEAR);
  depthTex = T2(W, H, gl.DEPTH_COMPONENT24, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, gl.NEAREST);
  resFBO = FB([sceneTex]);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depthTex, 0);
  dofPrepTex = T2(HW, HH, ...RGBA16F, gl.LINEAR); dofPrepFBO = FB([dofPrepTex]);
  dofTex = T2(HW, HH, ...RGBA16F, gl.LINEAR); dofFBO = FB([dofTex]);
  let bw = HW, bh = HH;
  for (let i = 0; i < q.bloom; i++){
    bloomSz.push([bw, bh]);
    bloomD.push(T2(bw, bh, ...RGBA16F, gl.LINEAR)); bloomDF.push(FB([bloomD[i]]));
    if (i < q.bloom - 1){ bloomU.push(T2(bw, bh, ...RGBA16F, gl.LINEAR)); bloomUF.push(FB([bloomU[i]])); }
    bw = Math.max(1, Math.ceil(bw / 2)); bh = Math.max(1, Math.ceil(bh / 2));
  }
  buildTerrain(q.terr[0], q.terr[1]);
  needReset = true;
  setMessage($('res'), 'rendering.resolution', { clouds: CW + '×' + CH, view: W + '×' + H });
}

/* ================================================================== */
/*  Input                                                              */
/* ================================================================== */
function basis(yaw, pitch, roll){
  const cp = Math.cos(pitch), sp = Math.sin(pitch), cy = Math.cos(yaw), sy = Math.sin(yaw), cr = Math.cos(roll), sr = Math.sin(roll);
  const f = [cp * sy, sp, cp * cy], r0 = [cy, 0, -sy], u0 = [-sp * sy, cp, -sp * cy];
  return {f, r: r0.map((v, i) => v * cr + u0[i] * sr), u: u0.map((v, i) => v * cr - r0[i] * sr)};
}
const keys = new Set();
window.addEventListener('keydown', (e) => {
  if (e.target.closest('input, textarea, select, button, summary') || $('helpDialog').open) return;
  const k = e.key.toLowerCase();
  if (['w','a','s','d','q','e','arrowup','arrowdown','arrowleft','arrowright','shift'].includes(k)){ keys.add(k); if (k !== 'shift') stopAuto(); }
});
window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
window.addEventListener('keydown', (e) => { if (e.key === ' ' && !e.target.closest('input, textarea, select, button, summary') && !$('helpDialog').open){ sprintUntil = performance.now() + 1600; e.preventDefault(); } });
window.addEventListener('blur', () => { keys.clear(); mouseFlight.reset(); });
/* touch flies the petal stream like a flight game: one finger is a virtual stick measured from where it landed;
   double taps: one finger = sprint, two fingers = turn around, three fingers = hover / fly on */
const touches = new Map();
const stick = {active: false, id: -1, ox: 0, oy: 0, x: 0, y: 0};
let gesture = null, lastTap = {n: 0, t: 0}, lastSteerAt = -1e9, sprintUntil = 0;
const mouseFlight = bindMouseFlightInput({
  canvas, isFlying: () => S.auto, isEnabled: () => !$('helpDialog').open,
  look: (dx, dy) => {
    const k = (S.fovY / 60) * 0.0032;
    cam.yawT += dx * k; cam.pitchT = clamp(cam.pitchT - dy * k, -1.45, 1.45);
  },
  dash: () => onDoubleTap(1), turn: () => onDoubleTap(2), toggleFlight: () => onDoubleTap(3),
});
window.addEventListener('resize', () => mouseFlight.reset());
const capture = (id) => { try { canvas.setPointerCapture(id); } catch (err) {} };
canvas.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'mouse') return;
  mouseFlight.reset();
  capture(e.pointerId);
  touches.set(e.pointerId, {x0: e.clientX, y0: e.clientY});
  if (!gesture) gesture = {t0: performance.now(), maxN: 0, moved: false};
  gesture.maxN = Math.max(gesture.maxN, touches.size);
  if (touches.size === 1){ stick.active = true; stick.id = e.pointerId; stick.ox = stick.x = e.clientX; stick.oy = stick.y = e.clientY; }
  else stick.active = false;
});
canvas.addEventListener('pointermove', (e) => {
  const tp = touches.get(e.pointerId);
  if (!tp) return;
  if (gesture && Math.hypot(e.clientX - tp.x0, e.clientY - tp.y0) > 14) gesture.moved = true;
  if (stick.active && e.pointerId === stick.id){ stick.x = e.clientX; stick.y = e.clientY; }
});
function onDoubleTap(n){
  if (n === 1) sprintUntil = performance.now() + 1600;
  else if (n === 2){ cam.yawT += Math.PI; lastSteerAt = performance.now(); }
  else setAuto(!S.auto);
}
const endPointer = (e) => {
  if (!touches.has(e.pointerId)) return;
  touches.delete(e.pointerId);
  if (stick.id === e.pointerId) stick.active = false;
  if (touches.size === 0 && gesture){
    const now = performance.now(), quick = now - gesture.t0 < 300 && !gesture.moved, n = gesture.maxN;
    gesture = null;
    if (quick){
      if (lastTap.n === n && now - lastTap.t < 400){ onDoubleTap(n); lastTap = {n: 0, t: 0}; }
      else lastTap = {n, t: now};
    }
  }
};
canvas.addEventListener('pointerup', endPointer); canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('wheel', (e) => { e.preventDefault(); S.fovY = clamp(S.fovY * Math.exp(e.deltaY * 0.0012), 28, 95); }, {passive: false});

/* ================================================================== */
/*  UI                                                                 */
/* ================================================================== */
function bindRange(id, key, fmt, onChange){
  const el = $(id), out = document.querySelector(`output[for="${id}"]`);
  const paint = (displayValue) => { const v = displayValue ?? parseFloat(el.value); out.textContent = fmt(v); el.style.setProperty('--fill', ((v - el.min) / (el.max - el.min) * 100) + '%'); };
  el.value = S[key]; paint(S[key]);
  el.addEventListener('input', () => { S[key] = parseFloat(el.value); paint(); onChange && onChange(); });
  onLanguageChange(() => paint(S[key]));
  return {el, paint};
}
const publishTimeControls = () => updateTimeControls({
  hours: S.time, speedIndex: S.speed, loc: LOC, sun: getSunEvents(simMs, LOC), phase: phaseIndex(astro(simMs).phase),
});
bindTimeActions({
  time(value) {
    S.time = value; followNow = false;
    simMs = localTimeToUTC(LOC.tz, simMs, S.time); expo = NaN;
    publishTimeControls();
  },
  speed(value) {
    S.speed = value; followNow = false;
    publishTimeControls();
  },
  sync() {
    simMs = Date.now(); S.time = cityHours(simMs);
    followNow = true; expo = NaN; S.speed = 1;
    publishTimeControls();
  },
});
publishTimeControls();
bindRange('sunAz', 'sunAz', (v) => Math.round(v) + '°');
bindRange('bloomR', 'bloomR', (v) => t('landscape.radiusValue', { value: Number(v).toFixed(1) }));
const wxCtl = {};
const wxBind = (id, key, fmt) => { wxCtl[key] = bindRange(id, key, fmt, () => { if (S.wxMode === 'manual') wxSetTarget(S.wxType, manualParams(), 2); }); };
wxBind('coverage', 'coverage', (v) => Math.round(v * 100) + '%');
wxBind('density', 'density', (v) => v.toFixed(2));
wxBind('wind', 'wind', (v) => Math.round(v) + ' m/s');
wxBind('breeze', 'breeze', (v) => Math.round(v * 100) + '%');
wxBind('fogVis', 'fogVisS', (v) => fmtVis(visFromSlider(v)));
wxBind('rainAmt', 'rainAmt', (v) => Math.round(v * 100) + '%');
wxBind('snowAmt', 'snowAmt', (v) => Math.round(v * 100) + '%');
wxBind('boltFreq', 'boltFreq', (v) => v < 0.05 ? t('common.none') : t('weather.boltValue', { value: v.toFixed(1) }));
wxBind('puddle', 'puddle', (v) => Math.round(v * 100) + '%');
wxBind('snowMax', 'snowMax', (v) => Math.round(v * 100) + '%');
function refreshWx(){ for (const k in wxCtl){ wxCtl[k].el.value = S[k]; wxCtl[k].paint(); } }
function markWxChips(){ document.querySelectorAll('#wxTypes .chip').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.wx === S.wxType))); }
for (const k of Object.keys(WX_TYPES)){
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'chip'; setMessage(b, `weather.${k}`); b.dataset.wx = k;
  b.addEventListener('click', () => {
    const pp = wxPreset(k);
    S.wxType = k; S.coverage = pp.cov; S.density = pp.dens; S.wind = pp.wind; S.breeze = pp.breeze; S.fogVisS = sliderFromVis(pp.vis);
    S.rainAmt = pp.rain; S.snowAmt = pp.snow; S.boltFreq = pp.bolt; S.puddle = pp.wet; S.snowMax = pp.snowCov;
    refreshWx(); markWxChips(); wxSetTarget(k, manualParams(), 6);
  });
  $('wxTypes').appendChild(b);
}
function setWxMode(mode){
  S.wxMode = mode;
  document.querySelectorAll('input[name="wxMode"]').forEach(r => { r.checked = r.value === mode; });
  $('wxManual').hidden = mode !== 'manual';
  if (mode === 'off') wxSetTarget('clear', wxPreset('clear'), 15);
  else if (mode === 'manual'){ markWxChips(); wxSetTarget(S.wxType, manualParams(), 4); }
  else if (mode === 'dynamic') wxStartDynamic(true);
  else { WXS.followOK = false; WXS.airQuality = null; WXS.src = ''; wxStartDynamic(true); syncWeather(); }
}
document.querySelectorAll('input[name="wxMode"]').forEach(r => r.addEventListener('change', () => { if (r.checked) setWxMode(r.value); }));
document.querySelectorAll('input[name="temperatureUnit"]').forEach(r => {
  r.checked = r.value === S.temperatureUnit;
  r.addEventListener('change', () => {
    if (!r.checked) return;
    S.temperatureUnit = r.value;
    saveSettings(); wxStatus();
  });
});
for (const key of ['showWeather', 'showTemperature', 'showPrecipitation', 'showAirQuality', 'showClouds', 'showWind']) {
  $(key).checked = S[key];
  $(key).addEventListener('change', () => { S[key] = $(key).checked; saveSettings(); });
}
function wxStatus(){
  const weather = t(`weather.${WXS.type}`);
  $('wxNow').textContent = WXS.prog < 1 ? t('weather.transition', { weather }) : weather;
  const parts = [t('weather.cloudValue', { value: Math.round(WP.cov * 100) }), t('weather.visibilityValue', { value: fmtVis(WP.vis) })];
  if (WP.rain > 0.02) parts.push(t('weather.rainValue', { value: Math.round(WP.rain * 100) }));
  if (WP.snow > 0.02) parts.push(t('weather.snowValue', { value: Math.round(WP.snow * 100) }));
  if (WXS.wet > 0.02) parts.push(t('weather.wetValue', { value: Math.round(WXS.wet * 100) }));
  if (WXS.snowCov > 0.02) parts.push(t('weather.snowCoverValue', { value: Math.round(WXS.snowCov * 100) }));
  const live = S.wxMode === 'follow' && WXS.followOK ? WXS.live : null;
  updateWeatherDetails($('panelWeatherMetrics'), { live, airQuality: live ? WXS.airQuality : null, temperatureUnit: S.temperatureUnit, simulated: S.wxMode !== 'follow' || Boolean(WXS.src && !live) });
  const src = S.wxMode === 'dynamic' ? t('weather.dynamicDescription', { minutes: Math.max(1, Math.round((WXS.until - wxClock) / 60000)) })
    : S.wxMode === 'off' ? t('weather.offDescription') : S.wxMode === 'manual' ? t('weather.manualDescription')
    : live ? t('weather.liveDescription', { city: locationName(LOC), weather: t(`weather.${live.type}`), clouds: Math.round(live.cloud_cover), wind: Number(live.wind_speed_10m).toFixed(1) })
    : t(WXS.src ? 'weather.unavailable' : 'weather.fetching');
  $('wxInfo').textContent = live
    ? [t('weather.cloudValue', { value: Math.round(live.cloud_cover) }), t('weather.windValue', { value: Number(live.wind_speed_10m).toFixed(1) })].join(' · ')
    : parts.join(' · ') + ' · ' + src;
}
bindRange('dof', 'dof', (v) => v < 0.01 ? t('common.off') : Math.round(v * 100) + '%');
const fmtAgl = (a) => a < 10 ? a.toFixed(1) + ' m' : Math.round(a) + ' m';
const heightCtl = bindRange('height', 'heightSlider', (v) => fmtAgl(aglFromSlider(v)), () => {
  const na = aglFromSlider(S.heightSlider);
  if (Math.abs(na - S.agl) > 300) needReset = true;
  S.agl = na;
});
function syncHeightSlider(){ S.heightSlider = sliderFromAgl(S.agl); heightCtl.el.value = S.heightSlider; heightCtl.paint(); }
const toggles = {auto: 'auto', god: 'god', petals: 'petals', sway: 'sway', constel: 'constel', flies: 'flies', flowerGlow: 'flowerGlow', bloom: 'bloom', streamScale: 'streamScale', infMem: 'infMem', lensDrops: 'lensDrops'};
for (const [id, key] of Object.entries(toggles)){ const el = $(id); el.checked = S[key]; el.addEventListener('change', () => { if (key === 'auto') setAuto(el.checked); else S[key] = el.checked; }); }
$('clearMem').addEventListener('click', () => {
  memPts = []; memGrid = new Map(); memLastX = NaN; memDirty = false;
  try { localStorage.removeItem(MEM_KEY); } catch (e) {}
  touchFBO.forEach(fb => { gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); });
});
window.addEventListener('pagehide', () => { if (S.infMem){ memDirty = true; memSave(true); } });
function setAuto(value){
  S.auto = value; $('auto').checked = value; mouseFlight.reset();
  if (!value) sprintUntil = 0;
  saveSettings();
}
function stopAuto(){ if (S.auto) setAuto(false); }
function setQuality(q){ S.quality = q; document.querySelectorAll('input[name="q"]').forEach(r => { r.checked = r.value === q; }); resize(true); }
document.querySelectorAll('input[name="sdist"]').forEach(r => {
  r.checked = r.value === S.streamDist;
  r.addEventListener('change', () => { if (r.checked) S.streamDist = r.value; });
});
document.querySelectorAll('input[name="q"]').forEach(r => {
  r.checked = r.value === S.quality;
  r.addEventListener('change', () => { if (r.checked){ userPickedQuality = true; S.qualityUser = r.value; setQuality(r.value); } });
});
if (S.qualityUser && QUALITY[S.qualityUser]){ userPickedQuality = true; if (S.quality !== S.qualityUser) setQuality(S.qualityUser); }
/* ================================================================== */
/*  Location search, geolocation, weather                              */
/* ================================================================== */
const cityLoc = (c) => ({name: c[0], lat: c[2], lon: c[3], tz: c[4]});
function renderLoc(){
  $('locName').textContent = locationName(LOC);
  $('locCoords').textContent = Math.abs(LOC.lat).toFixed(2) + '° ' + (LOC.lat >= 0 ? 'N' : 'S') + ' · ' + Math.abs(LOC.lon).toFixed(2) + '° ' + (LOC.lon >= 0 ? 'E' : 'W');
  $('locSun').textContent = riseSetText(simMs);
  document.querySelectorAll('.chip[data-name]').forEach(b => {
    b.setAttribute('aria-pressed', String(b.dataset.name === LOC.name));
    b.textContent = cityName(CITIES.find(c => c[0] === b.dataset.name));
  });
}
function setLocation(loc){
  LOC = loc; lightKey = ''; expo = NaN; WXS.followOK = false; WXS.live = null; WXS.airQuality = null; WXS.src = '';
  saveLocation(LOC);
  renderLoc(); syncWeather();
}
function cityChip(c){
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'chip'; b.textContent = cityName(c); b.dataset.name = c[0]; b.title = c[1];
  b.addEventListener('click', () => setLocation(cityLoc(c)));
  return b;
}
COMMON_CITIES.forEach(n => { const c = CITIES.find(x => x[0] === n); if (c) $('cityCommon').appendChild(cityChip(c)); });
const searchEl = $('citySearch');
function renderSearch() {
  const qv = searchEl.value.trim(), box = $('cityResults');
  box.textContent = '';
  if (!qv) return;
  const hits = searchCities(qv).slice(0, 8);
  hits.forEach(c => box.appendChild(cityChip(c)));
  if (!hits.length){ const sp = document.createElement('span'); sp.className = 'loc-sub'; setMessage(sp, 'location.noResults'); box.appendChild(sp); }
  renderLoc();
}
searchEl.addEventListener('input', renderSearch);
searchEl.addEventListener('keydown', (e) => { if (e.key === 'Enter'){ const f = $('cityResults').querySelector('.chip'); if (f) f.click(); } });
$('geoBtn').addEventListener('click', () => {
  const msg = (key) => {
    if (key) setMessage($('geoMsg'), key);
    else { $('geoMsg').textContent = ''; delete $('geoMsg').dataset.i18n; }
  };
  if (!navigator.geolocation){ msg('geo.unsupported'); return; }
  msg('geo.loading');
  navigator.geolocation.getCurrentPosition((pos) => {
    const lat = pos.coords.latitude, lon = pos.coords.longitude;
    let tz = 'UTC'; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch (e) {}
    let near = null, best = Infinity;
    for (const c of CITIES){
      const dLat = (c[2] - lat) * RAD, dLon = (c[3] - lon) * RAD;
      const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat * RAD) * Math.cos(c[2] * RAD) * Math.sin(dLon / 2) ** 2;
      const km = 12742 * Math.asin(Math.sqrt(a));
      if (km < best){ best = km; near = c; }
    }
    if (best < 60) tz = near[4];
    setLocation({name: best < 60 ? near[0] + '附近' : '我的位置', lat, lon, tz});
    msg('');
  }, (err) => msg(err.code === 1 ? 'geo.denied' : 'geo.unavailable'), {timeout: 9000, maximumAge: 600000});
});

/* 当地天气请求失败时继续动态天气；始终在观测信息中说明数据来源。 */
let weatherRequest = 0;
async function syncAirQuality(loc, request){
  const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 8000);
  const isCurrent = () => request === weatherRequest && loc === LOC && S.wxMode === 'follow';
  try {
    const airQuality = await fetchAirQuality(loc, { signal: controller.signal });
    if (isCurrent()) WXS.airQuality = airQuality;
  } catch {
    if (isCurrent()) WXS.airQuality = null;
  } finally {
    clearTimeout(timeout);
  }
}
async function syncWeather(){
  if (S.wxMode !== 'follow') return;
  const loc = LOC, request = ++weatherRequest;
  // 空气质量独立获取；失败或超时不影响正常天气显示。
  void syncAirQuality(loc, request);
  const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const c = await fetchWeather(loc, { signal: controller.signal });
    if (request !== weatherRequest || loc !== LOC || S.wxMode !== 'follow') return;
    const type = c.type, pp = wxPreset(type);
    pp.cov = clamp(0.12 + 0.85 * c.cloud_cover / 100, 0.12, 0.97);
    pp.wind = clamp(c.wind_speed_10m * 3, 0, 200); pp.breeze = clamp(0.12 + c.wind_speed_10m / 12, 0, 1);
    WIND_ANGLE = Math.PI / 2 - ((c.wind_direction_10m + 180) * RAD + S.sunAz * RAD);
    WXS.followOK = true; WXS.live = c; wxSetTarget(type, pp, 30);
    WXS.src = 'live';
  } catch (e) {
    if (request === weatherRequest && loc === LOC && S.wxMode === 'follow') {
      WXS.followOK = false; WXS.live = null;
      WXS.src = 'unavailable';
      wxStartDynamic(true);
    }
  } finally {
    clearTimeout(timeout);
  }
}
setInterval(() => { if (S.wxMode === 'follow') syncWeather(); }, 15 * 60 * 1000);
$('retryWeather').addEventListener('click', () => { setWxMode('follow'); });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { keys.clear(); mouseFlight.reset(); }
  if (!document.hidden && (!WXS.live || Date.now() - WXS.live.fetchedAt > 15 * 60 * 1000)) syncWeather();
});
renderLoc();
setWxMode(S.wxMode);
refreshWx();
const renderClock = () => setMessage($('clock'), 'rendering.clock', { city: locationName(LOC), time: fmtTime(S.time), phase: phaseName(AST.phase) });
onLanguageChange(() => { renderLoc(); renderSearch(); wxStatus(); renderClock(); });

/* ================================================================== */
/*  Camera rig, petal stream, culling                                  */
/* ================================================================== */
let autoT = 0;
function updateCamera(dt){
  autoT += dt;
  let mf = 0, mr = 0, mu = 0;
  if (keys.has('w') || keys.has('arrowup')) mf += 1;
  if (keys.has('s') || keys.has('arrowdown')) mf -= 1;
  if (keys.has('d') || keys.has('arrowright')) mr += 1;
  if (keys.has('a') || keys.has('arrowleft')) mr -= 1;
  if (keys.has('e')) mu += 1;
  if (keys.has('q')) mu -= 1;
  const fast = keys.has('shift') ? 5 : 1;
  const flightStick = stick.active ? stick : mouseFlight.stick;
  const stickActive = flightStick.active && (flightStick === stick || S.auto) && !$('helpDialog').open && !document.hidden;
  const { x: stX, y: stY } = flightStickAxes({ ...flightStick, active: stickActive }, cssW, cssH);
  if (stX || stY) lastSteerAt = performance.now();
  const steering = performance.now() - lastSteerAt < 3000;
  if (S.auto && !steering){
    cam.yawT += (0.16 * Math.sin(autoT * 0.19) + 0.09 * Math.sin(autoT * 0.071 + 1.3)) * dt;
    cam.pitchT = 0.035 + 0.05 * Math.sin(autoT * 0.13);
  }
  if (stickActive){
    cam.yawT += stX * 1.1 * dt;
    cam.pitchT = 0.035 - stY * 0.22;
    if (stY){ S.agl = clamp(S.agl * Math.exp(-stY * 0.9 * dt), 1.2, 800); syncHeightSlider(); }
  }
  /* chase camera (as in flight games): while flying, pitch looks at the lead petal and keeps it a little below centre,
     so slopes, dives and climbs never carry the stream out of frame */
  const lead = trailHist.length ? trailHist[trailHist.length - 1].p : null;
  if ((S.auto || stickActive) && lead && S.petals){
    const dh = Math.max(1, Math.hypot(lead[0] - S.x, lead[2] - S.z));
    const look = Math.atan2(lead[1] - cam.y, dh) + 0.12;
    cam.pitchT = clamp(look - (stickActive ? stY * 0.18 : 0) + (S.auto && !steering ? 0.02 * Math.sin(autoT * 0.13) : 0), -0.75, 0.6);
  }
  /* inertia on look, banking into turns */
  const k = 1 - Math.exp(-dt * 8), py = cam.yaw;
  cam.yaw += (cam.yawT - cam.yaw) * k; cam.pitch += (cam.pitchT - cam.pitch) * k;
  const yawRate = dt > 0 ? (cam.yaw - py) / dt : 0;
  cam.roll += ((S.sway ? clamp(-yawRate * 0.35, -0.22, 0.22) : 0) - cam.roll) * (1 - Math.exp(-dt * 3));
  /* momentum on movement */
  const sy = Math.sin(cam.yaw), cy = Math.cos(cam.yaw);
  let tvx = 0, tvz = 0;
  const sprinting = performance.now() < sprintUntil;
  if (S.auto || sprinting){ const v = Math.max(7, S.agl * 0.35) * (sprinting ? 2.6 : 1); tvx = sy * v; tvz = cy * v; }
  if (mf || mr){ const v = Math.max(6, S.agl * 0.8) * fast; tvx = (sy * mf + cy * mr) * v; tvz = (cy * mf - sy * mr) * v; }
  const ka = 1 - Math.exp(-dt * 2.2);
  cam.vx += (tvx - cam.vx) * ka; cam.vz += (tvz - cam.vz) * ka;
  S.x += cam.vx * dt; S.z += cam.vz * dt;
  if (mu){ S.agl = clamp(S.agl * Math.exp(mu * 1.2 * dt * fast), 1.2, 6500); syncHeightSlider(); }
  /* glide over the hills: look ahead so the camera rises before a slope, not into it */
  /* terrain following: sample fixed distances ahead (not times, so sprinting does not lift more) and only climb early
     as much as a 24-degree climb needs; the old 0.8 s / 1.6 s look-ahead lifted the camera metres off the grass whenever
     a slope came into range, which read as being bounced up */
  const g0 = groundH(S.x, S.z), spH = Math.hypot(cam.vx, cam.vz), hx = spH > 0.5 ? cam.vx / spH : 0, hz = spH > 0.5 ? cam.vz / spH : 0;
  let need = g0;
  for (const dA of [2, 4, 7, 11]) need = Math.max(need, groundH(S.x + hx * dA, S.z + hz * dA) - dA * 0.45);
  const bob = S.auto && S.agl < 20 ? 0.5 * Math.sin(autoT * 0.37) + 0.25 * Math.sin(autoT * 0.83 + 2) : 0;
  const targetY = need + S.agl + bob;
  cam.y += (targetY - cam.y) * (1 - Math.exp(-dt * (targetY > cam.y ? 3.2 : 2.2)));
  cam.y = Math.max(cam.y, g0 + Math.min(0.9, S.agl * 0.6));
  const spd = Math.hypot(cam.vx, cam.vz);
  cam.fov = S.fovY + (S.sway ? Math.min(9, spd * 0.45) : 0);
  return g0;
}
function focusDistance(p, f){
  let t = 0.6;
  for (let i = 0; i < 90; i++){
    const x = p[0] + f[0] * t, y = p[1] + f[1] * t, z = p[2] + f[2] * t;
    if (y < groundH(x, z) + 0.75) return t;
    t *= 1.075; if (t > 900) break;
  }
  return 900;
}
const TRAIL_N = 40, trail = [], trailUni = new Float32Array(TRAIL_N * 4), pushUni = new Float32Array(24);
/* path history is time-stamped every frame; each petal reads the path at a fixed delay with interpolation,
   so spacing and motion do not depend on frame rate (the old fixed-rate ring stuttered between two positions) */
const TRAIL_DT = 1 / 45, trailHist = [], STREAM_DIST = {near: 6.5, mid: 11, far: 17};
let streamG = NaN;
let streamD = 6.5;
function trailAt(tq){
  if (tq <= trailHist[0].t) return trailHist[0].p;
  for (let i = trailHist.length - 1; i > 0; i--){
    const a = trailHist[i - 1], b = trailHist[i];
    if (tq >= a.t){
      const f = Math.min(1, (tq - a.t) / Math.max(b.t - a.t, 1e-6));
      return [a.p[0] + (b.p[0] - a.p[0]) * f, a.p[1] + (b.p[1] - a.p[1]) * f, a.p[2] + (b.p[2] - a.p[2]) * f];
    }
  }
  return trailHist[0].p;
}
function updateTrail(dt, t, camM, active, spd){
  pushUni.fill(0);
  if (!active){ trailHist.length = 0; streamG = NaN; return false; }
  /* the lead petal flies streamD metres ahead; switching near/mid/far glides there over about a second */
  streamD += ((STREAM_DIST[S.streamDist] || 6.5) - streamD) * (1 - Math.exp(-dt * 4.5));
  const sy = Math.sin(cam.yaw), cy = Math.cos(cam.yaw), weave = Math.sin(t * 0.8) * (0.6 + 0.06 * streamD);
  const lx = S.x + sy * streamD + cy * weave, lz = S.z + cy * streamD - sy * weave;
  /* the stream holds a steady height above the grass (the camera's own height above ground, a metre lower), so climbing
     and diving carry it along; the ground under it is low-passed (faster up than down) so bumps and steps ease in */
  const gl0 = groundH(lx, lz);
  if (!isFinite(streamG)) streamG = gl0;
  streamG += (gl0 - streamG) * (1 - Math.exp(-dt * (gl0 > streamG ? 5 : 2.5)));
  const ly = Math.max(gl0 + 0.6, streamG + Math.max(0.9, S.agl - 1.05)) + 0.3 * Math.sin(t * 1.25);
  if (trailHist.length && t <= trailHist[trailHist.length - 1].t) trailHist[trailHist.length - 1] = {t, p: [lx, ly, lz]};
  else trailHist.push({t, p: [lx, ly, lz]});
  const maxAge = TRAIL_N * TRAIL_DT + 0.5;
  while (trailHist.length > 2 && t - trailHist[1].t > maxAge) trailHist.shift();
  for (let k = 0; k < TRAIL_N; k++){
    const p = trailAt(t - k * TRAIL_DT), a = t * 2.4 + k * 0.95, rad = 0.15 + 0.28 * ((k * 0.618) % 1) + k * 0.006;
    trailUni[k * 4] = p[0] + cy * Math.cos(a) * rad - camM[0];
    trailUni[k * 4 + 1] = p[1] + Math.sin(a) * rad - camM[1];
    trailUni[k * 4 + 2] = p[2] - sy * Math.cos(a) * rad - camM[2];
    trailUni[k * 4 + 3] = k;
  }
  for (let i = 0; i < 6; i++){
    const p = trailAt(t - i * 6 * TRAIL_DT), hgt = p[1] - groundH(p[0], p[2]);
    pushUni.set([p[0] - camM[0], p[2] - camM[2], 1.3, clamp((3.0 - hgt) / 2.2, 0, 1) * 0.9 * clamp(spd / 4, 0.12, 1)], i * 4);
  }
  return true;
}
function frustumPlanes(B, tanX, tanY){
  const {f, r, u} = B;
  return [f.map((v, i) => v * tanX - r[i]), f.map((v, i) => v * tanX + r[i]), f.map((v, i) => v * tanY - u[i]), f.map((v, i) => v * tanY + u[i]), f];
}
function boxVisible(planes, x0, x1, y0, y1, z0, z1){
  for (const n of planes){
    const px = n[0] >= 0 ? x1 : x0, py = n[1] >= 0 ? y1 : y0, pz = n[2] >= 0 ? z1 : z0;
    if (n[0] * px + n[1] * py + n[2] * pz < -0.8) return false;
  }
  return true;
}

/* ================================================================== */
/*  Frame                                                              */
/* ================================================================== */
let last = performance.now(), frameNo = 0, simTime = 0, prev = null, skyKey = '';
let statAcc = 0, statFrames = 0, statT = 0, perfFrames = 0, perfAcc = 0, downgrades = 0, bladeEst = 0;
const NEAR = 0.08, FARP = 80000;
const depthAB = [(FARP + NEAR) / (FARP - NEAR), -2 * FARP * NEAR / (FARP - NEAR)];

function frame(now){
  if (contextLost) return;
  const elapsedMs = Math.max(0, now - last);
  const dt = Math.min(0.1, elapsedMs / 1000); last = now;
  if (!noiseReady){ genStep(14); requestAnimationFrame(tick); return; }
  resize(false);
  simTime += dt;

  const groundNow = updateCamera(dt);
  const sw = S.sway ? 1 : 0;
  const yaw = cam.yaw + sw * (0.004 * Math.sin(simTime * 0.53) + 0.003 * Math.sin(simTime * 1.31));
  const pitch = cam.pitch + sw * 0.003 * Math.sin(simTime * 0.71 + 1);
  const camM = [S.x, cam.y + sw * 0.06 * Math.sin(simTime * 0.9), S.z], camK = camM.map(v => v / 1000);
  const aglReal = camM[1] - groundNow;

  const wv = WP.wind / 1000;
  windOff[0] += Math.cos(WIND_ANGLE) * wv * dt; windOff[2] += Math.sin(WIND_ANGLE) * wv * dt; windOff[1] += 0.0025 * dt;
  const windDir = [Math.cos(WIND_ANGLE), Math.sin(WIND_ANGLE)];

  simMs = advanceClock(simMs, elapsedMs, SPEEDS[S.speed | 0], followNow);
  S.time = cityHours(simMs);
  updateWeather(dt);
  const lightChanged = updateLighting();
  const L = light, sun = L.lightDir, q = QUALITY[S.quality];
  expo = !isFinite(expo) ? L.exposure : Math.exp(Math.log(expo) + (Math.log(L.exposure) - Math.log(expo)) * (1 - Math.exp(-dt * 2.5)));
  const expoS = expo / L.pe, nightGlow = L.glowF * 0.45 / expoS;
  const B = basis(yaw, pitch, cam.roll), aspect = W / H;
  /* weather this frame: lightning, fog, colours (all pre-exposed like the rest of the lighting) */
  if (WXS.storm > 0.15 && bolt.t > 1.4 && Math.random() < 1 - Math.exp(-WP.bolt / 10 * dt)) spawnBolt(camM, B.f);
  bolt.t += dt;
  const flash = bolt.t < 1.4 ? flashAt(bolt.t) * Math.max(WXS.storm, 0.3) : 0;
  /* fog uses the visibility slider; rain adds its own haze (visibility ~3 km in drizzle down to ~1.2 km in a downpour) */
  const fogDens = WXS.fogDens;
  const flashAmb = [0.85, 0.9, 1.0].map(v => v * flash * 9 * (1 - 0.5 * Math.min(1, fogDens * 400)));
  const fogColR = L.skyIrr.map((v, i) => v / Math.PI * 1.15 + flashAmb[i] / Math.PI * 0.6), fogLum = lum(fogColR);
  const fogCol = fogColR.map(v => fogLum + (v - fogLum) * 0.4);
  const fogW = [fogDens, WXS.fogH, Math.max(aglReal, 0.5), 0];
  const flashTop = [bolt.x - camM[0], LAYER[0] * 1000 + 300 - camM[1], bolt.z - camM[2]], ftl = Math.hypot(...flashTop) || 1;
  const tanY = Math.tan(cam.fov * Math.PI / 360), tanX = tanY * aspect;
  /* focus pulls to the petal stream: it is what the shot is about */
  const grassOn = aglReal < 450;
  const streamOn = updateTrail(dt, simTime, camM, S.petals, Math.hypot(cam.vx, cam.vz));
  let fd = focusDistance(camM, B.f);
  if (streamOn){
    let sx = 0, sy2 = 0, sz = 0;
    for (let k = 0; k < 14; k++){ sx += trailUni[k * 4]; sy2 += trailUni[k * 4 + 1]; sz += trailUni[k * 4 + 2]; }
    const dz = (sx * B.f[0] + sy2 * B.f[1] + sz * B.f[2]) / 14;
    if (dz > 0.8) fd = dz;
  }
  cam.focus += (clamp(fd, 1.5, 600) - cam.focus) * (1 - Math.exp(-dt * 3));

  gl.bindVertexArray(emptyVAO);
  gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.depthMask(true);

  const setCloudCommon = (Pp) => {
    set(Pp, 'uCamPos', camK); set(Pp, 'uSunDir', sun); set(Pp, 'uLayer', LAYER[0], LAYER[1]);
    set(Pp, 'uCoverage', covEff); set(Pp, 'uDensity', densEff);
    set(Pp, 'uWind', -windOff[0], -windOff[1], -windOff[2]);
    set(Pp, 'uWindDetail', -windOff[0] * 1.6, -windOff[1] * 3.0 - simTime * 0.004, -windOff[2] * 1.6);
    set(Pp, 'uWindDir', windDir[0], windDir[1]);
    set(Pp, 'uRight', B.r); set(Pp, 'uUp', B.u); set(Pp, 'uFwd', B.f); set(Pp, 'uTan', tanX, tanY);
  };
  const bindCloudTex = (Pp) => {
    tex(Pp, 'uShape', gl.TEXTURE_3D, shapeTex); tex(Pp, 'uDetail', gl.TEXTURE_3D, detailTex);
    tex(Pp, 'uWeather', gl.TEXTURE_2D, weatherTex); tex(Pp, 'uSkyLut', gl.TEXTURE_2D, skyTex);
  };

  /* sky LUT */
  const sk = L.sunT.join(',') + L.moonD.join(',') + L.moonI + '|' + L.pe + '|' + Math.round(cam.y / 100);
  if (sk !== skyKey){
    skyKey = sk; use(P.skyLut);
    gl.bindFramebuffer(gl.FRAMEBUFFER, skyFBO); gl.viewport(0, 0, SKY_W, SKY_H);
    set(P.skyLut, 'uCamPos', camK); set(P.skyLut, 'uSunDir', L.sunT); set(P.skyLut, 'uSunI', SUN_I * L.pe);
    set(P.skyLut, 'uMoonDir', L.moonD); set(P.skyLut, 'uMoonI', L.moonI * L.pe); set(P.skyLut, 'uGlow', GLOW.map(v => v * L.pe)); set(P.skyLut, 'uMS', L.ms);
    draw();
  }
  /* cloud shadow map */
  const cshTexel = CSH_EXT / CSH_N;
  const cshP = [Math.floor(camK[0] / cshTexel) * cshTexel, Math.floor(camK[2] / cshTexel) * cshTexel, CSH_EXT];
  if (frameNo % 2 === 0 || lightChanged){
    use(P.cshadow); gl.bindFramebuffer(gl.FRAMEBUFFER, cshFBO); gl.viewport(0, 0, CSH_N, CSH_N);
    setCloudCommon(P.cshadow); bindCloudTex(P.cshadow); set(P.cshadow, 'uShadowP', cshP);
    draw();
  }
  /* clouds */
  use(P.cloud); gl.bindFramebuffer(gl.FRAMEBUFFER, cloudFBO); gl.viewport(0, 0, CW, CH);
  setCloudCommon(P.cloud); bindCloudTex(P.cloud);
  set(P.cloud, 'uSunColor', L.lightCloud);
  set(P.cloud, 'uFlashP', bolt.x / 1000, (LAYER[0] + LAYER[1]) * 0.45, bolt.z / 1000, 2.5); set(P.cloud, 'uFlashC', [0.9, 0.92, 1.0].map(v => v * flash * 22)); set(P.cloud, 'uFwdScat', L.fwd); set(P.cloud, 'uAmbOcc', L.ambOcc); set(P.cloud, 'uAmbTop', L.ambTop); set(P.cloud, 'uAmbBottom', L.ambBottom);
  seti(P.cloud, 'uSteps', q.steps); seti(P.cloud, 'uLightSteps', q.light);
  set(P.cloud, 'uFrame', frameNo % 1024); set(P.cloud, 'uPixAngle', 2 * tanY / CH); set(P.cloud, 'uFogK', 1 / 42);
  draw();
  /* temporal accumulation */
  const cur = histIdx, prv = 1 - histIdx;
  {
    const T = P.taa; use(T); gl.bindFramebuffer(gl.FRAMEBUFFER, histFBO[cur]); gl.viewport(0, 0, CW, CH);
    tex(T, 'uCur', gl.TEXTURE_2D, cloudColor); tex(T, 'uCurDepth', gl.TEXTURE_2D, cloudDepth); tex(T, 'uHist', gl.TEXTURE_2D, hist[prv]);
    set(T, 'uRight', B.r); set(T, 'uUp', B.u); set(T, 'uFwd', B.f); set(T, 'uTan', tanX, tanY);
    const pv = prev || {B, tanX, tanY, cam: camK};
    set(T, 'uPRight', pv.B.r); set(T, 'uPUp', pv.B.u); set(T, 'uPFwd', pv.B.f); set(T, 'uPTan', pv.tanX, pv.tanY);
    set(T, 'uCamDelta', camK[0] - pv.cam[0], camK[1] - pv.cam[1], camK[2] - pv.cam[2]);
    const turn = Math.acos(Math.min(1, B.f[0] * pv.B.f[0] + B.f[1] * pv.B.f[1] + B.f[2] * pv.B.f[2]));
    set(T, 'uBlend', Math.min(0.7, 0.1 + turn * 6 + (SPEEDS[S.speed | 0] >= 10 ? 0.3 : (lightChanged ? 0.25 : 0)) + (flash > 0.03 ? 0.5 : 0)));
    set(T, 'uTexel', 1 / CW, 1 / CH);
    seti(T, 'uReset', needReset ? 1 : 0);
    draw();
    needReset = false;
    prev = {B, tanX, tanY, cam: camK.slice()};
  }

  /* touch map: where the petal stream passes low, flowers wake and glow (as in Flower), fading over a few minutes */
  const TT = TOUCH_EXT / TOUCH_N, tcx = Math.floor(camM[0] / TT) * TT, tcz = Math.floor(camM[2] / TT) * TT;
  {
    const sh = isFinite(touchCx) ? [(tcx - touchCx) / TOUCH_EXT, (tcz - touchCz) / TOUCH_EXT] : [9, 9];
    touchCx = tcx; touchCz = tcz;
    touchDecayAcc += dt;
    let decay = 1;
    if (touchDecayAcc >= 1){ const n = Math.floor(touchDecayAcc); decay = Math.pow(0.997, n); touchDecayAcc -= n; }
    let ns = 0;
    if (streamOn) for (let k = 0; k < TRAIL_N; k += 2){
      const wx = trailUni[k * 4] + camM[0], wy = trailUni[k * 4 + 1] + camM[1], wz = trailUni[k * 4 + 2] + camM[2];
      stampUni.set([wx, wz, 0, clamp((2.8 - (wy - groundH(wx, wz))) / 1.5, 0, 1)], ns * 4); ns++;
    }
    const Tc = P.touch; use(Tc);
    gl.bindFramebuffer(gl.FRAMEBUFFER, touchFBO[1 - touchIdx]); gl.viewport(0, 0, TOUCH_N, TOUCH_N);
    tex(Tc, 'uPrev', gl.TEXTURE_2D, touchTex[touchIdx]);
    set(Tc, 'uShift', sh[0], sh[1]); set(Tc, 'uCenter', tcx, tcz); set(Tc, 'uExt', TOUCH_EXT);
    set(Tc, 'uDecay', decay); set(Tc, 'uRamp', 1 - Math.exp(-dt * 5)); set(Tc, 'uRampB', 1 - Math.exp(-dt * 2.4)); set(Tc, 'uStampR', S.bloomR); seti(Tc, 'uStampN', ns); gl.uniform4fv(Tc.u.uStamp, stampUni);
    draw();
    touchIdx = 1 - touchIdx;
  }
  /* infinite memory: log where the stream skims the grass; when on, re-stamp the logged path as the map scrolls */
  if (streamOn && trailHist.length){
    const lp = trailHist[trailHist.length - 1].p, wl = clamp((2.8 - (lp[1] - groundH(lp[0], lp[2]))) / 1.5, 0, 1);
    if (wl > 0.05) memAdd(lp[0], lp[2], wl);
  }
  if (S.infMem){
    restampFrame++;
    if (!isFinite(restampCx) || Math.hypot(tcx - restampCx, tcz - restampCz) > 24 || restampFrame >= 30){
      restampFrame = 0; restampCx = tcx; restampCz = tcz;
      const half = TOUCH_EXT / 2 + S.bloomR + 1, nowS = Date.now() / 1000;
      let n = 0;
      for (let cx = Math.floor((tcx - half) / MEM_CELL); cx <= Math.floor((tcx + half) / MEM_CELL); cx++)
      for (let cz = Math.floor((tcz - half) / MEM_CELL); cz <= Math.floor((tcz + half) / MEM_CELL); cz++){
        const a = memGrid.get(cx + ',' + cz); if (!a) continue;
        for (const i of a){
          const age = nowS - memPts[i + 2]; if (age < 3) continue;
          const rx = memPts[i] - tcx, rz = memPts[i + 1] - tcz;
          if (Math.abs(rx) > half || Math.abs(rz) > half) continue;
          if ((n + 1) * 4 > restampData.length){
            const nd = new Float32Array(restampData.length * 2); nd.set(restampData); restampData = nd;
            gl.bindBuffer(gl.ARRAY_BUFFER, restampBuf); gl.bufferData(gl.ARRAY_BUFFER, restampData.byteLength, gl.DYNAMIC_DRAW);
          }
          restampData[n * 4] = rx; restampData[n * 4 + 1] = rz; restampData[n * 4 + 2] = Math.pow(0.997, age); restampData[n * 4 + 3] = memPts[i + 3];
          n++;
        }
      }
      if (n){
        const Rs = P.restamp; use(Rs);
        gl.bindFramebuffer(gl.FRAMEBUFFER, touchFBO[touchIdx]); gl.viewport(0, 0, TOUCH_N, TOUCH_N);
        set(Rs, 'uExt', TOUCH_EXT); set(Rs, 'uStampR', S.bloomR);
        gl.enable(gl.BLEND); gl.blendEquation(gl.MAX);
        gl.bindVertexArray(restampVAO); gl.bindBuffer(gl.ARRAY_BUFFER, restampBuf); gl.bufferSubData(gl.ARRAY_BUFFER, 0, restampData, 0, n * 4);
        gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, n);
        gl.bindVertexArray(emptyVAO); gl.blendEquation(gl.FUNC_ADD); gl.disable(gl.BLEND);
      }
    }
    memSave(false);
  }

  if (WXS.wet > 0.02 && (!isFinite(pudCx) || Math.hypot(camM[0] - pudCx, camM[2] - pudCz) > 8)){
    const PT = PUD_EXT / PUD_N; pudCx = Math.round(camM[0] / PT) * PT; pudCz = Math.round(camM[2] / PT) * PT;
    const Pd = P.pud; use(Pd); gl.bindFramebuffer(gl.FRAMEBUFFER, pudFBO); gl.viewport(0, 0, PUD_N, PUD_N);
    tex(Pd, 'uTerr', gl.TEXTURE_2D, terrTex); set(Pd, 'uPudP', pudCx, pudCz, PUD_EXT);
    draw();
  }

  /* ---------------- scene into the multisampled target ---------------- */
  gl.bindFramebuffer(gl.FRAMEBUFFER, msFBO);
  gl.viewport(0, 0, W, H);
  gl.clearColor(0, 0, 0, 1); gl.clearDepth(1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LESS); gl.depthMask(true);

  const setScene = (Pp) => {
    tex(Pp, 'uTerr', gl.TEXTURE_2D, terrTex); tex(Pp, 'uSkyLut', gl.TEXTURE_2D, skyTex); tex(Pp, 'uCShadow', gl.TEXTURE_2D, cshTex);
    set(Pp, 'uCamM', camM); set(Pp, 'uR', B.r); set(Pp, 'uU', B.u); set(Pp, 'uF', B.f);
    set(Pp, 'uTanS', tanX, tanY); set(Pp, 'uDepthAB', depthAB[0], depthAB[1]);
    set(Pp, 'uTime', simTime); set(Pp, 'uWindDirG', windDir[0], windDir[1]); set(Pp, 'uWindStr', WP.breeze);
    set(Pp, 'uShadowP', cshP); set(Pp, 'uSunDir', sun); set(Pp, 'uSunGround', L.lightGround); set(Pp, 'uSkyIrr', L.skyIrr);
    set(Pp, 'uFogKG', 1 / 13); set(Pp, 'uExposure', expoS); set(Pp, 'uRes', W, H); set(Pp, 'uNightGlow', nightGlow);
    set(Pp, 'uCShadowAmt', L.cshAmt); tex(Pp, 'uTouch', gl.TEXTURE_2D, touchTex[touchIdx]); set(Pp, 'uTouchP', tcx, tcz, TOUCH_EXT, S.flowerGlow ? 1 : 0); set(Pp, 'uBloomAnim', S.bloom ? 1 : 0); set(Pp, 'uWet', WXS.wet); set(Pp, 'uPudTh', pudThreshold(WXS.wet)); set(Pp, 'uSnowCov', WXS.snowCov); tex(Pp, 'uPud', gl.TEXTURE_2D, pudTex); set(Pp, 'uPudP', pudCx, pudCz, PUD_EXT); set(Pp, 'uRainNow', WXS.rain); set(Pp, 'uFlashAmb', flashAmb); set(Pp, 'uFogW', fogW[0], fogW[1], fogW[2], fogW[3]); set(Pp, 'uFogCol', fogCol); set(Pp, 'uStreamScale', S.streamScale ? 1 + (streamD - 6.5) * 0.05 : 1); tex(Pp, 'uGlowMap', gl.TEXTURE_2D, glowTex); set(Pp, 'uGlowP4', gcx, gcz, GLOW_EXT, glowAmt);
  };
  /* night glow map: flowers, petals and fireflies splatted top-down, sampled by grass, shells and terrain */
  const glowAmt = grassOn ? smooth(0.05, 0.6, L.glowF) : 0;
  const gTx = GLOW_EXT / GLOW_N, gcx = Math.floor(camM[0] / gTx) * gTx, gcz = Math.floor(camM[2] / gTx) * gTx;
  if (glowAmt > 0.01){
    gl.disable(gl.DEPTH_TEST);
    gl.bindFramebuffer(gl.FRAMEBUFFER, glowFBO); gl.viewport(0, 0, GLOW_N, GLOW_N);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
    const Gw = P.glow; use(Gw); setScene(Gw); tex(Gw, 'uGlowMap', gl.TEXTURE_2D, terrTex); set(Gw, 'uGlowI', nightGlow);
    const GF = q.flowers, fbx = Math.floor(camM[0]) - GF / 2, fbz = Math.floor(camM[2]) - GF / 2;
    set(Gw, 'uFGrid', GF); set(Gw, 'uFCell', 1.0); set(Gw, 'uFBase', fbx, fbz); set(Gw, 'uFOrig', fbx - camM[0], fbz - camM[2]);
    seti(Gw, 'uMode', 0); gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, GF * GF);
    const flyG = S.flies && aglReal < 30 ? smooth(0.2, 0.7, L.night) : 0;
    if (flyG > 0.01){ seti(Gw, 'uMode', 1); set(Gw, 'uFBox', 60); set(Gw, 'uFlyMul', flyG); gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, FLY_COUNT[S.quality] || 240); }
    if (S.petals){
      seti(Gw, 'uMode', 2); set(Gw, 'uPBox', 70); gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, q.petals);
      if (streamOn){ seti(Gw, 'uMode', 3); gl.uniform4fv(Gw.u.uTrail, trailUni); gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, TRAIL_N); }
    }
    gl.disable(gl.BLEND);
    gl.bindFramebuffer(gl.FRAMEBUFFER, msFBO); gl.viewport(0, 0, W, H);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LESS); gl.depthMask(true);
  }
  const R0 = q.layers[0][0] * q.layers[0][1] / 2;
  bladeEst = 0;
  if (grassOn){
    /* flowers (alpha-to-coverage petals) */
    gl.enable(gl.SAMPLE_ALPHA_TO_COVERAGE);
    {
      const F = P.flower; use(F); setScene(F);
      const G = q.flowers, cell = 1.0, bx = Math.floor(camM[0] / cell) - G / 2, bz = Math.floor(camM[2] / cell) - G / 2;
      set(F, 'uFGrid', G); set(F, 'uFCell', cell); set(F, 'uFBase', bx, bz); set(F, 'uFOrig', bx * cell - camM[0], bz * cell - camM[2]);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6 + 36 + 6, G * G);
    }
    gl.disable(gl.SAMPLE_ALPHA_TO_COVERAGE);
    /* grass: three LOD layers, only tiles inside the view frustum are drawn */
    const Gp = P.grass; use(Gp); setScene(Gp);
    gl.uniform4fv(Gp.u.uPush, pushUni);
    const planes = frustumPlanes(B, tanX, tanY);
    let prevR = 0;
    q.layers.forEach(([G, cell, segs], li) => {
      const R = G * cell / 2, lr = li === 0 ? [-1, 0, R] : [prevR * 0.78, prevR, R];
      const bx = Math.floor(camM[0] / cell) - G / 2, bz = Math.floor(camM[2] / cell) - G / 2;
      const ox = bx * cell - camM[0], oz = bz * cell - camM[2];
      set(Gp, 'uTileN', TILE); set(Gp, 'uCell', cell); set(Gp, 'uGridBase', bx, bz); set(Gp, 'uGridOrig', ox, oz);
      set(Gp, 'uLayerR', lr[0], lr[1], lr[2]); set(Gp, 'uWidthMul', LAYER_WIDTH[li]); set(Gp, 'uFarLayer', li === 0 ? 0 : 1); seti(Gp, 'uSegs', segs);
      const nT = G / TILE, ts = TILE * cell, mg = ts * 0.4 + 2, tileLoc = Gp.u.uTile;
      for (let tz = 0; tz < nT; tz++) for (let tx = 0; tx < nT; tx++){
        const x0 = ox + tx * ts, z0 = oz + tz * ts, x1 = x0 + ts, z1 = z0 + ts;
        const nx = Math.max(x0, Math.min(0, x1)), nz = Math.max(z0, Math.min(0, z1));
        const dNear = Math.hypot(nx, nz);
        if (dNear > R) continue;
        if (Math.hypot(Math.max(-x0, x1), Math.max(-z0, z1)) < lr[0]) continue;
        const gc = groundH(camM[0] + (x0 + x1) / 2, camM[2] + (z0 + z1) / 2) - camM[1];
        if (!boxVisible(planes, x0, x1, gc - mg, gc + mg + 1.2, z0, z1)) continue;
        gl.uniform2f(tileLoc, tx * TILE, tz * TILE);
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 2 * segs + 1, TILE * TILE);
        const dc = Math.hypot((x0 + x1) / 2, (z0 + z1) / 2);
        const keep = (li === 0 ? 1 : clamp((dc - lr[0]) / (lr[1] - lr[0]), 0, 1)) * (1 - clamp((dc - R * 0.78) / (R * 0.22), 0, 1));
        bladeEst += TILE * TILE * keep;
      }
      prevR = R;
    });
  }
  /* terrain */
  {
    const Tt = P.terrain; use(Tt); setScene(Tt);
    tex(Tt, 'uCloud', gl.TEXTURE_2D, hist[cur]); tex(Tt, 'uCloudDepth', gl.TEXTURE_2D, cloudDepth);
    const [NR, NA] = q.terr, Bk = 9, Ak = 60000 / (Math.exp(Bk) - 1);
    set(Tt, 'uNR', NR); set(Tt, 'uNA', NA); set(Tt, 'uRadAB', Ak, Bk);
    set(Tt, 'uNearR', grassOn ? R0 : 0.001); set(Tt, 'uPixAng', 2 * tanY / H); set(Tt, 'uShellR', R0 * 0.5, grassOn ? q.shell[1] : 0.001);
    set(Tt, 'uCloudOver', camK[1] > LAYER[0] - 0.05 ? 1 : 0);
    gl.bindVertexArray(terrainVAO);
    gl.drawElements(gl.TRIANGLES, terrainCount, gl.UNSIGNED_INT, 0);
    gl.bindVertexArray(emptyVAO);
  }
  /* shells: stacked grass slices across the mid-range, drawn top-down over the rings they cover */
  if (grassOn && q.shell[0] > 0){
    const [NS, rOut, cell] = q.shell, [NR, NA] = q.terr, Bk = 9, Ak = 60000 / (Math.exp(Bk) - 1);
    const ringAt = (r) => clamp(Math.floor(Math.log(r / Ak + 1) / Bk * NR), 0, NR);
    const i0 = Math.max(0, ringAt(R0 * 0.25) - 1), i1 = Math.min(NR, ringAt(rOut) + 2);
    const Sh = P.shell; use(Sh); setScene(Sh);
    set(Sh, 'uNR', NR); set(Sh, 'uNA', NA); set(Sh, 'uRadAB', Ak, Bk);
    set(Sh, 'uShellR', R0 * 0.5, rOut); set(Sh, 'uShellCell', cell); set(Sh, 'uPixAng', 2 * tanY / H);
    gl.enable(gl.SAMPLE_ALPHA_TO_COVERAGE);
    gl.bindVertexArray(terrainVAO);
    for (let k = NS - 1; k >= 0; k--){
      set(Sh, 'uShellS', (k + 0.5) / NS * 0.95);
      gl.drawElements(gl.TRIANGLES, (i1 - i0) * NA * 6, gl.UNSIGNED_INT, i0 * NA * 6 * 4);
    }
    gl.bindVertexArray(emptyVAO);
    gl.disable(gl.SAMPLE_ALPHA_TO_COVERAGE);
  }
  /* petals: drifting on the wind, plus the stream leading the camera */
  if (S.petals){
    gl.enable(gl.SAMPLE_ALPHA_TO_COVERAGE);
    const Pe = P.petal; use(Pe); setScene(Pe); set(Pe, 'uPBox', 70);
    if (grassOn) gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, q.petals);
    if (streamOn){
      const St = P.stream; use(St); setScene(St);
      gl.uniform4fv(St.u.uTrail, trailUni);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, TRAIL_N);
    }
    gl.disable(gl.SAMPLE_ALPHA_TO_COVERAGE);
  }
  /* sky + clouds where nothing was drawn */
  {
    const Sk = P.sky; use(Sk);
    gl.depthFunc(gl.LEQUAL); gl.depthMask(false);
    setCloudCommon(Sk); tex(Sk, 'uSkyLut', gl.TEXTURE_2D, skyTex); tex(Sk, 'uCloud', gl.TEXTURE_2D, hist[cur]);
    set(Sk, 'uCloudSize', CW, CH); set(Sk, 'uSunDisk', L.sunDisk); set(Sk, 'uExposure', expoS); set(Sk, 'uRes', W, H);
    set(Sk, 'uFogW', fogW[0], fogW[1], fogW[2], fogW[3]); set(Sk, 'uFogCol', fogCol); set(Sk, 'uFlashSky', [0.8, 0.85, 1.0].map(v => v * flash * 1.4)); set(Sk, 'uFlashDir', flashTop.map(v => v / ftl));
    set(Sk, 'uSunTrue', L.sunT); set(Sk, 'uMoonDir', L.moonD); set(Sk, 'uMoonDisk', L.moonDisk);
    const off = S.sunAz * Math.PI / 180, dirAE = (az, el) => [Math.cos(el) * Math.sin(az + off), Math.sin(el), Math.cos(el) * Math.cos(az + off)];
    const LATR = LOC.lat * RAD; set(Sk, 'uPole', dirAE(0, LATR)); set(Sk, 'uSouthEq', dirAE(Math.PI, Math.PI / 2 - LATR)); set(Sk, 'uWestEq', dirAE(Math.PI * 1.5, 0));
    set(Sk, 'uSidereal', AST.lst); set(Sk, 'uStarI', L.starI); set(Sk, 'uPixAngS', 2 * tanY / H); set(Sk, 'uTimeS', simTime);
    draw();
    gl.depthMask(true);
  }
  /* real stars, planets and optional constellation lines, added over the sky only (depth test at the far plane) */
  if (L.starCat > 2e-4){
    const off = S.sunAz * RAD, LATR = LOC.lat * RAD, dae = (az, el) => [Math.cos(el) * Math.sin(az + off), Math.sin(el), Math.cos(el) * Math.cos(az + off)];
    const Pv = dae(0, LATR), Sv = dae(Math.PI, Math.PI / 2 - LATR), Wv = dae(Math.PI * 1.5, 0), cl = Math.cos(AST.lst), sl = Math.sin(AST.lst);
    eqMat.set([cl * Sv[0] + sl * Wv[0], cl * Sv[1] + sl * Wv[1], cl * Sv[2] + sl * Wv[2], sl * Sv[0] - cl * Wv[0], sl * Sv[1] - cl * Wv[1], sl * Sv[2] - cl * Wv[2], Pv[0], Pv[1], Pv[2]]);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_COLOR); gl.depthFunc(gl.LEQUAL); gl.depthMask(false);
    const St = P.stars; use(St);
    gl.uniformMatrix3fv(St.u.uEq, false, eqMat);
    set(St, 'uR', B.r); set(St, 'uU', B.u); set(St, 'uF', B.f); set(St, 'uTan', tanX, tanY);
    set(St, 'uStarI', L.starCat * (1 - 0.95 * Math.min(1, WXS.fog * 1.5 + WXS.rain + WXS.snow))); set(St, 'uPxScale', W / Math.max(cssW, 1)); set(St, 'uTimeS', simTime);
    tex(St, 'uCloud', gl.TEXTURE_2D, hist[cur]);
    gl.bindVertexArray(starVAO); gl.drawArrays(gl.POINTS, 0, STAR_N);
    updatePlanets(simMs);
    gl.bindVertexArray(planetVAO); gl.drawArrays(gl.POINTS, 0, 5);
    if (S.constel){
      const Ln = P.lines; use(Ln);
      gl.uniformMatrix3fv(Ln.u.uEq, false, eqMat);
      set(Ln, 'uR', B.r); set(Ln, 'uU', B.u); set(Ln, 'uF', B.f); set(Ln, 'uTan', tanX, tanY); set(Ln, 'uLineA', 0.05 + 0.3 * L.night);
      gl.bindVertexArray(lineVAO); gl.drawArrays(gl.LINES, 0, LINE_N);
    }
    gl.bindVertexArray(emptyVAO); gl.disable(gl.BLEND); gl.depthMask(true);
  }
  /* fireflies from dusk on: additive glow, depth-tested against the grass, depth written so DOF treats them as near objects */
  const flyVis = S.flies && grassOn && aglReal < 30 ? smooth(0.2, 0.7, L.night) * (1 - Math.min(1, WXS.rain + WXS.snow)) : 0;
  if (flyVis > 0.01){
    const Fl = P.flies; use(Fl); setScene(Fl);
    set(Fl, 'uFBox', 60); set(Fl, 'uFlyI', 4.2 * flyVis); set(Fl, 'uPxScale', W / Math.max(cssW, 1));
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_COLOR); gl.depthFunc(gl.LESS); gl.depthMask(true);
    gl.drawArraysInstanced(gl.POINTS, 0, 1, FLY_COUNT[S.quality] || 240);
    gl.disable(gl.BLEND);
  }
  /* rain streaks (alpha) and lightning channels (additive), depth-tested against the scene */
  if (WXS.rain > 0.01){
    const Rn = P.rain; use(Rn); setScene(Rn);
    set(Rn, 'uRainBox', 30); set(Rn, 'uRainH', 18); set(Rn, 'uRainA', 0.6 * Math.sqrt(WXS.rain));
    set(Rn, 'uRainCol', L.skyIrr.map((v, i) => v / Math.PI * 1.7 + flashAmb[i] / Math.PI * 1.2));
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthFunc(gl.LESS); gl.depthMask(false);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, Math.round((RAIN_N[S.quality] || 3000) * WXS.rain));
    gl.disable(gl.BLEND); gl.depthMask(true);
  }
  if (WXS.snow > 0.01){
    const Sn = P.snow; use(Sn); setScene(Sn);
    set(Sn, 'uSnowBox', 20); set(Sn, 'uSnowH', 14); set(Sn, 'uSnowA', 0.85 * Math.sqrt(WXS.snow));
    set(Sn, 'uSnowCol', L.skyIrr.map((v, i) => v / Math.PI * 3.2 + flashAmb[i] / Math.PI * 1.5));
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthFunc(gl.LESS); gl.depthMask(false);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, Math.round((SNOW_N[S.quality] || 4000) * WXS.snow));
    gl.disable(gl.BLEND); gl.depthMask(true);
  }
  if (flash > 0.02 && bolt.segs.length){
    const n = Math.min(bolt.segs.length, BOLT_MAX), pxs = W / Math.max(cssW, 1);
    for (let i = 0; i < n; i++){
      const [a, b, wd] = bolt.segs[i];
      boltData.set([a[0] - camM[0], a[1] - camM[1], a[2] - camM[2], b[0] - camM[0], b[1] - camM[1], b[2] - camM[2], wd * pxs], i * 7);
    }
    const Bo = P.bolt; use(Bo); setScene(Bo);
    set(Bo, 'uResB', W, H); set(Bo, 'uBoltI', Math.min(3, flash * 2.2 * Math.exp(-fogDens * bolt.dist * 0.3)));
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); gl.depthFunc(gl.LESS); gl.depthMask(false);
    gl.bindVertexArray(boltVAO); gl.bindBuffer(gl.ARRAY_BUFFER, boltBuf); gl.bufferSubData(gl.ARRAY_BUFFER, 0, boltData, 0, n * 7);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, n);
    gl.bindVertexArray(emptyVAO); gl.disable(gl.BLEND); gl.depthMask(true);
  }
  gl.disable(gl.DEPTH_TEST);
  /* light shafts */
  const fw = sun[0] * B.f[0] + sun[1] * B.f[1] + sun[2] * B.f[2];
  if (S.god && fw > 0.05){
    const sx = (sun[0] * B.r[0] + sun[1] * B.r[1] + sun[2] * B.r[2]) / (fw * tanX);
    const syy = (sun[0] * B.u[0] + sun[1] * B.u[1] + sun[2] * B.u[2]) / (fw * tanY);
    const off = Math.max(Math.abs(sx), Math.abs(syy));
    const god = Math.max(0, 1 - Math.max(0, off - 1) / 1.2) * Math.min(1, (fw - 0.05) * 4);
    if (god > 0.001){
      const Gd = P.god; use(Gd);
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_COLOR);
      tex(Gd, 'uCloud', gl.TEXTURE_2D, hist[cur]);
      set(Gd, 'uSunUV', sx * 0.5 + 0.5, syy * 0.5 + 0.5); set(Gd, 'uGod', god); set(Gd, 'uAspect', aspect);
      set(Gd, 'uExposure', expoS); set(Gd, 'uSunCam', L.lightCam); set(Gd, 'uSunDir', sun);
      set(Gd, 'uRight', B.r); set(Gd, 'uUp', B.u); set(Gd, 'uFwd', B.f); set(Gd, 'uTan', tanX, tanY);
      draw();
      gl.disable(gl.BLEND);
    }
  }

  /* ---------------- resolve + post ---------------- */
  gl.bindFramebuffer(gl.READ_FRAMEBUFFER, msFBO); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, resFBO);
  gl.blitFramebuffer(0, 0, W, H, 0, 0, W, H, gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT, gl.NEAREST);
  gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);

  const dofOn = S.dof > 0.01;
  const setPost = (Pp) => {
    set(Pp, 'uDepthAB', depthAB[0], depthAB[1]); set(Pp, 'uFocus', cam.focus);
    set(Pp, 'uCocK', S.dof * 48 * (HH / 540)); set(Pp, 'uCocMaxN', q.dof[0] * 0.75); set(Pp, 'uCocMaxF', q.dof[0] * 0.35); set(Pp, 'uFocusR', 2.4); set(Pp, 'uSkyCoc', 1 - 0.9 * L.night);
  };
  if (dofOn){
    const Dp = P.dofPrep; use(Dp); gl.bindFramebuffer(gl.FRAMEBUFFER, dofPrepFBO); gl.viewport(0, 0, HW, HH);
    tex(Dp, 'uScene', gl.TEXTURE_2D, sceneTex); tex(Dp, 'uDepth', gl.TEXTURE_2D, depthTex);
    set(Dp, 'uSrcTexel', 1 / W, 1 / H); setPost(Dp);
    draw();
    const Dg = P.dof; use(Dg); gl.bindFramebuffer(gl.FRAMEBUFFER, dofFBO); gl.viewport(0, 0, HW, HH);
    tex(Dg, 'uSrc', gl.TEXTURE_2D, dofPrepTex); set(Dg, 'uTexel', 1 / HW, 1 / HH); set(Dg, 'uMaxR', q.dof[0]); set(Dg, 'uRadStep', q.dof[1]);
    draw();
  }
  {
    const Bp = P.bloomPre; use(Bp); gl.bindFramebuffer(gl.FRAMEBUFFER, bloomDF[0]); gl.viewport(0, 0, bloomSz[0][0], bloomSz[0][1]);
    tex(Bp, 'uSrc', gl.TEXTURE_2D, sceneTex); set(Bp, 'uSrcTexel', 1 / W, 1 / H); set(Bp, 'uThresh', 0.76 - 0.15 * L.glowF);
    draw();
    for (let i = 1; i < bloomD.length; i++){
      const Dn = P.down; use(Dn); gl.bindFramebuffer(gl.FRAMEBUFFER, bloomDF[i]); gl.viewport(0, 0, bloomSz[i][0], bloomSz[i][1]);
      tex(Dn, 'uSrc', gl.TEXTURE_2D, bloomD[i - 1]); set(Dn, 'uSrcTexel', 1 / bloomSz[i - 1][0], 1 / bloomSz[i - 1][1]);
      draw();
    }
  }
  let bloomOut = bloomD[bloomD.length - 1];
  for (let i = bloomD.length - 2; i >= 0; i--){
    const Up = P.up; use(Up); gl.bindFramebuffer(gl.FRAMEBUFFER, bloomUF[i]); gl.viewport(0, 0, bloomSz[i][0], bloomSz[i][1]);
    tex(Up, 'uSrc', gl.TEXTURE_2D, bloomOut); tex(Up, 'uBase', gl.TEXTURE_2D, bloomD[i]);
    set(Up, 'uSrcTexel', 1 / bloomSz[i + 1][0], 1 / bloomSz[i + 1][1]);
    draw();
    bloomOut = bloomU[i];
  }
  {
    /* lens rain: simulate and draw the water map, then return to the screen */
    const lensOn = S.lensDrops && (WXS.rain > 0.01 || LR.drops.length > 0);
    if (lensOn){
      const yr = (cam.yaw - LR.lastYaw) / Math.max(dt, 1e-3);
      lensRainUpdate(dt, WXS.rain, W / H, clamp(yr, -3, 3));
      lensRainDraw(W / H);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, W, H);
    } else if (!S.lensDrops) LR.drops.length = 0;
    LR.lastYaw = cam.yaw;
    const Fi = P.final; use(Fi); gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, W, H);
    tex(Fi, 'uScene', gl.TEXTURE_2D, sceneTex); tex(Fi, 'uDepth', gl.TEXTURE_2D, depthTex);
    tex(Fi, 'uDof', gl.TEXTURE_2D, dofTex); tex(Fi, 'uBloom', gl.TEXTURE_2D, bloomOut);
    set(Fi, 'uSat', L.grade.sat); set(Fi, 'uShTint', L.grade.sh); set(Fi, 'uHiTint', L.grade.hi); set(Fi, 'uLift', L.grade.lift);
    set(Fi, 'uDrops', lensOn && LR.tex ? 1 : 0); set(Fi, 'uTimeD', simTime); if (LR.tex) tex(Fi, 'uLens', gl.TEXTURE_2D, LR.tex);
    set(Fi, 'uDofOn', dofOn ? 1 : 0); set(Fi, 'uBloomI', 0.16 + 0.2 * L.glowF); set(Fi, 'uNight', L.night); set(Fi, 'uFrameN', frameNo % 997); set(Fi, 'uRes', W, H); setPost(Fi);
    draw();
  }

  histIdx = 1 - histIdx; frameNo++;

  /* stats + adaptive quality */
  statAcc += dt; statFrames++; statT += dt;
  if (statT > 0.5){
    const fps = statFrames / statAcc;
    $('fps').textContent = fps.toFixed(1); setMessage($('ms'), 'rendering.frameTime', { value: (1000 / fps).toFixed(1) });
    wxStatus();
    renderClock();
    $('locSun').textContent = riseSetText(simMs);
    const live = S.wxMode === 'follow' && WXS.followOK ? WXS.live : null;
    const timeState = { hours: S.time, speedIndex: S.speed, loc: LOC, sun: getSunEvents(simMs, LOC), phase: phaseIndex(AST.phase) };
    updateTimeControls(timeState);
    onUpdate({
      loc: LOC, ms: simMs, live, followNow, speed: SPEEDS[S.speed | 0],
      airQuality: live ? WXS.airQuality : null, temperatureUnit: S.temperatureUnit,
      weatherDisplay: { show: S.showWeather, temperature: S.showTemperature, precipitation: S.showPrecipitation, airQuality: S.showAirQuality, clouds: S.showClouds, wind: S.showWind },
      simulatedWeather: S.wxMode !== 'follow' || Boolean(WXS.src && !live),
      weather: live ? live.type : WXS.type,
      coverage: WP.cov, wind: WP.wind,
      weatherSource: S.wxMode === 'manual' ? 'weather.source.manual' : S.wxMode === 'off' ? 'weather.source.off' : S.wxMode === 'dynamic' ? 'weather.source.dynamic' : WXS.src ? 'weather.source.fallback' : 'weather.source.connecting',
      sun: timeState.sun, sunAltitude: AST.sunAlt / RAD, phase: timeState.phase,
    });
    setMessage($('blades'), grassOn ? 'rendering.blades' : 'rendering.noGrass', { count: Math.round(bladeEst).toLocaleString(getLocale()) });
    statAcc = 0; statFrames = 0; statT = 0;
  }
  if (!userPickedQuality && downgrades < 2 && frameNo > 30){
    perfFrames++; perfAcc += dt;
    if (perfFrames >= 90){
      const avg = perfAcc / perfFrames; perfFrames = 0; perfAcc = 0;
      const order = ['low', 'med', 'high', 'ultra'], idx = order.indexOf(S.quality);
      if (avg > 0.042 && idx > 0){ downgrades++; setQuality(order[idx - 1]); }
    }
  }
  requestAnimationFrame(tick);
}

function tick(now) {
  try { frame(now); }
  catch (error) {
    console.error('Hanagoyomi 渲染中断', error);
    fail('error.rendering');
  }
}
resize(true);
requestAnimationFrame(tick);

}
