import { CELESTIAL_GLSL, LENS_DISTORTION_GLSL } from './shaders.js';
import { CONSTELLATIONS, CONSTELLATION_GROUPS } from '../data/constellations.js';
import { constellationAppearance, constellationSegments } from './constellation-lines.js';
import { constellationPhotometry, constellationGroupPhotometry } from './stellar-color.js';
import { constellationLabel, skyDirection } from './stargazing.js';

// SDR 标注层：在场景色调映射后合成，不进入曝光积累、景深与泛光。
// 可见性和拾取共用同一 GPU 程序；只在交互时读取 1 像素，PBO + fence 避免同步等待 GPU。
const common = `
uniform mat3 uEq;
uniform vec3 uR,uU,uF,uMoonDir,uSunDir;
uniform vec2 uTan,uRes,uPickPoint;
uniform float uPxScale,uAtmosphere,uLensOn,uImmersive,uEndpointI,uRawEndpointI,uRealistic,uHdr,uMoonWash,uHalo,uShow,uPick;
// 打包高亮、柔光、最亮星等和透明度，避免超过 WebGL2 最低顶点 uniform 配额。
uniform vec4 uGroup[88];
uniform sampler2D uCloud,uDepth,uSkyLut,uLens;
${CELESTIAL_GLSL}
vec4 project(vec3 d){float w=dot(d,uF);return vec4(dot(d,uR)/uTan.x,dot(d,uU)/uTan.y,w,w);}
float cloudVisibility(float t){return t*smoothstep(.04,.30,t);}
float clearReference(float magnitude){
 // 只传递星等参考，不把端点处的云遮挡扩大到整根线。
 float peak=uRealistic>.5?stellarFlux(magnitude,uRawEndpointI,uHdr>.5)/(6.28318530718*.7*.7):uRawEndpointI*pow(10.0,-.248*(magnitude-6.0));
 return peak*(1.0-smoothstep(6.25,6.5,magnitude));
}
vec4 pickProjection(vec4 p){if(uPick>.5)p.xy=(p.xy/p.w-uPickPoint)*uRes*p.w;return p;}
`;
const fragmentCommon = `
${LENS_DISTORTION_GLSL}
vec3 direction(vec2 uv){vec2 n=uv*2.0-1.0;return normalize(uF+n.x*uTan.x*uR+n.y*uTan.y*uU);}
float discVisibility(vec2 uv){
 uv=clamp(uv,0.0,1.0);
 vec3 d=direction(uv);float pixel=2.0*uTan.y/uRes.y;
 return (1.0-discMask(d,uMoonDir,.0115,pixel))*(1.0-(1.0-uAtmosphere)*discMask(d,uSunDir,.0095,pixel));
}
float lunar(vec2 uv){
 float clear=discVisibility(uv);
 if(uLensOn<.5)return clear;
 vec4 water=texture(uLens,uv);float wet=water.a;
 if(wet<=.004)return clear;
 vec2 n,sampleUV=lensSampleUV(uv,water,uRes,n),bo=lensBlurOffset(uRes);
 float blur=(discVisibility(sampleUV)+discVisibility(sampleUV+bo)+discVisibility(sampleUV-bo)
  +discVisibility(sampleUV+vec2(bo.x,-bo.y))+discVisibility(sampleUV+vec2(-bo.x,bo.y)))*.2;
 return mix(clear,blur,wet);
}
float visibility(vec2 uv,vec3 d,float reference,float highlight){
 if(texture(uDepth,uv).r<1.0) return 0.0;
 float h=smoothstep(0.0,.035,d.y)*lunar(uv);
 if(uImmersive<.0001)return h;
 float t=clamp(texture(uCloud,uv).a,0.0,1.0);
 float ext=mix(1.0,uRealistic>.5?stellarExtinction(d.y):exp(-.28/max(d.y,.035)),uAtmosphere);
 float peak=reference*ext;
 float energy=peak*t*(uRealistic>.5?.65:.55);
 if(uRealistic>.5){
  if(uHdr<.5){
   vec2 skyUV=vec2(atan(d.x,d.z)/6.28318530718+.5,.5+.5*sign(d.y)*sqrt(abs(asin(clamp(d.y,-1.0,1.0)))/1.57079632679));
   float skyL=dot(textureLod(uSkyLut,skyUV,0.0).rgb,vec3(.2126,.7152,.0722))*uAtmosphere;
   energy*=stellarContrast(peak,skyL);
  }
  energy*=stellarMoonGlare(d,uMoonDir,uMoonWash);
 }
 float displayed=energy*uEndpointI/max(uRawEndpointI,1e-20);
 // 每个片元在自己的云透射率下先于参考恒星淡出；不跟随长曝光积累。
 float visible=cloudVisibility(t)*min(smoothstep(.0004,.001,energy),smoothstep(.002,.018,displayed));
 // 高亮统一亮度，只保留逐像素云遮挡，不再随星等、大气消光及月光改变。
 return h*mix(1.0,mix(visible,cloudVisibility(t),highlight),uImmersive);
}
vec2 screenUV(){return uPick>.5?uPickPoint*.5+.5:gl_FragCoord.xy/uRes;}
`;
const lineVS = `#version 300 es
precision highp float;precision highp sampler2D;
layout(location=0) in vec4 aStart;layout(location=1) in vec4 aEnd;layout(location=2) in float aGroup;
layout(location=3) in vec4 aSource;layout(location=4) in vec4 aTarget;
uniform vec2 uGap;uniform float uWidth;
out float vAcross,vAlong,vMix;flat out vec4 vSource,vTarget;flat out vec2 vStartUV,vEndUV;flat out float vLength,vReference,vHighlight,vGroup,vGlow;
${common}
void main(){
 vec4 a=project(uEq*aStart.xyz),b=project(uEq*aEnd.xyz);
 vSource=aSource;vTarget=aTarget;vMix=0.0;vStartUV=vec2(0);vEndUV=vec2(0);
 gl_Position=vec4(2,2,2,1);vAcross=0.0;vAlong=0.0;vLength=0.0;
 vHighlight=uGroup[int(aGroup)].x;vGroup=aGroup;vGlow=uGroup[int(aGroup)].y;vReference=0.0;
 if(uHalo>.5&&vGlow<.001)return;
 vReference=clearReference(uGroup[int(aGroup)].z);
 if(max(a.w,b.w)<=.001)return;
 vec2 gap=(uGap.x+uGap.y*clamp((5.0-vec2(aStart.w,aEnd.w))/6.0,0.0,1.0))*uPxScale;
 if(a.w<.001){float t=(.001-a.w)/(b.w-a.w);a=mix(a,b,t);vSource=mix(vSource,vTarget,t);gap.x=0.0;}
 if(b.w<.001){float t=(.001-b.w)/(a.w-b.w);b=mix(b,a,t);vTarget=mix(vTarget,vSource,t);gap.y=0.0;}
 vStartUV=a.xy/a.w*.5+.5;vEndUV=b.xy/b.w*.5+.5;
 vec2 delta=(vEndUV-vStartUV)*uRes;float len=length(delta);
 vLength=len-gap.x-gap.y;if(vLength<=0.0)return;
 vec2 tangent=delta/len,normal=vec2(-tangent.y,tangent.x);
 bool end=gl_VertexID==1||gl_VertexID==2||gl_VertexID==4;
 float side=gl_VertexID==0||gl_VertexID==1||gl_VertexID==3?-1.0:1.0;
 vec4 p=end?b:a;float across=side*(.5*uWidth*uPxScale+.75);
 float extension=uPick>.5?.5*uWidth*uPxScale:0.0;
 p.xy+=(normal*across+tangent*(end?-gap.y+extension:gap.x-extension))*2.0/uRes*p.w;
 vMix=(end?1.0:0.0)*p.w;
 vAcross=across*p.w;vAlong=(end?vLength+extension:-extension)*p.w;gl_Position=pickProjection(p);
}`;
const lineFS = `#version 300 es
precision highp float;precision highp sampler2D;
in float vAcross,vAlong,vMix;flat in vec4 vSource,vTarget;flat in vec2 vStartUV,vEndUV;flat in float vLength,vReference,vHighlight,vGroup,vGlow;
uniform float uWidth,uOpacity;
out vec4 o;
${common}
${fragmentCommon}
void main(){
 vec2 uv=screenUV(),sampleUV=uv;
 if(uPick>.5){
  vec2 segment=(vEndUV-vStartUV)*uRes,offset=(uv-vStartUV)*uRes;
  float nearest=clamp(dot(offset,segment)/max(dot(segment,segment),1e-8),0.0,1.0);
  sampleUV=mix(vStartUV,vEndUV,nearest);
 }
 float visible=visibility(sampleUV,direction(sampleUV),vReference,vHighlight)*uShow;
 float coverage=1.0;
 if(uPick>.5){
  float along=vAlong*gl_FragCoord.w;
  float distance=length(vec2(vAcross*gl_FragCoord.w,max(0.0,max(-along,along-vLength))));
  if(distance>.5*uWidth*uPxScale)discard;
  // 单像素深度选择最近的可见线段，避免扩大区域交叠时按绘制顺序抢占。
  gl_FragDepth=.005+.99*distance/(.5*uWidth*uPxScale);
 }
 if(uPick<.5){
  coverage=1.0-smoothstep(.5*uWidth*uPxScale-.65,.5*uWidth*uPxScale+.65,abs(vAcross*gl_FragCoord.w));
  coverage*=smoothstep(0.0,.8*uPxScale,min(vAlong*gl_FragCoord.w,vLength-vAlong*gl_FragCoord.w));
 }
 float t=clamp(vMix*gl_FragCoord.w,0.0,1.0);
 float intrinsic=mix(uGroup[int(vGroup)].w,1.0,vHighlight);
 float alpha=coverage*visible*intrinsic*min(.88,uOpacity*(1.0+vHighlight*1.8));
 if(uHalo>.5){
  float distance=abs(vAcross*gl_FragCoord.w)/uPxScale;
  alpha=exp(-distance*distance/3.2)*visible*intrinsic*vGlow*min(.09,uOpacity*.28);
  alpha*=smoothstep(0.0,1.2*uPxScale,min(vAlong*gl_FragCoord.w,vLength-vAlong*gl_FragCoord.w));
 }
 if(alpha<.004)discard;
 if(uPick>.5){if(visible<.04)discard;o=vec4((vGroup+1.0)/255.0,0,0,1);}
 else{
  // 在线性能量中插值颜色；高亮只轻微趋白，保留原恒星的冷暖差异。
  vec3 color=pow(mix(pow(vSource.rgb,vec3(2.2)),pow(vTarget.rgb,vec3(2.2)),t),vec3(1.0/2.2))*.88;
  o=vec4(mix(color,vec3(.94),vHighlight*.18),alpha);
 }
}`;
const labelVS = `#version 300 es
precision highp float;precision highp sampler2D;
layout(location=0) in vec4 aAnchor;layout(location=1) in vec4 aRect;
layout(location=2) in vec2 aSize;layout(location=3) in vec4 aProxy;layout(location=4) in vec4 aProxyEnd;layout(location=5) in float aGroup;
uniform float uFont;uniform float uLabelVisible[88];
out vec2 vUV;flat out vec2 vAnchor;flat out float vVisible,vReference,vHighlight,vGroup;
${common}
void main(){
 vec3 d=uEq*aAnchor.xyz;vec4 p=project(d);
 vVisible=uLabelVisible[int(aGroup)];vReference=clearReference(max(aProxy.w,aProxyEnd.w));
 vHighlight=uGroup[int(aGroup)].x;vGroup=aGroup;
 vAnchor=p.xy/max(.001,p.w)*.5+.5;
 vec2 q=vec2(gl_VertexID==1||gl_VertexID==2||gl_VertexID==4?1.0:0.0,gl_VertexID==2||gl_VertexID==4||gl_VertexID==5?1.0:0.0);
 vUV=mix(aRect.xy,aRect.zw,vec2(q.x,1.0-q.y));
 if(p.w<=.001||d.y<=0.0){gl_Position=vec4(2,2,2,1);return;}
 p.xy+=(q-.5)*aSize*uFont/28.0*uPxScale*2.0/uRes*p.w;
 gl_Position=pickProjection(p);
}`;
const labelFS = `#version 300 es
precision highp float;precision highp sampler2D;
in vec2 vUV;flat in vec2 vAnchor;flat in float vVisible,vReference,vHighlight,vGroup;
uniform sampler2D uAtlas;uniform float uOpacity;uniform vec3 uColor;
out vec4 o;
${common}
${fragmentCommon}
void main(){
 float visible=visibility(screenUV(),direction(screenUV()),vReference,0.0)*vVisible*uShow;
 if(texture(uDepth,vAnchor).r<1.0)visible=0.0;
 float glyph=texture(uAtlas,vUV).r;
 float alpha=glyph*visible*min(.95,uOpacity*(1.0+vHighlight));
 if(uPick>.5){if(visible<.04)discard;gl_FragDepth=0.0;o=vec4((vGroup+1.0)/255.0,0,0,1);}
 else{if(alpha<.004)discard;o=vec4(mix(uColor,vec3(.96,.91,.72),vHighlight*.72),alpha);}
}`;
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
export function createConstellationOverlay(gl, api, directions, stars, catalogs = {}) {
 const {makeProgram,use,set,tex}=api;
 const lines=makeProgram(lineVS,lineFS,'constellation overlay'),labels=makeProgram(labelVS,labelFS,'constellation labels');
 const segments=constellationSegments(directions,stars),data=new Float32Array(CONSTELLATION_GROUPS.length*17);
 const centers=CONSTELLATIONS.map(()=>[0,0,0]),proxies=CONSTELLATIONS.map(()=>[0,0,1,99,0,0,1,99]);
 for(let i=0;i<CONSTELLATION_GROUPS.length;i++){
  const group=CONSTELLATION_GROUPS[i];data.set(segments.subarray(i*8,i*8+8),i*17);data[i*17+8]=group;
  data.set([1,1,1,1,1,1,1,1],i*17+9);
  for(let end=0;end<2;end++){
   const star=segments.subarray(i*8+end*4,i*8+end*4+4);
   for(let k=0;k<3;k++)centers[group][k]+=star[k];

  }
  const pair=Array.from(segments.subarray(i*8,i*8+8));
  if(Math.max(pair[3],pair[7])<Math.max(proxies[group][3],proxies[group][7]))proxies[group]=pair;
 }
 for(const center of centers){const len=Math.hypot(...center);for(let k=0;k<3;k++)center[k]/=len;}
 function vao(bufferData,attributes,stride,usage){
  const vao=gl.createVertexArray(),buffer=gl.createBuffer();gl.bindVertexArray(vao);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,bufferData,usage);
  for(const [loc,size,offset]of attributes){gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,size,gl.FLOAT,false,stride*4,offset*4);gl.vertexAttribDivisor(loc,1);}
  gl.bindVertexArray(null);return {vao,buffer};
 }
 const line=vao(data,[[0,4,0],[1,4,4],[2,1,8],[3,4,9],[4,4,13]],17,gl.DYNAMIC_DRAW);
 let activeCatalog=null,groupPhotometry=null;
 const photometryCache=new WeakMap();
 function catalogPhotometry(catalog){
  if(!photometryCache.has(catalog)){
   const photometry=constellationPhotometry(directions,catalog.positions,catalog.colors);
   photometryCache.set(catalog,{...photometry,...constellationGroupPhotometry(photometry,CONSTELLATION_GROUPS,88),
    highlights:new Float32Array(catalog.positions.length/4),previous:new Float32Array(88).fill(-1)});
  }
  return photometryCache.get(catalog);
 }
 function updatePhotometry(style){
  const catalog=catalogs[style]||catalogs.default;
  if(!catalog||catalog===activeCatalog)return;
  activeCatalog=catalog;
  groupPhotometry=catalogPhotometry(catalog);
  const photometry=groupPhotometry.data;
  for(let i=0;i<CONSTELLATION_GROUPS.length;i++)data.set(photometry.subarray(i*8,i*8+8),i*17+9);
  gl.bindBuffer(gl.ARRAY_BUFFER,line.buffer);gl.bufferSubData(gl.ARRAY_BUFFER,0,data);
 }
 const labelData=new Float32Array(88*19),label=vao(labelData,[[0,4,0],[1,4,4],[2,2,8],[3,4,10],[4,4,14],[5,1,18]],19,gl.DYNAMIC_DRAW);
 const atlas=gl.createTexture(),pickTexture=gl.createTexture(),pickFbo=gl.createFramebuffer(),pickDepth=gl.createRenderbuffer(),pbo=gl.createBuffer();
 gl.bindTexture(gl.TEXTURE_2D,pickTexture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
 gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
 gl.bindFramebuffer(gl.FRAMEBUFFER,pickFbo);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,pickTexture,0);
 gl.bindRenderbuffer(gl.RENDERBUFFER,pickDepth);gl.renderbufferStorage(gl.RENDERBUFFER,gl.DEPTH_COMPONENT16,1,1);gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.RENDERBUFFER,pickDepth);
 gl.bindRenderbuffer(gl.RENDERBUFFER,null);gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.bindBuffer(gl.PIXEL_PACK_BUFFER,pbo);gl.bufferData(gl.PIXEL_PACK_BUFFER,4,gl.STREAM_DRAW);gl.bindBuffer(gl.PIXEL_PACK_BUFFER,null);
 const highlight=new Float32Array(88),glow=new Float32Array(88),groupUniforms=new Float32Array(88*4),labelVisible=new Float32Array(88),sizes=Array.from({length:88},()=>[0,0]);
 let atlasKey='',hover=-1,selected=-1,request=null,pending=null,serial=0,cancelGeneration=0,selectSequence=0,show=0,immersive=1,lastPickAt=-Infinity;
 const pixels=new Uint8Array(4);
 function updateAtlas(language,bilingual){
  const key=language+':'+bilingual;if(atlasKey===key)return;atlasKey=key;
  const canvas=document.createElement('canvas');canvas.width=2048;canvas.height=1024;const ctx=canvas.getContext('2d');
  ctx.fillStyle='#fff';ctx.textAlign='center';ctx.textBaseline='middle';
  CONSTELLATIONS.forEach((item,i)=>{
   const text=constellationLabel(item,language,bilingual),x=i%8*256,y=Math.floor(i/8)*88;
   let width=0;
   text.forEach((name,row)=>{ctx.font=`${row?22:28}px system-ui,sans-serif`;width=Math.max(width,ctx.measureText(name).width);ctx.fillText(name,x+128,y+(text.length===1?44:row?64:30),244);});
   sizes[i]=[Math.min(252,width+12),text.length===1?42:80];
   const [w,h]=sizes[i];labelData.set([...centers[i],0,(x+128-w/2)/2048,(y+44-h/2)/1024,(x+128+w/2)/2048,(y+44+h/2)/1024,w,h,...proxies[i],i],i*19);
  });
  gl.bindTexture(gl.TEXTURE_2D,atlas);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);
  const rgba=ctx.getImageData(0,0,2048,1024).data,alpha=new Uint8Array(2048*1024);
  for(let i=0;i<alpha.length;i++)alpha[i]=rgba[i*4+3];
  gl.texImage2D(gl.TEXTURE_2D,0,gl.R8,2048,1024,0,gl.RED,gl.UNSIGNED_BYTE,alpha);
  for(const param of[gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,param,gl.LINEAR);
  for(const param of[gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,param,gl.CLAMP_TO_EDGE);
  gl.bindBuffer(gl.ARRAY_BUFFER,label.buffer);gl.bufferSubData(gl.ARRAY_BUFFER,0,labelData);
 }
 function poll(onPick){
  if(!pending)return;
  const result=gl.clientWaitSync(pending.fence,0,0);if(result===gl.TIMEOUT_EXPIRED)return;
  gl.deleteSync(pending.fence);
  if(result!==gl.WAIT_FAILED){
   gl.bindBuffer(gl.PIXEL_PACK_BUFFER,pbo);gl.getBufferSubData(gl.PIXEL_PACK_BUFFER,0,pixels);gl.bindBuffer(gl.PIXEL_PACK_BUFFER,null);
   if(pending.serial===serial || (pending.kind==='select' && pending.cancelGeneration===cancelGeneration && pending.selectSequence===selectSequence)){const id=pixels[0]-1;if(pending.kind==='select')selected=id;else hover=id;onPick?.(id,pending.kind);}
  }
  pending=null;
 }
 function clear(){serial++;cancelGeneration++;request=null;hover=-1;selected=-1;}
 function labelLayout(frame,dt){
  const placed=[],order=Array.from({length:88},(_,i)=>i).sort((a,b)=>(b===selected?2:b===hover?1:0)-(a===selected?2:a===hover?1:0));
  for(const i of order){
   const d=skyDirection(frame.eq,centers[i]),z=dot(d,frame.basis.f);
   const x=(dot(d,frame.basis.r)/frame.tan[0]/Math.max(.001,z)*.5+.5)*frame.css[0],y=(.5-dot(d,frame.basis.u)/frame.tan[1]/Math.max(.001,z)*.5)*frame.css[1];
   const w=sizes[i][0]*frame.settings.constelFont/28,h=sizes[i][1]*frame.settings.constelFont/28;
   const box={l:x-w/2-5,r:x+w/2+5,t:y-h/2-4,b:y+h/2+4};
   let visible=frame.settings.constelNames&&z>.001&&d[1]>0&&box.l>8&&box.r<frame.css[0]-8&&box.t>8&&box.b<frame.css[1]-8;
   if(visible&&placed.some(a=>box.l<a.r&&box.r>a.l&&box.t<a.b&&box.b>a.t))visible=false;
   if(visible)placed.push(box);
   labelVisible[i]+=(+visible-labelVisible[i])*(1-Math.exp(-dt*8));
  }
 }
 function uniforms(program,frame,pick){
  use(program);gl.uniformMatrix3fv(program.u.uEq,false,frame.eq);
  set(program,'uR',frame.basis.r);set(program,'uU',frame.basis.u);set(program,'uF',frame.basis.f);
  set(program,'uSunDir',frame.sun||[0,-1,0]);set(program,'uMoonDir',frame.moon);set(program,'uTan',frame.tan);set(program,'uRes',frame.res);
  set(program,'uLensOn',frame.lens?1:0);set(program,'uPxScale',frame.res[0]/frame.css[0]);set(program,'uAtmosphere',frame.atmosphere);
  set(program,'uImmersive',immersive);set(program,'uHalo',0);set(program,'uEndpointI',frame.endpointI);set(program,'uRawEndpointI',frame.rawEndpointI);set(program,'uHdr',frame.hdr?1:0);set(program,'uMoonWash',frame.moonWash);set(program,'uRealistic',frame.settings.nightSkyStyle==='realistic'?1:0);
  set(program,'uShow',show);set(program,'uPick',pick?1:0);set(program,'uPickPoint',pick?[pick.x/frame.css[0]*2-1,1-pick.y/frame.css[1]*2]:[0,0]);
  gl.uniform4fv(program.u.uGroup,groupUniforms);
  if(frame.lens)tex(program,'uLens',gl.TEXTURE_2D,frame.lens);tex(program,'uCloud',gl.TEXTURE_2D,frame.cloud);tex(program,'uDepth',gl.TEXTURE_2D,frame.depth);tex(program,'uSkyLut',gl.TEXTURE_2D,frame.sky);
 }
 return {
  centers,
  get selected(){return selected;},get hover(){return hover;},
  clear,
  select(id){selected=id;},
  cancelPick(){serial++;cancelGeneration++;request=null;hover=-1;},
  clearHover(){serial++;hover=-1;if(request?.kind==='hover')request=null;},
  requestPick(x,y,kind='hover',pointerType='mouse'){if(request?.kind==='select'&&kind==='hover')return;request={x,y,kind,pointerType,serial:++serial,cancelGeneration,selectSequence:kind==='select'?++selectSequence:selectSequence};},
  update(settings,dt,onPick){
   poll(onPick);
   const enabled=settings.constel||settings.stargazing;
   // 悬浮移入快速响应；移出渐暗、点击选中与选中柔光保持原速。
   for(let i=0;i<88;i++){
    const active=enabled&&(i===hover||i===selected),rate=i===hover&&i!==selected?32:9;
    highlight[i]+=(+active-highlight[i])*(1-Math.exp(-dt*rate));
    if(Math.abs(+active-highlight[i])<.0001)highlight[i]=+active;
    glow[i]+=((enabled&&i===selected?1:0)-glow[i])*(1-Math.exp(-dt*7));
   }
  },
  updateStars(catalog){
   const state=catalogPhotometry(catalog);
   if(!highlight.some((value,i)=>value!==state.previous[i]))return;
   state.previous.set(highlight);state.highlights.fill(0);
   state.members.forEach((members,group)=>{if(highlight[group]>0)for(const index of members)state.highlights[index]=Math.max(state.highlights[index],highlight[group]);});
   gl.bindBuffer(gl.ARRAY_BUFFER,catalog.highlightBuffer);gl.bufferSubData(gl.ARRAY_BUFFER,0,state.highlights);
  },
  render(frame,dt){
   const enabled=frame.settings.constel||frame.settings.stargazing;
   if(!enabled&&show<.001){show=0;return;}
   show+=(+enabled-show)*(1-Math.exp(-dt*7));
   immersive+=((frame.settings.constelStyle==='immersive'?1:0)-immersive)*(1-Math.exp(-dt*7));
   updateAtlas(frame.language,frame.settings.constelBilingual);updatePhotometry(frame.settings.nightSkyStyle);labelLayout(frame,dt);
   for(let i=0;i<88;i++)groupUniforms.set([highlight[i],glow[i],groupPhotometry.magnitudes[i],groupPhotometry.brightness[i]],i*4);
   const appearance=constellationAppearance(frame.settings.nightSkyStyle,...frame.css,frame.sunAltitude);
   const visibility=mixVisibility(frame,appearance.visibility,immersive);
   const drawLayer=pick=>{
    const oldShow=show;show*=visibility;
    uniforms(lines,frame,pick);set(lines,'uGap',pick?[0,0]:appearance.gap);
    set(lines,'uWidth',pick?(pick.pointerType==='touch'?56:40):appearance.width*frame.settings.constelWidth);
    set(lines,'uColor',appearance.color);set(lines,'uOpacity',(frame.settings.nightSkyStyle==='realistic'?.19:.23)*frame.settings.constelClarity);
    gl.bindVertexArray(line.vao);
    if(!pick&&glow.some(x=>x>.001)){
     set(lines,'uHalo',1);set(lines,'uWidth',appearance.width*frame.settings.constelWidth+4);
     gl.drawArraysInstanced(gl.TRIANGLES,0,6,743);set(lines,'uHalo',0);set(lines,'uWidth',appearance.width*frame.settings.constelWidth);
    }
    gl.drawArraysInstanced(gl.TRIANGLES,0,6,743);
    if(frame.settings.constelNames||labelVisible.some(x=>x>.001)){
     uniforms(labels,frame,pick);set(labels,'uFont',frame.settings.constelFont);
     set(labels,'uColor',appearance.color);set(labels,'uOpacity',.52*frame.settings.constelClarity);
     gl.uniform1fv(labels.u.uLabelVisible,labelVisible);tex(labels,'uAtlas',gl.TEXTURE_2D,atlas);
     gl.bindVertexArray(label.vao);gl.drawArraysInstanced(gl.TRIANGLES,0,6,88);
    }
    show=oldShow;
   };
   gl.disable(gl.DEPTH_TEST);gl.depthMask(false);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
   drawLayer(null);gl.disable(gl.BLEND);
   if(request&&!pending&&(request.kind==='select'||frame.now-lastPickAt>32)){
    const pick=request;request=null;lastPickAt=frame.now;
    gl.bindFramebuffer(gl.FRAMEBUFFER,pickFbo);gl.viewport(0,0,1,1);gl.clearColor(0,0,0,0);gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LESS);gl.depthMask(true);gl.clearDepth(1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    drawLayer(pick);gl.disable(gl.DEPTH_TEST);gl.bindBuffer(gl.PIXEL_PACK_BUFFER,pbo);gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,0);gl.bindBuffer(gl.PIXEL_PACK_BUFFER,null);
    pending={...pick,fence:gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE,0)};gl.flush();
    gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,...frame.res);
   }
   gl.bindVertexArray(null);gl.depthMask(true);
  },
  dispose(){if(pending)gl.deleteSync(pending.fence);for(const p of[lines,labels])gl.deleteProgram(p.p);for(const t of[atlas,pickTexture])gl.deleteTexture(t);gl.deleteFramebuffer(pickFbo);gl.deleteRenderbuffer(pickDepth);for(const b of[line.buffer,label.buffer,pbo])gl.deleteBuffer(b);for(const v of[line.vao,label.vao])gl.deleteVertexArray(v);},
 };
}
function mixVisibility(frame,night,immersive){
 // “始终显示”是图解层；沉浸随大气日光和云淡出，仍始终保留地形及月盘遮挡。
 const day=1-immersive+immersive*night;
 return 1-frame.atmosphere+frame.atmosphere*day;
}
