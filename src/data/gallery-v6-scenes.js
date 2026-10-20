// 沿用 2026-10-13 最终 V6 的起始机位、光学设置、绝对时刻与天气。
// 宣传片中的飞行、摇镜和定时闪电不写入风景；花草、雨雪与云继续自然运动。
export const V6_SCENES = Object.freeze([
  {
    id: "recommended-v6-storm-flowers",
    title: {"zh":"雷雨花海","en":"Flowers in the Thunderstorm","ja":"雷雨の花畑"},
    thumbnail: "gallery/recommended-v6-storm-flowers.jpg",
    scene: {
      version: 1,
      settings: {"auto":false,"god":true,"petals":false,"sway":false,"constel":false,"flies":false,"flowerGlow":true,"bloom":false,"streamScale":false,"infMem":false,"lensDrops":false,"lowSaturation":true,"streamDist":"near","bloomR":10,"sunAz":317,"dof":0.42,"wxMode":"manual","wxType":"tstorm","coverage":0.94,"density":2.3,"wind":90,"breeze":1,"fogVisS":517.9531474696581,"rainAmt":0.95,"snowAmt":0,"boltFreq":2.6,"puddle":1,"snowMax":0},
      camera: {"x":-2786.597137599582,"z":4700.742448387173,"y":63.615740791829595,"agl":3,"yaw":4.076990816987242,"pitch":0.035,"roll":0,"fov":43},
      environment: {"time":{"ms":1791535500000,"followNow":false,"speedIndex":0},"weather":{"type":"tstorm","current":{"cov":0.94,"dens":2.3,"wind":90,"breeze":1,"vis":1500,"rain":0.95,"snow":0,"bolt":2.6,"wet":1,"snowCov":0},"wet":1,"snowCover":0},"skyLocation":{"lat":35.6762,"lon":139.6503,"tz":"Asia/Tokyo"},"motion":{"time":32,"windAngle":0.6,"windOffset":[0,0]}},
      freeze: {"time":true,"weather":true,"clouds":false},
    },
  },
  {
    id: "recommended-v6-cloudsea-dusk",
    title: {"zh":"晚霞云海","en":"Cloud Sea at Sunset","ja":"夕映えの雲海"},
    thumbnail: "gallery/recommended-v6-cloudsea-dusk.jpg",
    scene: {
      version: 1,
      settings: {"auto":false,"god":true,"petals":false,"sway":false,"constel":false,"flies":false,"flowerGlow":false,"bloom":true,"streamScale":false,"infMem":false,"lensDrops":false,"lowSaturation":true,"streamDist":"near","bloomR":10,"sunAz":317,"dof":0,"wxMode":"manual","wxType":"cloudy","coverage":0.72,"density":1.05,"wind":40,"breeze":0.55,"fogVisS":970.6624208789219,"rainAmt":0,"snowAmt":0,"boltFreq":0,"puddle":0,"snowMax":0},
      camera: {"x":-2786.597137599582,"z":4700.742448387173,"y":4460.61574079183,"agl":4400,"yaw":4.076990816987242,"pitch":-0.04,"roll":0,"fov":72},
      environment: {"time":{"ms":1791533700000,"followNow":false,"speedIndex":0},"weather":{"type":"cloudy","current":{"cov":0.72,"dens":1.05,"wind":40,"breeze":0.55,"vis":25000,"rain":0,"snow":0,"bolt":0,"wet":0,"snowCov":0},"wet":0,"snowCover":0},"skyLocation":{"lat":35.6762,"lon":139.6503,"tz":"Asia/Tokyo"},"motion":{"time":32,"windAngle":0.6,"windOffset":[0,0]}},
      freeze: {"time":true,"weather":true,"clouds":false},
    },
  },
  {
    id: "recommended-v6-snow-flowers",
    title: {"zh":"薄雪花海","en":"Flowers under Light Snow","ja":"薄雪の花畑"},
    thumbnail: "gallery/recommended-v6-snow-flowers.jpg",
    scene: {
      version: 1,
      settings: {"auto":false,"god":true,"petals":true,"sway":false,"constel":false,"flies":true,"flowerGlow":false,"bloom":false,"streamScale":false,"infMem":false,"lensDrops":false,"lowSaturation":true,"streamDist":"near","bloomR":10,"sunAz":317,"dof":0.17,"wxMode":"manual","wxType":"snow","coverage":0.95,"density":1.7,"wind":30,"breeze":0.4,"fogVisS":579.580887496152,"rainAmt":0,"snowAmt":0.75,"boltFreq":0,"puddle":0,"snowMax":0.28},
      camera: {"x":-2786.597137599582,"z":4700.742448387173,"y":63.41574079182959,"agl":2.799999999999997,"yaw":4.076990816987242,"pitch":0.09,"roll":0,"fov":64},
      environment: {"time":{"ms":1767792600000,"followNow":false,"speedIndex":0},"weather":{"type":"snow","current":{"cov":0.95,"dens":1.7,"wind":30,"breeze":0.4,"vis":2200,"rain":0,"snow":0.75,"bolt":0,"wet":0,"snowCov":0.28},"wet":0,"snowCover":0.28},"skyLocation":{"lat":64.1466,"lon":-21.9426,"tz":"Atlantic/Reykjavik"},"motion":{"time":32,"windAngle":0.6,"windOffset":[0,0]}},
      freeze: {"time":true,"weather":true,"clouds":false},
    },
  },
  {
    id: "recommended-v6-night-flowers",
    title: {"zh":"晴夜花海","en":"Flowers under Clear Night Skies","ja":"晴夜の花畑"},
    thumbnail: "gallery/recommended-v6-night-flowers.jpg",
    scene: {
      version: 1,
      settings: {"auto":false,"god":true,"petals":true,"sway":false,"constel":false,"flies":true,"flowerGlow":true,"bloom":true,"streamScale":false,"infMem":false,"lensDrops":false,"lowSaturation":true,"streamDist":"near","bloomR":10,"sunAz":317,"dof":0.17,"wxMode":"manual","wxType":"clear","coverage":0,"density":0.8,"wind":18,"breeze":0.3,"fogVisS":1000,"rainAmt":0,"snowAmt":0,"boltFreq":0,"puddle":0,"snowMax":0},
      camera: {"x":-3095.327136805683,"z":5186.496116677535,"y":33.917061042984486,"agl":2.3000005149066354,"yaw":2.726990816987241,"pitch":0.15,"roll":0,"fov":68},
      environment: {"time":{"ms":1791551880000,"followNow":false,"speedIndex":0},"weather":{"type":"clear","current":{"cov":0,"dens":0.8,"wind":18,"breeze":0.3,"vis":30000,"rain":0,"snow":0,"bolt":0,"wet":0,"snowCov":0},"wet":0,"snowCover":0},"skyLocation":{"lat":35.6762,"lon":139.6503,"tz":"Asia/Tokyo"},"motion":{"time":32,"windAngle":0.6,"windOffset":[0,0]}},
      freeze: {"time":true,"weather":true,"clouds":false},
    },
  },
]);
