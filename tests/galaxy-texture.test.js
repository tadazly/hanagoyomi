import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGalaxyTexture} from '../src/rendering/galaxy-texture.js';
function fixture(t){
 const saved={Image:globalThis.Image,document:globalThis.document,performance:globalThis.performance,warn:console.warn},images=[],uploads=[];let now=0,created=0;
 globalThis.Image=class{constructor(){images.push(this);this.width=4096;this.height=2048}removeAttribute(){}};
 globalThis.document={baseURI:'https://example.test/'};Object.defineProperty(globalThis,'performance',{configurable:true,value:{now:()=>now}});console.warn=()=>{};
 t.after(()=>{globalThis.Image=saved.Image;globalThis.document=saved.document;Object.defineProperty(globalThis,'performance',{configurable:true,value:saved.performance});console.warn=saved.warn});
 const gl={TEXTURE_2D:1,SRGB8_ALPHA8:2,RGBA:3,UNSIGNED_BYTE:4,MAX_TEXTURE_SIZE:5,
  createTexture:()=>++created,bindTexture(){},texImage2D(...a){uploads.push(a)},texParameteri(){},generateMipmap(){},isContextLost:()=>false,getParameter:()=>8192};
 const galaxy=createGalaxyTexture(gl,{high:'/high.webp',low:'/low.webp'});
 return{galaxy,images,uploads,created:()=>created,advance:ms=>{now+=ms}};
}
test('快速切档拒绝旧图片回调，只替换同一张GPU纹理并保留sRGB格式',t=>{
 const {galaxy,images,uploads,created}=fixture(t);galaxy.select('high');const stale=images[0].onload;galaxy.select('low');
 images[1].width=2048;images[1].height=1024;images[1].onload();const count=uploads.length;stale();
 assert.equal(uploads.length,count);assert.equal(created(),1);assert.equal(uploads.at(-1)[2],2);assert.equal(uploads.at(-1).at(-1).width,2048);
 for(let i=0;i<60;i++)galaxy.select('low');assert.equal(images.length,2);
});
test('网络失败保留现有纹理，有界退避重试，重新选择另一档后允许恢复',t=>{
 const {galaxy,images,uploads,advance}=fixture(t);galaxy.select('high');images[0].onload();const count=uploads.length;
 galaxy.select('low');images.at(-1).onerror();assert.equal(uploads.length,count);
 for(let i=0;i<60;i++)galaxy.select('low');assert.equal(images.length,2);
 advance(1001);galaxy.select('low');assert.equal(images.length,3);images.at(-1).onerror();
 advance(2001);galaxy.select('low');assert.equal(images.length,4);images.at(-1).onerror();
 advance(100000);for(let i=0;i<60;i++)galaxy.select('low');assert.equal(images.length,4);
 galaxy.select('high');images.at(-1).onload();galaxy.select('low');assert.equal(images.length,6);images.at(-1).onload();assert.equal(uploads.length,count+2);
});
