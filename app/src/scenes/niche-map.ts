// Data for the niche plate: a coarse world map as (lon, lat) polygons (rough outlines, good enough for a
// dot-matrix map table), the land-dot grid, the sung niches and the long list of small ones.

type LL = [number, number];
const POLYS: LL[][] = [
  // North America
  [[-168, 65], [-162, 70], [-140, 70], [-125, 70], [-95, 72], [-80, 73], [-65, 62], [-60, 55], [-55, 50], [-66, 45], [-70, 42], [-76, 35], [-81, 31], [-80, 25], [-82, 27], [-84, 30], [-90, 29], [-97, 27], [-97, 22], [-92, 18], [-88, 21], [-87, 16], [-83, 10], [-79, 8], [-78, 7], [-81, 8], [-86, 12], [-92, 15], [-105, 20], [-110, 24], [-113, 31], [-117, 32], [-121, 35], [-124, 40], [-124, 46], [-130, 55], [-140, 60], [-152, 60], [-158, 57], [-165, 60], [-168, 65]],
  // Greenland
  [[-55, 60], [-45, 60], [-40, 65], [-22, 70], [-20, 78], [-30, 83], [-60, 82], [-70, 78], [-60, 75], [-55, 70], [-52, 65], [-55, 60]],
  // South America
  [[-80, 9], [-72, 12], [-62, 11], [-52, 5], [-50, 0], [-45, -2], [-35, -6], [-38, -13], [-40, -22], [-48, -26], [-53, -34], [-58, -38], [-65, -41], [-66, -47], [-69, -52], [-74, -53], [-73, -45], [-72, -35], [-71, -25], [-70, -18], [-76, -14], [-81, -6], [-80, 0], [-78, 3], [-77, 7], [-80, 9]],
  // Eurasia
  [[-10, 36], [-9, 43], [-2, 44], [-5, 48], [0, 49], [2, 51], [5, 53], [8, 54], [8, 57], [10, 58], [12, 56], [14, 55], [19, 55], [21, 57], [24, 60], [22, 63], [18, 63], [21, 66], [25, 70], [30, 70], [40, 68], [45, 68], [60, 70], [70, 73], [80, 73], [100, 78], [115, 74], [130, 72], [140, 72], [160, 70], [170, 70], [180, 68], [180, 65], [172, 62], [163, 58], [160, 52], [156, 51], [157, 57], [150, 59], [142, 53], [140, 48], [135, 43], [130, 42], [127, 39], [126, 35], [121, 31], [122, 28], [119, 24], [111, 21], [108, 17], [109, 12], [105, 9], [103, 1], [100, 3], [98, 8], [98, 15], [94, 17], [91, 22], [86, 21], [80, 15], [78, 8], [76, 11], [72, 21], [67, 24], [61, 25], [57, 26], [52, 24], [56, 18], [52, 15], [44, 12], [43, 15], [38, 21], [35, 28], [33, 31], [35, 36], [28, 37], [26, 40], [23, 37], [20, 40], [19, 42], [14, 45], [12, 44], [16, 39], [12, 38], [9, 44], [3, 42], [0, 39], [-2, 37], [-6, 36], [-10, 36]],
  // Scandinavia's Norwegian coast is in Eurasia; the British Isles, Ireland, Iceland
  [[-5, 50], [1, 51], [2, 53], [0, 54], [-2, 56], [-2, 58], [-5, 58], [-6, 56], [-5, 54], [-4, 53], [-5, 52], [-5, 50]],
  [[-10, 52], [-6, 52], [-6, 55], [-8, 55], [-10, 54], [-10, 52]],
  [[-24, 64], [-14, 64], [-14, 66], [-22, 66.5], [-24, 64]],
  // Africa, Madagascar
  [[-17, 21], [-13, 28], [-6, 35], [10, 37], [11, 33], [20, 31], [32, 31], [34, 28], [38, 18], [43, 12], [51, 11], [48, 5], [42, -1], [40, -11], [35, -24], [33, -26], [27, -34], [18, -34], [15, -27], [12, -17], [12, -6], [9, 4], [5, 5], [-5, 5], [-8, 4], [-13, 8], [-17, 14], [-17, 21]],
  [[44, -25], [47, -25], [50, -15], [49, -12], [44, -17], [44, -25]],
  // Australia, New Zealand, Japan, islands
  [[114, -22], [114, -34], [118, -35], [124, -33], [131, -31], [135, -35], [138, -34], [140, -38], [146, -39], [150, -37], [153, -30], [153, -25], [146, -19], [145, -15], [142, -11], [141, -17], [136, -12], [131, -11], [125, -14], [122, -18], [114, -22]],
  [[172, -35], [178, -38], [175, -42], [172, -44], [167, -46], [170, -43], [174, -39], [172, -35]],
  [[130, 31], [135, 34], [140, 35], [142, 40], [142, 44], [145, 44], [141, 45], [140, 41], [139, 38], [136, 36], [132, 34], [130, 31]],
  [[109, 2], [114, 5], [119, 6], [119, 1], [116, -4], [110, -3], [109, 2]],
  [[95, 5], [98, 4], [104, -2], [106, -6], [101, -3], [95, 5]],
  [[131, -1], [141, -3], [150, -10], [141, -9], [137, -5], [131, -1]],
  [[120, 18], [122, 18], [126, 7], [122, 7], [120, 18]],
  [[-85, 22], [-74, 20], [-78, 22], [-85, 22]],
];

function inPoly(lon: number, lat: number, P: LL[]) {
  let c = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const [xi, yi] = P[i]!, [xj, yj] = P[j]!;
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
export const isLand = (lon: number, lat: number) => POLYS.some((p) => inPoly(lon, lat, p));

/** Map table coordinates: 18 x 9 world units, lon/lat -> (x, z) (north = -z). */
export const MAP = { W: 18, H: 9, step: 1.8 };
export const llToXZ = (lon: number, lat: number) => ({ x: (lon / 180) * (MAP.W / 2), z: (-lat / 90) * (MAP.H / 2) });

export function landDots(): { x: number; z: number; lon: number; lat: number }[] {
  const out: { x: number; z: number; lon: number; lat: number }[] = [];
  for (let lat = 82; lat >= -56; lat -= MAP.step) {
    for (let lon = -178; lon <= 180; lon += MAP.step) {
      if (!isLand(lon, lat)) continue;
      const p = llToXZ(lon, lat);
      out.push({ ...p, lon, lat });
    }
  }
  return out;
}

export type ModelKind = 'rota' | 'tide' | 'choir' | 'walk' | 'stars';
/** The sung niches: one pin per word of "Every niche and every dream," */
export const SUNG: { lon: number; lat: number; kind: ModelKind; label: string; sub: string }[] = [
  { lon: 4.8, lat: 45.8, kind: 'rota', label: 'BAKERY ROTA — LYON', sub: '6 bakers · 4 a.m. shifts' },
  { lon: 19.0, lat: 69.6, kind: 'tide', label: 'TIDE TABLE — TROMSØ HARBOUR', sub: '11 boats · 2 cranes' },
  { lon: -3.2, lat: 51.5, kind: 'choir', label: 'CHOIR PARTS — CARDIFF', sub: '34 voices · 4 parts' },
  { lon: 135.8, lat: 35.0, kind: 'walk', label: 'TEMPLE WALK — KYOTO', sub: '1 map · 19 gates' },
  { lon: -69.5, lat: -24.0, kind: 'stars', label: 'STAR PARTY — ATACAMA', sub: '1 telescope · no clouds' },
];

/** Small niches for the lights that rain in on the beats. */
export const NICHES = [
  'allotment swaps', 'ferry times', 'bee-hive notes', 'chess ladder', 'lost-cat map', 'dialect dictionary', 'kiln schedule',
  'rugby minibus', 'seed library', 'sauna booking', 'tuba repairs', 'night-bus alerts', 'village fête', 'goat registry',
  'bell-ringers’ rota', 'dune survey', 'orchard map', 'bread-oven share', 'cricket scores', 'tram-stop poems', 'quilt patterns',
  'glacier diary', 'harbour crane log', 'reading circle', 'fish-market prices', 'snow-plough route', 'bird counts',
  'laundry rota', 'river levels', 'cheese cave temps', 'hymn numbers', 'ski-lift queue', 'wedding seating', 'well-water tests',
];
