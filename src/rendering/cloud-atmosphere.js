// 仅供写实云 LUT 和云前空气；宿主天空继续使用原积分。
export const DEFAULT_ATMOSPHERE = Object.freeze({
  rayleigh:[.005802,.013558,.0331],mie:.003996,mieExtinction:.0044,g:.8,
  ozone:[.000650,.001881,.000085],rayleighHeight:8,mieHeight:1.2,ozoneHeight:25,ozoneFalloff:15,top:100,
});

const scalar = key => `float atmo_${key}(){return ${Number(DEFAULT_ATMOSPHERE[key]).toPrecision(12)};}\n`;
const vector = key => `vec3 atmo_${key}(){return vec3(${DEFAULT_ATMOSPHERE[key].map(v=>Number(v).toPrecision(12)).join(',')});}\n`;
export const ATMOSPHERE_GLSL=`uniform int uCloudStyle;\n`
  +['rayleigh','ozone'].map(vector).join('')
  +['mie','mieExtinction','g','rayleighHeight','mieHeight','ozoneHeight','ozoneFalloff','top'].map(scalar).join('')
  +`vec3 atmoDensity(float h){return vec3(exp(-h/atmo_rayleighHeight()),exp(-h/atmo_mieHeight()),max(0.0,1.0-abs(h-atmo_ozoneHeight())/atmo_ozoneFalloff()));}\n`
  +`vec3 atmoExtinction(vec3 od){return atmo_rayleigh()*od.x+atmo_mieExtinction()*od.y+atmo_ozone()*od.z;}\n`
  +`float atmoMiePhase(float mu){float g=atmo_g(),g2=g*g;return 3.0/(8.0*PI)*(1.0-g2)*(1.0+mu*mu)/((2.0+g2)*pow(1.0+g2-2.0*g*mu,1.5));}\n`
  +`vec2 atmoInterval(vec3 ro,vec3 rd,float start,float end,int index,int count){
    float closest=clamp(-dot(ro-PC,rd),start,end);vec3 p=ro+rd*closest-PC;
    float r=length(p),mu=abs(dot(p,rd)/r),d=2.0*r+1.0;
    float scale=d/(sqrt(r*r*mu*mu+d)+r*mu);
    vec2 x=(vec2(start,end)-closest)/scale;
    vec2 a=sign(x)*log(abs(x)+sqrt(x*x+1.0));
    vec2 u=vec2(float(index),float(index+1))/float(count);
    vec2 y=mix(vec2(a.x),vec2(a.y),u);
    return clamp(closest+.5*scale*(exp(y)-exp(-y)),vec2(start),vec2(end));
  }\n`;
