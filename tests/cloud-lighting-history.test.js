import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cloudLightBlend, cloudLightTemporalChange } from '../src/rendering/cloud-lighting-history.js';

test('光照历史按秒收敛，切片频率变化不把旧天气保留几十秒', () => {
  for (const changing of [false,true]) {
    const residual = hz => {
      let old=1;
      for(let i=0;i<hz;i++)old*=1-cloudLightBlend(1/hz,changing);
      return old;
    };
    assert.ok(Math.abs(residual(60)-residual(30))<1e-12);
    assert.ok(Math.abs(residual(30)-residual(4))<1e-12);
    assert.ok(residual(4)<.02);
  }
  assert.ok(cloudLightBlend(.25,true)>.95);
  assert.equal(cloudLightBlend(0),0);
  assert.equal(cloudLightBlend(-1),0);
});

test('写实云TAA按实际光照连续响应，不因天气缓存刷新在权重两端跳换',()=>{
  const light=[0,1,0,20,20,20,1,1.2,1.4,.7,.8,.9];
  assert.equal(cloudLightTemporalChange(null,light),0);
  assert.equal(cloudLightTemporalChange(light,light.slice()),0);
  const small=light.slice();small[9]+=.001;
  assert.ok(cloudLightTemporalChange(light,small)>0);
  assert.ok(cloudLightTemporalChange(light,small)<.01);
  const large=light.slice();large[3]=1;
  assert.equal(cloudLightTemporalChange(light,large),.25);
  const turn=light.slice();turn[0]=1;turn[1]=0;
  assert.equal(cloudLightTemporalChange(light,turn),.25);
  assert.ok(Number.isFinite(cloudLightTemporalChange(new Array(12).fill(0),new Array(12).fill(0))));
});
