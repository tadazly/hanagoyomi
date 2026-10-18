// Clear-air scattering is already present in the sky LUT and terrain haze.
// Weather adds extinction relative to that clear baseline, continuously.
export function weatherFogDensity(visibility) {
  return Math.max(0, 3.912 / Math.max(60, visibility) - 3.912 / 30000);
}

// Shared by sky, terrain and grass. Distances and heights are in metres.
// uFogW packs extinction, scale height, camera altitude and camera air density.
export const WEATHER_FOG_GLSL = `
uniform vec4 uFogW;
uniform vec3 uFogCol;
float wxFogF(vec3 rel){
  if (uFogW.x <= 0.0) return 0.0;
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
vec3 wxFogRadiance(vec3 directionalSky){
  // Thin haze retains the light's direction and dawn/dusk colour. Dense fog
  // becomes diffuse as multiple scattering erases that directionality.
  float diffuse = smoothstep(0.0002, 0.0013, uFogW.x);
  return mix(directionalSky, uFogCol, diffuse);
}
vec3 wxFog(vec3 c, vec3 rel, vec3 directionalSky){
  return mix(c, wxFogRadiance(directionalSky), wxFogF(rel));
}
// 云是预乘散射与透射率，前景雾只积分到云深度；背景仍保留自己的雾。
vec3 wxCloud(vec3 background, vec4 cloud, vec3 cloudRel, vec3 directionalSky){
  float transmittance = clamp(cloud.a, 0.0, 1.0);
  vec3 scattering = max(cloud.rgb, vec3(0.0));
  if (uFogW.x > 0.0 && transmittance < 1.0){
    float frontFog = wxFogF(cloudRel);
    scattering = scattering * (1.0 - frontFog) + wxFogRadiance(directionalSky) * frontFog * (1.0 - transmittance);
  }
  return background * transmittance + scattering;
}
`;
