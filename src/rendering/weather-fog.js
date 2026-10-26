// Clear-air scattering is already present in the sky LUT and terrain haze.
// Weather adds extinction relative to that clear baseline, continuously.
export function weatherFogDensity(visibility) {
  return Math.max(0, 3.912 / Math.max(60, visibility) - 3.912 / 30000);
}

// 贴地背景天空不能在虚拟地面提前截断；不依赖立即变化的目标天气类型。
// 高处平滑回到既有球面地面截止，保留云海和雾层上方的积分。
export function groundFogHorizonBlend(altitude) {
  const t = Math.min(1, Math.max(0, (altitude - 5) / 10));
  return 1 - t * t * (3 - 2 * t);
}

// Shared by sky, terrain and grass. Distances and heights are in metres.
// uFogW packs extinction, scale height, camera altitude and camera air density.
export const WEATHER_FOG_GLSL = `
uniform vec4 uFogW;
// 帧常量：切线尺度、高斯柱系数、雾层上方权重、地平线俯角。
uniform vec4 uFogSky;
uniform vec3 uFogCol;
uniform float uGroundFogHorizon;
float wxFogF(vec3 rel){
  if (uFogW.x <= 0.0) return 0.0;
  // 在本项目最大消光下，整段高于 28 个尺度高度且不超过 120 km 时，
  // 光学厚度小于 6e-9，已低于 float32 的透射率分辨率。
  if (min(uFogW.z, uFogW.z + rel.y) >= 28.0 * uFogW.y && dot(rel, rel) <= 1.44e10) return 0.0;
  // Camera density is constant for the whole frame and supplied by the CPU.
  float dy = rel.y / uFogW.y, rho0 = uFogW.w;
  // Evaluate the two endpoint densities separately: descending from above
  // the fog must not produce the indeterminate product 0 * infinity.
  float rho1 = exp(clamp(-(uFogW.z + rel.y) / uFogW.y, -80.0, 50.0));
  // A short series avoids cancellation where the endpoint densities almost
  // coincide, including CPU/GPU rounding of the precomputed camera density.
  float meanDensity = abs(dy) > 1e-2 ? (rho0 - rho1) / dy : rho0 * (1.0 - dy * 0.5 + dy * dy / 6.0);
  float od = uFogW.x * length(rel) * meanDensity;
  return 1.0 - exp(-od);
}
// 背景沿弯曲的薄雾层积分到远方，不把有限地形半径当成雾的尽头。
// 指数球面大气在切线附近可写成高斯积分；erfcx 避免高空的 0 * infinity。
float wxErfcx(float x){
  float t = 1.0 / (1.0 + 0.3275911 * x);
  float erfcx = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  if (x > 3.0){
    float inv = 1.0 / (x * x);
    float tail = 0.564189584 / x * (1.0 + inv * (-0.5 + inv * (0.75 - 1.875 * inv)));
    erfcx = mix(erfcx, tail, smoothstep(3.0, 4.0, x));
  }
  return erfcx;
}
float wxFogColumn(vec3 rd){
  float curve = inversesqrt(max(1.0 - rd.y * rd.y, 1e-4));
  float x = abs(rd.y) * uFogSky.x * curve;
  float erfcx = wxErfcx(x);
  float column = uFogSky.y * curve;
  float rho0 = uFogW.w;
  if (rd.y >= 0.0) column *= rho0 * erfcx;
  else {
    float minHeight = uFogW.z / uFogW.y - x * x;
    // 先求球面地面截止的雾柱，高处保留这一积分。
    if (minHeight <= 0.0){
      float below = sqrt(-minHeight), groundTail = wxErfcx(below);
      float groundColumn = max(0.0, groundTail - rho0 * erfcx);
      if (uGroundFogHorizon > 0.0){
        // 这里只用于真实地形未遮挡的背景；穿过参考地面后仍有远方雾。
        // 地面以下密度封顶为1：两侧高斯尾加常密度段，避免地下指数膨胀。
        // minHeight趋于0时与上方分支同为2-rho0*erfcx，消除一像素亮线。
        float fullColumn = 2.0 * groundTail - rho0 * erfcx + 2.256758334 * below;
        groundColumn = mix(groundColumn, fullColumn, uGroundFogHorizon);
      }
      column *= groundColumn;
    } else column *= exp(-minHeight) * (2.0 - exp(-x * x) * erfcx);
  }
  return column;
}
float wxSkyFogF(vec3 rd){
  if (uFogW.x <= 0.0) return 0.0;
  if (rd.y >= 0.0 && uFogW.z >= 28.0 * uFogW.y) return 0.0;
  float column = wxFogColumn(rd);
  return 1.0 - exp(-uFogW.x * column);
}
vec3 wxFogRadiance(vec3 directionalSky, vec3 rd){
  // Thin haze retains the light's direction and dawn/dusk colour. Dense fog
  // becomes diffuse as multiple scattering erases that directionality.
  float diffuse = smoothstep(0.0002, 0.0013, uFogW.x);
  if (diffuse <= 0.0 || uFogW.z <= 2.0 * uFogW.y) return mix(directionalSky, uFogCol, diffuse);
  // 高于雾层时，远缘的掠射散射承接同方向的天空光，向下逐渐回到漫射雾色。
  // 以世界方向和相对雾层高度计算，转动视角时不会形成固定屏幕色带。
  float grazing = 1.0 - smoothstep(0.0, 0.2, max(-rd.y - uFogSky.w, 0.0));
  return mix(directionalSky, uFogCol, diffuse * (1.0 - uFogSky.z * grazing));
}
vec3 wxFog(vec3 c, vec3 rel, vec3 directionalSky){
  return mix(c, wxFogRadiance(directionalSky, rel / max(length(rel), 1e-4)), wxFogF(rel));
}
// 云是预乘散射与透射率，前景雾只积分到云深度；背景仍保留自己的雾。
vec3 wxCloud(vec3 background, vec4 cloud, vec3 cloudRel, vec3 directionalSky){
  float transmittance = clamp(cloud.a, 0.0, 1.0);
  vec3 scattering = max(cloud.rgb, vec3(0.0));
  if (uFogW.x > 0.0 && transmittance < 1.0){
    float frontFog = wxFogF(cloudRel);
    if (frontFog > 0.0){
      vec3 rd = cloudRel / max(length(cloudRel), 1e-4);
      scattering = scattering * (1.0 - frontFog) + wxFogRadiance(directionalSky, rd) * frontFog * (1.0 - transmittance);
    }
  }
  return background * transmittance + scattering;
}
`;
