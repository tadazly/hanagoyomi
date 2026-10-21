// 来源：2026-10-21 夜景探索，保留原始机位、天文位置、时刻与运动相位。
// 风格只作为精选预览提示，不写入通用风景分享协议。
export const NIGHT_SKY_SCENES = Object.freeze([
  {
    id: "recommended-milky-way-fireflies",
    title: {"zh":"横河萤野","en":"Milky Way and Fireflies","ja":"天の川と蛍の野"},
    thumbnail: "gallery/recommended-milky-way-fireflies.jpg",
    nightSkyStyle: "realistic",
    scene: {
      version: 1,
      settings: {"auto":false,"god":true,"petals":false,"sway":false,"constel":false,"flies":true,"flowerGlow":false,"bloom":false,"streamScale":false,"infMem":false,"lensDrops":false,"lowSaturation":false,"streamDist":"near","bloomR":10,"sunAz":0,"dof":0,"wxMode":"manual","wxType":"clear","coverage":0.09,"density":0.8500000000000001,"wind":26,"breeze":0.25,"fogVisS":1000,"rainAmt":0,"snowAmt":0,"boltFreq":0,"puddle":0,"snowMax":0},
      camera: {"x":43917.4,"z":11414,"agl":1.6,"yaw":2.8,"pitch":0.19,"roll":0,"fov":78,"y":38.82609721899459,"focus":35},
      environment: {"time":{"ms":1780537500000,"followNow":false,"speedIndex":0},"weather":{"type":"clear","current":{"cov":0.09,"dens":0.8500000000000001,"wind":26,"breeze":0.25,"vis":30000,"rain":0,"snow":0,"bolt":0,"wet":0,"snowCov":0},"wet":0,"snowCover":0},"skyLocation":{"lat":-0.1807,"lon":-78.4678,"tz":"America/Guayaquil"},"motion":{"time":26.520199999665866,"windAngle":0.6,"windOffset":[0.4369399374822644,0.2989266942661388],"cloudAngle":0.6,"cloudY":0.06630049999916486}},
      freeze: {"time":true,"weather":true,"clouds":false},
    },
  },
  {
    id: "recommended-southern-clouds",
    title: {"zh":"南天双云","en":"Southern Twin Clouds","ja":"南天のふたつの雲"},
    thumbnail: "gallery/recommended-southern-clouds.jpg",
    nightSkyStyle: "realistic",
    scene: {
      version: 1,
      settings: {"auto":false,"god":true,"petals":false,"sway":false,"constel":false,"flies":false,"flowerGlow":false,"bloom":false,"streamScale":false,"infMem":false,"lensDrops":false,"lowSaturation":false,"streamDist":"near","bloomR":10,"sunAz":0,"dof":0,"wxMode":"manual","wxType":"clear","coverage":0,"density":0.8500000000000001,"wind":22,"breeze":0.25,"fogVisS":1000,"rainAmt":0,"snowAmt":0,"boltFreq":0,"puddle":0,"snowMax":0},
      camera: {"x":-2979,"z":4552.8,"agl":1.7,"yaw":3.6,"pitch":0.16,"roll":0,"fov":60,"y":12.832268412500198,"focus":35},
      environment: {"time":{"ms":1780911900000,"followNow":false,"speedIndex":0},"weather":{"type":"clear","current":{"cov":0,"dens":0.8500000000000001,"wind":22,"breeze":0.25,"vis":30000,"rain":0,"snow":0,"bolt":0,"wet":0,"snowCov":0},"wet":0,"snowCover":0},"skyLocation":{"lat":-33.8688,"lon":151.2093,"tz":"Australia/Sydney"},"motion":{"time":33.20739999966582,"windAngle":0.6,"windOffset":[0.5375645255174932,0.367767678765257],"cloudAngle":0.6,"cloudY":0.08301849999916568}},
      freeze: {"time":true,"weather":true,"clouds":false},
    },
  },
]);
