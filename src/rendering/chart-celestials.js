import { CELESTIAL_GLSL, DEFAULT_MOON_GLSL, DISPLAY_TRANSFORM, VS_FULL, HEAD } from './shaders.js';
import { WEATHER_FOG_GLSL } from './weather-fog.js';
import { MOON_RADIUS, SUN_RADIUS } from './night-sky.js';

const dot = (a, b) => a.reduce((sum, x, i) => sum + x * b[i], 0);

// 只继承自然月光的色比，移除场景预曝光与强度，星图显示亮度不随曝光积累变化。
export function chartMoonTint(radiance) {
  const color = radiance?.length === 3 && radiance.every(v => Number.isFinite(v) && v >= 0)
    && Math.max(...radiance) > 0 ? radiance : [1, .82, .6];
  const peak = Math.max(...color);
  return color.map(v => v / peak);
}

// 只控制显示柔光；月亮完全遮住太阳时不留下凭空的光环。
export function solarDiscVisibility(sun, moon) {
  const cosine = Math.max(-1, Math.min(1, dot(sun, moon))), rs = SUN_RADIUS, rm = MOON_RADIUS;
  if (cosine <= Math.cos(rs + rm)) return 1;
  const cross = [sun[1]*moon[2]-sun[2]*moon[1], sun[2]*moon[0]-sun[0]*moon[2], sun[0]*moon[1]-sun[1]*moon[0]];
  const d = Math.atan2(Math.hypot(...cross), cosine);
  if (d <= rm - rs) return 0;
  const acos = x => Math.acos(Math.max(-1, Math.min(1, x)));
  const overlap = rs*rs*acos((d*d+rs*rs-rm*rm)/(2*d*rs))
    + rm*rm*acos((d*d+rm*rm-rs*rs)/(2*d*rm))
    - .5*Math.sqrt(Math.max(0,(-d+rs+rm)*(d+rs-rm)*(d-rs+rm)*(d+rs+rm)));
  return Math.max(0, Math.min(1, 1-overlap/(Math.PI*rs*rs)));
}

// 球面圆盘在透视平面上的保守包围盒，只光栅化日月附近的少量像素。
export function celestialDiscBounds(direction, radius, basis, tan, res) {
  const aa = 2 * tan[1] / res[1], r = radius + aa * 2;
  if (direction[1] < -Math.sin(r)) return null;
  const z = dot(direction, basis.f), s = Math.sin(r);
  if (z <= -s) return null;
  // 圆盘贴近相机侧面时，先用球冠与视锥侧面排除，避免离屏天体退化为全屏绘制。
  for (const [axis, scale] of [[basis.r, tan[0]], [basis.u, tan[1]]]) {
    const x = dot(direction, axis), margin = s * Math.hypot(1, scale);
    if (z * scale + x < -margin || z * scale - x < -margin) return null;
  }
  if (z <= s) return [0, 0, ...res];
  const range = (axis, scale, pixels) => {
    const x = dot(direction, axis), d = z * z - s * s;
    const spread = s * Math.sqrt(Math.max(0, x * x + z * z - s * s));
    return [(x * z - spread) / d, (x * z + spread) / d].map(v => (v / scale * .5 + .5) * pixels);
  };
  const x = range(basis.r, tan[0], res[0]), y = range(basis.u, tan[1], res[1]);
  const left = Math.max(0, Math.floor(x[0])), bottom = Math.max(0, Math.floor(y[0]));
  const right = Math.min(res[0], Math.ceil(x[1])), top = Math.min(res[1], Math.ceil(y[1]));
  return right > left && top > bottom ? [left, bottom, right - left, top - bottom] : null;
}

const fragment = HEAD + CELESTIAL_GLSL + DEFAULT_MOON_GLSL + DISPLAY_TRANSFORM + WEATHER_FOG_GLSL + `
uniform vec3 uR,uU,uF,uSunDir,uMoonDir,uMoonNorth,uSunColor,uMoonColor;
uniform vec2 uTan,uRes;
uniform float uAmount,uBody,uRealistic,uSunHaloRadius,uSunHaloVisible,uSunEnhancement,uOutputHdr;
uniform sampler2D uCloud,uDepth,uMoonSurface;
out vec4 o;
void main(){
  if(texture(uDepth,vUv).r<1.0)discard;
  vec2 p=vUv*2.0-1.0;
  vec3 d=normalize(uF+p.x*uTan.x*uR+p.y*uTan.y*uU);
  if(d.y<0.0)discard;
  float pix=2.0*uTan.y/uRes.y;
  float moonMask=discMask(d,uMoonDir,${MOON_RADIUS},pix);
  vec3 col=vec3(0);
  if(uBody<.5){
    float edge=discMask(d,uSunDir,${SUN_RADIUS},pix);
    float r=length(cross(d,uSunDir))/sin(${SUN_RADIUS});
    float limb=1.0-.45*(1.0-sqrt(max(1.0-r*r,0.0)));
    float haloX=clamp((length(cross(d,uSunDir))-sin(${SUN_RADIUS}))/(sin(uSunHaloRadius)-sin(${SUN_RADIUS})),0.0,1.0);
    float initialHalo=mix(.08,.045,uRealistic)*exp(-2.0*haloX)*(1.0-smoothstep(.65,1.0,haloX))*(1.0-edge);
    // 从光盘中心连续衰减，不在盘外单独开启一圈；尾端低于可见能量后再平滑归零。
    float haloR=length(cross(d,uSunDir))/sin(uSunHaloRadius),haloPeak=mix(2.0,1.2,uRealistic);
    float gaussianHalo=haloPeak*exp(-7.29*haloR*haloR)*(1.0-smoothstep(.8,1.0,haloR));
    float coreGain=1.0+11.0*uSunEnhancement-uSunEnhancement*haloPeak;
    float radiance=coreGain*limb*edge+mix(initialHalo,gaussianHalo,uSunEnhancement)*uSunHaloVisible;
    col=uSunColor*radiance*(1.0-moonMask);
  }else if(uRealistic<.5){
    vec2 surface=defaultMoonSurface(d,uMoonDir,uSunDir,pix);
    float r=length(cross(d,uMoonDir))/sin(${MOON_RADIUS});
    float phase=clamp(.5*(1.0-dot(uMoonDir,uSunDir)),0.0,1.0);
    float horizon=smoothstep(-sin(${MOON_RADIUS}),sin(${MOON_RADIUS}),uMoonDir.y);
    float halo=.11*exp(-.6*r*r)*(1.0-smoothstep(2.5,3.5,r))*pow(phase,1.5)*horizon;
    col=uMoonColor*(4.0*surface.x*surface.y+halo);
  }else if(moonMask>0.0){
    vec3 north=uMoonNorth-uMoonDir*dot(uMoonNorth,uMoonDir);
    if(dot(north,north)<1e-8){
      vec3 axis=abs(uMoonDir.y)<.99?vec3(0,1,0):vec3(1,0,0);
      north=axis-uMoonDir*dot(axis,uMoonDir);
    }
    vec3 up=normalize(north),right=normalize(cross(up,uMoonDir));
    vec2 q=vec2(dot(d,right),dot(d,up))/sin(${MOON_RADIUS});
    float z=sqrt(max(1.0-dot(q,q),0.0));
    vec3 n=right*q.x+up*q.y-uMoonDir*z;
    float incidence=dot(n,uSunDir),aa=max(fwidth(incidence),.008);
    float lit=smoothstep(-aa,aa,incidence);
    float diffuse=max(incidence,0.0)/max(max(incidence,0.0)+z,.03)*2.0;
    vec2 uv=vec2(.5+atan(q.x,max(z,1e-5))/(2.0*PI),.5-asin(clamp(q.y,-1.0,1.0))/PI);
    vec3 albedo=texture(uMoonSurface,uv).rgb;
    col=clamp(albedo*(lit*diffuse*.86+.018),0.0,.82)*moonMask;
  }
  // 只添加光盘，绝不以黑色圆盘覆盖前景云。月亮暗面的遮星在背景各层完成。
  float transmittance=clamp(texture(uCloud,vUv).a,0.0,1.0)*(1.0-wxSkyFogF(d));
  col*=transmittance*uAmount;
  // SDR screen 仅接受有界显示值；先在完整线性能量中应用云、遮挡与交接权重。
  if(uOutputHdr<.5)col=srgbOut(aces(max(col,vec3(0.0))));
  o=vec4(col,1);
}`;

// 泛光提取后、FINAL 前的有界光盘与太阳柔光；不乘曝光，不参与曝光积累或全局泛光。
// 与星空共用最终镜头雨滴折射；HDR 使用线性能量加法，过渡中的 SDR 保留 screen 合成。
export function createChartCelestials(gl, { makeProgram, use, set, tex }) {
  const program = makeProgram(VS_FULL, fragment, 'chart Sun and Moon');
  return {
    render(frame) {
      if (frame.amount <= 0) return;
      // 与旧太阳共用交接进度，避免虚拟暮光在一帧内跨过 HDR 区间时突然增强。
      const enhancement = Math.max(0, Math.min(1, frame.sunHandoff ?? (frame.hdr ? frame.hdrBlend ?? 1 : 0)));
      const pixelAngle = 2*frame.tan[1]/(frame.css || frame.res)[1];
      const initialWidth = Math.min(SUN_RADIUS*.65, pixelAngle*(frame.realistic ? 3 : 4.5));
      const targetWidth = Math.min(SUN_RADIUS*1.5, pixelAngle*(frame.realistic ? 6 : 8));
      const haloWidth = initialWidth + (targetWidth-initialWidth)*enhancement;
      const haloRadius = SUN_RADIUS + haloWidth;
      const bodies = [[frame.sun, haloRadius], [frame.moon, MOON_RADIUS * (frame.realistic ? 1 : 3.5)]]
        .map(([direction, radius]) => celestialDiscBounds(direction, radius, frame.basis, frame.tan, frame.res));
      if (!bodies.some(Boolean)) return;
      use(program);
      // 默认夜景调色较冷，单独校准太阳输入以保持暖白；写实、低饱和分别保留色调。
      const targetColor = !frame.realistic
        ? frame.lowSaturation ? [.96, .86, .68] : [1, .45, .05]
        : [.92, .89, .81];
      const sunColor = [.92, .89, .81].map((v,i) => v+(targetColor[i]-v)*enhancement);
      for (const [name, value] of Object.entries({ uR: frame.basis.r, uU: frame.basis.u, uF: frame.basis.f,
        uSunDir: frame.sun, uSunColor: sunColor, uMoonDir: frame.moon, uMoonNorth: frame.north, uMoonColor: chartMoonTint(frame.moonColor), uTan: frame.tan, uRes: frame.res,
        uAmount: frame.amount, uRealistic: frame.realistic ? 1 : 0, uSunEnhancement: enhancement, uSunHaloRadius: haloRadius, uOutputHdr: frame.hdr ? 1 : 0,
        uSunHaloVisible: solarDiscVisibility(frame.sun, frame.moon), uFogW: frame.fog, uFogSky: frame.fogSky })) {
        if (value.length === 4) { if (program.u[name]) gl.uniform4fv(program.u[name], value); }
        else set(program, name, value);
      }
      tex(program, 'uCloud', gl.TEXTURE_2D, frame.cloud); tex(program, 'uDepth', gl.TEXTURE_2D, frame.depth);
      tex(program, 'uMoonSurface', gl.TEXTURE_2D, frame.surface);
      gl.disable(gl.DEPTH_TEST); gl.depthMask(false); gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, frame.hdr ? gl.ONE : gl.ONE_MINUS_SRC_COLOR); gl.enable(gl.SCISSOR_TEST);
      bodies.forEach((bounds, body) => {
        if (!bounds) return;
        gl.scissor(...bounds); set(program, 'uBody', body); gl.drawArrays(gl.TRIANGLES, 0, 3);
      });
      gl.disable(gl.SCISSOR_TEST); gl.disable(gl.BLEND); gl.depthMask(true);
    },
  };
}
