// 星座观赏：使用真实地点与绝对时刻，保留自然天空、地形和本机观星偏好。
// 封面来自同一 WebGL 世界；夜空风格只作为推荐预览元数据。
export const CONSTELLATION_SCENES = Object.freeze([
  {
    "id": "recommended-constellation-summer-triangle",
    "title": {
      "zh": "天河三角",
      "en": "Summer Triangle and Milky Way",
      "ja": "夏の大三角と天の川"
    },
    "thumbnail": "gallery/recommended-constellation-summer-triangle.jpg",
    "nightSkyStyle": "realistic",
    "scene": {
      "version": 1,
      "settings": {
        "auto": false,
        "god": true,
        "petals": false,
        "sway": false,
        "constel": true,
        "flies": false,
        "flowerGlow": false,
        "bloom": false,
        "streamScale": false,
        "infMem": false,
        "lensDrops": false,
        "lowSaturation": false,
        "streamDist": "near",
        "bloomR": 4,
        "sunAz": 0,
        "dof": 0,
        "wxMode": "manual",
        "wxType": "clear",
        "coverage": 0.035,
        "density": 0.6,
        "wind": 14,
        "breeze": 0.2,
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
        "yaw": -1.2797794778904246,
        "pitch": 0.3839724354387525,
        "roll": 0,
        "fov": 90,
        "y": 63.85481445012952,
        "focus": 35
      },
      "environment": {
        "time": {
          "ms": 1786555800000,
          "followNow": false,
          "speedIndex": 0
        },
        "weather": {
          "type": "clear",
          "current": {
            "cov": 0.035,
            "dens": 0.6,
            "wind": 14,
            "breeze": 0.2,
            "vis": 30000,
            "rain": 0,
            "snow": 0,
            "bolt": 0,
            "wet": 0,
            "snowCov": 0
          },
          "wet": 0,
          "snowCover": 0
        },
        "skyLocation": {
          "lat": 35.6762,
          "lon": 139.6503,
          "tz": "Asia/Tokyo"
        },
        "motion": {
          "time": 30,
          "windAngle": 0.6,
          "windOffset": [
            0.2,
            0.2
          ],
          "cloudAngle": 0.6,
          "cloudY": 0.075
        }
      },
      "freeze": {
        "time": true,
        "weather": true,
        "clouds": false
      }
    }
  },
  {
    "id": "recommended-constellation-southern-cross",
    "title": {
      "zh": "南十字之野",
      "en": "Southern Cross Meadow",
      "ja": "南十字の野"
    },
    "thumbnail": "gallery/recommended-constellation-southern-cross.jpg",
    "nightSkyStyle": "realistic",
    "scene": {
      "version": 1,
      "settings": {
        "auto": false,
        "god": true,
        "petals": false,
        "sway": false,
        "constel": true,
        "flies": false,
        "flowerGlow": false,
        "bloom": false,
        "streamScale": false,
        "infMem": false,
        "lensDrops": false,
        "lowSaturation": false,
        "streamDist": "near",
        "bloomR": 4,
        "sunAz": 0,
        "dof": 0,
        "wxMode": "manual",
        "wxType": "clear",
        "coverage": 0.035,
        "density": 0.6,
        "wind": 14,
        "breeze": 0.2,
        "fogVisS": 1000,
        "rainAmt": 0,
        "snowAmt": 0,
        "boltFreq": 0,
        "puddle": 0,
        "snowMax": 0
      },
      "camera": {
        "x": -18445,
        "z": 7969.4,
        "agl": 1.8,
        "yaw": -2.364685146838854,
        "pitch": 0.4537856055185257,
        "roll": 0,
        "fov": 76,
        "y": 41.61780203357186,
        "focus": 35
      },
      "environment": {
        "time": {
          "ms": 1777190400000,
          "followNow": false,
          "speedIndex": 0
        },
        "weather": {
          "type": "clear",
          "current": {
            "cov": 0.035,
            "dens": 0.6,
            "wind": 14,
            "breeze": 0.2,
            "vis": 30000,
            "rain": 0,
            "snow": 0,
            "bolt": 0,
            "wet": 0,
            "snowCov": 0
          },
          "wet": 0,
          "snowCover": 0
        },
        "skyLocation": {
          "lat": -24.627,
          "lon": -70.404,
          "tz": "America/Santiago"
        },
        "motion": {
          "time": 30,
          "windAngle": 0.6,
          "windOffset": [
            0.2,
            0.2
          ],
          "cloudAngle": 0.6,
          "cloudY": 0.075
        }
      },
      "freeze": {
        "time": true,
        "weather": true,
        "clouds": false
      }
    }
  }
]);
