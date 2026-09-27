// Shared helpers for A1's plates (open, boot):
//  - THE TERMINAL LINE: the handoff between open and boot. open ends with Clarke's sentence collapsed into
//    one mono terminal line with the cursor at its end; boot's first frame is the same line (same pixels).
//  - a camera rig (target / yaw / pitch / dist / roll) that also works looking straight down.
//  - monotone cubic key interpolation (camera dollies that never overshoot), beat helpers.
import * as THREE from 'three';
import { F, font, glyphX, measure, plain } from '../engine/type';
import { rgba } from '../engine/palette';
import type { AudioData } from '../engine/audio';
import { clamp } from '../engine/util';

export type RGB = [number, number, number];

// ------------------------------------------------------------------ the terminal line (logical px)
export const TERM = {
  fam: () => F.mono(400),
  famDim: () => F.mono(300),
  size: 28,
  attrSize: 18,
  base: 556, // baseline of the quote row
  attrBase: 600, // baseline of the attribution row
  promptBase: 668, // baseline of the prompt row (boot)
  capTop: 0.74, // caret top above the baseline (em)
  caretH: 0.98, // caret height (em)
};
export const ATTR = '— Arthur C. Clarke, 1973 ("Profiles of the Future", rev. ed.)';

export interface QuoteLine {
  text: string;
  x0: number;
  width: number;
  /** Left x (px) and char range of each word in the mono line. */
  words: { x: number; w: number; i0: number; i1: number; text: string }[];
  /** Caret top-left at the end of the line. */
  caretX: number;
  caretY: number;
  caretH: number;
  attrX: number;
}

/** Layout of Clarke's sentence as the terminal line. `text` is the lyric line text (typographic). */
export function quoteLine(text: string): QuoteLine {
  const fam = TERM.fam(), s = TERM.size;
  const t = plain(text);
  const width = measure(t, fam, s);
  const x0 = Math.round((1920 - width) / 2);
  const words: QuoteLine['words'] = [];
  let i = 0;
  for (const w of t.split(' ')) {
    const x = x0 + glyphX(t, i, fam, s);
    words.push({ x, w: measure(w, fam, s), i0: i, i1: i + w.length, text: w });
    i += w.length + 1;
  }
  return { text: t, x0, width, words, caretX: x0 + width + 5, caretY: TERM.base - s * TERM.capTop, caretH: s * TERM.caretH, attrX: x0 };
}

/**
 * Draw the terminal quote row (per-word alpha) and the attribution (first `attrChars` chars, alpha `attrA`).
 * Both open (its last frames) and boot (its first frames) draw through this, so the handoff matches.
 */
export function drawQuoteRow(c: CanvasRenderingContext2D, q: QuoteLine, wordAlpha: (i: number) => number, attrChars: number, attrA: number, rowA = 1) {
  c.textBaseline = 'alphabetic';
  c.textAlign = 'left';
  c.font = font(TERM.fam(), TERM.size);
  q.words.forEach((w, i) => {
    const a = wordAlpha(i) * rowA;
    if (a <= 0.003) return;
    c.fillStyle = rgba('bone', a);
    c.fillText(w.text, w.x, TERM.base);
  });
  const n = Math.floor(clamp(attrChars, 0, ATTR.length));
  if (n > 0 && attrA > 0.003) {
    c.font = font(TERM.famDim(), TERM.attrSize);
    c.fillStyle = rgba('ash', 0.9 * attrA);
    c.fillText(ATTR.slice(0, n), q.attrX, TERM.attrBase);
  }
}

// ------------------------------------------------------------------ camera rig
export interface Rig { tx: number; ty: number; tz: number; yaw: number; pitch: number; dist: number; fov: number; roll: number }

/** Place a camera orbiting a target. pitch = PI/2 looks straight down with screen-up = -z (at yaw 0). */
export function applyRig(cam: THREE.PerspectiveCamera, r: Rig) {
  const cp = Math.cos(r.pitch), sp = Math.sin(r.pitch), cy = Math.cos(r.yaw), sy = Math.sin(r.yaw);
  cam.position.set(r.tx + r.dist * cp * sy, r.ty + r.dist * sp, r.tz + r.dist * cp * cy);
  cam.up.set(-sp * sy, cp, -sp * cy);
  cam.lookAt(r.tx, r.ty, r.tz);
  if (r.roll) cam.rotateZ(r.roll);
  cam.fov = r.fov;
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld();
}

export function lerpRig(a: Rig, b: Rig, u: number): Rig {
  const l = (x: number, y: number) => x + (y - x) * u;
  return { tx: l(a.tx, b.tx), ty: l(a.ty, b.ty), tz: l(a.tz, b.tz), yaw: l(a.yaw, b.yaw), pitch: l(a.pitch, b.pitch), dist: l(a.dist, b.dist), fov: l(a.fov, b.fov), roll: l(a.roll, b.roll) };
}

/** World point -> screen px (logical, y down) and view depth. */
const _v = new THREE.Vector3();
export function toScreen(cam: THREE.Camera, x: number, y: number, z: number): { x: number; y: number; z: number; ok: boolean } {
  _v.set(x, y, z).applyMatrix4(cam.matrixWorldInverse);
  const depth = -_v.z;
  _v.applyMatrix4((cam as THREE.PerspectiveCamera).projectionMatrix);
  return { x: (_v.x * 0.5 + 0.5) * 1920, y: (0.5 - _v.y * 0.5) * 1080, z: depth, ok: depth > 0.05 };
}

// ------------------------------------------------------------------ keys
/** Monotone cubic (Fritsch–Carlson) interpolation through (t, v) keys: smooth, never overshoots. */
export class Mono {
  private t: number[]; private v: number[]; private m: number[];
  constructor(keys: [number, number][]) {
    const k = [...keys].sort((a, b) => a[0] - b[0]);
    this.t = k.map((x) => x[0]); this.v = k.map((x) => x[1]);
    const n = k.length, d: number[] = [], m = new Array(n).fill(0);
    for (let i = 0; i < n - 1; i++) d.push((this.v[i + 1]! - this.v[i]!) / Math.max(1e-6, this.t[i + 1]! - this.t[i]!));
    for (let i = 1; i < n - 1; i++) m[i] = d[i - 1]! * d[i]! <= 0 ? 0 : (d[i - 1]! + d[i]!) / 2;
    if (n > 1) { m[0] = d[0]!; m[n - 1] = d[n - 2]!; }
    for (let i = 0; i < n - 1; i++) {
      if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
      const a = m[i]! / d[i]!, b = m[i + 1]! / d[i]!, s = a * a + b * b;
      if (s > 9) { const tau = 3 / Math.sqrt(s); m[i] = tau * a * d[i]!; m[i + 1] = tau * b * d[i]!; }
    }
    this.m = m;
  }
  at(x: number): number {
    const t = this.t, v = this.v, m = this.m, n = t.length;
    if (x <= t[0]!) return v[0]!;
    if (x >= t[n - 1]!) return v[n - 1]!;
    let i = 0;
    while (i < n - 2 && x > t[i + 1]!) i++;
    const h = t[i + 1]! - t[i]!, s = (x - t[i]!) / h;
    const h00 = 2 * s ** 3 - 3 * s ** 2 + 1, h10 = s ** 3 - 2 * s ** 2 + s, h01 = -2 * s ** 3 + 3 * s ** 2, h11 = s ** 3 - s ** 2;
    return h00 * v[i]! + h10 * h * m[i]! + h01 * v[i + 1]! + h11 * h * m[i + 1]!;
  }
}

/** Beat times (analysed grid) in [t0, t1). `sub` = 2 gives 8ths. */
export function beatsIn(au: AudioData, t0: number, t1: number, sub = 1): number[] {
  const out: number[] = [];
  const i0 = Math.ceil(au.beatAt(t0) * sub - 1e-6);
  for (let i = i0; i < i0 + 800; i++) {
    const t = au.timeOfBeat(i / sub);
    if (t >= t1) break;
    if (t >= t0 - 1e-6) out.push(t);
  }
  return out;
}

/** Nearest analysed beat to t (the grid, not onsets). */
export const snapBeat = (au: AudioData, t: number) => au.timeOfBeat(Math.round(au.beatAt(t)));

export const lin = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k];
