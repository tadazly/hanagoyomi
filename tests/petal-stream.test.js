import { test } from 'node:test';
import assert from 'node:assert/strict';
import { petalStreamOpacity, STREAM_FADE_START, STREAM_FADE_END } from '../src/rendering/petal-stream.js';

test('花瓣低空保留、云前隐去，越界高度仍输出有效不透明度', () => {
  for (const h of [-50, 1.2, 2.2, STREAM_FADE_START]) assert.equal(petalStreamOpacity(h), 1);
  for (const h of [STREAM_FADE_END, 800, 4500, 6501.2]) assert.equal(petalStreamOpacity(h), 0);
  assert.equal(petalStreamOpacity((STREAM_FADE_START + STREAM_FADE_END) / 2), .5);
});

test('逐米升降连续可逆，过渡端点没有斜率跳变', () => {
  let previous = 1;
  const samples = [];
  for (let h = STREAM_FADE_START; h <= STREAM_FADE_END; h++) {
    const opacity = petalStreamOpacity(h);
    assert.ok(opacity <= previous && opacity >= 0 && previous - opacity < .004);
    samples.push(opacity); previous = opacity;
  }
  samples.reverse().forEach((opacity, i) => assert.equal(petalStreamOpacity(STREAM_FADE_END - i), opacity));
  assert.ok(1 - petalStreamOpacity(STREAM_FADE_START + .1) < 1e-6);
  assert.ok(petalStreamOpacity(STREAM_FADE_END - .1) < 1e-6);
});
