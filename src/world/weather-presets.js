const WX_TYPES = {
  clear:     {n: '晴朗',   cov: 0.16, dens: 0.8,  wind: 18,  breeze: 0.3,  vis: 30000},
  fewcloud:  {n: '少云',   cov: 0.4,  dens: 0.9,  wind: 28,  breeze: 0.4,  vis: 30000},
  cloudy:    {n: '多云',   cov: 0.62, dens: 1.05, wind: 40,  breeze: 0.55, vis: 25000},
  overcast:  {n: '阴天',   cov: 0.9,  dens: 1.35, wind: 32,  breeze: 0.5,  vis: 15000},
  mist:      {n: '薄雾',   cov: 0.55, dens: 1.0,  wind: 12,  breeze: 0.2,  vis: 1500},
  fog:       {n: '大雾',   cov: 0.75, dens: 1.1,  wind: 8,   breeze: 0.12, vis: 220},
  lightrain: {n: '小雨',   cov: 0.92, dens: 1.4,  wind: 35,  breeze: 0.45, vis: 6000, rain: 0.3,  wet: 0.4},
  rain:      {n: '中雨',   cov: 0.94, dens: 1.6,  wind: 45,  breeze: 0.6,  vis: 4000, rain: 0.6,  wet: 0.65},
  heavyrain: {n: '大雨',   cov: 0.96, dens: 1.9,  wind: 60,  breeze: 0.75, vis: 2500, rain: 0.85, wet: 0.85},
  downpour:  {n: '暴雨',   cov: 0.97, dens: 2.2,  wind: 85,  breeze: 0.95, vis: 1200, rain: 1.0,  wet: 1.0},
  tshower:   {n: '雷阵雨', cov: 0.88, dens: 1.9,  wind: 60,  breeze: 0.7,  vis: 3500, rain: 0.65, wet: 0.7, bolt: 1.2},
  tstorm:    {n: '雷暴',   cov: 0.96, dens: 2.3,  wind: 90,  breeze: 1.0,  vis: 1500, rain: 0.95, wet: 1.0, bolt: 2.6},
  sleet:     {n: '雨夹雪', cov: 0.94, dens: 1.6,  wind: 45,  breeze: 0.55, vis: 2500, rain: 0.35, snow: 0.4, wet: 0.5, snowCov: 0.2},
  lightsnow: {n: '小雪',   cov: 0.9,  dens: 1.4,  wind: 20,  breeze: 0.3,  vis: 4000, snow: 0.35, snowCov: 0.45},
  snow:      {n: '大雪',   cov: 0.95, dens: 1.7,  wind: 30,  breeze: 0.4,  vis: 1200, snow: 0.75, snowCov: 0.85},
  blizzard:  {n: '暴雪',   cov: 0.97, dens: 2.0,  wind: 110, breeze: 1.0,  vis: 300,  snow: 1.0,  snowCov: 1.0},
};
const WX_KEYS = ['cov', 'dens', 'wind', 'breeze', 'vis', 'rain', 'snow', 'bolt', 'wet', 'snowCov'];
const wxPreset = (k) => { const t = WX_TYPES[k] || WX_TYPES.clear, o = {}; WX_KEYS.forEach(q => { o[q] = t[q] || 0; }); return o; };
/* dynamic mode: a Markov chain over the presets (weights of what tends to follow what), biased by season and hour */
const WX_NEXT = {
  clear: {clear: 3, fewcloud: 4, cloudy: 1, mist: 0.6}, fewcloud: {clear: 3, fewcloud: 2, cloudy: 4, mist: 0.4},
  cloudy: {fewcloud: 3, cloudy: 2, overcast: 3, lightrain: 1, tshower: 0.6}, overcast: {cloudy: 3, overcast: 2, lightrain: 2.5, rain: 1, fog: 0.6, lightsnow: 1.2, sleet: 0.5},
  mist: {clear: 2, fewcloud: 2, fog: 1, cloudy: 1}, fog: {mist: 3, overcast: 1.5, cloudy: 1},
  lightrain: {overcast: 2, rain: 2, lightrain: 1, cloudy: 1.5, mist: 0.5}, rain: {lightrain: 2, heavyrain: 1.5, overcast: 1.5, tshower: 0.8},
  heavyrain: {rain: 2.5, downpour: 1, tstorm: 0.8, overcast: 1}, downpour: {heavyrain: 3, tstorm: 1},
  tshower: {cloudy: 2, rain: 1.5, tstorm: 0.6, fewcloud: 1}, tstorm: {heavyrain: 2, tshower: 2, rain: 1},
  sleet: {lightsnow: 2, lightrain: 1.5, overcast: 1.5}, lightsnow: {snow: 1.5, overcast: 2, lightsnow: 1, sleet: 0.6},
  snow: {lightsnow: 2, blizzard: 0.6, snow: 1, overcast: 1}, blizzard: {snow: 3},
};

export { WX_TYPES, WX_KEYS, wxPreset, WX_NEXT };
