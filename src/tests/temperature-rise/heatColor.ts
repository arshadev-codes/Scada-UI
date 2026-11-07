/**
 * Temperature → colour, like a thermal camera palette:
 * cold blue → teal → green → yellow → orange → red → deep red.
 */
const STOPS: Array<[number, [number, number, number]]> = [
  [15, [44, 98, 214]],
  [35, [30, 160, 200]],
  [50, [52, 182, 120]],
  [65, [226, 196, 20]],
  [80, [242, 140, 36]],
  [95, [226, 70, 44]],
  [115, [170, 22, 58]],
];

export const HEAT_MIN = STOPS[0][0];
export const HEAT_MAX = STOPS[STOPS.length - 1][0];
export const HEAT_STOPS = STOPS;

export function heatColor(t: number): string {
  if (t <= STOPS[0][0]) return rgb(STOPS[0][1]);
  for (let k = 1; k < STOPS.length; k++) {
    const [t1, c1] = STOPS[k];
    if (t <= t1) {
      const [t0, c0] = STOPS[k - 1];
      const f = (t - t0) / (t1 - t0);
      return rgb([0, 1, 2].map((i) => c0[i] + (c1[i] - c0[i]) * f) as [number, number, number]);
    }
  }
  return rgb(STOPS[STOPS.length - 1][1]);
}

const rgb = (c: [number, number, number]) => `rgb(${c.map((v) => Math.round(v)).join(' ')})`;
