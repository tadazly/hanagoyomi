import { FIREFLY_VS } from '../../src/rendering/shaders.js';
import { TN, tnData, groundH } from '../../src/rendering/terrain.js';
import { splitAnimationTime, wrap } from '../../src/rendering/animation-time.js';

// 在 Vite 页面/Playwright 中调用 runFireflyHeightRegression()。
// 使用生产顶点着色器与真实 R16F 地形，测量最终世界高度，不能用平地或 hgt 代替。
export function runFireflyHeightRegression({ legacyTerrain = false, frames = 180 } = {}) {
  const gl = document.createElement('canvas').getContext('webgl2');
  if (!gl) throw new Error('萤火虫高度回归需要真实 WebGL2 上下文');
  const shaders = [];
  let program, texture, buffer;
  try {
    const compile = (type, source) => {
      const shader = gl.createShader(type); shaders.push(shader);
      gl.shaderSource(shader, source); gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
      return shader;
    };
    const source = legacyTerrain ? FIREFLY_VS.replace('terrainContinuousH(uCamM.xz + rel, 0.0)', 'terrainH(uCamM.xz + rel, 0.0)') : FIREFLY_VS;
    const vertex = source.replace('void main(){', 'out vec4 probePosition;\nout float probeHeight;\nvoid main(){')
      .replace('gl_Position = project(p);', 'probePosition = vec4(p + uCamM, vI); probeHeight = hgt;\ngl_Position = project(p);');
    if (!vertex.includes('probeHeight = hgt;')) throw new Error('萤火虫高度采样点缺失');
    program = gl.createProgram();
    gl.attachShader(program, compile(gl.VERTEX_SHADER, vertex));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, '#version 300 es\nprecision highp float; out vec4 o; void main(){ o = vec4(1); }'));
    gl.transformFeedbackVaryings(program, ['probePosition', 'probeHeight'], gl.INTERLEAVED_ATTRIBS);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    gl.useProgram(program);
    const uniform = name => gl.getUniformLocation(program, name);
    for (const [name, value] of [['uFBox', 60], ['uFlyI', 1], ['uPxScale', 1]]) gl.uniform1f(uniform(name), value);
    gl.uniform2f(uniform('uTanS'), 1, 1); gl.uniform2f(uniform('uDepthAB'), 1, -.1);
    gl.uniform3f(uniform('uR'), 1, 0, 0); gl.uniform3f(uniform('uU'), 0, 1, 0); gl.uniform3f(uniform('uF'), 0, 0, 1);
    texture = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, TN, TN, 0, gl.RED, gl.FLOAT, tnData);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.uniform1i(uniform('uTerr'), 0);
    const count = 600, stride = 5;
    buffer = gl.createBuffer(); gl.bindBuffer(gl.TRANSFORM_FEEDBACK_BUFFER, buffer);
    gl.bufferData(gl.TRANSFORM_FEEDBACK_BUFFER, count * stride * 4, gl.DYNAMIC_READ);
    gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, buffer); gl.enable(gl.RASTERIZER_DISCARD);
    const sample = (time, x, z) => {
      const { whole, fraction } = splitAnimationTime(time);
      gl.uniform1ui(uniform('uTimeWhole'), whole); gl.uniform1f(uniform('uTimeFraction'), fraction);
      gl.uniform2f(uniform('uFlyOffset'), wrap(Math.cos(.6) * time * .072, 60), wrap(Math.sin(.6) * time * .072, 60));
      gl.uniform3f(uniform('uCamM'), x, groundH(x, z) + 2.2, z);
      gl.beginTransformFeedback(gl.POINTS); gl.drawArraysInstanced(gl.POINTS, 0, 1, count); gl.endTransformFeedback();
      const values = new Float32Array(count * stride); gl.getBufferSubData(gl.TRANSFORM_FEEDBACK_BUFFER, 0, values);
      return values;
    };
    const cases = [[-2801.5971376, 4700.7424484, 20], [0, 0, 20], [-6400, 1200, 20], [-2801.5971376, 4700.7424484, 1e9]];
    const results = cases.map(([x, z, start]) => {
      const previousDelta = new Float32Array(count), previousValid = new Uint8Array(count);
      let previous = sample(start, x, z), maxStep = 0, maxStepChange = 0, visibleSamples = 0;
      for (let frame = 1; frame <= frames; frame++) {
        const current = sample(start + frame / 60, x, z);
        for (let id = 0; id < count; id++) {
          const i = id * stride;
          // 回绕在淡出区完成；只检测前后都可见、未跨盒边界的同一粒子。
          if (Math.min(previous[i + 3], current[i + 3]) < .02 || Math.abs(current[i] - previous[i]) > 30 || Math.abs(current[i + 2] - previous[i + 2]) > 30) {
            previousValid[id] = 0; continue;
          }
          const delta = current[i + 1] - previous[i + 1]; visibleSamples++;
          maxStep = Math.max(maxStep, Math.abs(delta));
          if (previousValid[id]) maxStepChange = Math.max(maxStepChange, Math.abs(delta - previousDelta[id]));
          previousDelta[id] = delta; previousValid[id] = 1;
        }
        previous = current;
      }
      if (!visibleSamples) throw new Error('没有采到可见萤火虫，不能判定通过');
      return { camera: [x, z], start, visibleSamples, maxStep, maxStepChange };
    });
    if (gl.getError() !== gl.NO_ERROR) throw new Error('萤火虫高度采样发生 WebGL 错误');
    const passed = results.every(result => result.maxStepChange < .005);
    if (!legacyTerrain && !passed) throw new Error(`萤火虫高度不连续：${JSON.stringify(results)}`);
    return { legacyTerrain, passed, results };
  } finally {
    if (buffer) gl.deleteBuffer(buffer);
    if (texture) gl.deleteTexture(texture);
    if (program) gl.deleteProgram(program);
    for (const shader of shaders) gl.deleteShader(shader);
  }
}
