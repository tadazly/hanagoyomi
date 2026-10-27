import { TN, tnData, tnSample, groundH } from './terrain.js';
import { VS_FULL, VS_SKY, PRE, HEAD, NOISE_FS, COMMON, SKYLUT_FS, CSHADOW_FS, CLOUD_FS, TAA_FS, DISPLAY, SCENE, SCENE_FS, VPRE, TERRAIN_VS, TERRAIN_FS, GRASS_VS, GRASS_FS, FLOWER_VS, PETAL_VS, STREAM_VS, PETAL_FS, SKYPASS_FS, GOD_FS, POSTCOMMON, DOFPREP_FS, DOF_FS, BLOOMPRE_FS, DOWN_FS, UP_FS, FINAL_FS, SHELL_VS, SHELL_FS, STAR_VS, STAR_FS, PLANET_VS, PLANET_FS, FIREFLY_VS, FIREFLY_FS, FLY_COUNT, GLOW_VS, GLOW_FS, GLOW_N, TOUCH_FS, RESTAMP_VS, RESTAMP_FS, TOUCH_N, PUD_FS, PUD_N, RAIN_VS, RAIN_FS, BOLT_VS, BOLT_FS, RAIN_N, SNOW_VS, SNOW_FS, SNOW_N, DROP_VS, DROP_FS, GLOW_EXT, TOUCH_EXT, PUD_EXT, BOLT_MAX } from './shaders.js';
import { equatorialToWorld } from './celestial-coordinates.js';
import { createGalaxyTexture } from './galaxy-texture.js';
import { cloudStyle } from './cloud-style.js';
import { REALISTIC_CLOUD_LAYER, REALISTIC_CLOUD_QUALITY, cloudCurveTexture, loadCloudNoise, cloudPhases, cloudLightProjection } from './realistic-clouds.js';
import { realisticCoverageControls } from './cloud-coverage.js';
import { CLOUD_TRANSMITTANCE_FS, CLOUD_IRRADIANCE_FS, CLOUD_LIGHT_VOLUME_FS, CLOUD_LIGHT_REPROJECT_FS } from './shaders.js';
import { cloudLightBlend, cloudLightTemporalChange } from './cloud-lighting-history.js';
import { cloudWindPhase } from './cloud-coordinates.js';
import { cloudRayLimit } from './cloud-range.js';
import { cloudAirLight } from './cloud-air-light.js';
import { moonlessAstronomy, observationLighting, observationSunAltitude } from './observation-lighting.js';
import { exposureKey } from './exposure.js';
import { splitAnimationTime, animationPhase, advanceFireflyOffset, advanceWindOffset, ANIMATION_TIME_PERIOD, wrap } from './animation-time.js';
import { createLightingTimeline } from './lighting-timeline.js';
import { MOON_RADIUS, celestialShaftSource, nightCloudGain, nightGroundGain, nightSkyAppearance, moonNorthDirection, nightSkyStyle } from './night-sky.js';
import { nightHdrEnabled, nightHdrBlend, nightHdrShader, hdrTarget } from './night-hdr.js';
import { createNightObservation, nightObservationAppearance } from './night-observation.js';
import { bvToRgb } from './stellar-color.js';
import { observationPlanetMagnitude } from './planet-photometry.js';
import { decodeHipparcosStars } from './stellar-photometry.js';
import { createConstellationOverlay } from './constellation-overlay.js';
import { createChartCelestials } from './chart-celestials.js';
import { STARGAZING_DEFAULTS, stargazingPreferences, constellationTarget, constellationLabel } from './stargazing.js';
import { CONSTELLATIONS } from '../data/constellations.js';
import { STAR_DATA, LINE_DATA } from '../data/stars.js';
import { CITIES, COMMON_CITIES, cityName, locationName, searchCities } from '../data/cities.js';
import { WX_TYPES, WX_KEYS, wxPreset, WX_NEXT } from '../world/weather-presets.js';
import { createObservationStore, realObservationState } from '../world/observation.js';
import { advanceCloudOffset, advanceCloudAngle } from './cloud-motion.js';
import { updateWeatherDetails } from '../ui/weather-details.js';
import { getSavedLocation, saveLocation } from '../world/location.js';
import { zonedHours, zonedDayStart, localTimeToUTC, fmtTime, advanceClock, timezoneOffset, TIME_SPEEDS as SPEEDS } from '../world/clock.js';
import { getAstronomy, sunEventsText, phaseName, phaseIndex, getSunEvents } from '../world/astronomy.js';
import { getLocale, getLanguage, onLanguageChange, setMessage, t } from '../i18n/index.js';
import { bindTimeActions, updateTimeControls } from '../ui/time-controls.js';
import { bindMouseFlightInput, flightStickAxes } from './flight-input.js';
import { WALLPAPER_MODE, storageKey } from '../platform/environment.js';
import { wallpaperSettings } from '../platform/wallpaper.js';
import { createFrameGate } from '../platform/frame-gate.js';
import { RENDER_DEFAULTS, renderPreferences, effectiveFrameLimit, qualityFrameBudget } from './render-preferences.js';
import { bindRenderSettings } from '../ui/render-settings.js';
import { readWeatherCache, saveWeatherCache } from '../world/weather-cache.js';
import { gradeAt } from './landscape-look.js';
import { weatherFogDensity, groundFogHorizonBlend } from './weather-fog.js';
import { CLOUD_LAYER_METRES, localWeatherAtHeight } from './weather-altitude.js';
import { petalStreamOpacity } from './petal-stream.js';
import { flowerMesh, FLOWER_CURVE_RADIUS, FLOWER_CURVE_GRID } from './flower-mesh.js';
import { SCENE_SETTINGS, SCENE_APPEARANCE, validateScene, resolveSceneTime, sceneFrameTiming, renderSize } from '../world/scene-state.js';
import { DEFAULT_VIEW, HEIGHT_PRESETS, VIEW_HEIGHT_MIN, VIEW_HEIGHT_MAX, aglFromSlider, sliderFromAgl, startupPreferences, sceneForStartup } from '../world/view-preferences.js';

// 显示偏好独立于作品协议；旧记录缺少新开关时默认开启，显式关闭须保留。
export function displayPreferences(saved) {
  return { vignette: typeof saved?.vignette === 'boolean' ? saved.vignette : true };
}

export function startWorld(onUpdate = () => {}, celestialAssets = {}) {

const canvas = document.getElementById('view');
const $ = (id) => document.getElementById(id);
function fail(key, values){ setMessage($('errorText'), key, values); $('error').classList.add('show'); $('loader').classList.add('done'); }

const gl = canvas.getContext('webgl2', {antialias:false, alpha:false, depth:false, stencil:false,
  powerPreference:'high-performance', preserveDrawingBuffer:false});
if (!gl){ fail('error.webgl'); return; }
const floatColorBuffer = gl.getExtension('EXT_color_buffer_float');
if (!(floatColorBuffer || gl.getExtension('EXT_color_buffer_half_float'))){
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
  try { saveSettings(); } catch { /* 即使状态已损坏，也保留恢复入口。 */ }
  event.preventDefault(); contextLost = true;cancelCloudWeather();
  rejectThumbnail(new Error('WebGL context lost'));
  fail('error.contextLost');
});
canvas.addEventListener('webglcontextrestored', () => {
  if (!WALLPAPER_MODE) return;
  // 完整重建资源；连续丢失时保留错误与手动重试入口，避免无限重载。
  try {
    const key = storageKey('contextRecovery'), previous = Number(sessionStorage.getItem(key));
    if (Date.now() - previous < 120000) return;
    sessionStorage.setItem(key, String(Date.now()));
    location.reload();
  } catch { /* 存储不可用时保留手动重试，避免重载循环。 */ }
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
function setAnimationTime(P){
  const { whole, fraction } = splitAnimationTime(simTime);
  if (P.u.uTimeWhole != null) gl.uniform1ui(P.u.uTimeWhole, whole);
  set(P, 'uTimeFraction', fraction);
}
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
    skyMix: makeProgram(VS_FULL, HEAD + `uniform sampler2D uA, uB; uniform float uMix; out vec4 o;
      void main(){ o = mix(texture(uA, vUv), texture(uB, vUv), uMix); }`, 'skymix'),
    cshadow: makeProgram(VS_FULL, CSHADOW_FS.replace('uniform int uCloudStyle;', 'const int uCloudStyle=0;'), 'default cloud shadow'),
    cloud: makeProgram(VS_FULL, CLOUD_FS.replace('uniform int uCloudStyle;', 'const int uCloudStyle=0;'), 'default cloud'),
    taa: makeProgram(VS_FULL, TAA_FS, 'taa'),
    terrain: makeProgram(TERRAIN_VS, TERRAIN_FS, 'terrain'),
    grass: makeProgram(GRASS_VS, GRASS_FS, 'grass'),
    flower: makeProgram(FLOWER_VS, PETAL_FS, 'flower'),
    petal: makeProgram(PETAL_VS, PETAL_FS, 'petal'),
    stream: makeProgram(STREAM_VS, PETAL_FS, 'stream'),
    shell: makeProgram(SHELL_VS, SHELL_FS, 'shell'),
    stars: makeProgram(STAR_VS, STAR_FS, 'stars'),
    planets: makeProgram(PLANET_VS, PLANET_FS, 'planets'),
    flies: makeProgram(FIREFLY_VS, FIREFLY_FS, 'flies'),
    glow: makeProgram(GLOW_VS, GLOW_FS, 'glow'),
    touch: makeProgram(VS_FULL, TOUCH_FS, 'touch'),
    restamp: makeProgram(RESTAMP_VS, RESTAMP_FS, 'restamp'),
    rain: makeProgram(RAIN_VS, RAIN_FS, 'rain'),
    snow: makeProgram(SNOW_VS, SNOW_FS, 'snow'),
    pud: makeProgram(VS_FULL, PUD_FS, 'pud'),
    drop: makeProgram(DROP_VS, DROP_FS, 'drop'),
    bolt: makeProgram(BOLT_VS, BOLT_FS, 'bolt'),
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
const dayPrograms = P;
let nightPrograms = null;
let nightProgramIndex = 0;
const nightProgramSources = [
    ['terrain', TERRAIN_VS, TERRAIN_FS], ['grass', GRASS_VS, GRASS_FS],
    ['flower', FLOWER_VS, PETAL_FS], ['petal', PETAL_VS, PETAL_FS], ['stream', STREAM_VS, PETAL_FS],
    ['shell', SHELL_VS, SHELL_FS], ['sky', VS_SKY, SKYPASS_FS],
    ['stars', STAR_VS, STAR_FS], ['planets', PLANET_VS, PLANET_FS], ['flies', FIREFLY_VS, FIREFLY_FS],
    ['rain', RAIN_VS, RAIN_FS], ['snow', SNOW_VS, SNOW_FS],
    ['god', VS_FULL, GOD_FS], ['final', VS_FULL, FINAL_FS],
    ['twilightBloom', VS_FULL, BLOOMPRE_FS, true], ['twilightFinal', VS_FULL, FINAL_FS, true],
];
function getNightPrograms(complete = true){
  if (!nightPrograms) nightPrograms = { ...dayPrograms };
  const end = complete ? nightProgramSources.length : Math.min(nightProgramIndex + 1, nightProgramSources.length);
  while (nightProgramIndex < end){
    const [name, vs, fs, twilight] = nightProgramSources[nightProgramIndex++];
    nightPrograms[name] = makeProgram(nightHdrShader(vs), nightHdrShader(fs, twilight), `night ${name}`);
  }
  return nightPrograms;
}
const emptyVAO = gl.createVertexArray();
const draw = () => gl.drawArrays(gl.TRIANGLES, 0, 3);
const flowerMeshes = [1, 4].map(segments => {
  const mesh = flowerMesh(segments), vao = gl.createVertexArray(), buffer = gl.createBuffer();
  gl.bindVertexArray(vao); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);
  return { vao, segments, count: mesh.indices.length };
});
gl.bindVertexArray(emptyVAO);

/* ================================================================== */
/*  Textures                                                           */
/* ================================================================== */
const SHAPE_N = 128, DETAIL_N = 64, WEATHER_N = 512;
const shapeTex = makeTex3D(SHAPE_N), detailTex = makeTex3D(DETAIL_N);
const weatherTex = makeTex2D(WEATHER_N, WEATHER_N, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.LINEAR, gl.REPEAT);
const terrTex = makeTex2D(TN, TN, gl.R16F, gl.RED, gl.FLOAT, gl.LINEAR, gl.REPEAT, tnData);
let eveNoiseTex = null, eveNoisePromise = null, eveNoiseReady = false;
let eveCurvesTex;
let cloudTransTex, cloudTransFBO, cloudIrrTex, cloudIrrFBO;

let cloudLightTextures=[],cloudLightTemp=null,cloudLightTempFBO=null,cloudLightConfig=null,cloudLightState=null,cloudLightCurrent=0;
let cloudDirectSlice=0,cloudAmbientSlice=0;
let cloudLightClock=0,cloudLightTimes=[],cloudLightValid=[0,0];
// 相机/TAA重置不改变密度场，不应触发昂贵的整卷光照预填。
let cloudLightInvalidated=true;
const cloudLightFBO=gl.createFramebuffer();
function ensureCloudLightVolume(config){
  if(cloudLightConfig===config)return;
  gl.bindFramebuffer(gl.FRAMEBUFFER,cloudLightFBO);gl.framebufferTextureLayer(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,null,0,0);
  cloudLightTextures.forEach(t=>gl.deleteTexture(t));
  if(cloudLightTemp)gl.deleteTexture(cloudLightTemp);
  if(cloudLightTempFBO)gl.deleteFramebuffer(cloudLightTempFBO);
  cloudLightTextures=Array.from({length:2},()=>{
    const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_3D,texture);
    gl.texStorage3D(gl.TEXTURE_3D,1,gl.RG16F,config.grid,config.grid,config.slices);
    gl.texParameteri(gl.TEXTURE_3D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_3D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    for(const axis of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T,gl.TEXTURE_WRAP_R])gl.texParameteri(gl.TEXTURE_3D,axis,gl.CLAMP_TO_EDGE);
    return texture;
  });
  cloudLightTemp=makeTex2D(config.grid,config.grid,gl.RG16F,gl.RG,gl.HALF_FLOAT,gl.NEAREST,gl.CLAMP_TO_EDGE);
  cloudLightTempFBO=makeFBO([cloudLightTemp]);
  cloudLightConfig=config;cloudLightState=null;cloudLightCurrent=0;cloudDirectSlice=cloudAmbientSlice=0;
  cloudLightTimes=[new Float64Array(config.slices).fill(-1),new Float64Array(config.slices).fill(-1)];cloudLightValid=[0,0];
}
let activeCloudStyle = 'default';
// 只保留当前画质的一张天气纹理；异步切档晚到不能覆盖新档。
let eveWeatherError=false;
let eveWeatherTex=null,eveWeatherStatsTex=null,eveWeatherKey='',eveWeatherRequest=null,eveWeatherRetryAt=0,eveWeatherFailures=0;
const maxWeatherSize=gl.getParameter(gl.MAX_TEXTURE_SIZE);
function cancelCloudWeather(){
  if(!eveWeatherRequest)return;
  const images=eveWeatherRequest.images;
  eveWeatherRequest=null;
  for(const image of images){image.onload=image.onerror=null;image.src='';}
}
function ensureCloudWeather(){
  const key=S.quality==='low'||maxWeatherSize<4096?'low':S.quality==='ultra'&&maxWeatherSize>=8192?'ultra':'high';
  if(eveWeatherKey===key){cancelCloudWeather();return true;}
  if(eveWeatherRequest?.key===key||performance.now()<eveWeatherRetryAt)return false;
  cancelCloudWeather();
  const image=new Image(),statistics=eveWeatherStatsTex?null:new Image();
  const images=statistics?[image,statistics]:[image],request={key,images};eveWeatherRequest=request;
  let loaded=0;
  const release=()=>{for(const image of images){image.onload=image.onerror=null;image.src='';}};
  const failed=()=>{
    if(eveWeatherRequest!==request)return;
    eveWeatherRequest=null;release();
    eveWeatherRetryAt=performance.now()+Math.min(60000,1000*2**Math.min(eveWeatherFailures++,6));
    console.error('写实云天气资源加载失败',key);eveWeatherError=true;fail('error.initialization');
  };
  const ready=()=>{
    if(eveWeatherRequest!==request)return;
    if(++loaded!==images.length)return;
    if(contextLost){cancelCloudWeather();return;}
    const allocated=[];
    const colorSpace=gl.getParameter(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL);
    const upload=image=>{
      const texture=gl.createTexture();allocated.push(texture);gl.bindTexture(gl.TEXTURE_2D,texture);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RG8,gl.RG,gl.UNSIGNED_BYTE,image);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      return texture;
    };
    let texture,statsTexture;
    try{
      gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL,gl.NONE);
      texture=upload(image);if(statistics)statsTexture=upload(statistics);
      if(gl.getError()!==gl.NO_ERROR)throw new Error('天气纹理上传失败');
    }catch(error){
      for(const texture of allocated)gl.deleteTexture(texture);
      failed();return;
    }finally{
      gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL,colorSpace);
    }
    // 天气图单活，统计图跨画质复用；均为RG8/mip0。
    if(eveWeatherTex)gl.deleteTexture(eveWeatherTex);
    if(statsTexture)eveWeatherStatsTex=statsTexture;
    eveWeatherTex=texture;eveWeatherKey=key;eveWeatherRequest=null;eveWeatherFailures=0;eveWeatherRetryAt=0;
    release();
    if(eveWeatherError){$('error').classList.remove('show');eveWeatherError=false;}
    cloudLightInvalidated=true;needReset=true;prev=null;
  };
  for(const image of images){image.onload=ready;image.onerror=failed;}
  if(statistics)statistics.src=celestialAssets.cloudStatisticsUrl;
  image.src=celestialAssets.cloudMapUrls[key];return false;
}
function ensureCloudNoise(){
  if(eveNoisePromise) return;
  eveNoisePromise = loadCloudNoise(celestialAssets.cloudNoiseLoader).then(data => {
    if(contextLost)return;
    eveNoiseTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_3D,eveNoiseTex);
    gl.texImage3D(gl.TEXTURE_3D,0,gl.R8,128,128,128,0,gl.RED,gl.UNSIGNED_BYTE,data);
    gl.texParameteri(gl.TEXTURE_3D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_3D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    for(const axis of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T,gl.TEXTURE_WRAP_R]) gl.texParameteri(gl.TEXTURE_3D,axis,gl.REPEAT);
    gl.generateMipmap(gl.TEXTURE_3D); eveNoiseReady = true; needReset = true;
    if(noiseReady) $('loader').classList.add('done');
  }).catch(error => { console.error('写实体积云资源加载失败',error); fail('error.initialization'); });
}
let realisticPrograms=null;
const defaultCloudPrograms={cloud:dayPrograms.cloud,cshadow:dayPrograms.cshadow};
function ensureRealisticPrograms(){
  if(realisticPrograms)return;
  const previous=P;P={};
  const fixed=source=>source.replace('uniform int uCloudStyle;','const int uCloudStyle=1;');
  P.realisticCloud=makeProgram(VS_FULL,fixed(CLOUD_FS),'realistic cloud');
  P.realisticShadow=makeProgram(VS_FULL,fixed(CSHADOW_FS),'realistic shadow');
  P.cloudTrans=makeProgram(VS_FULL,fixed(CLOUD_TRANSMITTANCE_FS),'cloud transmittance');
  P.cloudIrr=makeProgram(VS_FULL,fixed(CLOUD_IRRADIANCE_FS),'cloud irradiance');
  P.cloudVolume=makeProgram(VS_FULL,fixed(CLOUD_LIGHT_VOLUME_FS),'cloud light volume');
  P.cloudReproject=makeProgram(VS_FULL,fixed(CLOUD_LIGHT_REPROJECT_FS),'cloud light reprojection');
  eveCurvesTex=makeTex2D(128,128,gl.RG8,gl.RG,gl.UNSIGNED_BYTE,gl.LINEAR,gl.CLAMP_TO_EDGE,cloudCurveTexture());
  cloudTransTex=makeTex2D(256,128,gl.RGBA16F,gl.RGBA,gl.HALF_FLOAT,gl.LINEAR,gl.CLAMP_TO_EDGE);
  cloudTransFBO=makeFBO([cloudTransTex]);
  cloudIrrTex=makeTex2D(64,32,gl.RGBA16F,gl.RGBA,gl.HALF_FLOAT,gl.LINEAR,gl.CLAMP_TO_EDGE);
  cloudIrrFBO=makeFBO([cloudIrrTex]);
  gl.bindVertexArray(emptyVAO);gl.disable(gl.BLEND);gl.disable(gl.DEPTH_TEST);
  use(P.cloudTrans);gl.bindFramebuffer(gl.FRAMEBUFFER,cloudTransFBO);gl.viewport(0,0,256,128);draw();
  use(P.cloudIrr);gl.bindFramebuffer(gl.FRAMEBUFFER,cloudIrrFBO);gl.viewport(0,0,64,32);
  tex(P.cloudIrr,'uCloudAtmoTrans',gl.TEXTURE_2D,cloudTransTex);draw();
  realisticPrograms=P;P=previous;
}
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
// 高倍速共用光照采样时刻，只新增两个小型天空 LUT；中间帧做纹理混合。
const skySamples = Array.from({ length: 2 }, () => {
  const texture = makeTex2D(SKY_W, SKY_H, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.LINEAR, gl.CLAMP_TO_EDGE);
  return { texture, fbo: makeFBO([texture]), key: '' };
});
// 小型本地贴图：立即绑定有效占位，解码后在同一纹理上传；不阻塞世界启动。
function celestialTexture(url, fallback) {
  const texture = makeTex2D(1, 1, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.LINEAR, gl.CLAMP_TO_EDGE);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(fallback));
  let started = false, retryAt = 0, failures = 0;
  function load(){
    if (started || !url || contextLost || performance.now() < retryAt) return;
    started = true;
    const image = new Image();
    image.onload = () => {
      if (contextLost) return;
      gl.bindTexture(gl.TEXTURE_2D, texture);
      let source = image;
      const maxSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
      if (image.width > maxSize || image.height > maxSize) {
        const ratio = Math.min(maxSize / image.width, maxSize / image.height), canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.width * ratio)); canvas.height = Math.max(1, Math.round(image.height * ratio));
        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height); source = canvas;
      }
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, source);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.generateMipmap(gl.TEXTURE_2D);
      image.onload = null; image.onerror = null; image.removeAttribute('src');
    };
    image.onerror = () => {
      started = false;
      retryAt = performance.now() + Math.min(60000, 1000 * 2 ** Math.min(failures++, 6));
      image.onload = null; image.onerror = null; image.removeAttribute('src');
      console.warn('天体贴图加载失败，暂用简化外观并稍后重试');
    };
    if (url) image.src = new URL(url, document.baseURI).href;
  }
  return { texture, load };
}
// 入口传入 Vite 的静态资源 URL，同时兼容 Web ES module 与壁纸 IIFE。
let chartCelestials = null;
const moonSurface = celestialTexture(celestialAssets.moonSurfaceUrl, [170, 165, 158, 255]);
const galaxy = createGalaxyTexture(gl, celestialAssets.galaxyUrls);
const galaxyTexture = galaxy.texture;

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
const MEM_KEY = storageKey('meadow.trail.v1'), MEM_CELL = 64, MEM_MAX = 30000;
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
  const location = renderLocation();
  const m = new Date(simMs + cityOffset(simMs)).getUTCMonth() + 1, al = Math.abs(location.lat), north = location.lat >= 0;
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
  WXS.fogDens = weatherFogDensity(WP.vis);
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
let STAR_N = 0, LINE_N = 0;
const starVAO = gl.createVertexArray(), planetVAO = gl.createVertexArray();
let constellationStars, constellationDirections, constellationOverlay = null;
const constellationCatalogs = {};
let realisticStarVAO = null, realisticStarCount = 0, realisticStarRequested = false;
const hipparcosUrl = celestialAssets.starCatalogUrl;
function loadRealisticStars(){
  if (realisticStarRequested || !hipparcosUrl) return;
  realisticStarRequested = true;
  fetch(hipparcosUrl).then(response => {
    if (!response.ok) throw new Error('Hipparcos ' + response.status);
    return response.arrayBuffer();
  }).then(buffer => {
    if (gl.isContextLost()) return;
    const { count, positions, colorIndices } = decodeHipparcosStars(buffer);
    const colors = new Float32Array(count * 3), vao = gl.createVertexArray();
    for (let i = 0; i < count; i++) colors.set(Number.isFinite(colorIndices[i]) ? bvToRgb(colorIndices[i]) : [1, 1, 1], i * 3);
    gl.bindVertexArray(vao);
    for (const [location, data, size] of [[0, positions, 4], [1, colors, 3]]){
      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(location); gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
    }
    gl.bindVertexArray(null);
    realisticStarVAO = vao; realisticStarCount = count;
    constellationCatalogs.realistic = { positions, colors };
  }).catch(error => console.warn('Hipparcos 星表加载失败，保留原星表', error));
}
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
  constellationStars = pos; constellationDirections = lp;
  constellationCatalogs.default = { positions: pos, colors: col };
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
function updatePlanets(ms, atmosphere = 1){
  const T = (ms / 86400000 + 2440587.5 - 2451545) / 36525, eps = 23.43928 * DEG;
  const E = helio(EARTH_EL[0], EARTH_EL[1], T);
  PLANET_EL.forEach(([el, rate, H], i) => {
    const h = helio(el, rate, T), g = [h[0] - E[0], h[1] - E[1], h[2] - E[2]];
    const r = Math.hypot(...h), dl = Math.hypot(...g);
    const x = g[0], y = g[1] * Math.cos(eps) - g[2] * Math.sin(eps), z = g[1] * Math.sin(eps) + g[2] * Math.cos(eps);
    const legacyMagnitude = H + 5 * Math.log10(r * dl);
    const magnitude = i === 1 ? observationPlanetMagnitude(legacyMagnitude, h, g, atmosphere) : legacyMagnitude;
    planetPos.set([x / dl, y / dl, z / dl, magnitude], i * 4);
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
let worldReady = false, hasRestoredSettings = false, restoredScene = null, preview = null;
let sceneFreeze = { time: false, weather: false, clouds: false }, thumbnailJob = null;
const S = {
  time: 0, speed: 1, wxSync: true, constel: false, flies: true, flowerGlow: false, bloom: true, streamDist: 'near', streamScale: false, infMem: false, bloomR: 4, wxMode: 'follow', wxType: 'cloudy', fogVisS: 1000, rainAmt: 0, snowAmt: 0, boltFreq: 0, puddle: 0, snowMax: 0, lensDrops: true, sunAz: 0, coverage: 0.58, density: 1.0, wind: 40, breeze: 0.65, petals: true,
  heightSlider: 0, dof: 0.6, sway: !reduceMotion, quality: WALLPAPER_MODE ? 'high' : coarse ? 'med' : 'high', god: !coarse, auto: WALLPAPER_MODE || !reduceMotion,
  fovY: 60, x: 0, z: 0, agl: 2.2, temperatureUnit: 'celsius', interactionEnabled: !WALLPAPER_MODE, autoFollowMouse: false, lowSaturation: false,
  nightSkyStyle: nightSkyStyle(),
  cloudStyle: cloudStyle(),
  ...RENDER_DEFAULTS,
  ...displayPreferences(),
  ...STARGAZING_DEFAULTS,
  ...startupPreferences(),
  showWeather: true, showTemperature: true, showPrecipitation: false, showAirQuality: false, showClouds: false, showWind: false,
};
// 保存读档前、已适配设备与减少动态效果的场景默认值。
const initialSceneSettings = Object.freeze(Object.fromEntries(Object.keys(SCENE_SETTINGS).map(key => [key, S[key]])));
/* 本机偏好与完整世界分开保存，未应用的预览始终写回原世界。 */
const SETTINGS_KEY = storageKey('meadow.settings.v1');
const PERSIST_KEYS = [...Object.keys(STARGAZING_DEFAULTS), 'cloudStyle', 'nightSkyStyle', 'auto', 'god', 'petals', 'sway', 'constel', 'flies', 'flowerGlow', 'bloom', 'streamScale', 'infMem', 'lensDrops', 'sunAz', 'dof', 'lowSaturation', 'vignette',
  'heightSlider', 'agl', 'speed', 'streamDist', 'wxMode', 'wxType', 'coverage', 'density', 'wind', 'breeze', 'fogVisS', 'rainAmt', 'snowAmt', 'boltFreq',
  'puddle', 'snowMax', 'qualityUser', 'bloomR', 'temperatureUnit', 'showWeather', 'showTemperature', 'showPrecipitation', 'showAirQuality', 'showClouds', 'showWind', 'interactionEnabled', 'autoFollowMouse', 'rememberPosition', ...Object.keys(RENDER_DEFAULTS)];
try {
  const sv = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null');
  if (sv && typeof sv === 'object' && !Array.isArray(sv)){
    Object.assign(S, displayPreferences(sv), stargazingPreferences(sv));
    Object.assign(S, renderPreferences(sv));
    S.nightSkyStyle = nightSkyStyle(sv);
    Object.assign(S, startupPreferences(sv));
    for (const k of PERSIST_KEYS) {
      if (!Object.hasOwn(sv, k) || k === 'nightSkyStyle' || Object.hasOwn(STARGAZING_DEFAULTS, k) || Object.hasOwn(RENDER_DEFAULTS, k)) continue;
      const value = sv[k];
      if (Object.hasOwn(SCENE_SETTINGS, k)) {
        if (!validateScene({ version: 1, settings: { [k]: value } })) continue;
      } else if (k === 'qualityUser') {
        if (!Object.hasOwn(QUALITY, value)) continue;
      } else if (typeof value !== typeof S[k] || (typeof value === 'number' && !Number.isFinite(value))) continue;
      if (k === 'agl' && (value < VIEW_HEIGHT_MIN || value > VIEW_HEIGHT_MAX)) continue;
      if (k === 'heightSlider' && (value < 0 || value > 1000)) continue;
      if (k === 'speed' && (!Number.isInteger(value) || value < 0 || value >= SPEEDS.length)) continue;
      S[k] = value; hasRestoredSettings = true;
    }
    if (!['near', 'mid', 'far'].includes(S.streamDist)) S.streamDist = 'near';
    if (!['follow', 'dynamic', 'manual', 'off'].includes(S.wxMode)) S.wxMode = 'follow';
    if (!WX_TYPES[S.wxType]) S.wxType = 'cloudy';
    if (!['celsius', 'fahrenheit'].includes(S.temperatureUnit)) S.temperatureUnit = 'celsius';
    restoredScene = validateScene(sv.world);
    hasRestoredSettings ||= Boolean(restoredScene);
    if (restoredScene) Object.assign(S, restoredScene.settings);
  }
} catch (e) {}
S.speed = Number.isInteger(S.speed) && S.speed >= 0 && S.speed < SPEEDS.length ? S.speed : 1;
let followNow = S.speed === 1;
let settingsSnap = '';
function saveSettings(){
  if (!worldReady) return;
  const o = {};
  const original = preview?.original;
  for (const k of PERSIST_KEYS) if (S[k] !== undefined) o[k] = original && k in original.settings ? original.settings[k]
    : original?.appearance && k in original.appearance ? original.appearance[k] : S[k];
  if (original) { o.speed = original.environment.time.speedIndex; o.agl = original.camera.agl; o.heightSlider = sliderFromAgl(original.camera.agl); }
  o.world = original || captureWorld();
  const j = JSON.stringify(o);
  if (j !== settingsSnap){
    let saved = false;
    try { localStorage.setItem(SETTINGS_KEY, j); settingsSnap = j; saved = true; } catch {}
    document.dispatchEvent(new CustomEvent('worldsettingssaved', { detail: { saved } }));
  }
}
setInterval(saveSettings, 1500);
window.addEventListener('pagehide', saveSettings);
const LAYER = CLOUD_LAYER_METRES.map(height => height / 1000), windOff = [0, 0, 0];
let cloudAngle = .6;
let WIND_ANGLE = 0.6;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
let userPickedQuality = WALLPAPER_MODE;
const cam = {yaw: 0, pitch: 0.04, roll: 0, yawT: 0, pitchT: 0.04, pitchBase: 0.04, vx: 0, vz: 0, y: 0, focus: 40, fov: 60};
let lastView = null, frozenView = null;
let skyPress = null, skyPointer = null;
const skyActivePointers = new Set();
let stargazingPosition = null, constellationFocus = -1, atmosphere = S.atmosphere ? 1 : 0;
const interactionEnabled = () => S.interactionEnabled || S.stargazing;

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
  if (!hasRestoredSettings) S.sunAz = (((best.yaw * 180 / Math.PI - 38 - 230) % 360) + 360) % 360;
})();
const startupCamera = { ...DEFAULT_VIEW, x: S.x, z: S.z, yaw: cam.yaw, y: groundH(S.x, S.z) + DEFAULT_VIEW.agl };
const initialSunAz = ((startupCamera.yaw * 180 / Math.PI - 38 - 230) % 360 + 360) % 360;
if (!S.rememberPosition) { S.agl = DEFAULT_VIEW.agl; S.fovY = DEFAULT_VIEW.fov; }
S.cloudStyle=cloudStyle(S);
S.heightSlider = sliderFromAgl(S.agl);
cam.y = groundH(S.x, S.z) + S.agl;

/* ---------- location and the city's own clock ---------- */
const RAD = Math.PI / 180;
let LOC = getSavedLocation() || {name: '东京', lat: 35.6762, lon: 139.6503, tz: 'Asia/Tokyo'};
let sceneSkyLocation = null;
const observation = createObservationStore({
  cache: WALLPAPER_MODE ? { read: loc => readWeatherCache(localStorage, loc), write: (loc, live) => saveWeatherCache(localStorage, loc, live) } : null, onChange: () => { if (worldReady) { consumeObservedWeather(); publishObservation(); } } });
const renderLocation = () => sceneSkyLocation || LOC;
const skyLocation = () => { const { lat, lon, tz } = renderLocation(); return { lat, lon, tz }; };
const cityOffset = (ms) => timezoneOffset(renderLocation().tz, ms);
const cityHours = (ms) => zonedHours(renderLocation().tz, ms);
const cityDayStart = (ms) => zonedDayStart(renderLocation().tz, ms);
S.time = cityHours(simMs);

/* ---------- sun and moon from latitude, longitude and UTC (low-precision almanac, as in SunCalc / Astronomical Almanac) ---------- */
const astro = (ms) => getAstronomy(ms, renderLocation(), S.sunAz);
const azElDir = (az, el) => {
  const a = az + S.sunAz * RAD;
  return [Math.cos(el) * Math.sin(a), Math.sin(el), Math.cos(el) * Math.cos(a)];
};
const riseSetText = (ms) => sunEventsText(ms, renderLocation());

/* ---------- lighting: physically based where it matters, art-directed where games always are ----------
   Night is lit by an over-bright moon (or a soft night key light when the moon is down), exposure follows a
   time-of-day compensation curve instead of full physical adaptation, and grading is keyframed on sun altitude. */
const AIRGLOW = 5e-7, GLOW = [0.55, 0.7, 1.0].map(v => v * AIRGLOW);
const MOON_PHYS = 2.5e-6, MOON_ART = 6.0, NIGHT_KEY_MIN = 1.4, KEY_NIGHT = 0.36, KEY_TWILIGHT = 0.8;
let light = null, lightKey = '', lightSamples = null, AST = astro(simMs), expo = NaN;
let observationLight = null, observationLightKey = '';
const lightingTimeline = createLightingTimeline(ms => calculateLighting(astro(ms)));
function updateLighting(){
  AST = astro(simMs);
  const environmentKey = [covEff.toFixed(2), densEff.toFixed(2), Math.round(cam.y / 50), S.nightSkyStyle, S.lowSaturation, S.sunAz, renderLocation().lat, renderLocation().lon].join('|');
  const speed = sceneFreeze.time ? 0 : SPEEDS[S.speed | 0];
  if (speed > 1) {
    const sampled = lightingTimeline(simMs, Math.max(1000, speed * 40), environmentKey);
    lightKey = 'accelerated';
    lightSamples = sampled;
    light = sampled.value;
    // 日月位置始终对应当前帧，昂贵的天空积分在相邻采样间平滑衔接。
    light.sunT = AST.sun; light.moonD = AST.moon;
    return sampled.changed;
  }
  lightSamples = null;
  const key = AST.sun.map(v => v.toFixed(3)).join(',') + AST.moon.map(v => v.toFixed(3)).join(',') + '|' + environmentKey;
  if (key === lightKey) return false;
  lightKey = key; light = calculateLighting(AST);
  return true;
}
function calculateLighting(AST, moonless = false){
  const sunT = AST.sun, moonD = AST.moon;
  const nightSky = nightSkyAppearance(AST, S.nightSkyStyle);
  const midH = (LAYER[0] + LAYER[1]) * 0.5, camKm = Math.max(cam.y / 1000, 0.002), Z = [0, 0, 0];
  const tr = (h, dir, I) => transmittance(h, dir).map(v => v * I);
  const sunCloud = tr(midH, sunT, SUN_I), sunGround = tr(0.05, sunT, SUN_I), sunCam = tr(camKm, sunT, SUN_I);
  const moonSky = SUN_I * MOON_PHYS * MOON_ART * AST.moonBright, moonUp = moonD[1] > -0.05 && moonSky > 0;
  /* night key light: the moon when it stands high enough, otherwise a soft high light from its bearing */
  const legacyNightI = moonless ? 0 : SUN_I * MOON_PHYS * Math.max(MOON_ART * AST.moonBright, NIGHT_KEY_MIN);
  const nightI = legacyNightI + (moonSky - legacyNightI) * nightSky.darkness;
  const moonRise = smooth(0, .1, moonD[1]), fillDir = azElDir(AST.moonAz, 1.1);
  const lowMoonDir = fillDir.map((v, i) => v + (moonD[i] - v) * moonRise);
  const legacyDir = moonRise === 1 ? moonD : moonRise === 0 ? fillDir : lowMoonDir.map(v => v / Math.hypot(...lowMoonDir));
  const blendedDir = legacyDir.map((v, i) => v + (moonD[i] - v) * nightSky.darkness);
  const nDir = nightSky.darkness > 0 ? blendedDir.map(v => v / Math.hypot(...blendedDir)) : legacyDir;
  // 写实深夜只保留真实月光；不再把落到地下的月亮抬成近地定向补光。
  const cool = [0.82, 0.93, 1.12].map(v => v + (1 - v) * nightSky.darkness);
  const nCloud = tr(midH, nDir, nightI).map((v, i) => v * cool[i] * (0.1 + 0.5 * AST.moonBright) * (.6 + .4 * moonRise)), nGround = tr(0.05, nDir, nightI).map((v, i) => v * cool[i] * (0.18 + 0.82 * AST.moonBright) * (.7 + .3 * moonRise));
  const moonCam = tr(camKm, moonD, moonSky).map((v, i) => v * cool[i] * (0.18 + 0.82 * AST.moonBright));
  const sunWins = lum(sunCloud) >= lum(nCloud);
  const lightDir = sunWins ? sunT : nDir;
  const lightCloud = sunWins ? sunCloud : nCloud, lightGround = sunWins ? sunGround : nGround;
  /* multiple-scattering stand-in: the upper atmosphere stays sunlit well into twilight */
  const msI = moonless ? 0 : SUN_I * lum(transmittance(30, sunT)) * 0.0028, MS = [0.35, 0.55, 1.0].map(v => v * msI);
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
  const legacyKey = lg >= -0.6 ? 1 : lg >= -2.5 ? KEY_TWILIGHT + (1 - KEY_TWILIGHT) * smooth(-2.5, -0.6, lg) : KEY_NIGHT + (KEY_TWILIGHT - KEY_NIGHT) * smooth(-5.0, -2.5, lg);
  // 写实夜间的低曝光目标，仅在太阳落入夜间范围后平滑启用。
  const darkness = nightSky.darkness;
  const keyV = legacyKey + (exposureKey(lg) - legacyKey) * darkness;
  const exposure = 0.66 / (0.9 * rel) * keyV, PE = exposure;
  const cloudGain = sunWins ? 1 : nightCloudGain(AST, S.nightSkyStyle, lum(lightCloud) * PE, lum(atCloud.avg) * PE);
  const nightF = smooth(-1.8, -4.5, lg);
  for (let c = 0; c < 3; c++){ ambTop[c] *= 1 - 0.8 * nightF; ambBottom[c] *= 1 - 0.9 * nightF; }
  const pe = (v) => v.map(x => x * PE);
  /* at night the cloud deck as a whole thins the moonlight and skylight reaching the ground: thicker, darker */
  const overcast = nightF * smooth(0.2, 0.95, cov) * clamp(0.55 + 0.35 * densEff, 0.6, 1.2), dimN = 1 - 0.85 * Math.min(overcast, 1);
  const groundBudget = (lum(lightGround) * ly + lum(skyIrr)) * PE * dimN;
  const groundGain = nightSky.groundNight * nightGroundGain(AST, S.nightSkyStyle, groundBudget);
  const sourceCloud=(sunWins?[SUN_I,SUN_I,SUN_I]:cool.map(v=>nightI*v*(.1+.5*AST.moonBright)*(.6+.4*moonRise))).map(v=>v*PE*cloudGain);
  return {lightDir, sourceCloud, lightCloud: pe(lightCloud).map(v => v * cloudGain), lightGround: pe(lightGround).map(v => v * dimN * groundGain), sunCam: pe(sunCam), moonCam: pe(moonCam), sunT, moonD,
    moonI: moonUp ? moonSky : 0, ms: pe(MS), ambTop: pe(ambTop), ambBottom: pe(ambBottom), skyIrr: pe(skyIrr).map(v => v * dimN * groundGain), sunDisk: pe(sunDisk), moonDisk: pe(moonDisk),
    exposure, pe: PE, airglow: nightSky.airglow, night: nightF, glowF: Math.max(nightF, smooth(4, -5, AST.sunAlt / RAD)), fwd: sunWins ? 1 : .3 + .5 * moonRise, ambOcc: 0.15 + 0.85 * nightF, cshAmt: 1, starCat: AIRGLOW * 2.4 * PE, starI: AIRGLOW * 14 * PE, grade: gradeAt(AST.sunAlt / RAD, S.lowSaturation, S.nightSkyStyle === 'realistic')};
}

/* ================================================================== */
/*  Render targets / geometry                                          */
/* ================================================================== */
let W = 0, H = 0, CW = 0, CH = 0, HW = 0, HH = 0, cssW = 0, cssH = 0, hdrActive = false;
const viewportLimit = gl.getParameter(gl.MAX_VIEWPORT_DIMS);
const textureLimit = gl.getParameter(gl.MAX_TEXTURE_SIZE), renderbufferLimit = gl.getParameter(gl.MAX_RENDERBUFFER_SIZE);
const targetLimits = { maxWidth: Math.min(textureLimit, renderbufferLimit, viewportLimit[0]), maxHeight: Math.min(textureLimit, renderbufferLimit, viewportLimit[1]) };
let targetSignature = '';
let cloudColor, cloudDepth, cloudFBO, hist = [], histFBO = [], histIdx = 0, needReset = true;
let msFBO, resFBO, chartFBO, sceneTex, depthTex, dofPrepTex, dofPrepFBO, dofTex, dofFBO;
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
  if (contextLost) return;
  const q = QUALITY[S.quality];
  const dpr = Math.min(window.devicePixelRatio || 1, q.dpr) * S.renderScale;
  cssW = canvas.clientWidth; cssH = canvas.clientHeight;
  const { width: w, height: h } = renderSize(cssW, cssH, { dpr, ...targetLimits, maxPixels: WALLPAPER_MODE ? 3840 * 2160 : Infinity });
  const cloudSize = renderSize(cssW, cssH, { dpr: (S.cloudStyle==='realistic'?REALISTIC_CLOUD_QUALITY[S.quality].cloud:q.cloud) * S.renderScale, ...targetLimits, maxPixels: 1.15e6 });
  const cw = Math.max(16, cloudSize.width), ch = Math.max(16, cloudSize.height);
  const signature = [w, h, cw, ch, S.quality, hdrActive].join('|');
  if (signature === targetSignature) return;
  W = w; H = h; canvas.width = W; canvas.height = H;
  HW = Math.max(8, Math.ceil(W / 2)); HH = Math.max(8, Math.ceil(H / 2));
  CW = cw; CH = ch;
  targetSignature = '';
  freeTargets();
  const RGBA16F = [gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT];
  cloudColor = T2(CW, CH, ...RGBA16F, gl.LINEAR);
  cloudDepth = T2(CW, CH, gl.R16F, gl.RED, gl.HALF_FLOAT, gl.LINEAR);
  cloudFBO = FB([cloudColor, cloudDepth]);
  for (let i = 0; i < 2; i++){ hist[i] = T2(CW, CH, ...RGBA16F, gl.LINEAR); histFBO[i] = FB([hist[i]]); }
  /* multisampled scene target, resolved into textures for post */
  const candidates = (hdrActive ? (floatColorBuffer ? [gl.R11F_G11F_B10F, gl.RGBA16F] : [gl.RGBA16F]) : [])
    .map(internal => ({ internal, format: internal === gl.RGBA16F ? gl.RGBA : gl.RGB,
      supportedSamples: gl.getInternalformatParameter(gl.RENDERBUFFER, internal, gl.SAMPLES) }));
  const target = hdrActive ? hdrTarget(q.samples, candidates,
    gl.getInternalformatParameter(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, gl.SAMPLES)) : null;
  const colorFormat = target?.internal ?? gl.RGBA8;
  const samples = target?.samples ?? Math.max(1, Math.min(q.samples, gl.getParameter(gl.MAX_SAMPLES)));
  const rbC = gl.createRenderbuffer(), rbD = gl.createRenderbuffer(); owned.rb.push(rbC, rbD);
  gl.bindRenderbuffer(gl.RENDERBUFFER, rbC); gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, colorFormat, W, H);
  gl.bindRenderbuffer(gl.RENDERBUFFER, rbD); gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.DEPTH_COMPONENT24, W, H);
  msFBO = gl.createFramebuffer(); owned.fb.push(msFBO);
  gl.bindFramebuffer(gl.FRAMEBUFFER, msFBO);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, rbC);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, rbD);
  gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('MSAA framebuffer incomplete');
  sceneTex = T2(W, H, colorFormat, target?.format ?? gl.RGBA, hdrActive ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE, gl.LINEAR);
  depthTex = T2(W, H, gl.DEPTH_COMPONENT24, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, gl.NEAREST);
  resFBO = FB([sceneTex]);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depthTex, 0);
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('Scene depth framebuffer incomplete');
  // 复用场景颜色，单独的纯色附件 FBO 允许安全采样 depthTex，避免深度附件反馈。
  chartFBO = FB([sceneTex]);
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
  targetSignature = signature;
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
  if (canPickConstellation() && e.key === 'Escape' && !e.target.closest('input,textarea,select')) { clearConstellation(); return; }
  if (S.stargazing || !S.interactionEnabled || e.target.closest('input, textarea, select, button, summary') || $('helpDialog').open) return;
  const k = e.key.toLowerCase();
  if (['w','a','s','d','q','e','arrowup','arrowdown','arrowleft','arrowright','shift'].includes(k)){ keys.add(k); if (k !== 'shift') stopAuto(); }
});
window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
window.addEventListener('keydown', (e) => { if (S.interactionEnabled && !S.stargazing && e.key === ' ' && !e.target.closest('input, textarea, select, button, summary') && !$('helpDialog').open){ sprintUntil = performance.now() + 1600; e.preventDefault(); } });
window.addEventListener('blur', () => { keys.clear(); mouseFlight.reset(); });
/* touch flies the petal stream like a flight game: one finger is a virtual stick measured from where it landed;
   double taps: one finger = sprint, two fingers = turn around, three fingers = hover / fly on */
const touches = new Map();
const stick = {active: false, id: -1, ox: 0, oy: 0, x: 0, y: 0};
let gesture = null, lastTap = {n: 0, t: 0}, lastSteerAt = -1e9, sprintUntil = 0;
const mouseFlight = bindMouseFlightInput({
  canvas, isFlying: () => S.auto, isEnabled: () => S.interactionEnabled && !S.stargazing && !$('helpDialog').open,
  followsMouse: () => S.autoFollowMouse,
  look: (dx, dy) => {
    constellationFocus = -1; constellationOverlay?.cancelPick();
    const k = (S.fovY / 60) * 0.0032;
    cam.yawT += dx * k; cam.pitchBase = cam.pitchT = clamp(cam.pitchT - dy * k, -1.45, 1.45);
  },
  dash: () => onDoubleTap(1), turn: () => onDoubleTap(2), toggleFlight: () => onDoubleTap(3),
});
window.addEventListener('resize', () => mouseFlight.reset());
const capture = (id) => { try { canvas.setPointerCapture(id); } catch (err) {} };
canvas.addEventListener('pointerdown', (e) => {
  if (!S.interactionEnabled || S.stargazing || e.pointerType === 'mouse') return;
  canvas.focus({ preventScroll: true });
  mouseFlight.reset();
  capture(e.pointerId);
  touches.set(e.pointerId, {x0: e.clientX, y0: e.clientY});
  if (!gesture) gesture = {t0: performance.now(), maxN: 0, moved: false};
  gesture.maxN = Math.max(gesture.maxN, touches.size);
  if (touches.size === 1){ stick.active = true; stick.id = e.pointerId; stick.ox = stick.x = e.clientX; stick.oy = stick.y = e.clientY; }
  else stick.active = false;
});
canvas.addEventListener('pointermove', (e) => {
  if (!S.interactionEnabled || S.stargazing) return;
  const tp = touches.get(e.pointerId);
  if (!tp) return;
  if (gesture && Math.hypot(e.clientX - tp.x0, e.clientY - tp.y0) > 14) gesture.moved = true;
  if (stick.active && e.pointerId === stick.id){ stick.x = e.clientX; stick.y = e.clientY; }
});
function onDoubleTap(n){
  if (!S.interactionEnabled || S.stargazing) return;
  if (n === 1) sprintUntil = performance.now() + 1600;
  else if (n === 2){ cam.yawT += Math.PI; lastSteerAt = performance.now(); }
  else setAuto(!S.auto);
}
const endPointer = (e) => {
  if (!S.interactionEnabled) return;
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
canvas.addEventListener('wheel', (e) => { e.preventDefault(); if (interactionEnabled()) { setViewFov(S.fovY * Math.exp(e.deltaY * 0.0012)); saveSettings(); } }, {passive: false});

/* ================================================================== */
/*  UI                                                                 */
/* ================================================================== */
const rangeControls = [];
const renderControls = bindRenderSettings({ settings: S, wallpaper: WALLPAPER_MODE, hostSettings: wallpaperSettings, resize: () => resize(true) });
function bindRange(id, key, fmt, onChange, isLocked = () => false){
  const el = $(id), out = document.querySelector(`output[for="${id}"]`);
  const paint = (displayValue) => { const v = displayValue ?? parseFloat(el.value); out.textContent = fmt(v); el.style.setProperty('--fill', ((v - el.min) / (el.max - el.min) * 100) + '%'); };
  el.value = S[key]; paint(S[key]);
  el.addEventListener('input', () => { if (isLocked()) { el.value = S[key]; paint(); return; } S[key] = parseFloat(el.value); paint(); onChange && onChange(); });
  onLanguageChange(() => paint(S[key]));
  const control = { el, paint, key }; rangeControls.push(control); return control;
}
const publishTimeControls = () => { updateTimeControls({
  locked: sceneFreeze.time, hours: S.time, speedIndex: sceneFreeze.time ? 0 : S.speed, loc: renderLocation(), sun: getSunEvents(simMs, renderLocation()), phase: phaseIndex(astro(simMs).phase),
}); if (worldReady) publishObservation(); };
bindTimeActions({
  time(value) {
    if (sceneFreeze.time) return;
    S.time = value; followNow = false;
    simMs = localTimeToUTC(renderLocation().tz, simMs, S.time); expo = NaN;
    publishTimeControls();
  },
  speed(value) {
    if (sceneFreeze.time) return;
    S.speed = value; followNow = false;
    publishTimeControls();
  },
  lock(value) { setPreviewFreeze({ freezeTime: value }); },
  sync() {
    if (sceneFreeze.time) return;
    sceneSkyLocation = null;
    sceneFreeze.time = false;
    simMs = Date.now(); S.time = cityHours(simMs);
    followNow = true; expo = NaN; S.speed = 1; lightKey = ''; skyKey = '';
    publishTimeControls(); saveSettings();
  },
});
publishTimeControls();
bindRange('sunAz', 'sunAz', (v) => Math.round(v) + '°');
bindRange('bloomR', 'bloomR', (v) => t('landscape.radiusValue', { value: Number(v).toFixed(1) }));
const wxCtl = {};
const wxBind = (id, key, fmt) => { wxCtl[key] = bindRange(id, key, fmt, () => { if (S.wxMode === 'manual') wxSetTarget(S.wxType, manualParams(), 2); }, () => sceneFreeze.weather); };
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
    if (sceneFreeze.weather) return;
    const pp = wxPreset(k);
    S.wxType = k; S.coverage = pp.cov; S.density = pp.dens; S.wind = pp.wind; S.breeze = pp.breeze; S.fogVisS = sliderFromVis(pp.vis);
    S.rainAmt = pp.rain; S.snowAmt = pp.snow; S.boltFreq = pp.bolt; S.puddle = pp.wet; S.snowMax = pp.snowCov;
    refreshWx(); markWxChips(); wxSetTarget(k, manualParams(), 6);
  });
  $('wxTypes').appendChild(b);
}
function setWxMode(mode){
  if (sceneFreeze.weather) { document.querySelectorAll('input[name="wxMode"]').forEach(r => { r.checked = r.value === S.wxMode; }); return; }
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
  const observed = observation.read(), live = observed.live;
  updateWeatherDetails($('panelWeatherMetrics'), { live, airQuality: observed.airQuality, temperatureUnit: S.temperatureUnit, simulated: false, hideUnavailable: false });
  $('weatherControls').disabled = sceneFreeze.weather;
  $('sceneWeatherLock').checked = sceneFreeze.weather;
  $('cloudLock').checked = sceneFreeze.clouds;
  $('weatherLockState').textContent = t(sceneFreeze.weather ? 'locks.weatherLocked' : 'locks.weatherUnlocked');
  const src = S.wxMode === 'dynamic' ? t('weather.dynamicDescription', { minutes: Math.max(1, Math.round((WXS.until - wxClock) / 60000)) })
    : S.wxMode === 'off' ? t('weather.offDescription') : S.wxMode === 'manual' ? t('weather.manualDescription')
    : live ? t('weather.liveDescription', { city: locationName(LOC), weather: t(`weather.${live.type}`), clouds: Math.round(live.cloud_cover), wind: Number(live.wind_speed_10m).toFixed(1) })
    : t(WXS.src ? 'weather.unavailable' : 'weather.fetching');
  $('wxInfo').textContent = live
    ? [t('weather.cloudValue', { value: Math.round(live.cloud_cover) }), t('weather.windValue', { value: Number(live.wind_speed_10m).toFixed(1) }), ...(live.cached ? [t('weather.source.cached')] : [])].join(' · ')
    : parts.join(' · ') + ' · ' + src;
}
bindRange('dof', 'dof', (v) => v < 0.01 ? t('common.off') : Math.round(v * 100) + '%');
const fmtAgl = (a) => a < 10 ? a.toFixed(1) + ' m' : Math.round(a) + ' m';
function setViewHeight(na) {
  if (S.stargazing) return;
  na = clamp(na, VIEW_HEIGHT_MIN, VIEW_HEIGHT_MAX);
  if (Math.abs(na - S.agl) > 300) needReset = true;
  S.agl = na;
  if (preview || (!S.interactionEnabled && !S.auto)) {
    // 禁用的是手动操纵；明确设置仍需同步真实相机并使固定视角缓存失效。
    cam.y = groundH(S.x, S.z) + na;
    cam.focus = clamp(focusDistance([S.x, cam.y, S.z], basis(cam.yaw, cam.pitch, cam.roll).f), 1.5, 600);
    frozenView = null; lastView = null;
  }
}
const heightCtl = bindRange('height', 'heightSlider', (v) => fmtAgl(aglFromSlider(v)), () => setViewHeight(aglFromSlider(S.heightSlider)), () => S.stargazing);
function syncHeightSlider(){ S.cloudStyle=cloudStyle(S);
S.heightSlider = sliderFromAgl(S.agl); heightCtl.el.value = S.heightSlider; heightCtl.paint(S.heightSlider); }
const fovCtl = bindRange('fov', 'fovY', (v) => Math.round(v) + '°', () => setViewFov(S.fovY));
function syncFovSlider(){ fovCtl.el.value = S.fovY; fovCtl.paint(); }
function setViewFov(value){
  constellationFocus = -1;
  S.fovY = clamp(value, 28, 95); cam.fov = S.fovY;
  // 固定相机与作品预览仍允许通过设置调整镜头，不必先开启手动操纵。
  if (frozenView) frozenView.fov = S.fovY;
  syncFovSlider();
}
document.querySelectorAll('[data-height-preset]').forEach(button => button.addEventListener('click', () => {
  const height = HEIGHT_PRESETS[button.dataset.heightPreset];
  if (!Number.isFinite(height)) return;
  setViewHeight(height); syncHeightSlider();
  document.dispatchEvent(new Event('worldscenechange'));
  saveSettings();
}));
$('rememberPosition').checked = S.rememberPosition;
$('rememberPosition').addEventListener('change', event => { S.rememberPosition = event.target.checked; saveSettings(); });
const toggles = {auto: 'auto', autoFollowMouse: 'autoFollowMouse', god: 'god', petals: 'petals', sway: 'sway', constel: 'constel', flies: 'flies', flowerGlow: 'flowerGlow', bloom: 'bloom', streamScale: 'streamScale', infMem: 'infMem', lensDrops: 'lensDrops', vignette: 'vignette'};
for (const [id, key] of Object.entries(toggles)){ const el = $(id); el.checked = S[key]; el.addEventListener('change', () => { if (key === 'auto') setAuto(el.checked); else { S[key] = el.checked; if (key === 'autoFollowMouse') mouseFlight.reset(); if (key === 'constel' && !el.checked) clearConstellation(); } }); }
function syncAutoFollowMouse(){
  $('autoFollowMouse').checked = S.autoFollowMouse;
  $('autoFollowMouse').disabled = !S.auto || S.stargazing;
}
function syncCloudControls(){
  document.querySelectorAll('input[name="cloudStyle"]').forEach(r=>{r.checked=r.value===S.cloudStyle;});
}
syncCloudControls();
document.querySelectorAll('input[name="cloudStyle"]').forEach(r=>r.addEventListener('change',()=>{
  if(!r.checked || !['default','realistic'].includes(r.value))return;
  S.cloudStyle=r.value;needReset=true;prev=null;cloudLightInvalidated=true;
  syncCloudControls();saveSettings();
}));
function syncNightSkyControls(){
  document.querySelectorAll('input[name="nightSkyStyle"]').forEach(r => { r.checked = r.value === S.nightSkyStyle; });
}
syncNightSkyControls();
document.querySelectorAll('input[name="nightSkyStyle"]').forEach(r => r.addEventListener('change', () => {
  if (!r.checked || !['default', 'realistic'].includes(r.value)) return;
  S.nightSkyStyle = r.value;
  lightKey = ''; skyKey = ''; expo = NaN; needReset = true;
  saveSettings();
}));
$('lowSaturation').checked = S.lowSaturation;
$('lowSaturation').addEventListener('change', e => {
  S.lowSaturation = e.target.checked;
  lightKey = ''; needReset = true;
  saveSettings();
});
function setInteractionEnabled(enabled){
  S.interactionEnabled = enabled;
  if (!enabled) { skyPress = null; skyPointer = null; skyActivePointers.clear(); clearConstellation(); }
  $('interactionEnabled').checked = enabled;
  keys.clear(); mouseFlight.reset();
  for (const id of touches.keys()) { try { canvas.releasePointerCapture(id); } catch {} }
  touches.clear(); stick.active = false; gesture = null; lastTap = {n: 0, t: 0}; sprintUntil = 0;
  if (!enabled) { lastSteerAt = -1e9; cam.yawT = cam.yaw; cam.pitchBase = cam.pitchT = cam.pitch; }
  if (!enabled && !S.auto) cam.vx = cam.vz = 0;
  frozenView = !enabled && !S.auto ? lastView : null;
  document.body.dataset.sceneInteractive = String(interactionEnabled());
  document.dispatchEvent(new Event('sceneinteractionchange'));
  saveSettings();
}
$('interactionEnabled').addEventListener('change', e => setInteractionEnabled(e.target.checked));
setInteractionEnabled(S.interactionEnabled);
$('clearMem').addEventListener('click', () => {
  memPts = []; memGrid = new Map(); memLastX = NaN; memDirty = false;
  try { localStorage.removeItem(MEM_KEY); } catch (e) {}
  touchFBO.forEach(fb => { gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); });
});
window.addEventListener('pagehide', () => { if (S.infMem){ memDirty = true; memSave(true); } });
function setAuto(value){
  if (S.stargazing) value = false;
  S.auto = value; $('auto').checked = value; mouseFlight.reset();
  syncAutoFollowMouse();
  if (!value) { sprintUntil = 0; cam.pitchBase = cam.pitchT = cam.pitch; }
  if (!S.interactionEnabled){
    frozenView = value ? null : lastView;
    if (!value) { cam.vx = cam.vz = 0; cam.yawT = cam.yaw; cam.pitchT = cam.pitch; }
  }
  saveSettings();
}
// 观星的输入路由独立于飞行手势，防止双击、惯性、自动飞行改变观察位置。
const canPickConstellation = () => interactionEnabled() && (S.constel || S.stargazing)
  && (S.constelInteract || S.stargazing) && !$('helpDialog').open;
const pointerPosition = e => { const rect = canvas.getBoundingClientRect(); return { x: e.clientX - rect.left, y: e.clientY - rect.top }; };
canvas.addEventListener('pointerdown', e => {
  if (!canPickConstellation() || e.button > 0) return;
  skyActivePointers.add(e.pointerId);
  if (skyActivePointers.size > 1) { skyPress = null; return; }
  if (skyPress) { skyPress = null; return; }
  skyPress = { id: e.pointerId, ...pointerPosition(e), cx: e.clientX, cy: e.clientY, lastX: e.clientX, lastY: e.clientY, moved: false };
  if (S.stargazing) { canvas.focus({ preventScroll: true }); capture(e.pointerId); }
});
canvas.addEventListener('pointermove', e => {
  if (!canPickConstellation()) return;
  const point = pointerPosition(e); skyPointer = e.pointerType === 'mouse' ? point : null;
  if (skyPress?.id === e.pointerId) {
    const p = skyPress, dx = e.clientX - p.lastX, dy = e.clientY - p.lastY;
    p.lastX = e.clientX; p.lastY = e.clientY;
    if (Math.hypot(e.clientX - p.cx, e.clientY - p.cy) > 8) p.moved = true;
    if (p.moved && S.stargazing) {
      constellationFocus = -1; constellationOverlay?.cancelPick();
      const k = S.fovY / 60 * .0032;
      cam.yawT += dx * k; cam.pitchBase = cam.pitchT = clamp(cam.pitchT - dy * k, -Math.PI / 2, Math.PI / 2);
    }
  }
  if (!skyPress?.moved && e.pointerType === 'mouse') constellationOverlay?.requestPick(point.x, point.y);
});
canvas.addEventListener('pointerup', e => {
  skyActivePointers.delete(e.pointerId);
  if (skyPress?.id !== e.pointerId) return;
  const p = skyPress; skyPress = null;
  if (canPickConstellation() && !p.moved && Math.hypot(e.clientX - p.cx, e.clientY - p.cy) <= 8) {
    const point = pointerPosition(e); constellationOverlay?.requestPick(point.x, point.y, 'select', e.pointerType);
  }
});
for (const event of ['pointercancel', 'lostpointercapture']) canvas.addEventListener(event, e => {
  skyActivePointers.delete(e.pointerId);
  if (skyPress?.id === e.pointerId) skyPress = null;
});
canvas.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') { skyPointer = null; constellationOverlay?.clearHover(); } });
for (const event of ['blur', 'resize']) window.addEventListener(event, () => { skyPress = null; skyPointer = null; skyActivePointers.clear(); constellationOverlay?.cancelPick(); });
function clearConstellation() {
  constellationFocus = -1; constellationOverlay?.clear();
  cam.yawT = cam.yaw; cam.pitchBase = cam.pitchT = cam.pitch;
  $('constellationInfo').textContent = ''; delete $('constellationInfo').dataset.i18n; delete $('constellationInfo').dataset.i18nParams; $('constellationSelect').value = '';
}
function selectConstellation(id, fromFinder = false) {
  if (id < 0 || !constellationOverlay) { clearConstellation(); return; }
  const target = constellationTarget(eqMat, constellationOverlay.centers[id], cam.yaw);
  if (target.pitch <= 0) { clearConstellation(); setMessage($('constellationInfo'), 'sky.belowHorizon'); return; }
  // 列表选择优先于此前仍在等待 GPU 返回的画布点选。
  if (fromFinder) constellationOverlay.cancelPick();
  if (fromFinder && !S.stargazing) setStargazing(true);
  constellationOverlay.select(id);
  constellationFocus = S.stargazing ? id : -1;
  $('constellationSelect').value = String(id);
  setMessage($('constellationInfo'), 'sky.selected', { name: constellationLabel(CONSTELLATIONS[id], getLanguage(), S.constelBilingual).join(' · ') });
}
function syncStargazingControls() {
  for (const key of ['stargazing', 'constelInteract', 'constelNames', 'constelBilingual']) $(key).checked = S[key];
  document.querySelectorAll('input[name="skyDisplay"]').forEach(el => { el.checked = el.value === (S.atmosphere ? 'natural' : 'chart'); });
  $('constel').checked = S.constel || S.stargazing; $('constel').disabled = S.stargazing;
  $('constelInteract').checked = S.constelInteract || S.stargazing; $('constelInteract').disabled = S.stargazing;
  $('interactionEnabled').checked = interactionEnabled(); $('interactionEnabled').disabled = S.stargazing;
  $('auto').checked = S.auto && !S.stargazing; $('auto').disabled = S.stargazing;
  syncAutoFollowMouse();
  $('height').disabled = S.stargazing;
  document.querySelectorAll('[data-height-preset]').forEach(el => { el.disabled = S.stargazing; });
  document.querySelectorAll('input[name="constelStyle"]').forEach(el => { el.checked = el.value === S.constelStyle; });
  $('bilingualOption').hidden = getLanguage() === 'en'; $('constelBilingual').disabled = !S.constelNames;
  $('stargazingStatus').hidden = !S.stargazing;
  setMessage($('hintText'), S.stargazing ? 'sky.hint' : coarse ? 'hint.touch' : 'hint.mouse');
  const current = $('constellationSelect').value;
  $('constellationSelect').replaceChildren(new Option(t('sky.choose'), ''));
  CONSTELLATIONS.forEach((item, i) => $('constellationSelect').add(new Option(constellationLabel(item, getLanguage(), S.constelBilingual).join(' · '), String(i))));
  $('constellationSelect').value = current;
  if (constellationOverlay?.selected >= 0) setMessage($('constellationInfo'), 'sky.selected', { name: constellationLabel(CONSTELLATIONS[constellationOverlay.selected], getLanguage(), S.constelBilingual).join(' · ') });
  document.body.dataset.sceneInteractive = String(interactionEnabled());
}
function setStargazing(enabled) {
  S.stargazing = enabled; stargazingPosition = null; constellationFocus = -1;
  keys.clear(); mouseFlight.reset(); touches.clear(); stick.active = false; gesture = null; skyPress = null; skyActivePointers.clear();
  lastTap = { n: 0, t: 0 }; sprintUntil = 0; cam.vx = cam.vz = 0;
  cam.yawT = cam.yaw; cam.pitchBase = cam.pitchT = cam.pitch;
  if (enabled) { S.auto = false; cam.y = lastView?.position[1] ?? cam.y; }
  frozenView = null; constellationOverlay?.cancelPick();
  syncStargazingControls(); document.dispatchEvent(new Event('sceneinteractionchange')); saveSettings();
}
for (const key of ['stargazing', 'constelInteract', 'constelNames', 'constelBilingual']) {
  $(key).addEventListener('change', e => {
    if (key === 'stargazing') setStargazing(e.target.checked);
    else { S[key] = e.target.checked; if (key === 'constelInteract' && !S[key]) clearConstellation(); syncStargazingControls(); saveSettings(); }
  });
}
// 沿用旧本机偏好以兼容已有星图用户；界面不再把整个显示模式称为大气开关。
document.querySelectorAll('input[name="skyDisplay"]').forEach(el => el.addEventListener('change', () => {
  if (el.checked) { S.atmosphere = el.value === 'natural'; saveSettings(); }
}));
document.querySelectorAll('input[name="constelStyle"]').forEach(el => el.addEventListener('change', () => {
  if (el.checked) { S.constelStyle = el.value; saveSettings(); }
}));
for (const key of ['constelWidth', 'constelClarity', 'constelFont']) bindRange(key, key,
  value => key === 'constelFont' ? `${value} px` : `${Math.round(value * 100)}%`);
$('resetConstellationDisplay').addEventListener('click', () => {
  for (const key of ['constelWidth', 'constelClarity', 'constelFont']) S[key] = STARGAZING_DEFAULTS[key];
  syncSceneControls(); saveSettings();
});
$('exitStargazing').addEventListener('click', () => setStargazing(false));
$('constellationSelect').addEventListener('change', () => {
  const value = $('constellationSelect').value;
  if (value === '') { clearConstellation(); return; }
  constellationOverlay ||= createConstellationOverlay(gl, { makeProgram, use, set, tex }, constellationDirections, constellationStars, constellationCatalogs);
  selectConstellation(Number(value), true);
});
onLanguageChange(syncStargazingControls);
syncStargazingControls();

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
  S.time = cityHours(simMs); skyKey = '';
  saveLocation(LOC);
  renderLoc(); publishTimeControls(); void observation.refresh(LOC); syncWeather(); saveSettings();
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
function applyObservedWeather(c) {
  const type = c.type, pp = wxPreset(type);
  pp.cov = clamp(0.12 + 0.85 * c.cloud_cover / 100, 0.12, 0.97);
  pp.wind = clamp(c.wind_speed_10m * 3, 0, 200); pp.breeze = clamp(0.12 + c.wind_speed_10m / 12, 0, 1);
  WIND_ANGLE = Math.PI / 2 - ((c.wind_direction_10m + 180) * RAD + S.sunAz * RAD);
  WXS.followOK = true; WXS.live = c; wxSetTarget(type, pp, 30);
  WXS.src = c.cached ? 'cached' : 'live';
}
function consumeObservedWeather() {
  if (S.wxMode !== 'follow' || sceneFreeze.weather) return;
  const observed = observation.read(), live = observed.live;
  if (!live) {
    if (observed.status === 'unavailable' && WXS.src !== 'unavailable') { WXS.followOK = false; WXS.live = null; WXS.src = 'unavailable'; wxStartDynamic(true); }
    return;
  }
  // 请求结果对象只有变化时才重新消费；复位或还原 WXS 后会自然重接实况。
  if (WXS.followOK && WXS.live === live) return;
  applyObservedWeather(live);
}
async function syncWeather(){
  const loc = LOC, request = ++weatherRequest;
  const pending = observation.refresh(loc);
  consumeObservedWeather();
  const observed = await pending;
  if (request !== weatherRequest || loc !== LOC || S.wxMode !== 'follow' || sceneFreeze.weather) return;
  if (observed.live) consumeObservedWeather();
  else if (WXS.src !== 'unavailable') { WXS.followOK = false; WXS.live = null; WXS.src = 'unavailable'; wxStartDynamic(true); }
}
setInterval(() => { void observation.refresh(LOC); if (S.wxMode === 'follow') void syncWeather(); }, 15 * 60 * 1000);
$('retryWeather').addEventListener('click', async () => { await observation.refresh(LOC, { force: true }); if (S.wxMode === 'follow' && !sceneFreeze.weather) void syncWeather(); });
$('sceneWeatherLock').addEventListener('change', event => setPreviewFreeze({ freezeWeather: event.target.checked }));
$('cloudLock').addEventListener('change', event => setPreviewFreeze({ freezeClouds: event.target.checked }));
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { keys.clear(); mouseFlight.reset(); }
  else { void observation.refresh(LOC); if (S.wxMode === 'follow') void syncWeather(); }
});
void observation.refresh(LOC);
renderLoc();
setWxMode(S.wxMode);
refreshWx();
const renderClock = () => setMessage($('clock'), 'rendering.clock', { city: locationName(LOC), time: fmtTime(zonedHours(LOC.tz, simMs)), phase: phaseName(AST.phase) });
onLanguageChange(() => { renderLoc(); renderSearch(); wxStatus(); renderClock(); });

/* ================================================================== */
/*  Camera rig, petal stream, culling                                  */
/* ================================================================== */
let autoT = 0;
function updateCamera(dt){
  if (S.stargazing) {
    stargazingPosition ||= { x: S.x, z: S.z, agl: S.agl, y: lastView?.position[1] ?? cam.y };
    Object.assign(S, { x: stargazingPosition.x, z: stargazingPosition.z, agl: stargazingPosition.agl });
    cam.y = stargazingPosition.y; cam.vx = cam.vz = 0;
    if (constellationFocus >= 0 && constellationOverlay) {
      const target = constellationTarget(eqMat, constellationOverlay.centers[constellationFocus], cam.yaw);
      cam.yawT = target.yaw; cam.pitchT = cam.pitchBase = clamp(target.pitch, -Math.PI / 2, Math.PI / 2);
    }
    const k = 1 - Math.exp(-dt * (reduceMotion ? 14 : 4));
    cam.yaw += (cam.yawT - cam.yaw) * k; cam.pitch += (cam.pitchT - cam.pitch) * k;
    cam.roll *= Math.exp(-dt * 7); cam.fov = S.fovY;
    return groundH(S.x, S.z);
  }
  if (preview) return groundH(S.x, S.z);
  if (!S.interactionEnabled && !S.auto) return groundH(S.x, S.z);
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
  const stickActive = S.interactionEnabled && flightStick.active && (flightStick === stick || S.auto) && !$('helpDialog').open && !document.hidden;
  const { x: stX, y: stY } = flightStickAxes({ ...flightStick, active: stickActive }, cssW, cssH);
  if (stX || stY) lastSteerAt = performance.now();
  const steering = performance.now() - lastSteerAt < 3000;
  if (S.auto && !steering){
    cam.yawT += (0.16 * Math.sin(autoT * 0.19) + 0.09 * Math.sin(autoT * 0.071 + 1.3)) * dt;
    cam.pitchBase = 0.035 + 0.05 * Math.sin(autoT * 0.13);
  }
  if (stickActive){
    cam.yawT += stX * 1.1 * dt;
    cam.pitchBase = 0.035 - stY * 0.22;
    if (stY){ S.agl = clamp(S.agl * Math.exp(-stY * 0.9 * dt), VIEW_HEIGHT_MIN, VIEW_HEIGHT_MAX); syncHeightSlider(); }
  }
  /* chase camera (as in flight games): while flying, pitch looks at the lead petal and keeps it a little below centre,
     so slopes, dives and climbs never carry the stream out of frame */
  const lead = trailHist.length ? trailHist[trailHist.length - 1].p : null;
  if (S.auto || stickActive) cam.pitchT = cam.pitchBase;
  else cam.pitchBase = cam.pitchT;
  if ((S.auto || stickActive) && lead && S.petals){
    const dh = Math.max(1, Math.hypot(lead[0] - S.x, lead[2] - S.z));
    const look = Math.atan2(lead[1] - cam.y, dh) + 0.12;
    const chase = clamp(look - (stickActive ? stY * 0.18 : 0) + (S.auto && !steering ? 0.02 * Math.sin(autoT * 0.13) : 0), -0.75, 0.6);
    cam.pitchT += (chase - cam.pitchT) * streamOpacity;
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
  if (mu){ S.agl = clamp(S.agl * Math.exp(mu * 1.2 * dt * fast), VIEW_HEIGHT_MIN, VIEW_HEIGHT_MAX); syncHeightSlider(); }
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
let streamG = NaN, streamAge = 0, streamOpacity = 0;
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
function updateTrail(dt, t, camM, active, spd, height){
  pushUni.fill(0);
  if (!active){ trailHist.length = 0; streamG = NaN; streamAge = 0; return false; }
  streamAge = Math.min(TRAIL_N * TRAIL_DT, streamAge + dt);
  /* the lead petal flies streamD metres ahead; switching near/mid/far glides there over about a second */
  streamD += ((STREAM_DIST[S.streamDist] || 6.5) - streamD) * (1 - Math.exp(-dt * 4.5));
  const sy = Math.sin(cam.yaw), cy = Math.cos(cam.yaw), weave = Math.sin(animationPhase(t, .8, 2 * Math.PI)) * (0.6 + 0.06 * streamD);
  const lx = S.x + sy * streamD + cy * weave, lz = S.z + cy * streamD - sy * weave;
  /* the stream holds a steady height above the grass (the camera's own height above ground, a metre lower), so climbing
     and diving carry it along; the ground under it is low-passed (faster up than down) so bumps and steps ease in */
  const gl0 = groundH(lx, lz);
  if (!isFinite(streamG)) streamG = gl0;
  streamG += (gl0 - streamG) * (1 - Math.exp(-dt * (gl0 > streamG ? 5 : 2.5)));
  const ly = Math.max(gl0 + 0.6, streamG + Math.max(0.9, height - 1.05)) + 0.3 * Math.sin(animationPhase(t, 1.25, 2 * Math.PI));
  if (trailHist.length && t <= trailHist[trailHist.length - 1].t) trailHist[trailHist.length - 1] = {t, p: [lx, ly, lz]};
  else trailHist.push({t, p: [lx, ly, lz]});
  const maxAge = TRAIL_N * TRAIL_DT + 0.5;
  while (trailHist.length > 2 && t - trailHist[1].t > maxAge) trailHist.shift();
  for (let k = 0; k < TRAIL_N; k++){
    const p = trailAt(t - k * TRAIL_DT), a = animationPhase(t, 2.4, 2 * Math.PI, k * .95), rad = 0.15 + 0.28 * ((k * 0.618) % 1) + k * 0.006;
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
const nightObservation = createNightObservation();
const flyOffset = [0, 0];
const gustOffset = [0, 0];
let animationFrame = 0;
const frameGate = createFrameGate();
let statAcc = 0, statFrames = 0, statT = 0, perfFrames = 0, perfAcc = 0, downgrades = 0, bladeEst = 0;
const NEAR = 0.08, FARP = 80000;
const depthAB = [(FARP + NEAR) / (FARP - NEAR), -2 * FARP * NEAR / (FARP - NEAR)];

function frame(now){
  if (contextLost) return;
  const elapsedMs = Math.max(0, now - last);
  const { clockElapsed, visualDt: dt, weatherDt } = sceneFrameTiming(elapsedMs, sceneFreeze); last = now;
  if (skyPointer && !skyPress?.moved && canPickConstellation() && now % 150 < elapsedMs) constellationOverlay?.requestPick(skyPointer.x, skyPointer.y);
  if (!noiseReady){
    // 夜间启动在加载阶段分摊编译，不把整组新 shader 留给首个可见夜景帧。
    if (AST.sunAlt < 2 * RAD || !S.atmosphere) getNightPrograms(false);
    genStep(14); return;
  }
  if(S.cloudStyle==='realistic'){
    ensureCloudNoise();
    const weatherReady=ensureCloudWeather();
    if(!eveNoiseReady||!weatherReady){$('loader').classList.remove('done');return;}
    ensureRealisticPrograms();$('loader').classList.add('done');
  }
  if(S.cloudStyle!=='realistic'){cancelCloudWeather();$('loader').classList.add('done');if(eveWeatherError){$('error').classList.remove('show');eveWeatherError=false;}}
  if(activeCloudStyle!==S.cloudStyle){
    activeCloudStyle=S.cloudStyle;needReset=true;prev=null;cloudLightInvalidated=true;
    const layer=S.cloudStyle==='realistic'?REALISTIC_CLOUD_LAYER:CLOUD_LAYER_METRES;
    LAYER[0]=layer[0]/1000;LAYER[1]=layer[1]/1000;lightKey='';skyKey='';
  }
  resize(false);
  // uint 整秒自然环绕，小数秒精度不随累计运行时间下降。
  if (simTime + dt >= ANIMATION_TIME_PERIOD) for (const point of trailHist) point.t -= ANIMATION_TIME_PERIOD;
  simTime = (simTime + dt) % ANIMATION_TIME_PERIOD;

  const groundNow = updateCamera(dt);
  const cameraActive = (!preview || S.stargazing) && (interactionEnabled() || S.auto);
  const sw = S.sway && cameraActive && !S.stargazing ? 1 : 0;
  const view = cameraActive ? {
    yaw: cam.yaw + sw * (0.004 * Math.sin(animationPhase(simTime, .53, 2 * Math.PI)) + 0.003 * Math.sin(animationPhase(simTime, 1.31, 2 * Math.PI))),
    pitch: cam.pitch + sw * 0.003 * Math.sin(animationPhase(simTime, .71, 2 * Math.PI, 1)),
    position: [S.x, cam.y + sw * 0.06 * Math.sin(animationPhase(simTime, .9, 2 * Math.PI)), S.z], fov: cam.fov,
  } : (frozenView ||= {yaw: cam.yaw, pitch: cam.pitch, position: [S.x, cam.y, S.z], fov: cam.fov});
  lastView = view;
  const {yaw, pitch} = view, camM = view.position, camK = camM.map(v => v / 1000);
  const aglReal = camM[1] - groundNow;
  const localWeather = localWeatherAtHeight(camM[1],LAYER.map(h=>h*1000));

  advanceCloudOffset(windOff, dt, WP.wind, WIND_ANGLE, sceneFreeze.clouds);
  cloudAngle = advanceCloudAngle(cloudAngle, WIND_ANGLE, dt, sceneFreeze.clouds);
  const windDir = [Math.cos(WIND_ANGLE), Math.sin(WIND_ANGLE)];
  advanceFireflyOffset(flyOffset, dt, WIND_ANGLE, WP.breeze);
  advanceWindOffset(gustOffset, dt, WIND_ANGLE, 1.8 / 230, 1);

  if (!sceneFreeze.time) simMs = advanceClock(simMs, clockElapsed, SPEEDS[S.speed | 0], followNow);
  S.time = cityHours(simMs);
  if (!sceneFreeze.weather) updateWeather(weatherDt);
  const localRain = WXS.rain * localWeather.precipitation;
  const lightChanged = updateLighting();
  atmosphere += ((S.atmosphere ? 1 : 0) - atmosphere) * (1 - Math.exp(-dt * 5));
  if (Math.abs(atmosphere - +S.atmosphere) < .0001) atmosphere = +S.atmosphere;
  let L = light, frameSkySamples = lightSamples, frameSkyLight = light;
  if (atmosphere < 1){
    const key = [covEff.toFixed(2), densEff.toFixed(2), Math.round(cam.y / 50), S.nightSkyStyle, S.lowSaturation].join('|');
    if (key !== observationLightKey){
      observationLightKey = key;
      observationLight = calculateLighting(moonlessAstronomy(AST), true);
      observationLight.sunI = 0;
    }
    L = observationLighting(light, observationLight, atmosphere);
    frameSkySamples = atmosphere > 0 ? { samples: [light, observationLight], fraction: 1 - atmosphere } : null;
    frameSkyLight = observationLight;
    // 沿同一渐变使用目标预曝光，避免日间曝光滞后让永夜恒星先消失数秒。
    expo = L.exposure;
  }
  const sun = L.lightDir, q = QUALITY[S.quality];
  const visualSunAltitude = observationSunAltitude(AST.sunAlt, atmosphere);
  const observationAstronomy = atmosphere === 1 ? AST : { ...AST, sunAlt: visualSunAltitude, moonBright: AST.moonBright * atmosphere };
  const hdr = nightHdrEnabled(visualSunAltitude);
  const hdrBlend = nightHdrBlend(visualSunAltitude);
  // 仅自然 SDR 天空进入星图时分离两种泛光单位；真实暮光与自然模式沿用原路径。
  const chartBloom = atmosphere < 1 && !nightHdrEnabled(AST.sunAlt);
  const sunHandoff = chartBloom ? smooth(0, Math.max(.001, (AST.sunAlt + 4 * RAD) / (AST.sunAlt + Math.PI / 2)), 1 - atmosphere) : 0;
  if (hdr !== hdrActive){
    P = hdr ? getNightPrograms() : dayPrograms;
    hdrActive = hdr;
    resize(true);
  }
  if(realisticPrograms)Object.assign(P,realisticPrograms);
  P.cloud=S.cloudStyle==='realistic'?realisticPrograms.realisticCloud:defaultCloudPrograms.cloud;
  P.cshadow=S.cloudStyle==='realistic'?realisticPrograms.realisticShadow:defaultCloudPrograms.cshadow;
  const nightSky = nightSkyAppearance(observationAstronomy, S.nightSkyStyle);
  if (nightSky.darkness > 0 || atmosphere < 1){ moonSurface.load(); galaxy.select(S.quality); loadRealisticStars(); }
  const nightView = nightObservationAppearance(nightObservation.update(elapsedMs / 1000,
    { position: camM, yaw, pitch, roll: cam.roll, fov: cam.fov }, nightSky.darkness > 0));
  equatorialToWorld(AST.lst, renderLocation().lat, S.sunAz, eqMat);
  expo = !isFinite(expo) ? L.exposure : Math.exp(Math.log(expo) + (Math.log(L.exposure) - Math.log(expo)) * (1 - Math.exp(-dt * 2.5)));
  const expoS = expo / L.pe, nightGlow = L.glowF * 0.45 / expoS;
  // 恒星和沉浸标注共享无积累基础强度；最低星图亮度在夜间风格系数之后应用，
  // 防止关闭大气时跨越暮光边界出现恒星消失、连线仍在的分支差异。
  const starWeather = 1 - .95 * Math.min(1, WXS.fog * 1.5 + WXS.rain + WXS.snow);
  const baseStarI = Math.max(L.starCat * (nightSky.darkness > 0 ? 8 / 2.4 * nightSky.stars : 1),
    (1 - atmosphere) * .10 / (hdrActive ? expoS : 1)) * starWeather;
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
  const fogAlt = Math.max(aglReal, 0.5);
  const fogW = [fogDens, WXS.fogH, fogAlt, Math.exp(-fogAlt / WXS.fogH)];
  const fogScale = Math.sqrt(6371000 / (2 * WXS.fogH));
  const fogSky = [fogScale, WXS.fogH * fogScale * Math.sqrt(Math.PI), smooth(2, 10, fogAlt / WXS.fogH), Math.sqrt(2 * fogAlt / 6371000)];
  const groundFogHorizon = groundFogHorizonBlend(aglReal);
  const flashTop = [bolt.x - camM[0], LAYER[0] * 1000 + 300 - camM[1], bolt.z - camM[2]], ftl = Math.hypot(...flashTop) || 1;
  const tanY = Math.tan(view.fov * Math.PI / 360), tanX = tanY * aspect;
  /* focus pulls to the petal stream: it is what the shot is about */
  const grassOn = aglReal < 450;
  const altitudeFade = S.petals ? petalStreamOpacity(aglReal) : 0;
  const streamOn = updateTrail(dt, simTime, camM, altitudeFade > 0, Math.hypot(cam.vx, cam.vz), aglReal);
  streamOpacity = altitudeFade * smooth(0, TRAIL_N * TRAIL_DT, streamAge);
  let fd = focusDistance(camM, B.f);
  if (streamOn){
    let sx = 0, sy2 = 0, sz = 0;
    for (let k = 0; k < 14; k++){ sx += trailUni[k * 4]; sy2 += trailUni[k * 4 + 1]; sz += trailUni[k * 4 + 2]; }
    const dz = (sx * B.f[0] + sy2 * B.f[1] + sz * B.f[2]) / 14;
    if (dz > 0.8) fd += (dz - fd) * streamOpacity;
  }
  if (cameraActive) cam.focus += (clamp(fd, 1.5, 600) - cam.focus) * (1 - Math.exp(-dt * 3));

  gl.bindVertexArray(emptyVAO);
  gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.depthMask(true);

  const cloudCoverage = S.cloudStyle === 'realistic' ? realisticCoverageControls(covEff) : null;
  const setCloudCommon = (Pp) => {
    set(Pp, 'uLowSaturation', S.lowSaturation ? 1 : 0);
    set(Pp, 'uCamPos', 0,camK[1],0); set(Pp, 'uSunDir', sun); set(Pp, 'uLayer', LAYER[0], LAYER[1]);
    set(Pp, 'uCoverage', cloudCoverage ? cloudCoverage.threshold : covEff);
    if (cloudCoverage) set(Pp, 'uCoverageShape', cloudCoverage.peak, cloudCoverage.typeBias, cloudCoverage.fade, cloudCoverage.fill);
    if (cloudCoverage) set(Pp, 'uCoverageSource', cloudCoverage.sourceMix, cloudCoverage.sourceOffset, cloudCoverage.referenceOffset);
    set(Pp, 'uDensity', densEff);
    // 按纹理共同周期约简后再上传，保持长时间云体/侵蚀的小位移精度。
    set(Pp, 'uWind', cloudWindPhase(camK,windOff));
    set(Pp, 'uWindDetail', cloudWindPhase(camK,windOff,true,simTime));
    set(Pp, 'uWindDir', Math.cos(cloudAngle), Math.sin(cloudAngle));
    set(Pp,'uEveNoiseLod',-1);
    set(Pp,'uCloudLightValid',cloudLightValid);
    set(Pp,'uEveWind',0,wrap(-windOff[1],2.3),0);
    set(Pp,'uEveMapPhase',cloudPhases(camK,windOff).map);
    if(cloudLightState){
      set(Pp,'uCloudLightOrigin',cloudLightState.origin[0]-camK[0],cloudLightState.origin[1],cloudLightState.origin[2]-camK[2]);
      set(Pp,'uCloudLightCenter',cloudLightState.center[0]-camK[0],cloudLightState.center[1]-camK[2]);
    }
    set(Pp, 'uRight', B.r); set(Pp, 'uUp', B.u); set(Pp, 'uFwd', B.f); set(Pp, 'uTan', tanX, tanY);
  };
  const bindCloudTex = (Pp) => {
    tex(Pp,'uEveNoise',gl.TEXTURE_3D,eveNoiseTex);
    tex(Pp,'uEveCurves',gl.TEXTURE_2D,eveCurvesTex);
    tex(Pp,'uEveWeather',gl.TEXTURE_2D,eveWeatherTex);
    tex(Pp,'uEveWeatherStats',gl.TEXTURE_2D,eveWeatherStatsTex);
    tex(Pp,'uCloudAtmoTrans',gl.TEXTURE_2D,cloudTransTex);
    tex(Pp,'uCloudSkyIrr',gl.TEXTURE_2D,cloudIrrTex);
    tex(Pp,'uCloudLightVolume',gl.TEXTURE_3D,cloudLightTextures[cloudLightCurrent]??null);
    tex(Pp, 'uShape', gl.TEXTURE_3D, shapeTex); tex(Pp, 'uDetail', gl.TEXTURE_3D, detailTex);
    tex(Pp, 'uWeather', gl.TEXTURE_2D, weatherTex); tex(Pp, 'uSkyLut', gl.TEXTURE_2D, skyTex);
  };

  const cloudQuality = S.cloudStyle === 'realistic' ? REALISTIC_CLOUD_QUALITY[S.quality] : q;
  if(S.cloudStyle==='realistic'){
    cloudLightClock+=dt;
    ensureCloudLightVolume(cloudQuality);
    const cloudWeatherChanging=!sceneFreeze.weather&&WXS.prog<1;
    const projection=cloudLightProjection(camK),initial=!cloudLightState,bootstrap=initial||cloudLightInvalidated;
    const move=!initial&&(Math.hypot(...projection.origin.map((v,i)=>v-cloudLightState.origin[i]))>.03*Math.min(projection.radius,cloudLightState.radius)
      ||Math.max(projection.radius,cloudLightState.radius)>1.03*Math.min(projection.radius,cloudLightState.radius));
    if(bootstrap){
      cloudLightState={...projection,center:[camK[0],camK[2]]};cloudDirectSlice=cloudAmbientSlice=0;
      cloudLightTimes.forEach(times=>times.fill(-1));cloudLightValid=[0,0];
      gl.bindFramebuffer(gl.FRAMEBUFFER,cloudLightFBO);gl.viewport(0,0,cloudQuality.grid,cloudQuality.grid);gl.clearColor(0,0,0,0);
      for(const texture of cloudLightTextures)for(let z=0;z<cloudQuality.slices;z++){
        gl.framebufferTextureLayer(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,texture,0,z);gl.clear(gl.COLOR_BUFFER_BIT);
      }
    }
    else if(move){
      const old=cloudLightState,next=1-cloudLightCurrent,Rp=P.cloudReproject;
      use(Rp);setCloudCommon(Rp);bindCloudTex(Rp);set(Rp,'uCloudLightOrigin',old.origin[0]-camK[0],old.origin[1],old.origin[2]-camK[2]);set(Rp,'uNewCloudLightOrigin',0,projection.origin[1],0);set(Rp,'uCloudLightCenter',old.center[0]-camK[0],old.center[1]-camK[2]);set(Rp,'uNewCloudLightCenter',0,0);
      gl.bindFramebuffer(gl.FRAMEBUFFER,cloudLightFBO);gl.viewport(0,0,cloudQuality.grid,cloudQuality.grid);
      for(let z=0;z<cloudQuality.slices;z++){
        gl.framebufferTextureLayer(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,cloudLightTextures[next],0,z);gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
        set(Rp,'uVolumeSlice',(z+.5)/cloudQuality.slices);draw();
      }
      cloudLightCurrent=next;cloudLightState={...projection,center:[camK[0],camK[2]]};
    }
    const V=P.cloudVolume;use(V);setCloudCommon(V);bindCloudTex(V);set(V,'uEveNoiseLod',3);seti(V,'uVolumeSteps',cloudQuality.volumeSteps);
    gl.bindFramebuffer(gl.FRAMEBUFFER,cloudLightTempFBO);gl.viewport(0,0,cloudQuality.grid,cloudQuality.grid);gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
    for(const ambient of [false,true]){
      seti(V,'uVolumeAmbient',ambient?1:0);
      const updates=(ambient?1:Math.max(1,Math.floor(cloudQuality.slices/12)))*(cloudWeatherChanging?2:1);
      for(let i=0;i<updates;i++){
        const z=ambient?cloudAmbientSlice:cloudDirectSlice;
        if(ambient)cloudAmbientSlice=(z+1)%cloudQuality.slices;else cloudDirectSlice=(z+1)%cloudQuality.slices;
        const channel=ambient?1:0,last=cloudLightTimes[channel][z];
        set(V,'uVolumeSlice',(z+.5)/cloudQuality.slices);
        // 按视觉时钟的切片年龄限制历史；天气渐变不再混入几十秒前的遮蔽。
        set(V,'uVolumeBlend',last<0?1:cloudLightBlend(cloudLightClock-last,cloudWeatherChanging));
        draw();
        gl.bindTexture(gl.TEXTURE_3D,cloudLightTextures[cloudLightCurrent]);
        gl.copyTexSubImage3D(gl.TEXTURE_3D,0,0,0,z,0,0,cloudQuality.grid,cloudQuality.grid);
        if(last<0)cloudLightValid[channel]++;
        cloudLightTimes[channel][z]=cloudLightClock;
      }
    }
    cloudLightInvalidated=false;
  }

  /* sky LUT：光照与天空使用同一对端点，避免只平滑草地而天空仍阶梯跳变。 */
  const skySampleKey = sample => sample.sunT.join(',') + sample.moonD.join(',') + sample.moonI + '|' + sample.pe + '|' + sample.airglow + '|' + Math.round(cam.y / 100) + (sample.sunI === 0 ? '|moonless' : '');
  const renderSkySample = (sample, fbo) => {
    use(P.skyLut); gl.bindFramebuffer(gl.FRAMEBUFFER, fbo); gl.viewport(0, 0, SKY_W, SKY_H);
    set(P.skyLut, 'uCamPos', camK); set(P.skyLut, 'uSunDir', sample.sunT); set(P.skyLut, 'uSunI', sample.sunI ?? SUN_I * sample.pe);
    set(P.skyLut, 'uMoonDir', sample.moonD); set(P.skyLut, 'uMoonI', sample.moonI * sample.pe);
    set(P.skyLut, 'uGlow', GLOW.map(v => v * sample.pe * sample.airglow)); set(P.skyLut, 'uMS', sample.ms); draw();
  };
  if (frameSkySamples) {
    const [a, b] = frameSkySamples.samples, ka = skySampleKey(a), kb = skySampleKey(b);
    let ia = skySamples.findIndex(sample => sample.key === ka), ib = skySamples.findIndex(sample => sample.key === kb);
    if (ia < 0) { ia = ib === 0 ? 1 : 0; renderSkySample(a, skySamples[ia].fbo); skySamples[ia].key = ka; }
    if (ib < 0) { ib = 1 - ia; renderSkySample(b, skySamples[ib].fbo); skySamples[ib].key = kb; }
    use(P.skyMix); gl.bindFramebuffer(gl.FRAMEBUFFER, skyFBO); gl.viewport(0, 0, SKY_W, SKY_H);
    tex(P.skyMix, 'uA', gl.TEXTURE_2D, skySamples[ia].texture); tex(P.skyMix, 'uB', gl.TEXTURE_2D, skySamples[ib].texture);
    set(P.skyMix, 'uMix', frameSkySamples.fraction); draw(); skyKey = '';
  } else {
    const sk = skySampleKey(frameSkyLight);
    if (sk !== skyKey) { skyKey = sk; renderSkySample(frameSkyLight, skyFBO); }
  }
  /* cloud shadow map */
  const cshTexel = CSH_EXT / CSH_N;
  const cshP = [Math.floor(camK[0] / cshTexel) * cshTexel, Math.floor(camK[2] / cshTexel) * cshTexel, CSH_EXT];
  if (frameNo % 2 === 0 || lightChanged){
    use(P.cshadow); gl.bindFramebuffer(gl.FRAMEBUFFER, cshFBO); gl.viewport(0, 0, CSH_N, CSH_N);
    setCloudCommon(P.cshadow); bindCloudTex(P.cshadow); set(P.cshadow, 'uShadowP', cshP[0]-camK[0],cshP[1]-camK[2],cshP[2]);
    draw();
  }
  /* clouds */
  const halton=(n,b)=>{let f=1,r=0;while(n>0){f/=b;r+=f*(n%b);n=Math.floor(n/b);}return r;};
  const jitterIndex=frameNo%32+1;
  const cloudJitter=S.cloudStyle==='realistic'?[(halton(jitterIndex,2)-.5)/CW,(halton(jitterIndex,3)-.5)/CH]:[0,0];
  use(P.cloud); gl.bindFramebuffer(gl.FRAMEBUFFER, cloudFBO); gl.viewport(0, 0, CW, CH);
  setCloudCommon(P.cloud); bindCloudTex(P.cloud);
  set(P.cloud,'uRayJitter',cloudJitter);set(P.cloud,'uEveLodScale',.25*CW/W,.25*CH/H);
  set(P.cloud,'uCloudSource',L.sourceCloud);
  if (S.cloudStyle === 'realistic') {
    const air = cloudAirLight(frameSkyLight, frameSkySamples, SUN_I, GLOW);
    set(P.cloud, 'uAirSunDir', AST.sun); set(P.cloud, 'uAirMoonDir', AST.moon);
    set(P.cloud, 'uAirSources', air.sources); set(P.cloud, 'uAirGlow', air.glow); set(P.cloud, 'uAirMS', air.ms);
  }
  if(cloudQuality.step)set(P.cloud,'uViewStep',cloudQuality.step);
  seti(P.cloud,'uAirSteps',cloudQuality.airSteps??16);
  set(P.cloud, 'uAtmosphere', atmosphere);
  set(P.cloud, 'uRayLimit', cloudRayLimit(camK[1], LAYER[0], atmosphere, S.cloudStyle === 'realistic'));
  set(P.cloud, 'uSunColor', L.lightCloud);
  set(P.cloud, 'uFlashP', bolt.x / 1000-camK[0], (LAYER[0] + LAYER[1]) * 0.45, bolt.z / 1000-camK[2], 2.5); set(P.cloud, 'uFlashC', [0.9, 0.92, 1.0].map(v => v * flash * 22)); set(P.cloud, 'uFwdScat', L.fwd); set(P.cloud, 'uAmbOcc', L.ambOcc); set(P.cloud, 'uAmbTop', L.ambTop); set(P.cloud, 'uAmbBottom', L.ambBottom);
  seti(P.cloud, 'uSteps', q.steps); seti(P.cloud, 'uLightSteps', cloudQuality.light);
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
    const cloudLight=[...sun,...L.sourceCloud,...L.ambTop,...L.ambBottom];
    const lightBlend=S.cloudStyle==='realistic'?cloudLightTemporalChange(prev?.cloudLight,cloudLight):(lightChanged?.25:0);
    set(T, 'uBlend', Math.min(0.7, 0.1 + turn * 6 + (SPEEDS[S.speed | 0] >= 10 ? 0.3 : lightBlend) + (flash > 0.03 ? 0.5 : 0)));
    set(T,'uRayJitter',cloudJitter);
    set(T, 'uTexel', 1 / CW, 1 / CH);
    seti(T, 'uReset', needReset ? 1 : 0);
    draw();
    needReset = false;
    prev = {B, tanX, tanY, cam: camK.slice(), cloudLight};
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
    set(Pp, 'uGroundFogHorizon', groundFogHorizon);
    set(Pp, 'uOpacity', 1);
    set(Pp, 'uLowSaturation', S.lowSaturation ? 1 : 0);
    tex(Pp, 'uTerr', gl.TEXTURE_2D, terrTex); tex(Pp, 'uSkyLut', gl.TEXTURE_2D, skyTex); tex(Pp, 'uCShadow', gl.TEXTURE_2D, cshTex);
    set(Pp, 'uCamM', camM); set(Pp, 'uR', B.r); set(Pp, 'uU', B.u); set(Pp, 'uF', B.f);
    set(Pp, 'uTanS', tanX, tanY); set(Pp, 'uDepthAB', depthAB[0], depthAB[1]);
    setAnimationTime(Pp); set(Pp, 'uFlyOffset', flyOffset); set(Pp, 'uGustOffset', gustOffset); set(Pp, 'uWindDirG', windDir[0], windDir[1]); set(Pp, 'uWindStr', WP.breeze);
    set(Pp, 'uShadowP', cshP); set(Pp, 'uSunDir', sun); set(Pp, 'uSunGround', L.lightGround); set(Pp, 'uSkyIrr', L.skyIrr);
    set(Pp, 'uFogKG', 1 / 13); set(Pp, 'uFogSky', fogSky[0], fogSky[1], fogSky[2], fogSky[3]); set(Pp, 'uExposure', expoS); set(Pp, 'uRes', W, H); set(Pp, 'uNightGlow', nightGlow);
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
    const flyG = S.flies && aglReal < 30 ? smooth(0.2, 0.7, L.night) * (1 - Math.min(1, WXS.rain + WXS.snow)) : 0;
    if (flyG > 0.01){ seti(Gw, 'uMode', 1); set(Gw, 'uFBox', 60); set(Gw, 'uFlyMul', flyG); gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, FLY_COUNT[S.quality] || 240); }
    if (S.petals){
      seti(Gw, 'uMode', 2); set(Gw, 'uPBox', 70); gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, q.petals);
      if (streamOn){ seti(Gw, 'uMode', 3); set(Gw, 'uStreamOpacity', streamOpacity); gl.uniform4fv(Gw.u.uTrail, trailUni); gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, TRAIL_N); }
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
      set(F, 'uFCell', 1); set(F, 'uFRadius', q.flowers / 2);
      for (const mesh of flowerMeshes) {
        const near = mesh.segments > 1, G = near ? FLOWER_CURVE_GRID : q.flowers;
        const bx = Math.floor(camM[0]) - G / 2, bz = Math.floor(camM[2]) - G / 2;
        set(F, 'uFGrid', G); set(F, 'uFBase', bx, bz); set(F, 'uFOrig', bx - camM[0], bz - camM[2]);
        set(F, 'uFRange', near ? 0 : FLOWER_CURVE_RADIUS, near ? FLOWER_CURVE_RADIUS : q.flowers / 2);
        seti(F, 'uFSegs', mesh.segments); gl.bindVertexArray(mesh.vao);
        gl.drawElementsInstanced(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0, G * G);
      }
      gl.bindVertexArray(emptyVAO);
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
      const St = P.stream; use(St); setScene(St); set(St, 'uOpacity', streamOpacity);
      gl.uniform4fv(St.u.uTrail, trailUni);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, TRAIL_N);
    }
    gl.disable(gl.SAMPLE_ALPHA_TO_COVERAGE);
  }
  /* sky + clouds where nothing was drawn */
  {
    const Sk = P.sky; use(Sk);
    set(Sk, 'uGroundFogHorizon', groundFogHorizon); set(Sk, 'uAtmosphere', atmosphere);
    gl.depthFunc(gl.LEQUAL); gl.depthMask(false);
    setCloudCommon(Sk); tex(Sk, 'uSkyLut', gl.TEXTURE_2D, skyTex); tex(Sk, 'uCloud', gl.TEXTURE_2D, hist[cur]); tex(Sk, 'uCloudDepth', gl.TEXTURE_2D, cloudDepth);
    set(Sk, 'uCloudSize', CW, CH); set(Sk, 'uSunDisk', L.sunDisk); set(Sk, 'uSunHandoff', sunHandoff); set(Sk, 'uExposure', expoS); set(Sk, 'uRes', W, H);
    set(Sk, 'uFogSky', fogSky[0], fogSky[1], fogSky[2], fogSky[3]);
    set(Sk, 'uFogW', fogW[0], fogW[1], fogW[2], fogW[3]); set(Sk, 'uFogCol', fogCol); set(Sk, 'uFlashSky', [0.8, 0.85, 1.0].map(v => v * flash * 1.4 * localWeather.skyFlash)); set(Sk, 'uFlashDir', flashTop.map(v => v / ftl));
    set(Sk, 'uSunTrue', L.sunT); set(Sk, 'uMoonDir', L.moonD); set(Sk, 'uMoonDisk', L.moonDisk);
    set(Sk, 'uMoonRadius', MOON_RADIUS); set(Sk, 'uMoonNorth', moonNorthDirection(eqMat));
    set(Sk, 'uEarthshine', nightSky.earthshine * atmosphere); set(Sk, 'uNightSky', nightSky.darkness);
    set(Sk, 'uGalaxyI', L.starI * nightSky.galaxy * nightView.galaxyGain);
    gl.uniformMatrix3fv(Sk.u.uEq, false, eqMat);
    tex(Sk, 'uMoonSurface', gl.TEXTURE_2D, moonSurface.texture); tex(Sk, 'uGalaxy', gl.TEXTURE_2D, galaxyTexture);
    const off = S.sunAz * Math.PI / 180, dirAE = (az, el) => [Math.cos(el) * Math.sin(az + off), Math.sin(el), Math.cos(el) * Math.cos(az + off)];
    const LATR = renderLocation().lat * RAD; set(Sk, 'uPole', dirAE(0, LATR)); set(Sk, 'uSouthEq', dirAE(Math.PI, Math.PI / 2 - LATR)); set(Sk, 'uWestEq', dirAE(Math.PI * 1.5, 0));
    set(Sk, 'uSidereal', AST.lst); set(Sk, 'uStarI', L.starI); set(Sk, 'uPixAngS', 2 * tanY / H); setAnimationTime(Sk);
    draw();
    gl.depthMask(true);
  }
  /* real stars, planets and optional constellation lines, added over the sky only (depth test at the far plane) */
  if (L.starCat > 2e-4 || atmosphere < 1){
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, hdrActive ? gl.ONE : gl.ONE_MINUS_SRC_COLOR); gl.depthFunc(gl.LEQUAL); gl.depthMask(false);
    const astronomicalStars = nightSky.darkness > 0 || (S.nightSkyStyle === 'realistic' && atmosphere < 1);
    const St = astronomicalStars ? P.stars : P.planets; use(St);
    gl.uniformMatrix3fv(St.u.uEq, false, eqMat);
    set(St, 'uR', B.r); set(St, 'uU', B.u); set(St, 'uF', B.f); set(St, 'uTan', tanX, tanY);
    set(St, 'uAtmosphere', atmosphere);
    set(St, 'uPointPeak', S.nightSkyStyle === 'realistic' ? 3.8 : 5);
    set(St, 'uSunDir', AST.sun); set(St, 'uMoonDir', AST.moon); set(St, 'uRes', W, H);
    set(St, 'uStarI', baseStarI * (nightSky.darkness > 0 ? nightView.starGain : 1)); set(St, 'uPxScale', W / Math.max(cssW, 1)); setAnimationTime(St);
    set(St, 'uStellarLimit', nightView.limitingMagnitude);
    tex(St, 'uCloud', gl.TEXTURE_2D, hist[cur]);
    if (astronomicalStars){
      set(St, 'uMoonDir', L.moonD); set(St, 'uMoonRadius', MOON_RADIUS); set(St, 'uMoonWash', observationAstronomy.moonBright * smooth(0, .2, L.moonD[1]));
      set(St, 'uScintillation', reduceMotion ? 0 : 1); set(St, 'uPixAngle', 2 * tanY / H); set(St, 'uRes', W, H);
      tex(St, 'uSkyLut', gl.TEXTURE_2D, skyTex);
    }
    const realCatalog = astronomicalStars && realisticStarVAO;
    gl.bindVertexArray(realCatalog || starVAO); gl.drawArrays(gl.POINTS, 0, realCatalog ? realisticStarCount : STAR_N);
    updatePlanets(simMs, atmosphere);
    const Pl = P.planets;
    if (Pl !== St){
      use(Pl);
      gl.uniformMatrix3fv(Pl.u.uEq, false, eqMat);
      set(Pl, 'uR', B.r); set(Pl, 'uU', B.u); set(Pl, 'uF', B.f); set(Pl, 'uTan', tanX, tanY);
      set(Pl, 'uSunDir', AST.sun); set(Pl, 'uMoonDir', AST.moon); set(Pl, 'uRes', W, H);
      set(Pl, 'uAtmosphere', atmosphere); set(Pl, 'uStarI', Math.max(L.starCat, (1 - atmosphere) * .10 / (hdrActive ? expoS : 1)) * starWeather);
      set(Pl, 'uPointPeak', S.nightSkyStyle === 'realistic' ? 3.8 : 5);
      set(Pl, 'uPxScale', W / Math.max(cssW, 1)); setAnimationTime(Pl); tex(Pl, 'uCloud', gl.TEXTURE_2D, hist[cur]);
    }
    gl.bindVertexArray(planetVAO); gl.drawArrays(gl.POINTS, 0, 5);
    gl.bindVertexArray(emptyVAO); gl.disable(gl.BLEND); gl.depthMask(true);
  }
  /* fireflies from dusk on: HDR additive glow, depth-tested against the grass without an opaque halo depth */
  const flyVis = S.flies && grassOn && aglReal < 30 ? smooth(0.2, 0.7, L.night) * (1 - Math.min(1, WXS.rain + WXS.snow)) : 0;
  if (flyVis > 0.01){
    const Fl = P.flies; use(Fl); setScene(Fl);
    set(Fl, 'uFBox', 60); set(Fl, 'uFlyI', 4.2 * flyVis); set(Fl, 'uPxScale', W / Math.max(cssW, 1));
    // HDR 光点可大于 1；screen 的 1-src 会变为负数，反而抹黑背后的亮星。
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, hdrActive ? gl.ONE : gl.ONE_MINUS_SRC_COLOR); gl.depthFunc(gl.LESS); gl.depthMask(!hdrActive);
    gl.drawArraysInstanced(gl.POINTS, 0, 1, FLY_COUNT[S.quality] || 240);
    gl.disable(gl.BLEND); gl.depthMask(true);
  }
  /* rain streaks (alpha) and lightning channels (additive), depth-tested against the scene */
  if (WXS.rain > 0.01 && localWeather.precipitation > 0.0){
    const Rn = P.rain; use(Rn); setScene(Rn);
    set(Rn, 'uRainBox', 30); set(Rn, 'uRainH', 18); set(Rn, 'uRainA', 0.6 * Math.sqrt(WXS.rain) * localWeather.precipitation);
    set(Rn, 'uRainCol', L.skyIrr.map((v, i) => v / Math.PI * 1.7 + flashAmb[i] / Math.PI * 1.2));
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthFunc(gl.LESS); gl.depthMask(false);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, Math.round((RAIN_N[S.quality] || 3000) * WXS.rain));
    gl.disable(gl.BLEND); gl.depthMask(true);
  }
  if (WXS.snow > 0.01 && localWeather.precipitation > 0.0){
    const Sn = P.snow; use(Sn); setScene(Sn);
    set(Sn, 'uSnowBox', 20); set(Sn, 'uSnowH', 14); set(Sn, 'uSnowA', 0.85 * Math.sqrt(WXS.snow) * localWeather.precipitation);
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
    tex(Bo, 'uCloud', gl.TEXTURE_2D, hist[cur]); tex(Bo, 'uCloudDepth', gl.TEXTURE_2D, cloudDepth);
    set(Bo, 'uResB', W, H); set(Bo, 'uBoltI', Math.min(3, flash * 2.2 * Math.exp(-fogDens * bolt.dist * 0.3)));
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); gl.depthFunc(gl.LESS); gl.depthMask(false);
    gl.bindVertexArray(boltVAO); gl.bindBuffer(gl.ARRAY_BUFFER, boltBuf); gl.bufferSubData(gl.ARRAY_BUFFER, 0, boltData, 0, n * 7);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, n);
    gl.bindVertexArray(emptyVAO); gl.disable(gl.BLEND); gl.depthMask(true);
  }
  gl.disable(gl.DEPTH_TEST);
  /* light shafts */
  const shaft = celestialShaftSource(AST, L.sunCam, L.moonCam), shaftDir = shaft.direction;
  const fw = shaftDir[0] * B.f[0] + shaftDir[1] * B.f[1] + shaftDir[2] * B.f[2];
  if (S.god && atmosphere > .0001 && lum(shaft.radiance) > 1e-8 && fw > 0.05){
    const sx = (shaftDir[0] * B.r[0] + shaftDir[1] * B.r[1] + shaftDir[2] * B.r[2]) / (fw * tanX);
    const syy = (shaftDir[0] * B.u[0] + shaftDir[1] * B.u[1] + shaftDir[2] * B.u[2]) / (fw * tanY);
    const off = Math.max(Math.abs(sx), Math.abs(syy));
    const god = Math.max(0, 1 - Math.max(0, off - 1) / 1.2) * Math.min(1, (fw - 0.05) * 4);
    if (god > 0.001){
      const Gd = P.god; use(Gd);
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, hdrActive ? gl.ONE : gl.ONE_MINUS_SRC_COLOR);
      tex(Gd, 'uCloud', gl.TEXTURE_2D, hist[cur]);
      set(Gd, 'uSunUV', sx * 0.5 + 0.5, syy * 0.5 + 0.5); set(Gd, 'uGod', god * atmosphere); set(Gd, 'uAspect', aspect);
      set(Gd, 'uExposure', expoS); set(Gd, 'uSunCam', shaft.radiance); set(Gd, 'uSunDir', shaftDir);
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
    set(Pp, 'uCocK', S.dof * 48 * (HH / 540)); set(Pp, 'uCocMaxN', q.dof[0] * 0.75); set(Pp, 'uCocMaxF', q.dof[0] * 0.35); set(Pp, 'uFocusR', 2.4); set(Pp, 'uSkyCoc', (1 - 0.9 * L.night) * atmosphere);
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
    const Bp = hdrActive && hdrBlend < 1 ? P.twilightBloom : P.bloomPre;
    use(Bp); gl.bindFramebuffer(gl.FRAMEBUFFER, bloomDF[0]); gl.viewport(0, 0, bloomSz[0][0], bloomSz[0][1]);
    const legacyThreshold = 0.76 - 0.15 * L.glowF;
    tex(Bp, 'uSrc', gl.TEXTURE_2D, sceneTex); set(Bp, 'uSrcTexel', 1 / W, 1 / H);
    set(Bp, 'uThresh', hdrActive ? legacyThreshold + (1 - legacyThreshold) * hdrBlend : legacyThreshold); set(Bp, 'uHdrBlend', hdrBlend); set(Bp, 'uChartBloom', +chartBloom); set(Bp, 'uLegacyThresh', legacyThreshold);
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
  let lensFrame = null;
  {
    /* lens rain: simulate and draw the water map, then return to the screen */
    const lensOn = S.lensDrops && (localRain > 0.01 || LR.drops.length > 0);
    if (lensOn){
      const yr = (cam.yaw - LR.lastYaw) / Math.max(dt, 1e-3);
      lensRainUpdate(dt, localRain, W / H, clamp(yr, -3, 3));
      lensRainDraw(W / H);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, W, H);
    } else if (!S.lensDrops) LR.drops.length = 0;
    LR.lastYaw = cam.yaw;
    lensFrame = lensOn && LR.tex ? LR.tex : null;
    if (atmosphere < 1) {
      chartCelestials ||= createChartCelestials(gl, { makeProgram, use, set, tex });
      gl.bindFramebuffer(gl.FRAMEBUFFER, chartFBO); gl.viewport(0, 0, W, H);
      chartCelestials.render({ amount: 1 - atmosphere, sun: AST.sun, moon: AST.moon, north: moonNorthDirection(eqMat),
        basis: B, tan: [tanX, tanY], res: [W, H], css: [cssW, cssH], cloud: hist[cur], depth: depthTex, surface: moonSurface.texture,
        fog: fogW, fogSky, hdr: hdrActive, hdrBlend, sunHandoff, moonColor: light.moonDisk, lowSaturation: S.lowSaturation, realistic: S.nightSkyStyle === 'realistic' });
    }
    const Fi = hdrActive && hdrBlend < 1 ? P.twilightFinal : P.final;
    use(Fi); gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, W, H);
    set(Fi, 'uLowSaturation', S.lowSaturation ? 1 : 0);
    set(Fi, 'uVignette', S.vignette ? 1 : 0);
    tex(Fi, 'uScene', gl.TEXTURE_2D, sceneTex); tex(Fi, 'uDepth', gl.TEXTURE_2D, depthTex);
    tex(Fi, 'uDof', gl.TEXTURE_2D, dofTex); tex(Fi, 'uBloom', gl.TEXTURE_2D, bloomOut);
    set(Fi, 'uSat', L.grade.sat); set(Fi, 'uShTint', L.grade.sh); set(Fi, 'uHiTint', L.grade.hi); set(Fi, 'uLift', L.grade.lift);
    set(Fi, 'uDrops', lensOn && LR.tex ? 1 : 0); if (LR.tex) tex(Fi, 'uLens', gl.TEXTURE_2D, LR.tex);
    set(Fi, 'uHdrBlend', hdrBlend); set(Fi, 'uChartBloom', +chartBloom); set(Fi, 'uLegacyBloomI', (S.lowSaturation ? 0.055 + 0.07 * L.glowF : 0.16 + 0.2 * L.glowF));
    set(Fi, 'uDofOn', dofOn ? 1 : 0); set(Fi, 'uBloomI', (hdrActive ? (S.lowSaturation ? .055 : .10) : S.lowSaturation ? 0.055 + 0.07 * L.glowF : 0.16 + 0.2 * L.glowF)); set(Fi, 'uNight', L.night); set(Fi, 'uNightSky', nightSky.darkness); set(Fi, 'uFrameN', frameNo % 997); set(Fi, 'uRes', W, H); setPost(Fi);
    draw();
  }

  if (S.constel || S.stargazing || constellationOverlay) {
    constellationOverlay ||= createConstellationOverlay(gl, { makeProgram, use, set, tex }, constellationDirections, constellationStars, constellationCatalogs);
    constellationOverlay.render({ settings: S, language: getLanguage(), eq: eqMat, basis: B, tan: [tanX, tanY],
      res: [W, H], css: [cssW, cssH], lens: lensFrame, cloud: hist[cur], depth: depthTex, sun: AST.sun, moon: L.moonD, moonWash: observationAstronomy.moonBright * smooth(0, .2, L.moonD[1]), sky: skyTex, hdr: hdrActive,
      rawEndpointI: baseStarI,
      atmosphere, sunAltitude: visualSunAltitude, now,
      endpointI: baseStarI * (hdrActive ? expoS : 1),
    }, Math.min(elapsedMs / 1000, .1), (id, kind) => {
      if (kind === 'select') selectConstellation(id, false);
    });
    gl.bindVertexArray(emptyVAO);
  }

  histIdx = 1 - histIdx; frameNo++;
  finishThumbnail();
  // 日落前逐帧预热；白昼帧不新增 shader，切换日夜后重复使用已编译对象。
  if (!hdrActive && AST.sunAlt < 2 * RAD && nightProgramIndex < nightProgramSources.length) getNightPrograms(false);

  /* stats + adaptive quality */
  statAcc += elapsedMs / 1000; statFrames++; statT += elapsedMs / 1000;
  if (statT > 0.5){
    const fps = statFrames / statAcc;
    $('fps').textContent = fps.toFixed(1); setMessage($('ms'), 'rendering.frameTime', { value: (1000 / fps).toFixed(1) });
    setMessage($('blades'), grassOn ? 'rendering.blades' : 'rendering.noGrass', { count: Math.round(bladeEst).toLocaleString(getLocale()) });
    if(S.showPerformance){
      $('performanceOverlay').textContent=[`${fps.toFixed(1)} FPS · ${(1000/fps).toFixed(1)} ms`, $('res').textContent, $('blades').textContent, $('gpu').textContent].filter(Boolean).join('\n');
      renderControls.placePerformance();
    }
    wxStatus();
    renderClock();
    $('locSun').textContent = riseSetText(simMs);
    const timeState = { locked: sceneFreeze.time, hours: S.time, speedIndex: sceneFreeze.time ? 0 : S.speed, loc: renderLocation(), sun: getSunEvents(simMs, renderLocation()), phase: phaseIndex(AST.phase) };
    updateTimeControls(timeState);
    statAcc = 0; statFrames = 0; statT = 0;
  }
  if (!userPickedQuality && downgrades < 2 && frameNo > 30){
    perfFrames++; perfAcc += elapsedMs / 1000;
    if (perfFrames >= 90){
      const avg = perfAcc / perfFrames; perfFrames = 0; perfAcc = 0;
      const order = ['low', 'med', 'high', 'ultra'], idx = order.indexOf(S.quality);
      const limit = effectiveFrameLimit(S.fpsLimit, WALLPAPER_MODE ? wallpaperSettings.fps : undefined);
      if (avg > qualityFrameBudget(limit) && idx > 0){ downgrades++; setQuality(order[idx - 1]); }
    }
  }
}

function publishObservation() {
  void observation.refresh(LOC);
  onUpdate(realObservationState({
    loc: LOC, temperatureUnit: S.temperatureUnit,
    weatherDisplay: { show: S.showWeather, temperature: S.showTemperature, precipitation: S.showPrecipitation, airQuality: S.showAirQuality, clouds: S.showClouds, wind: S.showWind },
    sceneTimeLocked: sceneFreeze.time, sceneFollowNow: followNow, sceneSpeed: sceneFreeze.time ? 0 : SPEEDS[S.speed | 0], sceneSunAltitude: AST.sunAlt / RAD,
  }, observation.read()));
}
setInterval(() => { if (worldReady) { consumeObservedWeather(); publishObservation(); } }, 1000);

function captureScene() {
  const settings = Object.fromEntries(Object.keys(SCENE_SETTINGS).map(key => [key, S[key]]));
  const appearance = Object.fromEntries(Object.keys(SCENE_APPEARANCE).map(key => [key, S[key]]));
  appearance.selectedConstellation = CONSTELLATIONS[constellationOverlay?.selected]?.id ?? null;
  const value = validateScene({ version: 1, settings,
    appearance,
    camera: { x: S.x, z: S.z, y: cam.y, agl: S.agl, yaw: cam.yaw, pitch: cam.pitch, roll: cam.roll, fov: S.fovY, focus: cam.focus,
      ...(lastView || frozenView ? { view: structuredClone(lastView ?? frozenView) } : {}), tracking: CONSTELLATIONS[constellationFocus]?.id ?? null },
    environment: { time: { ms: simMs, followNow, speedIndex: S.speed }, skyLocation: skyLocation(),
      motion: { time: simTime, windAngle: WIND_ANGLE, windOffset: [windOff[0], windOff[2]], cloudY: windOff[1], cloudAngle, flyOffset: [...flyOffset], gustOffset: [...gustOffset] },
      weather: { type: WXS.type, current: { ...WP }, wet: WXS.wet, snowCover: WXS.snowCov } },
    freeze: { ...sceneFreeze },
  });
  if (!value) throw new Error('当前世界包含无效状态');
  return value;
}
// 本机世界保留“跟随城市”的绑定；收藏和分享仍由 captureScene 固定天文地点。
function captureWorld() {
  const scene = captureScene();
  if (!sceneSkyLocation) delete scene.environment.skyLocation;
  return scene;
}
function createInitialScene() {
  return validateScene({ version: 1, settings: { ...initialSceneSettings, sunAz: initialSunAz }, camera: { ...startupCamera },
    environment: { time: { ms: Date.now(), followNow: true, speedIndex: 1 },
      weather: { type: 'cloudy', current: wxPreset('cloudy'), wet: 0, snowCover: 0 },
      motion: { time: 0, windAngle: .6, windOffset: [0, 0], cloudY: 0, cloudAngle: .6, flyOffset: [0, 0], gustOffset: [0, 0] } },
    freeze: { time: false, weather: false, clouds: false } });
}
function syncSceneControls() {
  S.cloudStyle=cloudStyle(S);
S.heightSlider = sliderFromAgl(S.agl);
  for (const { el, paint, key } of rangeControls) { el.value = S[key]; paint(S[key]); }
  syncFovSlider();
  renderControls.refresh();
  for (const [id, key] of Object.entries(toggles)) $(id).checked = S[key];
  $('lowSaturation').checked = S.lowSaturation;
  syncNightSkyControls(); syncCloudControls(); syncStargazingControls();
  for (const [name, key] of [['sdist', 'streamDist'], ['wxMode', 'wxMode']]) document.querySelectorAll(`input[name="${name}"]`).forEach(r => { r.checked = r.value === S[key]; });
  $('wxManual').hidden = S.wxMode !== 'manual'; markWxChips(); publishTimeControls(); wxStatus();
  document.dispatchEvent(new CustomEvent('worldscenechange', { detail: { previewing: Boolean(preview), freeze: { ...sceneFreeze } } }));
}
function applySceneWeather(weather) {
  Object.assign(WP, weather.current);
  Object.assign(WXS, { type: weather.type, from: { ...WP }, to: { ...WP }, prog: 1, dur: 1000,
    until: wxClock + 8 * 60000, t0: wxClock, wet: weather.wet, snowCov: weather.snowCover,
    rain: WP.rain, snow: WP.snow, storm: Math.min(1, WP.bolt / 1.2), fogDens: weatherFogDensity(WP.vis),
    fogH: WP.rain + WP.snow < .08 ? WP.vis < 1000 ? 55 : 120 : 260, fog: clamp(1 - WP.vis / 3000, 0, 1),
    followOK: false, live: null, airQuality: null, src: '', });
  covEff = WP.cov; densEff = WP.dens;
}
function resumeWeatherTarget() {
  if (sceneFreeze.weather) return;
  if (S.wxMode === 'manual') wxSetTarget(S.wxType, manualParams(), 4);
  else if (S.wxMode === 'off') wxSetTarget('clear', wxPreset('clear'), 15);
}
function applySceneCamera(camera) {
  stargazingPosition = null; constellationFocus = -1; constellationOverlay?.clear();
  Object.assign(S, { x: camera.x, z: camera.z, agl: camera.agl, fovY: camera.fov });
  Object.assign(cam, { y: camera.y ?? groundH(S.x, S.z) + S.agl, yaw: camera.yaw, pitch: camera.pitch,
    yawT: camera.yaw, pitchT: camera.pitch, pitchBase: camera.pitch, roll: camera.roll, fov: camera.view?.fov ?? camera.fov, vx: 0, vz: 0 });
  cam.focus = camera.focus ?? clamp(focusDistance([S.x, cam.y, S.z], basis(cam.yaw, cam.pitch, cam.roll).f), 1.5, 600);
}
function loadScene(scene) {
  rejectThumbnail(new Error('场景已切换'));
  sceneSkyLocation = scene.environment.skyLocation ? { ...scene.environment.skyLocation } : null;
  Object.assign(S, scene.settings);
  if (scene.appearance) Object.assign(S, scene.appearance);
  applySceneCamera(scene.camera);
  if (scene.appearance?.selectedConstellation) {
    constellationOverlay ||= createConstellationOverlay(gl, { makeProgram, use, set, tex }, constellationDirections, constellationStars, constellationCatalogs);
    constellationOverlay.select(CONSTELLATIONS.findIndex(item => item.id === scene.appearance.selectedConstellation));
  }
  $('constellationSelect').value = constellationOverlay?.selected >= 0 ? String(constellationOverlay.selected) : '';
  $('constellationInfo').textContent = ''; delete $('constellationInfo').dataset.i18n; delete $('constellationInfo').dataset.i18nParams;
  if (scene.camera.tracking) constellationFocus = CONSTELLATIONS.findIndex(item => item.id === scene.camera.tracking);
  simMs = scene.environment.time.ms; followNow = scene.environment.time.followNow; S.speed = scene.environment.time.speedIndex; S.time = cityHours(simMs);
  const motion = scene.environment.motion;
  if (motion) {
    simTime = motion.time; WIND_ANGLE = motion.windAngle;
    const savedFly = motion.flyOffset ?? [Math.cos(WIND_ANGLE) * simTime * .12 * scene.environment.weather.current.breeze, Math.sin(WIND_ANGLE) * simTime * .12 * scene.environment.weather.current.breeze];
    flyOffset[0] = wrap(savedFly[0], 60); flyOffset[1] = wrap(savedFly[1], 60);
    const savedGust = motion.gustOffset ?? [Math.cos(WIND_ANGLE) * simTime * 1.8 / 230, Math.sin(WIND_ANGLE) * simTime * 1.8 / 230];
    gustOffset[0] = wrap(savedGust[0], 1); gustOffset[1] = wrap(savedGust[1], 1);
    windOff[0] = motion.windOffset[0]; windOff[1] = motion.cloudY ?? simTime * 0.0025; windOff[2] = motion.windOffset[1]; cloudAngle = motion.cloudAngle ?? WIND_ANGLE;
  }
  sceneFreeze = { ...scene.freeze };
  applySceneWeather(scene.environment.weather);
  // 快照可能在过渡途中写入；未锁定的手动或关闭模式仍需继续走向用户保存的目标。
  resumeWeatherTarget();
  // 作品可恢复运动相位；旧作品保留当前相位，自然动画继续运行。
  keys.clear(); mouseFlight.reset(); frozenView = scene.camera.view ? structuredClone(scene.camera.view) : null; lastView = null;
  for (const id of new Set([...touches.keys(), ...skyActivePointers])) { try { canvas.releasePointerCapture(id); } catch {} }
  touches.clear(); stick.active = false; gesture = null; skyPress = null; skyPointer = null; skyActivePointers.clear();
  lastTap = { n: 0, t: 0 }; lastSteerAt = -1e9; sprintUntil = 0;
  prev = null; needReset = true; lightKey = ''; skyKey = ''; expo = NaN; cloudLightInvalidated=true;
  nightObservation.reset();
  trailHist.length = 0; LR.drops.length = 0; streamG = NaN; streamAge = 0; streamOpacity = 0; bolt.t = 99;
  if (S.stargazing) { S.auto = false; sprintUntil = 0; }
  last = performance.now(); syncSceneControls();
  if (S.wxMode === 'follow' && !sceneFreeze.weather) { consumeObservedWeather(); void syncWeather(); }
}
function previewScene(input, options = {}) {
  const scene = resolveSceneTime(input, LOC.tz);
  if (!scene) throw new TypeError('无效的风景');
  const { freezeTime = scene.freeze.time, freezeWeather = scene.freeze.weather, freezeClouds = scene.freeze.clouds } = options;
  if (!scene.environment.skyLocation && !options.followLocation) { const { lat, lon, tz } = LOC; scene.environment.skyLocation = { lat, lon, tz }; }
  if (!preview) preview = { original: captureWorld(), weather: structuredClone(WXS), startedAt: performance.now() };
  preview.selected = scene;
  const composed = structuredClone(scene);
  composed.freeze = { time: Boolean(freezeTime), weather: Boolean(freezeWeather), clouds: Boolean(freezeClouds) };
  if (!freezeTime && options.freezeTime === false && scene.freeze.time) composed.environment.time = { ...scene.environment.time, followNow: false, speedIndex: Math.max(1, scene.environment.time.speedIndex) };

  composed.appearance = { ...preview.original.appearance, ...scene.appearance };
  if (!scene.appearance && ['default', 'realistic'].includes(options.nightSkyStyle)) composed.appearance.nightSkyStyle = options.nightSkyStyle;
  if (!scene.appearance && ['immersive', 'always'].includes(options.constelStyle)) composed.appearance.constelStyle = options.constelStyle;
  weatherRequest++; loadScene(composed);
  return captureScene();
}
// 开关只改变当下状态的锁定，不重载作品或重置运动相位。
function setPreviewFreeze({ freezeTime = sceneFreeze.time, freezeWeather = sceneFreeze.weather, freezeClouds = sceneFreeze.clouds } = {}) {
  const weatherUnlocked = sceneFreeze.weather && !freezeWeather;
  if (sceneFreeze.time !== Boolean(freezeTime)) {
    followNow = false;
    if (!freezeTime) S.speed = Math.max(1, S.speed);
  }
  if (sceneFreeze.weather !== Boolean(freezeWeather)) {
    applySceneWeather(captureScene().environment.weather);

  }
  sceneFreeze = { time: Boolean(freezeTime), weather: Boolean(freezeWeather), clouds: Boolean(freezeClouds) };
  if (weatherUnlocked) resumeWeatherTarget();
  syncSceneControls(); saveSettings();
  if (weatherUnlocked && S.wxMode === 'follow') { consumeObservedWeather(); void syncWeather(); }
  return true;
}
function cancelPreview() {
  if (!preview) return false;
  const original = preview.original, weather = preview.weather;
  preview = null; weatherRequest++; loadScene(original); Object.assign(WXS, weather);
  saveSettings();
  if (S.wxMode === 'follow' && !sceneFreeze.weather) void syncWeather();
  return true;
}
function commitPreview() {
  if (!preview) return false;
  // 先写入成功再清除还原点；存储失败时仍可继续预览和还原。
  const previous = preview;
  try {
    const o = Object.fromEntries(PERSIST_KEYS.filter(key => S[key] !== undefined).map(key => [key, S[key]]));
    o.world = captureWorld();
    const serialized = JSON.stringify(o); localStorage.setItem(SETTINGS_KEY, serialized); settingsSnap = serialized;
    preview = null;
  }
  catch (error) { preview = previous; document.dispatchEvent(new CustomEvent('worldsettingssaved', { detail: { saved: false } })); throw new Error('无法保存当前世界', { cause: error }); }
  frozenView = null; syncSceneControls();
  document.dispatchEvent(new CustomEvent('worldsettingssaved', { detail: { saved: true } }));
  return true;
}
function rejectThumbnail(error) {
  if (!thumbnailJob) return;
  const job = thumbnailJob; thumbnailJob = null; clearTimeout(job.timer); job.reject(error);
}
function captureThumbnail() {
  if (thumbnailJob) return Promise.reject(new Error('正在生成封面'));
  if (contextLost || !animationFrame || document.hidden || (WALLPAPER_MODE && wallpaperSettings.paused)) return Promise.reject(new Error('当前画面已暂停'));
  return new Promise((resolve, reject) => {
    const job = { resolve, reject, stage: 'waiting' };
    job.timer = setTimeout(() => { if (thumbnailJob === job) rejectThumbnail(new Error('生成封面超时')); }, 5000);
    thumbnailJob = job;
  });
}
function finishThumbnail() {
  const job = thumbnailJob;
  if (!job || job.stage !== 'waiting') return;
  job.stage = 'encoding';
  try {
    const output = document.createElement('canvas'); output.width = 480; output.height = 270;
    const ctx = output.getContext('2d');
    if (!ctx) throw new Error('无法生成封面');
    const ratio = Math.max(480 / canvas.width, 270 / canvas.height), width = canvas.width * ratio, height = canvas.height * ratio;
    ctx.drawImage(canvas, (480 - width) / 2, (270 - height) / 2, width, height);
    output.toBlob(blob => {
      if (thumbnailJob !== job) return;
      if (!blob) { rejectThumbnail(new Error('封面编码失败')); return; }
      clearTimeout(job.timer); thumbnailJob = null; job.resolve(blob);
    }, 'image/jpeg', .86);
  } catch (error) { rejectThumbnail(error); }
}

function tick(now) {
  animationFrame = 0;
  if (contextLost || (WALLPAPER_MODE && wallpaperSettings.paused)) return;
  animationFrame = requestAnimationFrame(tick);
  if (WALLPAPER_MODE && document.hidden) return;
  if (!frameGate.ready(now, effectiveFrameLimit(S.fpsLimit, WALLPAPER_MODE ? wallpaperSettings.fps : undefined))) return;
  try { frame(now); }
  catch (error) {
    rejectThumbnail(error);
    cancelAnimationFrame(animationFrame); animationFrame = 0;
    console.error('Hanagoyomi 渲染中断', error);
    fail('error.rendering');
  }
}
if (restoredScene) loadScene(sceneForStartup(restoredScene, startupCamera, S.rememberPosition));
if (restoredScene?.appearance) document.dispatchEvent(new Event('sceneinteractionchange'));
else if (S.stargazing) setStargazing(true);
worldReady = true;
publishObservation();
for (const eventName of ['input', 'change']) document.addEventListener(eventName, event => {
  if (event.target.closest('#panel, #timePopover')) saveSettings();
});
document.addEventListener('click', event => {
  if (event.target.closest('#panel, #timePopover')) queueMicrotask(saveSettings);
});
canvas.addEventListener('pointerup', saveSettings);
window.addEventListener('keyup', saveSettings);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { saveSettings(); rejectThumbnail(new Error('当前画面已暂停')); }
});
resize(true);
animationFrame = requestAnimationFrame(tick);

return {
  hasRestoredSettings, captureScene, createInitialScene, previewScene, setPreviewFreeze, cancelPreview, commitPreview, captureThumbnail,
  isPreviewing: () => Boolean(preview),
  save: saveSettings,
  applyStartupPositionPreference(rememberPosition) {
    if (rememberPosition && !restoredScene) return;
    applySceneCamera(rememberPosition ? restoredScene.camera : startupCamera);
    keys.clear(); mouseFlight.reset(); frozenView = null; lastView = null; prev = null; needReset = true;
    syncSceneControls();
  },
  resize: () => resize(true),
  syncRenderSettings: () => renderControls.refresh(),
  setCity(name) {
    let city = CITIES.find(c => c[1] === name);
    if (name === 'system') {
      const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      city = CITIES.find(c => c[1] === 'Shanghai' && c[4] === zone) || CITIES.find(c => c[4] === zone) || CITIES.find(c => c[1] === 'Tokyo');
    }
    if (city) setLocation(cityLoc(city));
  },
  setPaused(paused) {
    if (paused) { cancelAnimationFrame(animationFrame); animationFrame = 0; saveSettings(); rejectThumbnail(new Error('当前画面已暂停')); return; }
    last = performance.now(); frameGate.reset(); prev = null; needReset = true; skyKey = '';
    statAcc = statFrames = statT = perfFrames = perfAcc = 0;
    keys.clear(); mouseFlight.reset();
    if (!WXS.live || Date.now() - WXS.live.fetchedAt > 15 * 60 * 1000) void syncWeather();
    if (!animationFrame && !contextLost) animationFrame = requestAnimationFrame(tick);
  },
};

}
