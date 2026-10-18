import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLOUD_LAYER_METRES, localWeatherAtHeight } from '../src/rendering/weather-altitude.js';

test('云下保留局部天气，云顶以上停止降水和全空闪光', () => {
  const [base, top] = CLOUD_LAYER_METRES;
  for (const height of [-50, 2.2, 800, base]) {
    assert.deepEqual(localWeatherAtHeight(height), { precipitation: 1, skyFlash: 1 });
  }
  for (const height of [top, 4500, 6501.2]) {
    assert.deepEqual(localWeatherAtHeight(height), { precipitation: 0, skyFlash: 0 });
  }
  assert.equal(localWeatherAtHeight(2200).precipitation, 1);
  assert.ok(localWeatherAtHeight(2800).precipitation < .5);
  assert.equal(localWeatherAtHeight(3200).precipitation, 0);
});

test('按真实海拔连续渐退，升降可逆，云层边界无突变', () => {
  const [base, top] = CLOUD_LAYER_METRES;
  let previous = localWeatherAtHeight(base);
  const samples = [];
  for (let height = base; height <= top; height++) {
    const current = localWeatherAtHeight(height);
    for (const key of ['precipitation', 'skyFlash']) {
      assert.ok(current[key] >= 0 && current[key] <= previous[key]);
      assert.ok(previous[key] - current[key] < .003);
    }
    samples.push(current); previous = current;
  }
  samples.reverse().forEach((sample, i) => assert.deepEqual(localWeatherAtHeight(top - i), sample));
  const nearTop = localWeatherAtHeight(top - .1);
  assert.ok(nearTop.precipitation < 1e-6 && nearTop.skyFlash < 1e-6);
});
