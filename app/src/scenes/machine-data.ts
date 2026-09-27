// Static content and the loss landscape for the `machine` plate.
import { clamp } from '../engine/util';

/** Next-token candidates for "software on ___" and their final probabilities (the model is sure). */
export const CANDIDATES: { s: string; p: number }[] = [
  { s: 'demand', p: 0.93 },
  { s: 'time', p: 0.031 },
  { s: 'paper', p: 0.012 },
  { s: 'rails', p: 0.008 },
  { s: '-prem', p: 0.006 },
  { s: 'fire', p: 0.004 },
  { s: 'schedule', p: 0.003 },
  { s: 'Tuesdays', p: 0.002 },
];
/** Bar order left → right (the winner right of centre, beside the blank it will fill). */
export const BAR_ORDER = [3, 1, 6, 2, 7, 4, 0, 5];

// ------------------------------------------------------------------ loss landscape h(x, z) (JS + GLSL twins)
// A wide bowl whose global minimum sits in a basin at (6, -4); the optimiser starts high on a hill at
// (-9, 8.5), rolls through a local-minimum trap at (1.2, 5.6) and a saddle, and settles in the basin.
export const HS = 1.6; // vertical scale
const g = (x: number, z: number, cx: number, cz: number, s: number) => Math.exp(-((x - cx) ** 2 + (z - cz) ** 2) / s);
export function lossH(x: number, z: number, rip = 1): number {
  const bowl = 0.011 * ((x - 5) ** 2 + (z + 3) ** 2);
  const h = bowl + 2.3 * g(x, z, -8, 7, 34) + 1.3 * g(x, z, -0.5, 1.5, 11) + 0.9 * g(x, z, 1.5, -8, 16)
    - 0.5 * g(x, z, 1.2, 5.6, 3) - 2.8 * g(x, z, 6, -4, 13) - 0.6 * g(x, z, 6.4, -4.2, 1.6)
    + rip * (0.22 * Math.sin(0.55 * x + 0.3 * z) * Math.sin(0.42 * z - 0.25 * x) + 0.08 * Math.sin(1.3 * x - 0.9 * z) * Math.sin(1.1 * z + 0.7 * x));
  return h * HS;
}
export const LOSS_GLSL = /* glsl */ `
float gss(vec2 p, vec2 c, float s) { vec2 d = p - c; return exp(-dot(d, d) / s); }
float lossH(vec2 p) {
  float x = p.x, z = p.y;
  float bowl = 0.011 * ((x - 5.0) * (x - 5.0) + (z + 3.0) * (z + 3.0));
  float h = bowl + 2.3 * gss(p, vec2(-8.0, 7.0), 34.0) + 1.3 * gss(p, vec2(-0.5, 1.5), 11.0) + 0.9 * gss(p, vec2(1.5, -8.0), 16.0)
    - 0.5 * gss(p, vec2(1.2, 5.6), 3.0) - 2.8 * gss(p, vec2(6.0, -4.0), 13.0) - 0.6 * gss(p, vec2(6.4, -4.2), 1.6)
    + 0.22 * sin(0.55 * x + 0.3 * z) * sin(0.42 * z - 0.25 * x) + 0.08 * sin(1.3 * x - 0.9 * z) * sin(1.1 * z + 0.7 * x);
  return h * ${HS.toFixed(3)};
}`;

export function lossGrad(x: number, z: number, rip = 1): [number, number] {
  const e = 0.01;
  return [(lossH(x + e, z, rip) - lossH(x - e, z, rip)) / (2 * e), (lossH(x, z + e, rip) - lossH(x, z - e, rip)) / (2 * e)];
}

const RIP_DYN = 0.5;
/** Heavy-ball gradient descent from the hill, fixed steps; returns the path (x, z, loss, |grad|). */
export function descend(steps = 1600): { x: number; z: number; h: number; gx: number; gz: number; vx: number; vz: number }[] {
  let x = -9.2, z = 8.6, vx = 0, vz = 0;
  const lr = 0.0105, mu = 0.955;
  const out = [];
  for (let i = 0; i < steps; i++) {
    // the dynamics see a slightly smoothed surface (robust path); the bead is drawn on the real one
    const [gx, gz] = lossGrad(x, z, RIP_DYN);
    vx = mu * vx - lr * gx; vz = mu * vz - lr * gz;
    const sp = Math.hypot(vx, vz), cap = 0.09;
    if (sp > cap) { vx *= cap / sp; vz *= cap / sp; }
    x += vx; z += vz;
    out.push({ x, z, h: lossH(x, z), gx, gz, vx, vz });
  }
  return out;
}

export const clampIdx = (i: number, n: number) => clamp(Math.floor(i), 0, n - 1);
