import {test} from 'node:test';
import assert from 'node:assert/strict';
import {getAstronomy} from '../src/world/astronomy.js';
import {equatorialToWorld,equatorialToGalactic} from '../src/rendering/celestial-coordinates.js';
const loc={lat:35.6762,lon:139.6503,tz:'Asia/Tokyo'},rad=Math.PI/180;
const mul=(m,v)=>[0,1,2].map(i=>m[i]*v[0]+m[i+3]*v[1]+m[i+6]*v[2]);
const vector=(ra,dec)=>[Math.cos(dec*rad)*Math.cos(ra*rad),Math.cos(dec*rad)*Math.sin(ra*rad),Math.sin(dec*rad)];
test('CPU 双精度矩阵保证逐秒天球旋转连续',()=>{
 for(const year of [1900,2000,2026,2100,2199]){
  let prev=null;
  for(let i=0;i<240;i++){
   const a=getAstronomy(Date.UTC(year,7,12,14,0,i),loc);
   const d=mul(equatorialToWorld(a.lst,loc.lat),vector(266.4051,-28.936175));
   if(prev){const angle=Math.hypot(...d.map((v,j)=>v-prev[j]));assert.ok(angle>1e-5&&angle<8e-5)}prev=d;
  }
 }
});
test('同一赤道矩阵映射日月与真星，旋转世界不改变天体相对角距',()=>{
 for(const latitude of [-75,0,35.6762,75])for(const rotation of [0,91,317]){
  const a=getAstronomy(Date.parse('2026-08-12T14:00Z'),{...loc,lat:latitude},rotation),m=equatorialToWorld(a.lst,latitude,rotation);
  for(const d of [[1,0,0],[0,1,0],[0,0,1]])assert.ok(Math.abs(Math.hypot(...mul(m,d))-1)<1e-7);
  const x=mul(m,vector(266.4051,-28.936175));const H=a.lst-266.4051*rad,p=latitude*rad,dec=-28.936175*rad;
  const alt=Math.asin(Math.sin(p)*Math.sin(dec)+Math.cos(p)*Math.cos(dec)*Math.cos(H));assert.ok(Math.abs(x[1]-Math.sin(alt))<1e-7);
 }
});
test('IAU银道中心/北极与常用参考星坐标相符，防止纹理翻转或额外旋转',()=>{
 const g=equatorialToGalactic(vector(266.4049948,-28.9361740));assert.ok(g[0]>.999999&&Math.abs(g[1])<1e-7&&Math.abs(g[2])<1e-7);
 const pole=equatorialToGalactic(vector(192.85948,27.12825));assert.ok(pole[2]>.999999);
 const sirius=equatorialToGalactic(vector(101.28715533,-16.71611586));
 let l=Math.atan2(sirius[1],sirius[0])/rad;if(l<0)l+=360;const b=Math.asin(sirius[2])/rad;
 assert.ok(Math.abs(l-227.2303)<.001);assert.ok(Math.abs(b+8.8903)<.001);
});
