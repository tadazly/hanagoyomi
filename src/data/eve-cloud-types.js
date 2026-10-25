// 云型配置使用 Hermite 曲线。
export const EVE_CLOUD_TYPES = Object.freeze([
  {
    "typeName": "Stratus",
    "minAltitude": 1750.0,
    "maxAltitude": 3450.0,
    "density": 0.0015,
    "baseNoiseTiling": 2300.0,
    "noiseEdgeHardness": 0.9,
    "multipleScatteringBrightness": 0.8,
    "coverageCurve": [
      [
        0.01728953,
        -0.004032524,
        1.633945,
        1.633945
      ],
      [
        0.1140957,
        0.8506892,
        0.06669102,
        0.261398
      ],
      [
        0.3686106,
        0.9575245,
        0.0,
        0.0
      ],
      [
        0.9732781,
        -0.006797761,
        -0.369256,
        -0.5550035
      ]
    ],
    "densityCurve": [
      [
        0.0,
        0.0,
        1.0,
        1.0
      ],
      [
        1.0,
        1.0,
        1.0,
        1.0
      ]
    ]
  },
  {
    "typeName": "Cumulus",
    "minAltitude": 1750.0,
    "maxAltitude": 4450.0,
    "density": 0.012,
    "baseNoiseTiling": 2300.0,
    "noiseEdgeHardness": 0.97,
    "multipleScatteringBrightness": 1,
    "coverageCurve": [
      [
        0.01728953,
        -0.004032524,
        1.633945,
        1.633945
      ],
      [
        0.08695792,
        0.976166,
        0.06669102,
        0.04846065
      ],
      [
        0.9732781,
        -0.006797761,
        -0.7966601,
        -0.5550035
      ]
    ],
    "densityCurve": [
      [
        0.0,
        0.0,
        1.0,
        1.0
      ],
      [
        1.0,
        1.0,
        1.0,
        1.0
      ]
    ]
  },
  {
    "typeName": "Congestus0",
    "minAltitude": 1750.0,
    "maxAltitude": 5450.0,
    "density": 0.012,
    "baseNoiseTiling": 2300.0,
    "noiseEdgeHardness": 0.97,
    "multipleScatteringBrightness": 1,
    "coverageCurve": [
      [
        0.01728953,
        -0.004032524,
        1.633945,
        1.633945
      ],
      [
        0.08695792,
        0.976166,
        0.06669102,
        0.04846065
      ],
      [
        0.9732781,
        -0.006797761,
        -0.7966601,
        -0.5550035
      ]
    ],
    "densityCurve": [
      [
        0.0,
        0.0,
        1.0,
        1.0
      ],
      [
        1.0,
        1.0,
        1.0,
        1.0
      ]
    ]
  },
  {
    "typeName": "Congestus 1",
    "minAltitude": 1750.0,
    "maxAltitude": 6450.0,
    "density": 0.012,
    "baseNoiseTiling": 2300.0,
    "noiseEdgeHardness": 0.97,
    "multipleScatteringBrightness": 1,
    "coverageCurve": [
      [
        0.01728953,
        -0.004032524,
        1.633945,
        1.633945
      ],
      [
        0.08695792,
        0.976166,
        0.06669102,
        0.04846065
      ],
      [
        0.4343985,
        0.6765829,
        -1.224023,
        -1.224023
      ],
      [
        0.8816288,
        0.3897246,
        -1.164106,
        -1.164106
      ],
      [
        0.9732781,
        -0.006797761,
        -0.7966601,
        -0.5550035
      ]
    ],
    "densityCurve": [
      [
        0.0,
        0.0,
        1.0,
        1.0
      ],
      [
        1.0,
        1.0,
        1.0,
        1.0
      ]
    ]
  },
  {
    "typeName": "Congestus 2",
    "interpolateCloudHeights": false,
    "minAltitude": 1750.0,
    "maxAltitude": 7450.0,
    "density": 0.006,
    "baseNoiseTiling": 2300.0,
    "noiseEdgeHardness": 0.97,
    "multipleScatteringBrightness": 1,
    "coverageCurve": [
      [
        0.01728953,
        -0.004032524,
        1.633945,
        1.633945
      ],
      [
        0.09431168,
        0.9640306,
        0.06669102,
        -0.8954304
      ],
      [
        0.2904161,
        0.8003764,
        0.2357683,
        0.2357683
      ],
      [
        0.59456,
        0.7429472,
        -0.001872113,
        -0.001872113
      ],
      [
        0.734686,
        0.7428927,
        -3.4198,
        -1.176937
      ],
      [
        0.9732781,
        -0.006797761,
        -0.8304251,
        -0.5550035
      ]
    ],
    "densityCurve": [
      [
        0.0,
        0.0,
        1.0,
        1.0
      ],
      [
        1.0,
        1.0,
        1.0,
        1.0
      ]
    ]
  },
  {
    "typeName": "Congestus 3",
    "interpolateCloudHeights": false,
    "minAltitude": 1750.0,
    "maxAltitude": 7450.0,
    "density": 0.006,
    "baseNoiseTiling": 2300.0,
    "noiseEdgeHardness": 0.97,
    "multipleScatteringBrightness": 1,
    "coverageCurve": [
      [
        0.01728953,
        -0.004032524,
        1.633945,
        1.633945
      ],
      [
        0.09431168,
        0.9640306,
        0.06669102,
        -0.8954304
      ],
      [
        0.2904161,
        0.8003764,
        0.2357683,
        0.2357683
      ],
      [
        0.734686,
        0.7428927,
        -3.4198,
        -1.176937
      ],
      [
        0.9732781,
        -0.006797761,
        -0.8304251,
        -0.5550035
      ]
    ],
    "densityCurve": [
      [
        0.0,
        0.0,
        1.0,
        1.0
      ],
      [
        1.0,
        1.0,
        1.0,
        1.0
      ]
    ]
  }
]);
