import { unzlibSync } from 'fflate';
import { EVE_CLOUD_TYPES } from '../data/eve-cloud-types.js';
import { CLOUD_COVERAGE_WIDTH } from './cloud-coverage.js';
const CLOUD_PLANET_RADIUS_KM = 6371;
// 天气图和侵蚀场使用 600 km 尺度，宿主球面相交使用地球半径。
const EVE_WEATHER_RADIUS_KM = 600;

export const REALISTIC_CLOUD_LAYER = Object.freeze([1750, 7450]);
export const REALISTIC_CLOUD_QUALITY = Object.freeze({
  low: { cloud: .35, step:[.225,.018], light: 2, grid:48, slices:16, volumeSteps:24, airSteps:8 },
  med: { cloud: .6, step:[.16875,.0135], light: 4, grid:64, slices:24, volumeSteps:32, airSteps:12 },
  high: { cloud: .65, step:[.1125,.009], light: 4, grid:96, slices:32, volumeSteps:50, airSteps:16 },
  ultra: { cloud: 1.25, step:[.075,.006], light: 4, grid:128, slices:32, volumeSteps:50, airSteps:24 },
});

// 天气图半径为 600 km；位置和风相位在 CPU double 中约简。
export function cloudPhases(cameraKm, windKm) {
  const wrap=(v,p)=>((v%p)+p)%p, radius=EVE_WEATHER_RADIUS_KM;
  const x=cameraKm[0]-windKm[0],z=cameraKm[2]-windKm[2];
  return {
    map:[wrap(.2723+x/(2*Math.PI*radius),1),wrap((.4666-.5)*Math.PI+z/radius,2*Math.PI)],
  };
}

// 光照体积的地下投影点；单位为 km，镜头当地径向为 Y。
export function cloudLightProjection(cameraKm,layer=REALISTIC_CLOUD_LAYER){
  const radius=CLOUD_PLANET_RADIUS_KM,r=Math.max(radius+cameraKm[1],radius+2.5),inner=radius+layer[0]/1000,outer=radius+layer[1]/1000;
  const R=Math.min(radius,inner),near=Math.sqrt(r*r-R*R),d=near+Math.sqrt(Math.max(0,outer*outer-R*R)),k=near/r;
  return {origin:[cameraKm[0],r-k*d-radius,cameraKm[2]],radius:Math.sqrt(Math.max(0,d*d*(1-k*k)))};
}

export function evePhase(g,mu){return Math.PI*.25*(1-g*g)/Math.pow(1+g*g-2*g*mu,1.5);}

// 高度曲线的入、出切线使用 Hermite 插值。
export function sampleCloudCurve(keys, value) {
  if (value <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1], b = keys[i];
    if (value > b[0]) continue;
    const d = b[0] - a[0], t = (value - a[0]) / d, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * a[1] + (t3 - 2 * t2 + t) * d * a[3]
      + (-2 * t3 + 3 * t2) * b[1] + (t3 - t2) * d * b[2];
  }
  return keys.at(-1)[1];
}

export function cloudCurveTexture(size = 128) {
  const data = new Uint8Array(size * size * 2), clamp = v => Math.max(0, Math.min(1, v));
  for (let x = 0; x < size; x++) {
    const type = x / (size - 1) * (EVE_CLOUD_TYPES.length - 1), i = Math.floor(type), f = type - i;
    const a = EVE_CLOUD_TYPES[i], b = EVE_CLOUD_TYPES[Math.min(i + 1, EVE_CLOUD_TYPES.length - 1)];
    const bottom = a.minAltitude * (1 - f) + b.minAltitude * f, top = a.maxAltitude * (1 - f) + b.maxAltitude * f;
    for (let y = 0; y < size; y++) {
      const h = REALISTIC_CLOUD_LAYER[0] + (REALISTIC_CLOUD_LAYER[1] - REALISTIC_CLOUD_LAYER[0]) * y / (size - 1);
      const t = (h - bottom) / (top - bottom), at = (x + y * size) * 2;
      const coverageAt = type => {
        const v = type.interpolateCloudHeights === false ? (h - type.minAltitude) / (type.maxAltitude - type.minAltitude) : t;
        return v < 0 || v > 1 ? 0 : sampleCloudCurve(type.coverageCurve, v);
      };
      data[at] = Math.round(255 * clamp(coverageAt(a) * (1 - f) + coverageAt(b) * f));
      data[at + 1] = Math.round(255 * clamp(t < 0 || t > 1 ? 1 : sampleCloudCurve(a.densityCurve, t) * (1 - f) + sampleCloudCurve(b.densityCurve, t) * f));
    }
  }
  return data;
}

export async function loadCloudNoise(loader) {
  const { default: packed } = await loader();
  const data = unzlibSync(Uint8Array.from(atob(packed), c => c.charCodeAt(0)));
  if (data.length !== 128 ** 3) throw new Error('写实体积云噪声数据长度无效');
  return data;
}

export const REALISTIC_DENSITY_GLSL = `
uniform sampler3D uEveNoise;
uniform sampler2D uEveCurves;
uniform sampler2D uEveWeather;
uniform sampler2D uEveWeatherStats;
const float EVE_WEATHER_RADIUS=600.0;
uniform sampler2D uCloudAtmoTrans,uCloudSkyIrr;
uniform vec3 uEveWind;
uniform float uEveNoiseLod;
uniform vec4 uCoverageShape;
uniform vec3 uCoverageSource;
uniform vec2 uEveLodScale;
float eveViewLod=-99.0;
uniform sampler3D uCloudLightVolume;
uniform vec3 uCloudLightOrigin;uniform vec2 uCloudLightCenter;
uniform vec2 uEveMapPhase;
uniform vec2 uCloudLightValid;

vec2 eveAtmosphereUV(vec3 pr,vec3 direction){
  float h=max(0.0,length(pr-PC)-R_EARTH),mu=dot(normalize(pr-PC),direction);
  return vec2(.5+.5*sign(mu)*sqrt(abs(mu)),sqrt(clamp(h/100.0,0.0,1.0)));
}
vec3 eveAtmosphere(vec3 pr,vec3 direction){return textureLod(uCloudAtmoTrans,eveAtmosphereUV(pr,direction),0.0).rgb;}

vec3 eveVolumeUV(vec3 pw,vec3 origin,vec2 center){
  vec3 v=normalize(pw-origin);
  return vec3(.5+.5*v.xz/(1.0+v.y),clamp((length(vec3(pw.x-center.x,pw.y+R_EARTH,pw.z-center.y))-R_EARTH-uLayer.x)/(uLayer.y-uLayer.x),0.0,1.0));
}
vec2 eveVolumeCubic(vec3 uv){
  vec3 size=vec3(textureSize(uCloudLightVolume,0));
  uv.z=clamp(uv.z,.5/size.z,1.0-.5/size.z);
  vec3 p=uv*size-.5,i=floor(p),f=fract(p),q=1.0-f;
  vec3 w0=q*q*q/6.0,w1=(3.0*f*f*f-6.0*f*f+4.0)/6.0;
  vec3 w2=(-3.0*f*f*f+3.0*f*f+3.0*f+1.0)/6.0,w3=f*f*f/6.0;
  vec3 a=w0+w1,b=w2+w3,h0=(i-.5+w1/a)/size,h1=(i+1.5+w3/b)/size;
  vec2 c00=mix(textureLod(uCloudLightVolume,vec3(h1.x,h0.y,h0.z),0.0).rg,textureLod(uCloudLightVolume,h0,0.0).rg,a.x);
  vec2 c10=mix(textureLod(uCloudLightVolume,vec3(h1.x,h1.y,h0.z),0.0).rg,textureLod(uCloudLightVolume,vec3(h0.x,h1.y,h0.z),0.0).rg,a.x);
  vec2 c01=mix(textureLod(uCloudLightVolume,vec3(h1.x,h0.y,h1.z),0.0).rg,textureLod(uCloudLightVolume,vec3(h0.x,h0.y,h1.z),0.0).rg,a.x);
  vec2 c11=mix(textureLod(uCloudLightVolume,h1,0.0).rg,textureLod(uCloudLightVolume,vec3(h0.x,h1.y,h1.z),0.0).rg,a.x);
  return mix(mix(c11,c01,a.y),mix(c10,c00,a.y),a.z);
}
vec3 eveVolumePoint(vec2 uv,float height,vec3 origin,vec2 center){
  vec2 q=uv*2.0-1.0;float q2=dot(q,q);
  vec3 d=vec3(2.0*q.x,1.0-q2,2.0*q.y)/(1.0+q2);
  vec3 local=vec3(origin.x-center.x,origin.y,origin.z-center.y);
  float distance=raySphere(local,d,R_EARTH+height).y;
  return origin+d*distance;
}

float eveHeight(vec3 p){return length(vec3(p.x-uCamPos.x,p.y+R_EARTH,p.z-uCamPos.z))-R_EARTH;}
vec3 eveAtAltitude(vec2 xz,float h){
  vec2 q=xz-uCamPos.xz;
  return vec3(xz.x,sqrt(max(0.0,pow(R_EARTH+h,2.0)-dot(q,q)))-R_EARTH,xz.y);
}

// Y 为纬度轴，q 与去平铺法线使用同一球面坐标。
vec3 eveCloudPosition(vec3 p){
  // 把当地水平距离映射到独立天气球面，避免随宿主半径放大团块10.6倍。
  // 指数映射在光照缓存远端仍连续，无sqrt半球域外塌到赤道的问题。
  vec2 xz=p.xz-uCamPos.xz;
  float radius=EVE_WEATHER_RADIUS+eveHeight(p),theta=length(xz)/radius;
  float sinc=theta<.0001?1.0-theta*theta/6.0:sin(theta)/theta;
  vec3 q=vec3(xz.x*sinc,radius*cos(theta),xz.y*sinc);
  float c=cos(uEveMapPhase.y),s=sin(uEveMapPhase.y);
  q.yz=vec2(c*q.y-s*q.z,s*q.y+c*q.z);
  q=q.xzy;
  float longitude=(uEveMapPhase.x-.5)*2.0*PI;c=cos(longitude);s=sin(longitude);
  q.xz=vec2(c*q.x+s*q.z,-s*q.x+c*q.z);
  return q;
}

// 三角网格去平铺使用三个整数哈希偏移及截去 0.15 的重心权重。
vec3 eveHash(uvec2 p){
  uvec3 q = (p.yxx ^ (p.xyx >> 8u)) * 1103515245u;
  q = (q ^ (q.zxy >> 8u)) * 1103515245u;
  q = (q ^ (q.zxy >> 8u)) * 1103515245u;
  return vec3(q) * (1.0 / 4294967296.0);
}
float eveNoise(vec3 p, float fp){
  vec3 source=eveCloudPosition(p),n=normalize(source);
  vec2 uv = n.yx / dot(abs(n), vec3(1.0)) * .5 + .5;
  uv *= floor((EVE_WEATHER_RADIUS+uLayer.x)*2.93/2.3);
  vec2 cell = floor(uv), f = fract(uv);
  vec3 w = vec3(1.0 - f.x - f.y, f.x, f.y);
  vec2 a = cell, b = cell + vec2(1,0), c = cell + vec2(0,1);
  if (w.x < 0.0){ a += 1.0; b = cell + vec2(0,1); c = cell + vec2(1,0); w = vec3(-w.x, 1.0-f.x, 1.0-f.y); }
  w = max(w - .15, 0.0); w /= dot(w, vec3(1.0));
  // 主云依据全分辨率导数和 0.25 足迹选择 mip；体积缓存固定 mip3。
  float lod=uEveNoiseLod>=0.0?uEveNoiseLod:eveViewLod> -90.0?floor(eveViewLod):lodOf(fp,2.3/128.0);
  vec3 q = (source + n*uEveWind.y) / 2.3;
  return dot(w, vec3(textureLod(uEveNoise, q + eveHash(uvec2(ivec2(a))), lod).r,
    textureLod(uEveNoise, q + eveHash(uvec2(ivec2(b))), lod).r,
    textureLod(uEveNoise, q + eveHash(uvec2(ivec2(c))), lod).r));
}

vec2 eveMapUV(vec3 p){
  vec3 n=normalize(eveCloudPosition(p));
  // 数据纹理不翻转 Y，北极对应 v=0。
  return vec2(atan(n.x,n.z)/(2.0*PI)+.5,acos(clamp(n.y,-1.0,1.0))/PI);
}
// 返回 x=消光系数/km，y=宏观覆盖梯度，z=多重散射亮度，w=侵蚀后的剩余量。
vec4 eveDensity(vec3 pw, float h01, float fp){
  if(h01 <= 0.0 || h01 >= 1.0 || uCoverageShape.z <= 0.0) return vec4(0.0);
  vec3 p = pw; p.xz += uWindDir * (h01 * .6);
  vec2 uv = eveMapUV(p), wt = textureLod(uEveWeather,uv,0.0).rg;
  float potential = saturate(wt.r + uCoverageSource.y), coverage = potential;
  if(uCoverageSource.x < 1.0){
    // 固定世界统计只校准低云量；不按镜头重算，不替换源天气图。
    vec2 stats = textureLod(uEveWeatherStats,uv,0.0).rg;
    // 低均值源场限制校准力度，避免原本接近的晴朗/少云场景反而偏离。
    // 权重只依固定世界统计，不随云量、机位或时间变化；凸混合仍保持单调。
    float reference = saturate(wt.r + uCoverageSource.z) * uCoverageShape.z;
    float trust = smoothstep(.15,.30,stats.r);
    coverage = reference;
    if(trust > 0.0){
      float score = saturate(.5 + .125 * (wt.r-stats.r) / (.06+.44*stats.g));
      float delta = score - uCoverage + uCoverageShape.y * smoothstep(.1,.2,wt.g);
      float calibrated = uCoverageShape.x * (.5 + .5 * delta * inversesqrt(delta*delta + ${CLOUD_COVERAGE_WIDTH ** 2})) * uCoverageShape.z;
      // min 后的校准值不超过 potential，回归源场时不会局部减云。
      coverage = mix(reference,mix(min(calibrated,potential),potential,uCoverageSource.x),trust);
    }
  }
  coverage = mix(coverage,1.0,uCoverageShape.w);
  if(coverage<.01)return vec4(0);
  float type=saturate(wt.g+max(uDensity-1.05,0.0)*.12);
  vec2 curve = textureLod(uEveCurves, vec2(type, h01), 0.0).rg;
  float macro = curve.r + coverage - 1.0;
  if (macro < .01) return vec4(0.0);
  const float density[6] = float[6](1.5,12.0,12.0,12.0,6.0,6.0);
  const float edge[6] = float[6](.1,.03,.03,.03,.03,.03);
  float it = type * 5.0, f = fract(it); int i = int(it), j = min(i+1,5);
  float softness = mix(edge[i],edge[j],f), sigma = mix(density[i],density[j],f);
  float d = 1.0, residual = 1.0;
  if (macro < softness + .65){residual=macro-.65*(1.0-eveNoise(p,fp));d=saturate(residual/softness);}
  return vec4(d > .01 ? d * sigma * curve.g * uDensity : 0.0, saturate(macro), mix(.8,1.0,saturate(it)),residual);
}
// 同一段积分用于缓存与未回填区域；完整覆盖光程，中点采样避免漏尾。
float eveShellExit(vec3 pw,vec3 d){
  vec3 p=vec3(pw.x-uCamPos.x,pw.y,pw.z-uCamPos.z);
  vec2 top=raySphere(p,d,R_EARTH+uLayer.y),bottom=raySphere(p,d,R_EARTH+uLayer.x);
  return max(0.0,bottom.x>0.0?min(top.y,bottom.x):top.y);
}
float eveOpticalDepth(vec3 p,vec3 d,int steps,float limit){
  float distance=min(eveShellExit(p,d),limit),od=0.0;
  if(distance<=0.0)return 0.0;
  int count=max(1,min(steps,int(ceil(distance/.075))));
  float savedViewLod=eveViewLod;eveViewLod=3.0;
  for(int i=0;i<50;i++){
    if(i>=count)break;
    // 较密的近端分段保留厚云遮蔽，远端仍覆盖到云壳出口。
    float a=float(i)/float(count),b=float(i+1)/float(count);
    a=distance*a*a;b=distance*b*b;
    vec3 q=p+d*((a+b)*.5);
    od+=eveDensity(q,(eveHeight(q)-uLayer.x)/(uLayer.y-uLayer.x),.14375).x*(b-a);
  }
  eveViewLod=savedViewLod;
  return od;
}
bool eveVolumeReady(vec3 uv,int channel){
  vec3 size=vec3(textureSize(uCloudLightVolume,0));
  if(length(uv.xy-.5)>=.5-3.0/min(size.x,size.y))return false;
  float slices=size.z;
  float last=min(slices-1.0,floor(uv.z*slices-.5)+2.0);
  return last<uCloudLightValid[channel];
}
float eveAmbientFallback(vec3 p){
  vec3 up=normalize(vec3(p.x-uCamPos.x,p.y+R_EARTH,p.z-uCamPos.z));
  return 2.0*eveOpticalDepth(p,up,8,4.0*(uLayer.y-uLayer.x));
}

`;

// 长程太阳 OD 与径向上半球平均 OD 以 OD * .01 存储。
// RG16F 两通道分别保存太阳 OD 和半球环境 OD。
export const CLOUD_LIGHT_VOLUME_GLSL = `
uniform int uVolumeAmbient,uVolumeSteps;
uniform float uVolumeSlice,uVolumeBlend;
out vec4 o;
void main(){
  if(length(vUv-.5)>=.5){o=vec4(0);return;}
  vec3 p=eveVolumePoint(vUv,mix(uLayer.x,uLayer.y,uVolumeSlice),uCloudLightOrigin,uCloudLightCenter);
  vec2 old=textureLod(uCloudLightVolume,vec3(vUv,uVolumeSlice),0.0).rg;
  if(uVolumeAmbient==0){o=vec4(mix(old.x,eveOpticalDepth(p,uSunDir,uVolumeSteps,1e6)*.01,uVolumeBlend),old.y,0,1);return;}
  vec3 up=normalize(vec3(p.x-uCamPos.x,p.y+R_EARTH,p.z-uCamPos.z));
  vec3 right=normalize(cross(abs(up.z)<.9?vec3(0,0,1):vec3(1,0,0),up)),forward=cross(up,right);
  float od=0.0;
  for(int j=0;j<6;j++){
    vec3 random=eveHash(uvec2(gl_FragCoord.xy)+uvec2(0,uint(uVolumeSlice*100000.0)));
    float y=(float(j)+.5)/6.0,a=random.x*2.0*PI+float(j)*2.39996323,r=sqrt(max(0.0,1.0-y*y));
    vec3 d=up*y+right*(r*cos(a))+forward*(r*sin(a));
    od+=eveOpticalDepth(p,d,uVolumeSteps/3,4.0*(uLayer.y-uLayer.x));
  }
  o=vec4(old.x,mix(old.y,od*(.01/6.0),uVolumeBlend),0,1);
}
`;
export const CLOUD_LIGHT_REPROJECT_GLSL = `
uniform float uVolumeSlice;uniform vec3 uNewCloudLightOrigin;uniform vec2 uNewCloudLightCenter;
out vec4 o;
void main(){
  if(length(vUv-.5)>=.5){o=vec4(0);return;}
  vec3 pw=eveVolumePoint(vUv,mix(uLayer.x,uLayer.y,uVolumeSlice),uNewCloudLightOrigin,uNewCloudLightCenter);
  vec3 old=eveVolumeUV(pw,uCloudLightOrigin,uCloudLightCenter);
  vec2 value=eveVolumeCubic(old);
  if(!eveVolumeReady(old,0))value.x=eveOpticalDepth(pw,uSunDir,12,1e6)*.01;
  if(!eveVolumeReady(old,1))value.y=eveAmbientFallback(pw)*.01;
  if(any(isnan(value)))value=vec2(0);
  o=vec4(max(value,vec2(0)),0,1);
}
`;

// 日照透射与太阳遮挡按每个云采样点的真实高度和径向法线查询。
export const CLOUD_TRANSMITTANCE_GLSL = `
out vec4 o;
void main(){
  float x=vUv.x*2.0-1.0,mu=sign(x)*x*x,h=100.0*vUv.y*vUv.y;
  vec3 p=vec3(0,h,0),d=vec3(sqrt(max(0.0,1.0-mu*mu)),mu,0);
  vec2 ground=raySphere(p,d,R_EARTH);
  if(ground.x>0.0){o=vec4(0,0,0,1);return;}
  float end=raySphere(p,d,R_EARTH+atmo_top()).y;vec3 od=vec3(0);
  if(end<=0.0){o=vec4(1);return;}
  for(int i=0;i<48;i++){
    vec2 b=atmoInterval(p,d,0.0,end,i,48);
    float altitude=max(0.0,length(p+d*((b.x+b.y)*.5)-PC)-R_EARTH);
    od+=atmoDensity(altitude)*(b.y-b.x);
  }
  o=vec4(exp(-atmoExtinction(od)),1);
}
`;

// 单位日照下的半球天空辐照度。以余弦重要性采样积分，覆盖云点实际高度和太阳天顶角。
export const CLOUD_IRRADIANCE_GLSL = `
out vec4 o;
void main(){
  float x=vUv.x*2.0-1.0,mu=sign(x)*x*x,h=100.0*vUv.y*vUv.y;
  vec3 sun=vec3(sqrt(max(0.0,1.0-mu*mu)),mu,0),ro=vec3(0,h,0),irr=vec3(0);
  for(int j=0;j<32;j++){
    float y=sqrt((float(j)+.5)/32.0),r=sqrt(1.0-y*y),a=float(j)*2.39996323;
    vec3 rd=vec3(r*cos(a),y,r*sin(a));
    float end=raySphere(ro,rd,R_EARTH+atmo_top()).y,cosT=dot(rd,sun);
    if(end<=0.0)continue;
    float pr=3.0/(16.0*PI)*(1.0+cosT*cosT);
    float pm=atmoMiePhase(cosT);
    vec3 od=vec3(0),radiance=vec3(0);
    for(int i=0;i<12;i++){
      vec2 b=atmoInterval(ro,rd,0.0,end,i,12);
      vec3 p=ro+rd*((b.x+b.y)*.5);
      float height=max(0.0,length(p-PC)-R_EARTH);
      vec3 dd=atmoDensity(height)*(b.y-b.x);
      vec3 mid=od+.5*dd;od+=dd;
      vec3 att=exp(-atmoExtinction(mid))*eveAtmosphere(p,sun);
      radiance+=att*(atmo_rayleigh()*(dd.x*pr)+vec3(atmo_mie()*dd.y*pm));
    }
    irr+=radiance;
  }
  o=vec4(irr*(PI/32.0),1);
}
`;

export const REALISTIC_RAYMARCH_GLSL = `
uniform vec2 uViewStep;
uniform vec3 uCloudSource;
uniform vec3 uAirSunDir,uAirMoonDir,uAirGlow,uAirMS;
uniform vec2 uAirSources;
uniform int uAirSteps;
// HG 相函数使用 π/4 归一化，预曝光尺度独立于相函数。
float eveHG(float g,float mu){return PI*PI*hg(g,mu);}
// 视线透射与内散射使用大气数值积分，云前空气与云内消光分离。
// 不以统一灰色距离雾替代RGB Beer透射，也不把相机外的真空计入光程。
vec3 eveAerial(vec3 cloud,float T,vec3 ro,vec3 rd,float depth){
  vec2 hit=raySphere(ro,rd,R_EARTH+atmo_top());
  float start=max(0.0,hit.x),end=min(depth,hit.y);
  if(end<=start || T>=1.0)return cloud;
  float mu=dot(rd,uAirSunDir),moonMu=dot(rd,uAirMoonDir);
  float phaseR=3.0/(16.0*PI)*(1.0+mu*mu),phaseM=atmoMiePhase(mu);
  float moonPhaseR=3.0/(16.0*PI)*(1.0+moonMu*moonMu),moonPhaseM=atmoMiePhase(moonMu);
  vec3 od=vec3(0),air=vec3(0);
  for(int i=0;i<24;i++){
    if(i>=uAirSteps)break;
    vec2 b=atmoInterval(ro,rd,start,end,i,uAirSteps);
    vec3 p=ro+rd*((b.x+b.y)*.5);
    float h=max(0.0,length(p-PC)-R_EARTH);
    vec3 d=atmoDensity(h)*(b.y-b.x);
    vec3 middle=od+d*.5;od+=d;
    vec3 att=exp(-atmoExtinction(middle));
    vec3 radiance=(atmo_rayleigh()*d.x*phaseR+atmo_mie()*d.y*phaseM)*eveAtmosphere(p,uAirSunDir)*uAirSources.x;
    if(uAirSources.y>0.0)radiance+=(atmo_rayleigh()*d.x*moonPhaseR+atmo_mie()*d.y*moonPhaseM)*eveAtmosphere(p,uAirMoonDir)*uAirSources.y;

    air+=att*radiance;
  }
  vec3 viewT=exp(-atmoExtinction(od));
  // 与宿主天空相同的近地颜色校准；暮光多重散射及空气辉光按已走过的光学路程加入。
  float hw=pow(1.0-abs(rd.y),5.0)*mix(.15,.75,smoothstep(.03,.35,uAirSunDir.y));
  air=mix(air,dot(air,vec3(.2126,.7152,.0722))*vec3(.90,.99,1.13),hw);
  vec3 diffuse=uAirMS*(.6+.4*(1.0-abs(rd.y)))+uAirGlow*(1.0+.6*pow(1.0-abs(rd.y),4.0));
  air+=diffuse*(1.0-viewT);
  return cloud*viewT+air*(1.0-T)*uAtmosphere;
}
float eveLight(vec3 pr,vec3 pw,float fp,float viewT,float distance,float jitter){
  // 距离小于 2 km 且视线仍透明时加倍采样，太阳光程上限为 1.2 km。
  int count=(distance<2.0 && viewT>=.75)?uLightSteps*2:uLightSteps;
  float shellExit=eveShellExit(pw,uSunDir),distanceToExit=min(1.2,shellExit);
  float ds=distanceToExit/float(count),od=0.0;
  for(int i=0;i<8;i++){
    if(i>=count)break;
    // 只抖动段内采样位置，不移动积分边界或制造未积分的缺口。
    float sampleT=(float(i)+fract(jitter+float(i)*.61803398875))*ds;
    vec3 q=pw+uSunDir*sampleT;
    od+=eveDensity(q,(eveHeight(q)-uLayer.x)/(uLayer.y-uLayer.x),max(.018,fp*.25)).x*ds;
  }
  vec3 end=pw+uSunDir*distanceToExit;
  // 外球出口之后没有剩余云层；不能把高度夹回顶层缓存重复遮蔽。
  if(shellExit<=1.2 && dot(vec3(end.x-uCamPos.x,end.y+R_EARTH,end.z-uCamPos.z),uSunDir)>=0.0)return od;
  vec3 uv=eveVolumeUV(end,uCloudLightOrigin,uCloudLightCenter);
  od+=eveVolumeReady(uv,0)?100.0*eveVolumeCubic(uv).x:eveOpticalDepth(end,uSunDir,12,1e6);
  return od;
}
void eveRaymarch(vec3 ro,vec3 rd,float t0,float t1,float jit){
  float seg=t1-t0;
  vec2 inner=raySphere(ro,rd,R_EARTH+uLayer.x);
  vec3 pn=ro+rd*t0,pf=ro+rd*t1;pn.xz+=uCamPos.xz;pf.xz+=uCamPos.xz;
  vec3 qn=eveCloudPosition(pn)*(128.0/2.3),qf=eveCloudPosition(pf)*(128.0/2.3);
  vec3 nx=dFdx(qn)*uEveLodScale.x,ny=dFdy(qn)*uEveLodScale.y;
  vec3 fx=dFdx(qf)*uEveLodScale.x,fy=dFdy(qf)*uEveLodScale.y;
  float ln=.5*log2(max(max(dot(nx,nx),dot(ny,ny)),1e-20));
  float lf=.5*log2(max(max(dot(fx,fx),dot(fy,fy)),1e-20));
  float mu=dot(rd,uSunDir);
  float directPhase=.1*eveHG(.95,mu)+.2*eveHG(.8,mu);
  float multiplePhase=3.0*eveHG(.2,mu)+.3*eveHG(-.4,mu);
  vec3 L=vec3(0); float T=1.0, ds=0.0, ws=0.0,ambientWeight=0.0;
  // V5：基础步长+绝对镜头距离的自适应项，薄段缩短基础步长。
  float base=uViewStep.x;
  if(seg<=10.0*base)base*=.3+.7*seg/(10.0*base);
  float t=t0;
  for(int i=0;i<512;i++){
    // 两段共享透射和辐亮度累积；跳过没有云的内球区间，避免远侧云底漏采。
    if(inner.x>0.0 && t>=inner.x && t<inner.y)t=inner.y;
    if(t>=t1)break;
    if(T<.002){T=0.0;break;}
    float dt=min(base+uViewStep.y*t,1.5);
    if(T<.04){float r=5.0+2.0*jit;dt*=r+(1.0-r)*max(50.0*T-1.0,0.0);}
    if(i==0)dt*=jit;
    float end=inner.x>t?min(t1,inner.x):t1;
    dt=min(dt,end-t);t+=dt;
    vec3 pr=ro+rd*t; float h=length(pr-PC)-R_EARTH;
    vec3 pw=vec3(pr.x+uCamPos.x,pr.y,pr.z+uCamPos.z);
    float fp=max(max(t*uPixAngle,dt*.3),.012);
    eveViewLod=mix(ln,lf,clamp((t-t0)/seg,0.0,1.0));
    vec4 den=eveDensity(pw,(h-uLayer.x)/(uLayer.y-uLayer.x),fp);
    if(den.x>0.0){
      float od=eveLight(pr,pw,fp,T,t,fract(jit+float(i)*.61803398875));
      float powder=smoothstep(0.0,1.0,den.y+den.w)*.95+.05;
      // 参考 Frostbite 多阶指数透射：保留浅层响应，避免有理式在厚云中留下过亮长尾。
      float ms=.5*exp(-.25*od)+.5*exp(-.45*od);
      // 云色为 120/255，积分系数为 5；照明强度 1 对应 SUN_I=20，uCloudSource 使用预曝光单位。
      float sun=((120.0/255.0)*5.0/20.0)*(directPhase*exp(-od)+multiplePhase*ms*powder*den.z);
      float Ts=exp(-den.x*dt), weight=T*(1.0-Ts);
      vec3 illumination=uCloudSource*eveAtmosphere(pr,uSunDir)*sun;
      ambientWeight+=weight*sqrt(max(0.0,1.0-den.y));
      L+=weight*illumination;
      vec3 fd=pw-uFlashP.xyz; L+=weight*uFlashC*exp(-dot(fd,fd)/(uFlashP.w*uFlashP.w));
      float representativeWeight=T*T*den.x*dt;
      ds+=representativeWeight*t;ws+=representativeWeight;T*=Ts;
    }
  }
  if(T>=1.0){oColor=vec4(0,0,0,1);oDepth=vec4(t1,0,0,1);return;}
  float depth=ws>1e-5?ds/ws:t0+min(seg,6.0)*.5;
  vec3 representative=ro+rd*depth,pw=vec3(representative.x+uCamPos.x,representative.y,representative.z+uCamPos.z);
  vec3 uv=eveVolumeUV(pw,uCloudLightOrigin,uCloudLightCenter);
  float A=eveVolumeReady(uv,1)?eveVolumeCubic(uv).y*100.0:eveAmbientFallback(pw);
  float ambientVisibility=.3+.7/(1.0+.035*A+.00065*A*A);
  vec3 skyIrr=textureLod(uCloudSkyIrr,eveAtmosphereUV(representative,uSunDir),0.0).rgb*uCloudSource;
  skyIrr*=((120.0/255.0)*200.0*.2/20.0);
  vec3 ambient=mix(vec3(length(skyIrr)),skyIrr,.7)*ambientWeight*ambientVisibility;
  // 暮光多重散射与夜间艺术光来自宿主天空，单次太阳LUT不能覆盖这部分能量。
  float representativeHeight=clamp((eveHeight(pw)-uLayer.x)/(uLayer.y-uLayer.x),0.0,1.0);
  vec3 hostAmbient=mix(uAmbBottom,uAmbTop,representativeHeight)*(.55+.45*ambientVisibility)*(1.0-T);
  L+=max(ambient,hostAmbient);
  L=eveAerial(L,T,ro,rd,depth);
  oColor=vec4(L,T);oDepth=vec4(depth,0,0,1);
}
`;
