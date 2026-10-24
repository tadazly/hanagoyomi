import { test } from 'node:test';
import assert from 'node:assert/strict';
import { celestialDiscBounds, chartMoonTint, solarDiscVisibility } from '../src/rendering/chart-celestials.js';
import { MOON_RADIUS, SUN_RADIUS } from '../src/rendering/night-sky.js';

const dot = (a, b) => a.reduce((sum, x, i) => sum + x * b[i], 0);
const normalize = a => a.map(x => x / Math.hypot(...a));
const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];

test('星图月光颜色保留色比并移除曝光强度，缺失月光时仍有稳定回退', () => {
  const radiance = [17273, 14041, 10055], tint = chartMoonTint(radiance);
  for (const exposure of [1e-8, .1, 1, 1e8]) {
    const scaled = chartMoonTint(radiance.map(x => x * exposure));
    scaled.forEach((x, i) => assert.ok(Math.abs(x - tint[i]) < 1e-12));
  }
  assert.ok(tint[0] > tint[1] && tint[1] > tint[2]);
  for (const value of [undefined, [0,0,0], [NaN,1,1], [-1,0,0]]) {
    const fallback = chartMoonTint(value);
    assert.ok(fallback.every(x => Number.isFinite(x) && x >= 0 && x <= 1));
    assert.equal(Math.max(...fallback), 1);
  }
});

test('太阳柔光随日食可见日面连续变化，满食为零，分离后为一', () => {
  const sun=[0,0,1], moon=angle=>[Math.sin(angle),0,Math.cos(angle)];
  assert.equal(solarDiscVisibility(sun,sun),0);
  assert.equal(solarDiscVisibility(sun,[0,0,-1]),1);
  let previous=0;
  // 与独立的日面面积数值积分对照，包含内切、外切及极小角距。
  for(const d of [1e-12,MOON_RADIUS-SUN_RADIUS, .004,.008,.012,.018,SUN_RADIUS+MOON_RADIUS, .05]) {
    const value=solarDiscVisibility(sun,moon(d));
    let covered=0,total=0;
    for(let i=0;i<400;i++)for(let j=0;j<400;j++) {
      const x=(i+.5)/400*2*SUN_RADIUS-SUN_RADIUS,y=(j+.5)/400*2*SUN_RADIUS-SUN_RADIUS;
      if(x*x+y*y<=SUN_RADIUS*SUN_RADIUS){total++;if((x-d)**2+y*y<=MOON_RADIUS*MOON_RADIUS)covered++;}
    }
    assert.ok(Number.isFinite(value)&&value>=previous&&value<=1);
    assert.ok(Math.abs(value-(1-covered/total))<.001,'日面面积不符');
    previous=value;
  }
});

test('日月局部光栅包围盒包含斜视椭圆与屏幕边缘，不画背后和地平线下的光盘', () => {
  const basis = { r:[1,0,0], u:[0,1,0], f:[0,0,1] }, res = [1280,720];
  for (const fov of [28,60,95]) for (const aspect of [.46,1,2.5]) {
    const t = Math.tan(fov*Math.PI/360), tan = [t*aspect,t];
    for (const x of [-1.01,-.8,0,.8,1.01]) for (const y of [.001,.6,1.01]) for (const radius of [SUN_RADIUS,MOON_RADIUS]) {
      const d = normalize([x*tan[0],y*tan[1],1]), up = normalize(cross(d,[1,0,0])), right = cross(up,d);
      const bounds = celestialDiscBounds(d,radius,basis,tan,res);
      for (let i=0;i<360;i++) {
        const angle=i*Math.PI/180;
        const p=d.map((v,k)=>v*Math.cos(radius)+Math.sin(radius)*(up[k]*Math.sin(angle)+right[k]*Math.cos(angle)));
        const px=(dot(p,basis.r)/dot(p,basis.f)/tan[0]*.5+.5)*res[0];
        const py=(dot(p,basis.u)/dot(p,basis.f)/tan[1]*.5+.5)*res[1];
        if(px>=0&&px<res[0]&&py>=0&&py<res[1]&&p[1]>=0) {
          assert.ok(bounds, '可见边缘被裁掉');
          assert.ok(px>=bounds[0]&&px<=bounds[0]+bounds[2]&&py>=bounds[1]&&py<=bounds[1]+bounds[3]);
        }
      }
    }
    assert.equal(celestialDiscBounds([0,0,-1],MOON_RADIUS,basis,tan,res),null);
    for (const d of [[1,0,0],[-1,0,0],[0,1,0]]) assert.equal(celestialDiscBounds(d,MOON_RADIUS,basis,tan,res),null);
    assert.equal(celestialDiscBounds(normalize([0,-.1,1]),MOON_RADIUS,basis,tan,res),null);
  }
});
