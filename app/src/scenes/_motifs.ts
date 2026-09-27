// Shared motifs, so recurring things look identical in every plate:
//  - THE CURSOR: a gold insertion caret with a white-hot tip. It types, writes, welds and, at the end, is the wand.
//  - WELD SPARKS: the particles the cursor throws when it builds something.
//  - THE HOOK WORDS: "SOFTWARE / ON / DEMAND" timings (one word per hit), so every chorus slams on the same data.
// (Particle emitter adapted from pdoom-video's spark, MIT.)
import { LineBatch } from '../engine/lines';
import { LIN, rgba } from '../engine/palette';
import { hash, TAU } from '../engine/util';
import type { Lyrics, Line } from '../engine/lyrics';

type P2 = { x: number; y: number };
type RGB = [number, number, number];
const mul = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k];

/** Blink phase of the cursor: fully on for the first half of every beat (pass f.beatPhase), soft edges. */
export const cursorBlink = (beatPhase: number) => (beatPhase < 0.5 ? 1 : 0.15 + 0.85 * Math.max(0, 1 - (beatPhase - 0.5) * 8));

/**
 * The cursor as a caret: a vertical gold bar of height h (px) whose top is at (x, y), with a white-hot tip dot at
 * the bottom (the working point). `on` 0..1 (blink / fade). Draw into a 2D additive LineBatch after the thing it builds.
 */
export function cursorCaret(lb: LineBatch, x: number, y: number, h: number, on = 1, t = 0) {
  if (on <= 0.001) return;
  const flick = 0.9 + 0.1 * Math.sin(t * 83.1) * Math.sin(t * 51.7);
  const I = on * flick;
  lb.seg2(x, y, x, y + h, Math.max(3, h * 0.07), mul(LIN.signal, 2.0 * I), 1);           // the bar
  lb.seg2(x, y, x, y + h, Math.max(9, h * 0.2), mul(LIN.signal, 0.45 * I), 0.35);        // its glow
  cursorTip(lb, x, y + h, t, Math.max(0.5, h / 60), I);
}

/** The white-hot working point (the caret's tip, the weld point, the wand's tip). */
export function cursorTip(lb: LineBatch, x: number, y: number, t: number, scale = 1, intensity = 1) {
  const flick = 0.85 + 0.15 * Math.sin(t * 91.7) * Math.sin(t * 57.3);
  const I = intensity * flick;
  lb.seg2(x, y, x + 0.01, y, 24 * scale, mul(LIN.signal, 0.5 * I), 0.35);
  lb.seg2(x, y, x + 0.01, y, 11 * scale, mul(LIN.ember, 2.4 * I), 0.85);
  lb.seg2(x, y, x + 0.01, y, 4.5 * scale, [6 * I, 5.6 * I, 4.4 * I], 1);
}

/**
 * Weld sparks thrown from a moving working point `headAt(t)`. Deterministic: particles are born on a fixed clock
 * (rate/s) with hashed velocities, so any motion-blur sub-frame draws the same particles. Gold -> white-hot.
 * Pass `rate` as a function of the birth time (with `rateMax`) when the rate changes over time.
 */
export function weldSparks(lb: LineBatch, t: number, headAt: (t: number) => P2 | null, o: { rate?: number | ((tb: number) => number); rateMax?: number; life?: number; speed?: number; gravity?: number; intensity?: number; seed?: number; width?: number } = {}) {
  const life = o.life ?? 0.5, speed = o.speed ?? 300, g = o.gravity ?? 700, I = o.intensity ?? 1, seed = o.seed ?? 1;
  const rateAt = typeof o.rate === 'function' ? o.rate : null;
  const rate = rateAt ? o.rateMax! : (o.rate as number | undefined) ?? 90;
  if (!(rate > 0)) return;
  const n0 = Math.floor((t - life) * rate), n1 = Math.floor(t * rate);
  for (let n = n0; n <= n1; n++) {
    const tb = n / rate;
    if (tb > t) continue;
    if (rateAt && hash(n, seed + 3) * rate >= rateAt(tb)) continue;
    const age = t - tb, h = headAt(tb);
    if (!h) continue;
    const a = hash(n, seed) * TAU, sp = speed * (0.25 + hash(n, seed + 1) ** 2 * 1.2);
    const lf = life * (0.35 + 0.65 * hash(n, seed + 2));
    if (age > lf) continue;
    const vx = Math.cos(a) * sp, vy = Math.sin(a) * sp - speed * 0.35;
    const pos = (s: number) => ({ x: h.x + vx * s, y: h.y + vy * s + 0.5 * g * s * s });
    const p1 = pos(age), p0 = pos(Math.max(0, age - 0.02));
    const k = 1 - age / lf, heat = k * k;
    const col: RGB = [
      (LIN.signal[0] + (1 - LIN.signal[0]) * heat) * 2.3 * I,
      (LIN.signal[1] + (0.95 - LIN.signal[1]) * heat) * 2.3 * I,
      (LIN.signal[2] + (0.7 - LIN.signal[2]) * heat) * 2.3 * I,
    ];
    lb.seg2(p0.x, p0.y, p1.x, p1.y, (o.width ?? 1.6) * (0.5 + k * 0.7), col, Math.min(1, k * 1.4));
  }
}

/** Canvas2D cursor tip (for scenes drawing in 2D layers). */
export function cursorTip2D(c: CanvasRenderingContext2D, x: number, y: number, scale = 1) {
  const g = c.createRadialGradient(x, y, 0, x, y, 22 * scale);
  g.addColorStop(0, 'rgba(255,252,240,1)');
  g.addColorStop(0.18, 'rgba(255,214,120,0.95)');
  g.addColorStop(0.45, rgba('signal', 0.45));
  g.addColorStop(1, rgba('signal', 0));
  c.fillStyle = g;
  c.beginPath(); c.arc(x, y, 22 * scale, 0, TAU); c.fill();
}

/** The "software on demand." line of a chorus (nth = 0, 1, 2) or the outro (nth = 3). */
export const hookLine = (ly: Lyrics, nth: number): Line => ly.get('software on demand', nth);
