// 初次进入的低空构图与场景默认值；封面是午后示例，预览跟随当前城市的时刻与天气。
// 点击时由世界根据设备能力与减少动态效果偏好重新创建初始场景。
export const INITIAL_LANDSCAPE = Object.freeze({
  "id": "recommended-first-landscape",
  "title": {
    "zh": "最初的风景",
    "en": "Where It All Begins",
    "ja": "はじまりの風景"
  },
  "thumbnail": "gallery/recommended-first-landscape.jpg",
  "initial": true,
  "nightSkyStyle": "default",
  "scene": {
    "version": 1,
    "settings": {
      "auto": true,
      "god": true,
      "petals": true,
      "sway": true,
      "constel": false,
      "flies": true,
      "flowerGlow": false,
      "bloom": true,
      "streamScale": false,
      "infMem": false,
      "lensDrops": true,
      "lowSaturation": false,
      "streamDist": "near",
      "bloomR": 4,
      "sunAz": 317,
      "dof": 0.6,
      "wxMode": "follow",
      "wxType": "cloudy",
      "coverage": 0.58,
      "density": 1,
      "wind": 40,
      "breeze": 0.65,
      "fogVisS": 1000,
      "rainAmt": 0,
      "snowAmt": 0,
      "boltFreq": 0,
      "puddle": 0,
      "snowMax": 0
    },
    "camera": {
      "x": -2801.597137599582,
      "z": 4700.742448387173,
      "agl": 2.2,
      "yaw": 3.9269908169872414,
      "pitch": 0.04,
      "roll": 0,
      "fov": 60,
      "y": 63.85481445012952,
      "focus": 40
    },
    "environment": {
      "time": {
        "ms": 1792908000000,
        "followNow": true,
        "speedIndex": 1
      },
      "weather": {
        "type": "cloudy",
        "current": {
          "cov": 0.62,
          "dens": 1.05,
          "wind": 40,
          "breeze": 0.55,
          "vis": 25000,
          "rain": 0,
          "snow": 0,
          "bolt": 0,
          "wet": 0,
          "snowCov": 0
        },
        "wet": 0,
        "snowCover": 0
      },
      "motion": {
        "time": 0,
        "windAngle": 0.6,
        "windOffset": [
          0,
          0
        ],
        "cloudAngle": 0.6,
        "cloudY": 0,
        "flyOffset": [
          0,
          0
        ],
        "gustOffset": [
          0,
          0
        ]
      }
    },
    "freeze": {
      "time": false,
      "weather": false,
      "clouds": false
    }
  }
});
