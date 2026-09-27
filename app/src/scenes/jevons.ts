// `jevons` — "The cost of making" (pre-chorus 1: "Then the cost of making fell, / and Jevons rang the bell.")
// Ink plate, engraved machinery. One 3D world: a hairline log chart stands on the plane z = 0; behind it a
// mill steam engine (flywheel, crank, crosshead) and a Watt governor spin faster and faster; high above hangs a
// bell on its headstock and wheel.
//  A. oldworld's rain streaks decelerate into the chart's vertical rules; the cobalt paper drains to ink.
//  B. the cursor draws the cost curve; "Then the cost of making" rides the curve as sung; a price tag hangs
//     from the cursor and loses its digits ($1,000,000 -> $1,000 -> $1).
//  C. "fell," — the letters fall down the cliff of the curve and slam onto the $1 floor (downbeat).
//  D. whip-pan to the engine; crane up the governor to the bell.
//  E. "and Jevons rang the" is the bell's cast inscription, lit as sung while the camera orbits the swinging bell.
//  F. "bell." — the clapper strikes: shockwave, flash; the word is held (width 62 -> 125); the DEMAND line
//     shoots straight up past the bell.
//  G. the camera rides the demand line up its log scale, then rolls over: the gold line plunges (hook1).
import * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '../engine/scene';
import { FSPass, Layer2D, W, H, clearRT } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { HEX, LIN, rgba } from '../engine/palette';
import { F, font, layout, type TextLayout } from '../engine/type';
import { Lyrics, norm, type Line, type Word } from '../engine/lyrics';
import { clamp, ease, frameIdx, hash, keys, lerp, noise1, polylineLengths, pointAtLength, prog, pulse, smootherstep, smoothstep, springStep, TAU, type V2 } from '../engine/util';
import { cursorTip, weldSparks, cursorBlink } from './_motifs';
import { Machine, Bell, MACH, BELL_AX, bellR } from './jevons-machine';
import { Projector, setCam, setEngraveCam, mixCam, v3, add3, mul3, sub3, norm3, lerp3, mulRGB, pendulum, type CamKey, type P3, type RGB } from './jevons-kit';

// ------------------------------------------------------------------ the chart (world units on z = 0)
const CH = { x0: 0.5, x1: 18.6, y0: 0.6, dec: 1.15, cliff0: 12.55, cliff1: 14.25, demandX: 17.9, top: 9.2 };
const yOfLog = (L: number) => CH.y0 + L * CH.dec;
function costLog(X: number, smooth = false) {
  let pre = 6.85 - 0.075 * (X - CH.x0) + 0.1 * noise1(X * 0.9, 11);
  if (!smooth) pre += 0.06 * noise1(X * 3.1, 12) + 0.025 * noise1(X * 9.7, 13);
  const k = smootherstep(CH.cliff0, CH.cliff1, X);
  return Math.max(0, pre * (1 - k) + (smooth ? 0 : 0.012 * noise1(X * 6, 14)) * k);
}
/** Year labels on a broken axis: 1970-2020 compressed, 2020-2026 stretched (drawing convention: break mark). */
const X_BREAK = 11.4;
const xOfYear = (y: number) => (y <= 2020 ? CH.x0 + (y - 1970) * 0.216 : X_BREAK + 0.2 + (y - 2020) * 0.66);

type Glyph3 = { ch: string; s: number; w: number; t0: number; t1: number; word: Word; x: number };

export default class Jevons extends Scene {
  cam = new THREE.PerspectiveCamera(32, W / H, 0.05, 500);
  pr = new Projector();
  world = new THREE.Scene();
  mach = new Machine();
  bell = new Bell();
  L3 = new LineBatch(60000, { screen2D: false, blend: 'add', depthTest: true });
  L3top = new LineBatch(8000, { screen2D: false, blend: 'add', depthTest: false });
  L2 = new LineBatch(6000, { screen2D: true, blend: 'add' });
  text = new Layer2D();
  bg = new FSPass(/* glsl */ `
    uniform float uLevel; uniform float uT; uniform float uGlow;
    void main() {
      vec2 p = (vUv - 0.5) * vec2(16.0 / 9.0, 1.0);
      vec3 c = mix(C_INK, C_INK2, 0.55 * (1.0 - smoothstep(0.0, 1.1, length(p))));
      c += C_BLOOD * uGlow * 0.25 * (1.0 - smoothstep(0.0, 0.9, length(p - vec2(0.0, -0.1))));
      fragColor = vec4(c, 1.0);
    }`, { uLevel: { value: 0 }, uT: { value: 0 }, uGlow: { value: 0 } });
  /** oldworld's cobalt paper, over the meshes, draining downward (a ragged tide line) in the first beat. */
  paper = new FSPass(/* glsl */ `
    uniform float uLevel; uniform float uT;
    void main() {
      float edge = uLevel + 0.018 * snoise(vec2(vUv.x * 9.0, uT * 2.0)) + 0.01 * snoise(vec2(vUv.x * 41.0, 3.0));
      float y = 1.0 - vUv.y;
      float wet = 1.0 - smoothstep(edge - 0.003, edge + 0.003, y);
      float tide = hatch(FRAG_PX.y / 3.0, 0.5) * (1.0 - smoothstep(0.0, 0.06, abs(y - edge - 0.03))) * 0.5;
      vec3 c = C_COBALT * wet + C_BONE * tide * 0.3;
      fragColor = vec4(c, max(wet, tide * 0.3));
    }`, { uLevel: { value: 0 }, uT: { value: 0 } }, { blending: THREE.NormalBlending, transparent: true });

  // timing
  T0 = 0; T1 = 0;
  l1!: Line; l2!: Line;
  wThen!: Word; wCost!: Word; wMaking!: Word; wFell!: Word; wAnd!: Word; wJevons!: Word; wRang!: Word; wThe2!: Word; wBell!: Word;
  db: number[] = [];
  tDraw = 0; tLand = 0; tWhip = 0; tCrane = 0; tBellCut = 0; tStrike = 0; tRide = 0; tRoll = 0; tRollEnd = 0;

  // chart geometry
  cp: V2[] = []; cpL = new Float32Array(0); tp: V2[] = []; tpL = new Float32Array(0);
  rideFam = F.archivo(100, 800); rideEm = 1.0;
  rideGlyphs: Glyph3[] = [];
  headKeys: [number, number, (x: number) => number][] = [];
  fellLay!: TextLayout; fellEm = 1.35;
  fellRest: number[] = [];

  // bell inscription
  insFam = F.archivo(112.5, 700);
  insGlyphs: { ch: string; a: number; wa: number; t0: number; t1: number; lit: boolean }[] = [];
  insR = 0; insY = 1.02; insEm = 0.34;
  mono = F.mono(500);

  override async init() {
    const ly = this.ctx.lyrics, au = this.ctx.audio;
    this.T0 = this.ctx.start; this.T1 = this.ctx.end;
    this.l1 = ly.get('the cost of making');
    this.l2 = ly.get('Jevons rang');
    const w1 = (q: string) => this.l1.words.find((w) => norm(w.w) === norm(q))!;
    const w2 = (q: string) => this.l2.words.find((w) => norm(w.w) === norm(q))!;
    this.wThen = w1('Then'); this.wCost = w1('cost'); this.wMaking = w1('making'); this.wFell = w1('fell');
    this.wAnd = w2('and'); this.wJevons = w2('Jevons'); this.wRang = w2('rang'); this.wThe2 = w2('the'); this.wBell = w2('bell');
    this.db = au.downbeats.filter((d) => d > this.T0 + 0.1 && d < this.T1 - 0.1);
    const beatAfter = (x: number) => au.timeOfBeat(Math.ceil(au.beatAt(x) - 1e-3));
    const downAfter = (x: number) => au.downbeats.find((d) => d >= x - 0.02) ?? beatAfter(x);
    this.tDraw = beatAfter(this.T0 + 0.3);                           // the cursor starts drawing on the first beat
    this.tLand = downAfter(this.wFell.start + 0.15);                  // FELL slams on the downbeat after "fell"
    this.tWhip = beatAfter(this.tLand + 0.3);                         // whip-pan to the engine
    this.tCrane = beatAfter(this.tWhip + 0.2);                        // crane up to the bell
    this.tBellCut = downAfter(this.wJevons.start + 0.05);             // punch-in on the bell (downbeat)
    this.tStrike = this.wBell.start;                                  // the clapper strikes exactly on "bell"
    this.tRide = downAfter(this.tStrike + 0.2);                       // ride the demand line
    this.tRoll = au.timeOfBeat(Math.round(au.beatAt(this.T1)) - 2);  // roll over for the last two beats
    this.tRollEnd = this.T1 - 0.12;

    // ---- chart curves
    for (let X = CH.x0; X <= CH.x1 + 1e-6; X += 0.01) {
      this.cp.push({ x: X, y: yOfLog(costLog(X)) });
      if (X <= CH.cliff0 + 0.4) this.tp.push({ x: X, y: yOfLog(costLog(X, true)) });
    }
    this.tpL = polylineLengths(this.tp);
    this.cpL = polylineLengths(this.cp);

    // ---- riding lyric: "Then the cost of making" along the curve, baseline slightly above
    const words = this.l1.words.filter((w) => w !== this.wFell);
    const txt = words.map((w) => w.w).join(' ');
    const lay = layout(txt, this.rideFam, 100, 2);
    const s0 = 0.75, avail = this.tpL[this.tpL.length - 1]! - 0.9 - s0;
    this.rideEm = Math.min(1.25, (avail / lay.width) * 100);
    const sc = this.rideEm / 100;
    let ci = 0;
    for (const w of words) {
      const n = w.w.length;
      for (let j = 0; j < n; j++, ci++) {
        const g = lay.glyphs[ci]!;
        const t0 = lerp(w.start, w.end, j / n), t1 = lerp(w.start, w.end, (j + 1) / n);
        const s = s0 + g.x * sc;
        this.rideGlyphs.push({ ch: g.ch, s, w: g.w * sc, t0, t1, word: w, x: pointAtLength(this.tp, this.tpL, s + g.w * sc).x });
      }
      ci++; // space
    }
    // the head (cursor) X over time: glyph-synced, then the cliff, then the run-out
    const hk: [number, number, (x: number) => number][] = [[this.T0, CH.x0, ease.linear], [this.tDraw, CH.x0, ease.linear]];
    const firstX = pointAtLength(this.tp, this.tpL, s0).x;
    hk.push([this.wThen.start, firstX, ease.inOutCubic]);
    for (const g of this.rideGlyphs) hk.push([g.t1, g.x, ease.linear]);
    hk.push([this.wFell.start, CH.cliff0 - 0.05, ease.inOutCubic]);
    hk.push([this.wFell.end + 0.05, CH.cliff1 + 0.1, ease.inQuad]);
    hk.push([this.tLand + 0.35, CH.demandX, ease.outCubic]);
    // monotone times
    for (let i = 1; i < hk.length; i++) if (hk[i]![0] <= hk[i - 1]![0]) hk[i]![0] = hk[i - 1]![0] + 1e-3;
    this.headKeys = hk;

    // ---- FELL
    this.fellLay = layout('FELL,', F.archivo(100, 900), 100, 3);
    const fsc = this.fellEm / 100;
    const restX0 = CH.cliff1 - 0.05;
    this.fellRest = this.fellLay.glyphs.map((g) => restX0 + g.x * fsc);

    // ---- bell inscription (around the waist band)
    this.insR = bellR(this.insY) + 0.012;
    const ins = [this.wAnd, this.wJevons, this.wRang, this.wThe2];
    const itxt = ins.map((w) => w.w.toUpperCase()).join(' · ') + ' · ';
    const il = layout(itxt, this.insFam, 100, 6);
    this.insEm = Math.min(0.34, (0.86 * TAU * this.insR) / (il.width / 100));
    const isc = this.insEm / 100;
    const aSpan = (il.width * isc) / this.insR;
    const a0 = -0.25;
    let k = 0;
    ins.forEach((w, wi) => {
      const n = w.w.length;
      for (let j = 0; j < n; j++, k++) {
        const g = il.glyphs[k]!;
        this.insGlyphs.push({ ch: g.ch, a: a0 + ((g.x + g.w / 2) * isc) / this.insR, wa: (g.w * isc) / this.insR, t0: lerp(w.start, w.end, j / n), t1: lerp(w.start, w.end, (j + 1) / n), lit: true });
      }
      if (wi < ins.length) for (let q = 0; q < 3 && k < il.glyphs.length; q++, k++) {
        const g = il.glyphs[k]!;
        if (g.ch !== ' ') this.insGlyphs.push({ ch: g.ch, a: a0 + ((g.x + g.w / 2) * isc) / this.insR, wa: (g.w * isc) / this.insR, t0: w.end, t1: w.end + 0.1, lit: false });
      }
    });
    void aSpan;

    this.world.add(this.mach.root);
    this.world.add(this.bell.root);
  }

  // ------------------------------------------------------------------ time functions
  headX(t: number) { return keys(t, this.headKeys); }
  headP(t: number): P3 { const X = this.headX(t); return v3(X, yOfLog(costLog(X)), 0.02); }
  /** Flywheel angular speed (rad/s): the engine gets more efficient all through the plate. */
  omega(t: number) {
    return 1.4 + 3.2 * smoothstep(this.wCost.start, this.tLand, t) + 7 * smoothstep(this.tLand, this.tStrike, t) + 6 * smoothstep(this.tStrike, this.T1, t);
  }
  phi(t: number) {
    // integrate the speed (fixed steps from the plate start: a pure function of t)
    const dt = 1 / 120;
    let a = 0.3;
    const n = Math.floor((t - this.T0) / dt);
    for (let i = 0; i < n; i++) a += this.omega(this.T0 + (i + 0.5) * dt) * dt;
    a += this.omega(t) * ((t - this.T0) - n * dt);
    return a;
  }
  bellSwing(t: number) {
    const T = 1.25, ph = (TAU * (t - this.tStrike)) / T + Math.PI / 2;
    const A = keys(t, [[this.T0, 0.0], [this.wAnd.start - 0.4, 0.02], [this.wJevons.start, 0.12], [this.wRang.start, 0.25], [this.tStrike, 0.46, ease.inOutQuad], [this.T1, 0.3]]);
    return A * Math.sin(ph);
  }
  clapperRel(t: number, sw: number) {
    const cMax = 0.44;
    let r = clamp(-sw * 0.98, -cMax, cMax);
    if (t > this.tStrike) r -= 0.12 * Math.sin((t - this.tStrike) * 24) * Math.exp(-(t - this.tStrike) * 7);
    return r;
  }
  /** Demand line head height. */
  demandY(t: number) {
    if (t < this.tStrike) return CH.y0;
    const e = t - this.tStrike;
    return CH.y0 + 21 * (1 - Math.exp(-e * 5)) + 10.5 * e + 9 * Math.pow(prog(t, this.tRoll, this.T1), 2);
  }

  // ------------------------------------------------------------------ camera
  camAt(t: number): CamKey {
    const T = this;
    const rideT = (x: number) => {
      const h = this.headP(x);
      return h;
    };
    if (t < this.wThen.start) {
      // A: straight-on at the top-left of the chart (rain rules), pulling back and yawing to reveal the engine
      const u = prog(t, this.T0 + 0.25, this.wThen.start + 0.2, ease.inOutCubic);
      const h = rideT(t);
      const tg = lerp3(v3(1.6, 7.8, 0), add3(h, v3(1.6, -1.2, 0)), u);
      const pos = lerp3(v3(1.6, 7.8, 4.2), add3(h, v3(-2.6, 1.0, 11.5)), u);
      return { pos, tgt: tg, roll: lerp(0, -0.05, u), fov: 32 };
    }
    if (t < this.wFell.start) {
      // B: ride along with the head; a snap to a low 3/4 angle on the downbeat
      const h = this.headP(t);
      const d1 = this.db[0] ?? this.T0 + 2;
      const k = prog(t, d1 - 0.05, d1 + 0.3, ease.outExpo);
      const drift = prog(t, this.wThen.start, this.wFell.start);
      const offA = v3(-2.6 + drift, 1.0, 11.5 - drift * 1.5);
      const offB = v3(3.4 - drift * 1.2, -2.6, 9.4 - drift * 1.4);
      const off = lerp3(offA, offB, k);
      const tg = add3(h, v3(lerp(1.6, 0.4, k), lerp(-1.2, 0.2, k), 0));
      return { pos: add3(tg, off), tgt: tg, roll: lerp(-0.05, 0.07, k) + 0.02 * Math.sin(t * 1.3), fov: 32 };
    }
    if (t < this.tWhip) {
      // C: FELL falls down the cliff; the camera tilts down with it and slams on the landing
      // follow the falling letters (their mean position), settling on the landed word
      const bot = v3(CH.cliff1 + 1.3, CH.y0 + 0.8, 0);
      let sx = 0, sy = 0, n = 0;
      for (let i = 0; i < this.fellLay.glyphs.length; i++) {
        const g = this.fellGlyph(i, Math.min(t, this.tLand));
        if (g) { sx += g.x; sy += g.y; n++; }
      }
      const u = prog(t, this.wFell.start, this.tLand, ease.inQuad);
      const mean = n ? v3(sx / n + 0.9, sy / n + 0.75, 0) : v3(CH.cliff0 + 0.4, yOfLog(costLog(CH.cliff0)) - 0.4, 0);
      const tg = lerp3(mean, bot, prog(t, this.wFell.start + 0.1, this.tLand, ease.inOutCubic));
      const push = prog(t, this.tLand, this.tWhip, ease.outCubic);
      const pos = add3(tg, v3(lerp(2.2, -0.6, u) - 0.8 * push, lerp(1.6, 0.9, u) + 0.2 * push, lerp(11.5, 8.2, u) - 1.4 * push));
      return { pos, tgt: tg, roll: lerp(0.07, -0.04, u), fov: 32 };
    }
    // D: whip-pan to the engine behind the chart, then crane up to the bell
    const M = MACH;
    const bellC = v3(M.bell.x, M.bell.y - BELL_AX + 1.0, M.bell.z);
    const chartEnd: CamKey = { pos: v3(CH.cliff1 + 0.7, CH.y0 + 1.7, 6.8), tgt: v3(CH.cliff1 + 1.3, CH.y0 + 0.8, 0), roll: -0.04, fov: 32 };
    const engine: CamKey = { pos: v3(15.8, 4.2, -1.2), tgt: v3(9.4, 2.4, -7.2), roll: 0.08, fov: 34 };
    const govTop: CamKey = { pos: v3(16.2, 8.6, -1.0), tgt: v3(M.gov.x, M.govPivotY, M.gov.z), roll: -0.03, fov: 34 };
    const orbit = (x: number): CamKey => {
      // azimuth follows the sung inscription glyph so the word being sung faces the camera
      const beta = this.insAz(x);
      const punch = x >= this.tBellCut ? 1 : 0;
      const R = lerp(6.2, 4.3, punch) - 0.5 * prog(x, this.tBellCut, this.tStrike);
      const hgt = lerp(-1.0, -0.75, punch);
      const pos = add3(bellC, v3(Math.sin(beta) * R, hgt, Math.cos(beta) * R));
      return { pos, tgt: add3(bellC, v3(0, lerp(0.1, -0.05, punch), 0)), roll: lerp(0.06, -0.08, punch) * Math.cos(beta * 0.7), fov: lerp(34, 36, punch) };
    };
    if (t < this.tCrane) {
      const u = prog(t, this.tWhip, this.tWhip + 0.34, ease.inOutExpo);
      const k = mixCam(chartEnd, engine, u);
      const drift = prog(t, this.tWhip, this.tCrane);
      k.pos = add3(k.pos, v3(-0.8 * drift, 0.3 * drift, -0.6 * drift));
      return k;
    }
    if (t < this.tStrike) {
      // settle on the governor, then a fast tilt up the rope to the bell, arriving on "and"
      const u1 = prog(t, this.tCrane, this.tCrane + 0.3, ease.inOutCubic);
      const u2 = prog(t, this.wAnd.start - 0.28, this.wAnd.start + 0.1, ease.inOutExpo);
      const a = mixCam(engine, govTop, u1);
      return mixCam(a, orbit(t), u2);
    }
    // F: the strike: kick back to reveal the demand line erupting on the right of the bell
    const lineX = CH.demandX;
    if (t < this.tRide) {
      const o = orbit(this.tStrike);
      const u = prog(t, this.tStrike, this.tStrike + 0.3, ease.outExpo);
      const wide: CamKey = { pos: v3(bellC.x + 3.2, bellC.y - 3.2, bellC.z + 13.5), tgt: v3((bellC.x + lineX) / 2 + 0.2, bellC.y + 0.4, -1.0), roll: 0.05, fov: 38 };
      return mixCam(o, wide, u);
    }
    // G: ride the demand line up; roll over at the end so the line plunges
    const hy = this.demandY(t);
    const catchK = prog(t, this.tRide, this.tRide + 0.6, ease.inOutCubic);
    const rk = prog(t, this.tRoll, this.tRollEnd, ease.inOutCubic);
    const cy = lerp(bellC.y + 1.5, hy - lerp(2.3, 1.15, rk), catchK);
    const pos = v3(lerp(lineX + 2.6, lineX + 0.05, rk), cy - lerp(1.2, 0.0, rk), lerp(7.6, 6.2, rk));
    const tgt = v3(lerp(lineX - 1.4, lineX, rk), cy + lerp(1.9, 0.0, rk), 0);
    return { pos, tgt, roll: lerp(0.04, Math.PI, rk), fov: lerp(36, 40, rk) };
  }
  /** Camera azimuth around the bell, following the inscription as it is sung. */
  insAz(t: number) {
    const gs = this.insGlyphs.filter((g) => g.lit);
    const first = gs[0]!, last = gs[gs.length - 1]!;
    if (t <= first.t0) return first.a - 0.5 + 0.5 * prog(t, first.t0 - 0.8, first.t0, ease.outCubic);
    let a = last.a;
    for (const g of gs) {
      if (t < g.t0) { a = g.a - g.wa / 2; break; }
      if (t < g.t1) { a = lerp(g.a - g.wa / 2, g.a + g.wa / 2, (t - g.t0) / (g.t1 - g.t0)); break; }
    }
    if (t > last.t1) a = last.a + 0.25 * prog(t, last.t1, this.tStrike + 0.3, ease.outCubic);
    return a + 0.18;
  }

  // ------------------------------------------------------------------ render
  render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer, comp } = this.ctx;
    const t = f.t;
    const ck = this.camAt(t);
    setCam(this.cam, ck);
    this.pr.update(this.cam);

    // ---- pose the hardware
    const phi = this.phi(t);
    const om = this.omega(t);
    const theta = Math.acos(clamp(2.2 / (om * om * 0.25 + 2.3), -1, 1)) * 1.05;
    this.mach.pose(phi, phi * 0.9, theta);
    const sw = this.bellSwing(t);
    this.bell.pose(sw, this.clapperRel(t, sw));
    const inBellPart = t >= this.tCrane;
    const machineClose = t >= this.tWhip && t < this.tBellCut;
    this.mach.setBright(machineClose ? 1.0 : 0.62);
    const ring = t >= this.tStrike ? Math.exp(-(t - this.tStrike) / 0.35) : 0;
    this.bell.mBell.uniforms.uEmit!.value = 0.35 * ring;
    this.bell.mBell.uniforms.uBright!.value = 1 + 0.4 * ring;
    setEngraveCam([...this.mach.mats, ...this.bell.mats], this.cam, v3(0.5, 0.75, 0.45));

    // ---- background
    const level = 1 - prog(t, this.T0 + 0.05, this.tDraw + 0.05, ease.inOutCubic);
    this.bg.u.uLevel!.value = level;
    this.bg.u.uT!.value = t;
    this.bg.u.uGlow!.value = 0.6 * ring + 0.2 * prog(t, this.tRide, this.T1);
    clearRT(renderer, out, LIN.ink);
    this.bg.render(renderer, out);
    renderer.setRenderTarget(out);
    renderer.clearDepth();
    renderer.render(this.world, this.cam);
    if (level > 0.001) {
      this.paper.u.uLevel!.value = level;
      this.paper.u.uT!.value = t;
      this.paper.render(renderer, out);
    }

    // ---- 3D lines
    const L3 = this.L3; L3.clear();
    const Lt = this.L3top; Lt.clear();
    this.drawChart(t, L3, level);
    this.drawFloor(t, L3);
    this.drawBellLines(t, L3, ring);
    this.drawDemand(t, L3, Lt);
    L3.render(renderer, out, this.cam);
    Lt.render(renderer, out, this.cam);

    // ---- type
    const Tx = this.text; Tx.clear();
    const c = Tx.ctx;
    this.drawChartText(c, t, level);
    this.drawRide(c, t);
    this.drawTag(c, t);
    this.drawFell(c, t);
    this.drawMachineNotes(c, t);
    if (inBellPart) this.drawInscription(c, t, ring);
    this.drawBellWord(c, t);
    this.drawDemandText(c, t);
    c.setTransform(1, 0, 0, 1, 0, 0);
    comp.draw(renderer, Tx.upload(), out);

    // ---- the cursor (2D glow on top)
    const L2 = this.L2; L2.clear();
    this.drawCursor(t, L2);
    L2.render(renderer, out);

    // ---- post
    const land = pulse(t, this.tLand, 0.09);
    const shk = 16 * land + 34 * pulse(t, this.tStrike, 0.1) + 6 * pulse(t, this.db[0] ?? 0, 0.08) + 4 * f.a.kick * (t > this.tRide ? 1 : 0.3);
    const fi = frameIdx(t);
    const shake: [number, number] = [shk * (hash(fi, 1) - 0.5) * 2, shk * (hash(fi, 2) - 0.5) * 2];
    return {
      bloom: (t < this.tWhip ? 0.5 : 0.7) + 0.5 * ring, shake,
      flash: 0.4 * pulse(t, this.tStrike, 0.06) + 0.1 * land,
      ca: 1.2 + 6 * pulse(t, this.tStrike, 0.12) + 2 * land,
      zoom: 1 + 0.035 * land + 0.05 * pulse(t, this.tStrike, 0.12),
      vignette: 0.42,
    };
  }

  // ------------------------------------------------------------------ chart lines
  drawChart(t: number, L: LineBatch, level: number) {
    const bone = LIN.bone, sig = LIN.signal;
    const rainEnd = this.tDraw;
    const rain = 1 - prog(t, this.T0, rainEnd, ease.outCubic); // 1 = streaks falling fast
    const hIn = prog(t, this.T0 + 0.35, this.tDraw + 0.35, ease.outCubic);
    const behind = this.pr.camPos.z < 0.3 ? 0.35 : 1;
    // vertical rules: majors every unit, minors every quarter (the rain lines of oldworld)
    for (let i = 0; i <= Math.round((CH.x1 + 0.4) / 0.25); i++) {
      const X = i * 0.25;
      const major = i % 4 === 0;
      const a = (major ? 0.26 : 0.1) * behind * (1 + 1.4 * rain);
      const y0 = -0.3, y1 = CH.top + 0.4;
      if (rain > 0.01) {
        // streaks: dashes sliding down, lengthening until they join into a rule
        const sp = 18 * rain * rain + 0.2;
        const dash = lerp(4.2, 0.35, rain), gap = lerp(0.0, 0.9, rain);
        const per = dash + gap;
        const off = ((t - this.T0) * sp + hash(i, 7) * per * 3) % per;
        for (let y = y1 + off; y > y0 - per; y -= per) {
          const ya = Math.min(y1, y), yb = Math.max(y0, y - dash);
          if (ya > yb) L.seg(X, ya, 0, X, yb, 0, major ? 1.3 : 1.0, bone[0] * a, bone[1] * a, bone[2] * a, 1);
        }
      } else L.seg(X, y1, 0, X, y0, 0, major ? 1.3 : 1.0, bone[0] * a, bone[1] * a, bone[2] * a, 1);
    }
    // horizontal decades draw in from the left on the first beats; minor log rules fainter
    if (hIn > 0) {
      for (let d = 0; d <= 7; d++) {
        const y = yOfLog(d);
        const xe = lerp(0, CH.x1 + 0.4, prog(hIn, d * 0.06, d * 0.06 + 0.5));
        L.seg(-0.2, y, 0, xe, y, 0, 1.3, bone[0] * 0.3 * behind, bone[1] * 0.3 * behind, bone[2] * 0.3 * behind, 1);
        if (d < 7) for (let m = 2; m <= 9; m++) {
          const ym = yOfLog(d + Math.log10(m));
          L.seg(-0.2, ym, 0, xe, ym, 0, 0.8, bone[0] * 0.07 * behind, bone[1] * 0.07 * behind, bone[2] * 0.07 * behind, 1);
        }
      }
      // axis break mark on the time axis (two slanted hairlines)
      for (const dx of [-0.07, 0.07]) L.seg(X_BREAK + dx - 0.1, CH.y0 - 0.45, 0, X_BREAK + dx + 0.1, CH.y0 - 0.15, 0, 1.4, bone[0] * 0.6 * hIn, bone[1] * 0.6 * hIn, bone[2] * 0.6 * hIn, 1);
      // ticks
      for (const yr of [1970, 1980, 1990, 2000, 2010, 2020, 2022, 2024, 2026]) {
        const X = xOfYear(yr);
        L.seg(X, CH.y0 - 0.12, 0, X, CH.y0 - 0.32, 0, 1.3, bone[0] * 0.5 * hIn, bone[1] * 0.5 * hIn, bone[2] * 0.5 * hIn, 1);
      }
    }
    void level;
    // the cost curve, drawn up to the head (gold, with a warm halo)
    if (t > this.tDraw) {
      const hx = this.headX(t);
      let prev: V2 | null = null;
      const cool = (x: number) => {
        // gold near the head, cooling to a bright bone line behind it
        const d = hx - x;
        return clamp(1 - d / 2.4);
      };
      for (const p of this.cp) {
        if (p.x > hx) break;
        if (prev) {
          const k = cool(p.x);
          const col: RGB = [lerp(bone[0] * 0.7, sig[0] * 1.8, k), lerp(bone[1] * 0.7, sig[1] * 1.8, k), lerp(bone[2] * 0.7, sig[2] * 1.8, k)];
          L.seg(prev.x, prev.y, 0.02, p.x, p.y, 0.02, 2.6, col[0], col[1], col[2], 1);
          L.seg(prev.x, prev.y, 0.02, p.x, p.y, 0.02, 10, sig[0] * 0.12 * k, sig[1] * 0.12 * k, sig[2] * 0.12 * k, 1);
        }
        prev = p;
      }
      const hp = this.headP(t);
      if (prev) L.seg(prev.x, prev.y, 0.02, hp.x, hp.y, 0.02, 2.6, sig[0] * 1.8, sig[1] * 1.8, sig[2] * 1.8, 1);
      // drop lines from the head to the axes (a plotter's crosshair)
      const ch = 0.22 * prog(t, this.tDraw, this.tDraw + 0.3) * (1 - prog(t, this.tLand, this.tWhip));
      L.seg(hp.x, hp.y, 0.01, hp.x, CH.y0 - 0.3, 0.01, 1, sig[0] * ch, sig[1] * ch, sig[2] * ch, 1);
      L.seg(hp.x, hp.y, 0.01, -0.2, hp.y, 0.01, 1, sig[0] * ch, sig[1] * ch, sig[2] * ch, 1);
    }
  }

  drawFloor(t: number, L: LineBatch) {
    // an engraved shop floor under the engine: boards along x, hairlines fading with distance
    const y = MACH.floorY, a0 = 0.09 * prog(t, this.T0 + 0.4, this.wThen.start);
    if (a0 <= 0) return;
    const b = LIN.bone;
    for (let z = -12; z <= -0.4; z += 0.5) L.seg(-2, y, z, 22, y, z, 1, b[0] * a0, b[1] * a0, b[2] * a0, 1);
    for (let x = -2; x <= 22; x += 2.0) L.seg(x, y, -12, x, y, -0.4, 1, b[0] * a0 * 0.6, b[1] * a0 * 0.6, b[2] * a0 * 0.6, 1);
  }

  drawBellLines(t: number, L: LineBatch, ring: number) {
    if (t < this.tCrane - 0.2) return;
    const b = LIN.bone, s = LIN.signal;
    // inscription band hairlines (two rings around the waist, above and below the letters)
    for (const dy of [-0.26, 0.3]) {
      const y = this.insY + dy, r = bellR(y) + 0.01;
      let p0 = this.bell.toWorld(v3(0, y, r));
      for (let i = 1; i <= 96; i++) {
        const a = (i / 96) * TAU;
        const p1 = this.bell.toWorld(v3(Math.sin(a) * r, y, Math.cos(a) * r));
        L.seg(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z, 1.2, b[0] * 0.55, b[1] * 0.55, b[2] * 0.55, 1);
        p0 = p1;
      }
    }
    // the rope from the wheel, down out of frame
    const wheelP = this.bell.toWorld(v3(1.62, BELL_AX - 0.3, 1.3));
    L.seg(wheelP.x, wheelP.y, wheelP.z, MACH.bell.x + 1.62, MACH.bell.y - 14, MACH.bell.z + 1.3, 3, b[0] * 0.6, b[1] * 0.6, b[2] * 0.6, 1);
    // shockwave: rings expanding from the mouth + sound hatching
    if (t >= this.tStrike) {
      const e = t - this.tStrike;
      const mouth = this.bell.toWorld(v3(0, 0.05, 0));
      const n = this.bell.dirToWorld(v3(0, 1, 0));
      const ax1 = norm3({ x: 1, y: 0, z: 0 });
      const ax2 = norm3({ x: -n.y * 0 + 0, y: n.z, z: -n.y });
      for (let k = 0; k < 5; k++) {
        const ek = e - k * 0.07;
        if (ek < 0) continue;
        const R = 1.35 + ek * (10 + k * 3);
        const a = Math.exp(-ek / 0.45) * (k === 0 ? 1.6 : 0.9);
        const hot = k === 0 ? mulRGB(LIN.ember, 1.4) : s;
        let p0: P3 | null = null;
        for (let i = 0; i <= 120; i++) {
          const q = (i / 120) * TAU;
          const p1 = add3(add3(mouth, mul3(ax1, Math.cos(q) * R)), mul3(ax2, Math.sin(q) * R));
          const p1b = add3(p1, mul3(n, -0.25 * ek * k));
          if (p0) L.seg(p0.x, p0.y, p0.z, p1b.x, p1b.y, p1b.z, 2.2 - k * 0.3, hot[0] * a, hot[1] * a, hot[2] * a, 1);
          p0 = p1b;
        }
      }
      // radial "sound" rays around the bell (engraver's vibration marks)
      const rc = this.bell.toWorld(v3(0, 1.0, 0));
      for (let i = 0; i < 28; i++) {
        const q = (i / 28) * TAU + 0.1;
        const d = v3(Math.cos(q), Math.sin(q) * 0.85, 0.3 * Math.sin(q * 2));
        const r0 = 1.9 + e * 3.5, r1 = r0 + 0.5 + 0.8 * hash(i, 3);
        const a = ring * 1.2 * (0.5 + 0.5 * hash(i, 9));
        L.seg(rc.x + d.x * r0, rc.y + d.y * r0, rc.z + d.z * r0, rc.x + d.x * r1, rc.y + d.y * r1, rc.z + d.z * r1, 1.5, s[0] * a, s[1] * a, s[2] * a, 1);
      }
    }
    void ring;
  }

  drawDemand(t: number, L: LineBatch, Lt: LineBatch) {
    if (t < this.tStrike) return;
    const s = LIN.signal, e = LIN.ember;
    const X = CH.demandX, hy = this.demandY(t);
    // the line itself (always on top: it is the cursor)
    Lt.seg(X, CH.y0, 0.05, X, hy, 0.05, 5, s[0] * 2.4, s[1] * 2.4, s[2] * 2.4, 1);
    Lt.seg(X, Math.max(CH.y0, hy - 3), 0.05, X, hy, 0.05, 3, e[0] * 2, e[1] * 2, e[2] * 2, 1);
    Lt.seg(X, CH.y0, 0.05, X, hy, 0.05, 26, s[0] * 0.14, s[1] * 0.14, s[2] * 0.14, 1);
    // its log scale: a tick every decade of demand, labels in drawDemandText
    const b = LIN.bone;
    for (let d = 1; d <= 12; d++) {
      const y = this.demandTickY(d);
      if (y > hy) break;
      const a = 0.7;
      L.seg(X - 0.5, y, 0, X + 0.5, y, 0, 1.4, b[0] * a, b[1] * a, b[2] * a, 1);
      for (let m = 2; m <= 9; m++) {
        const ym = this.demandTickY(d - 1 + Math.log10(m));
        if (ym > hy) break;
        L.seg(X - 0.18, ym, 0, X + 0.18, ym, 0, 1, b[0] * 0.3, b[1] * 0.3, b[2] * 0.3, 1);
      }
    }
    // everyone else's demand: a field of thin lines rising behind and around it, heads glowing
    for (let i = 0; i < 120; i++) {
      const tb = this.tStrike + 0.05 + hash(i, 31) * 1.3;
      if (t < tb) continue;
      const x = X + (hash(i, 32) - 0.6) * 16, z = -7 + hash(i, 33) * 8.5;
      if (Math.abs(x - X) < 0.8 && z > -1.5) continue;
      const sp = 9 + hash(i, 34) * 7;
      const e2 = t - tb;
      const y1 = CH.y0 + sp * e2 + 12 * (1 - Math.exp(-e2 * 3)) * hash(i, 35);
      const gold = hash(i, 36) < 0.35;
      const col = gold ? s : b;
      const a = gold ? 1.1 : 0.45;
      L.seg(x, Math.max(CH.y0 - 2, y1 - 26), z, x, y1, z, gold ? 2.0 : 1.3, col[0] * a, col[1] * a, col[2] * a, 1);
      const hc = gold ? mulRGB(LIN.ember, 2.2) : mulRGB(b, 1.0);
      L.seg(x, y1 - 0.04, z, x, y1, z, gold ? 6 : 4, hc[0], hc[1], hc[2], 1);
    }
    // ride streaks: faint vertical hairlines around the line (speed)
    if (t > this.tRide - 0.2) {
      for (let i = 0; i < 26; i++) {
        const x = X + (hash(i, 21) - 0.5) * 9, z = -3 + hash(i, 22) * 5;
        const y0 = hy - 30 + hash(i, 23) * 40, len = 2 + hash(i, 24) * 6;
        const a = 0.12 * prog(t, this.tRide - 0.2, this.tRide + 0.4);
        L.seg(x, y0, z, x, y0 + len, z, 1, b[0] * a, b[1] * a, b[2] * a, 1);
      }
    }
  }
  demandTickY(d: number) { return CH.y0 + 3.2 + d * 5.2; }

  // ------------------------------------------------------------------ type on the chart
  onChart(c: CanvasRenderingContext2D, x: number, y: number, em: number, ang = 0): boolean {
    const X = v3(Math.cos(ang), Math.sin(ang), 0), Y = v3(-Math.sin(ang), Math.cos(ang), 0);
    return this.pr.plane(c, v3(x, y, 0.02), X, Y, em / 100);
  }
  chartVis() { return this.pr.camPos.z > 0.5; }

  drawChartText(c: CanvasRenderingContext2D, t: number, level: number) {
    if (!this.chartVis() || t > this.tCrane + 0.4) return;
    const k = prog(t, this.T0 + 0.5, this.tDraw + 0.6) * (1 - prog(t, this.tWhip, this.tWhip + 0.25));
    if (k <= 0) return;
    c.textBaseline = 'alphabetic';
    // y labels
    const labs = ['$1', '$10', '$100', '$1k', '$10k', '$100k', '$1M', '$10M'];
    c.font = font(this.mono, 100);
    c.textAlign = 'right';
    for (let d = 0; d <= 7; d++) {
      const kk = k * prog(t, this.T0 + 0.5 + d * 0.05, this.T0 + 0.9 + d * 0.05);
      if (kk <= 0 || !this.onChart(c, -0.3, yOfLog(d) - 0.09, 0.3)) continue;
      c.fillStyle = rgba('ash', 0.85 * kk);
      c.fillText(labs[d]!, 0, 0);
    }
    c.textAlign = 'center';
    for (const yr of [1970, 1980, 1990, 2000, 2010, 2020, 2022, 2024, 2026]) {
      if (!this.onChart(c, xOfYear(yr), CH.y0 - 0.66, 0.28)) continue;
      c.fillStyle = rgba('ash', 0.8 * k);
      c.fillText(String(yr), 0, 0);
    }
    // title block, typed in
    const title = 'FIG. 1 — COST OF MAKING ONE PIECE OF SOFTWARE (log scale)';
    const n = Math.floor(title.length * prog(t, this.T0 + 0.6, this.wThen.start + 0.4));
    if (n > 0 && this.onChart(c, 0.0, CH.top + 0.5, 0.3)) {
      c.textAlign = 'left';
      c.font = font(F.mono(600), 100);
      c.fillStyle = rgba('bone', 0.9 * k);
      c.fillText(title.slice(0, n), 0, 0);
    }
    if (this.onChart(c, X_BREAK - 0.1, CH.y0 - 1.05, 0.2)) {
      c.textAlign = 'center';
      c.font = font(F.mono(400, true), 100);
      c.fillStyle = rgba('graphite', 0.95 * k);
      c.fillText('scale changes', 0, 0);
    }
    void level;
  }

  drawRide(c: CanvasRenderingContext2D, t: number) {
    if (!this.chartVis() || t > this.tCrane + 0.3 || t < this.wThen.start - 0.3) return;
    const fade = 1 - prog(t, this.tWhip, this.tWhip + 0.25);
    c.font = font(this.rideFam, 100);
    c.textAlign = 'left';
    c.textBaseline = 'alphabetic';
    for (const g of this.rideGlyphs) {
      if (g.ch === ' ' || t < g.t0 - 0.02) continue;
      const pa = pointAtLength(this.tp, this.tpL, g.s), pb = pointAtLength(this.tp, this.tpL, g.s + g.w);
      const ang = Math.atan2(pb.y - pa.y, pb.x - pa.x);
      // baseline lifted off the curve along its normal
      const lift = 0.2;
      const x = pa.x - Math.sin(ang) * lift, y = pa.y + Math.cos(ang) * lift;
      const pop = springStep(t - g.t0, 3.2, 0.45);
      const sc = lerp(0.2, 1, clamp(pop, 0, 1.2));
      if (!this.onChart(c, x, y, this.rideEm * sc, ang)) continue;
      const hot = t < g.t1 + 0.05 ? 1 : Math.exp(-(t - g.t1 - 0.05) / 0.35);
      c.fillStyle = hot > 0.02 ? mixCss('bone', 'signal', hot, fade) : rgba('bone', 0.92 * fade);
      c.fillText(g.ch, 0, 0);
    }
  }

  tagText(t: number) {
    if (t < this.wMaking.start) return '$1,000,000';
    if (t < this.wFell.start) return '$1,000';
    return '$1';
  }

  drawTag(c: CanvasRenderingContext2D, t: number) {
    if (!this.chartVis() || t < this.wCost.start - 0.05 || t > this.tWhip + 0.3) return;
    const fade = 1 - prog(t, this.tWhip, this.tWhip + 0.25);
    const h = this.headP(t);
    // the tag drops in on "cost" (a spring on the string), then swings from the moving cursor
    const drop = springStep(t - this.wCost.start, 2.6, 0.38);
    const Ls = lerp(0.2, 1.05, clamp(drop, 0, 1.3));
    const swing = pendulum(t, this.wCost.start, (x) => this.headX(x), 1.05, 2.2);
    const th = clamp(swing, -1.2, 1.2) + 0.08 * Math.sin((t - this.wCost.start) * 5) * Math.exp(-(t - this.wCost.start) * 2);
    const hole = v3(h.x + Math.sin(th) * Ls, h.y - Math.cos(th) * Ls, 0.03);
    const ang = th; // tag rotates with the string
    // string
    const st = this.pr.p(h), sh = this.pr.p(hole);
    if (!st || !sh) return;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.strokeStyle = rgba('bone', 0.75 * fade);
    c.lineWidth = 1.4;
    c.beginPath(); c.moveTo(st.x, st.y); c.lineTo(sh.x, sh.y); c.stroke();
    // tag body (local px: 100 px = 0.5 units)
    const em = 0.5;
    const txt = this.tagText(t);
    const tf = F.mono(600);
    c.font = font(tf, 100);
    const tw = c.measureText(txt).width;
    // width eases to the new text when digits drop off
    const tChange = t >= this.wFell.start ? this.wFell.start : t >= this.wMaking.start ? this.wMaking.start : this.wCost.start;
    const prevTxt = t >= this.wFell.start ? '$1,000' : t >= this.wMaking.start ? '$1,000,000' : txt;
    const pw = c.measureText(prevTxt).width;
    const ww = lerp(pw, tw, clamp(springStep(t - tChange, 3, 0.5), 0, 1.1)) + 70;
    if (!this.pr.plane(c, hole, v3(Math.cos(ang), Math.sin(ang), 0), v3(-Math.sin(ang), Math.cos(ang), 0), em / 100)) return;
    const hh = 205;
    c.beginPath();
    c.moveTo(-ww / 2 + 26, 0); c.lineTo(ww / 2 - 26, 0); c.lineTo(ww / 2, 26); c.lineTo(ww / 2, hh); c.lineTo(-ww / 2, hh); c.lineTo(-ww / 2, 26); c.closePath();
    c.fillStyle = rgba('bone', 0.93 * fade);
    c.fill();
    c.fillStyle = rgba('ink', 1);
    c.beginPath(); c.arc(0, 22, 9, 0, TAU); c.fill();
    c.strokeStyle = rgba('ink', 0.55 * fade); c.lineWidth = 2;
    c.strokeRect(-ww / 2 + 10, 44, ww - 20, hh - 54);
    c.fillStyle = rgba('ink', 0.95 * fade);
    c.textAlign = 'center';
    c.textBaseline = 'alphabetic';
    const stamp = 1 + 0.25 * pulse(t, tChange, 0.08);
    c.save(); c.translate(0, 178); c.scale(stamp, stamp);
    c.fillText(txt, 0, 0);
    c.restore();
    c.font = font(F.mono(500), 22);
    c.fillText('PRICE PER APP', 0, 76);
    // the dropped digits fall away as torn-off pieces
    for (const [tc, piece, fullTxt] of [[this.wMaking.start, ',000', '$1,000,000'], [this.wFell.start, ',000', '$1,000']] as const) {
      const e = t - tc;
      if (e < 0 || e > 1.4) continue;
      c.font = font(tf, 100);
      const fw = c.measureText(fullTxt).width;
      const px0 = fw / 2 - c.measureText(piece).width / 2 + 10;
      const gy = 2600, vx = 260 + 120 * (tc === this.wFell.start ? 1 : 0), vy = -700;
      const x = px0 + vx * e, y = 160 + vy * e + 0.5 * gy * e * e;
      c.save();
      c.translate(x, y);
      c.rotate(e * 5.5);
      c.fillStyle = rgba('bone', 0.9 * (1 - e / 1.4) * fade);
      c.fillRect(-120, -80, 240, 110);
      c.fillStyle = rgba('ink', (1 - e / 1.4) * fade);
      c.fillText(piece, 0, 18);
      c.restore();
    }
  }

  /** Position/angle of FELL's glyph i at time t: it appears at the cliff top, slides down the curve, slams, rests. */
  fellGlyph(i: number, t: number) {
    // letters leave the cliff top in quick succession (over the first part of "fell,") and slide down the curve
    // with gravity (arc length s = v0 tau + g tau^2 / 2, g solved so each lands on the downbeat), then stand up
    const w = this.wFell;
    const nG = this.fellLay.glyphs.length;
    const ti = w.start + (i / nG) * Math.max(0.12, (this.tLand - w.start) * 0.62);
    if (t < ti) return null;
    const tRest = this.tLand + i * 0.035;
    const sTop = this.arcAtX(CH.cliff0 - 0.05), sRest = this.arcAtX(this.fellRest[i]!);
    const tau = Math.max(0.05, tRest - ti), v0 = 14;
    const g = Math.max(0, (2 * (sRest - sTop - v0 * tau)) / (tau * tau));
    const e1 = Math.min(t, tRest) - ti;
    const sNow = Math.min(sRest, sTop + v0 * e1 + 0.5 * g * e1 * e1);
    const p = pointAtLength(this.cp, this.cpL, sNow);
    const x = p.x;
    const y = yOfLog(costLog(x, false));
    const settle = t < tRest ? 0 : springStep(t - tRest, 3.5, 0.3);
    // sliding, the word reads up the cliff face (F lowest, it left first); landed, each letter stands up
    const slide = p.angle + Math.PI * smoothstep(-0.3, -0.9, p.angle);
    const a = lerp(slide + 0.1 * Math.sin((t - ti) * 11 + i), 0, clamp(settle, 0, 1));
    const hop = t < tRest ? 0 : 0.35 * Math.max(0, Math.sin(clamp((t - tRest) / 0.28) * Math.PI)) * Math.exp(-(t - tRest) * 3);
    return { x, y: y + 0.08 + hop, a, landed: t >= tRest };
  }
  arcAtX(X: number) {
    const i = clamp(Math.round((X - CH.x0) / 0.01), 0, this.cp.length - 1);
    return this.cpL[i]!;
  }

  drawFell(c: CanvasRenderingContext2D, t: number) {
    if (!this.chartVis() || t < this.wFell.start || t > this.tWhip + 0.4) return;
    const fade = 1 - prog(t, this.tWhip, this.tWhip + 0.3);
    c.font = font(F.archivo(100, 900), 100);
    c.textAlign = 'left';
    c.textBaseline = 'alphabetic';
    for (let i = 0; i < this.fellLay.glyphs.length; i++) {
      const p = this.fellGlyph(i, t);
      if (!p) continue;
      const g = this.fellLay.glyphs[i]!;
      if (!this.onChart(c, p.x, p.y, this.fellEm, p.a)) continue;
      const hot = p.landed ? 0.5 + 0.5 * Math.exp(-(t - this.tLand) / 0.5) : 1;
      c.fillStyle = mixCss('bone', 'signal', hot, fade);
      c.fillText(g.ch, 0, 0);
    }
    // dust on the landing: small bone ticks kicked up off the $1 floor
    if (t > this.tLand) {
      const e = t - this.tLand;
      c.setTransform(1, 0, 0, 1, 0, 0);
      for (let k = 0; k < 40; k++) {
        const x0 = this.fellRest[0]! + hash(k, 5) * 3.4, vx = (hash(k, 6) - 0.5) * 2.5, vy = 1 + hash(k, 7) * 3;
        const x = x0 + vx * e, y = CH.y0 + vy * e - 6 * e * e;
        if (y < CH.y0 - 0.05) continue;
        const p = this.pr.p(v3(x, y, 0.1));
        if (!p) continue;
        const a = (1 - e / 0.8) * fade;
        if (a <= 0) continue;
        c.fillStyle = rgba(hash(k, 8) < 0.3 ? 'signal' : 'bone', a * 0.8);
        c.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
      }
    }
  }

  drawMachineNotes(c: CanvasRenderingContext2D, t: number) {
    if (t < this.tWhip || t > this.tBellCut) return;
    const k = prog(t, this.tWhip + 0.25, this.tWhip + 0.45) * (1 - prog(t, this.tCrane + 0.35, this.tCrane + 0.6));
    const kg = prog(t, this.tCrane, this.tCrane + 0.2) * (1 - prog(t, this.tBellCut - 0.45, this.tBellCut - 0.2));
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.textBaseline = 'alphabetic';
    const note = (anchor: P3, dx: number, dy: number, lines: string[], a: number) => {
      if (a <= 0) return;
      const p = this.pr.p(anchor);
      if (!p) return;
      const qx = p.x + dx, qy = p.y + dy;
      c.strokeStyle = rgba('bone', 0.7 * a); c.lineWidth = 1.2;
      c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(qx, qy); c.lineTo(qx + (dx > 0 ? 24 : -24), qy); c.stroke();
      c.fillStyle = rgba('signal', a); c.beginPath(); c.arc(p.x, p.y, 3.5, 0, TAU); c.fill();
      c.textAlign = dx > 0 ? 'left' : 'right';
      lines.forEach((s, i) => {
        c.font = font(i === 0 ? F.mono(600) : F.mono(400), i === 0 ? 24 : 20);
        c.fillStyle = rgba(i === 0 ? 'bone' : 'ash', a);
        const n = Math.floor(s.length * prog(a, 0, 1));
        c.fillText(s.slice(0, n), qx + (dx > 0 ? 32 : -32), qy + 8 + i * 27);
      });
    };
    const rpm = Math.round((this.omega(t) * 60) / TAU);
    note(add3(MACH.fly, v3(0, MACH.flyR, 0)), 110, -60, ['FLYWHEEL, CAST IRON, 14 t', `${rpm} rev/min`], k);
    note(v3(MACH.cylX0 + 1.2, MACH.fly.y + 1.2, MACH.crankZ + 0.3), -90, -70, ['CYLINDER', 'coal in, work out'], k);
    const ball = this.mach.ballPos(this.phi(t) * 0.9, 0.9, 0);
    note(ball, 120, -40, ['GOVERNOR (WATT, 1788)', 'faster → balls rise'], kg);
    // the footnote that names the plate
    const fk = prog(t, this.tWhip + 0.3, this.tWhip + 0.5) * (1 - prog(t, this.tBellCut - 0.3, this.tBellCut));
    if (fk > 0) {
      const s1 = 'W. S. JEVONS, “THE COAL QUESTION”, 1865:';
      const s2 = 'better engines burn more coal, not less.';
      c.textAlign = 'left';
      c.font = font(F.mono(600), 24);
      c.fillStyle = rgba('bone', 0.95 * fk);
      c.fillText(s1.slice(0, Math.floor(s1.length * prog(t, this.tWhip + 0.3, this.tWhip + 0.75))), 150, H - 150);
      c.font = font(F.mono(400, true), 22);
      c.fillStyle = rgba('ash', fk);
      c.fillText(s2.slice(0, Math.floor(s2.length * prog(t, this.tWhip + 0.6, this.tCrane + 0.5))), 150, H - 118);
    }
  }

  drawInscription(c: CanvasRenderingContext2D, t: number, ring: number) {
    c.font = font(this.insFam, 100);
    c.textAlign = 'center';
    c.textBaseline = 'alphabetic';
    const slope = -0.2;
    for (const g of this.insGlyphs) {
      const a = g.a;
      const r = this.insR;
      const P = this.bell.toWorld(v3(Math.sin(a) * r, this.insY - 0.12, Math.cos(a) * r));
      const n = this.bell.dirToWorld(v3(Math.sin(a), 0.2, Math.cos(a)));
      const fac = this.pr.facing(P, norm3(n));
      if (fac < 0.12) continue;
      const X = this.bell.dirToWorld(v3(Math.cos(a), 0, -Math.sin(a)));
      const Y = this.bell.dirToWorld(norm3(v3(Math.sin(a) * slope, 1, Math.cos(a) * slope)));
      if (!this.pr.plane(c, P, X, Y, this.insEm / 100)) continue;
      const vis = smoothstep(0.12, 0.45, fac);
      const p = clamp((t - g.t0) / Math.max(0.01, g.t1 - g.t0));
      let col: string;
      if (!g.lit) col = rgba('bone', (t >= g.t0 ? 0.7 : 0.22) * vis);
      else if (p <= 0) col = rgba('bone', 0.22 * vis);
      else {
        const hot = t < g.t1 + 0.05 ? 1 : Math.exp(-(t - g.t1) / 0.6);
        col = mixCss('bone', 'signal', Math.max(hot, ring), vis);
      }
      c.fillStyle = col;
      const pop = g.lit && p > 0 ? 1 + 0.18 * pulse(t, g.t0, 0.07) : 1;
      if (pop !== 1) c.scale(pop, pop);
      c.fillText(g.ch, 0, 0);
    }
    // a founder's mark on the sound bow (small mono, dim)
    const mark = 'CAST 1865 · CHEAPER ENGINES · MORE ENGINES · ';
    c.font = font(F.mono(500), 100);
    const ml = layout(mark, F.mono(500), 100, 4);
    const r2 = bellR(0.42) + 0.01, em2 = 0.13;
    for (const g of ml.glyphs) {
      if (g.ch === ' ') continue;
      const a = -0.8 + ((g.x + g.w / 2) * em2) / 100 / r2;
      const P = this.bell.toWorld(v3(Math.sin(a) * r2, 0.34, Math.cos(a) * r2));
      const fac = this.pr.facing(P, norm3(this.bell.dirToWorld(v3(Math.sin(a), 0.5, Math.cos(a)))));
      if (fac < 0.2) continue;
      const X = this.bell.dirToWorld(v3(Math.cos(a), 0, -Math.sin(a)));
      const Y = this.bell.dirToWorld(norm3(v3(Math.sin(a) * -0.55, 1, Math.cos(a) * -0.55)));
      if (!this.pr.plane(c, P, X, Y, em2 / 100)) continue;
      c.fillStyle = rgba('ash', 0.55 * smoothstep(0.2, 0.5, fac));
      c.fillText(g.ch, 0, 0);
    }
  }

  drawBellWord(c: CanvasRenderingContext2D, t: number) {
    const w = this.wBell;
    if (t < w.start) return;
    const e = t - w.start;
    // held: the width steps 62 -> 125 over the note, a continuous stretch in between
    const hp = clamp(e / Math.max(0.2, w.end - w.start));
    const widths = [62, 75, 87.5, 100, 112.5, 125];
    const wi = Math.min(widths.length - 1, Math.floor(hp * widths.length));
    const fam = F.archivo(widths[wi]!, 900);
    const release = prog(t, w.end, w.end + 0.5, ease.inCubic);
    // placed in the world, just in front of the bell's mouth, riding up with the camera after the strike
    const M = MACH;
    const base = v3(M.bell.x + 1.2, M.bell.y - BELL_AX - 1.4, M.bell.z + 3.2);
    const cy = this.camAt(t).pos.y;
    const follow = prog(t, this.tRide - 0.1, this.tRide + 0.5, ease.inOutCubic);
    const y = lerp(base.y, cy + 3.3, follow) - 6 * release * release;
    const P = v3(lerp(base.x, CH.demandX - 3.5, follow), y, base.z);
    // face the camera (billboard in yaw) so the stamp reads flat
    const toCam = norm3(sub3(this.pr.camPos, P));
    const X = norm3(v3(toCam.z, 0, -toCam.x));
    const Y = v3(0, 1, 0);
    const slam = 1 + 0.6 * Math.exp(-e / 0.06);
    const em = 1.35 * slam * lerp(1, 0.8, follow);
    const lay = layout('BELL.', fam, 100, 4);
    const stretch = lerp(1, 1.12, hp);
    if (!this.pr.plane(c, P, X, Y, (em / 100))) return;
    c.scale(stretch, 1);
    c.font = font(fam, 100);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    const a = 1 - release;
    const hot = hp < 1 ? 1 : Math.exp(-(t - w.end) / 0.3);
    c.fillStyle = mixCss('bone', 'signal', hot, a);
    // tremble with the ring
    const tr = 6 * Math.exp(-e / 0.5) * Math.sin(e * 90);
    c.fillText('BELL.', tr, 0);
    void lay;
  }

  drawDemandText(c: CanvasRenderingContext2D, t: number) {
    if (t < this.tStrike) return;
    const hy = this.demandY(t);
    const X = CH.demandX;
    c.textBaseline = 'middle';
    const labs = ['×10', '×100', '×1,000', '×10,000', '×100,000', '×1,000,000', '×10,000,000', '×100,000,000', '', '', '', ''];
    const notes = ['', 'apps nobody could afford', 'one-person tools', 'a tool for every job', 'for every club and street', 'for every niche', '', '', '', '', '', ''];
    for (let d = 1; d <= 12; d++) {
      const y = this.demandTickY(d);
      if (y > hy + 0.1) break;
      const k = prog(hy - y, 0, 1.2);
      if (!this.pr.plane(c, v3(X + 0.65, y, 0), v3(1, 0, 0), v3(0, 1, 0), 0.5 / 100)) continue;
      c.textAlign = 'left';
      c.font = font(F.mono(600), 100);
      c.fillStyle = rgba('bone', 0.95 * k);
      c.fillText(labs[d - 1]!, 0, 0);
      if (notes[d - 1]) {
        c.font = font(F.mono(400, true), 70);
        c.fillStyle = rgba('ash', 0.9 * k);
        c.fillText(notes[d - 1]!, 0, 95);
      }
    }
    // the line's label rides beside the head (gone before the roll)
    const dl = 1 - prog(t, this.tRoll - 0.1, this.tRoll + 0.15);
    if (dl > 0 && this.pr.plane(c, v3(X - 0.45, hy - 0.6, 0.05), v3(0, 1, 0), v3(-1, 0, 0), 0.62 / 100)) {
      c.textAlign = 'right';
      c.font = font(F.mono(700), 100);
      c.fillStyle = rgba('signal', dl);
      c.fillText('DEMAND', 0, 0);
    }
    // footnote: typed, riding with the camera
    const fk = prog(t, this.tRide + 0.15, this.tRide + 0.3);
    if (fk > 0) {
      c.setTransform(1, 0, 0, 1, 0, 0);
      const rk = prog(t, this.tRoll, this.tRoll + 0.25);
      const s1 = 'Jevons paradox: cheaper → far more of it.';
      const n = Math.floor(s1.length * prog(t, this.tRide + 0.15, this.tRide + 0.95));
      c.textAlign = 'left';
      c.font = font(F.mono(600), 34);
      c.fillStyle = rgba('bone', 0.95 * fk * (1 - rk));
      c.fillText(s1.slice(0, n), 150, H - 160);
      c.font = font(F.mono(400, true), 22);
      c.fillStyle = rgba('ash', 0.9 * fk * (1 - rk));
      c.fillText('fig. 1a — demand, log scale: the same chart, turned up', 150, H - 122);
    }
  }

  // ------------------------------------------------------------------ the cursor
  drawCursor(t: number, L: LineBatch) {
    // before drawing: the caret blinks at the chart origin
    const au = this.ctx.audio;
    const bp = au.beatAt(t) % 1;
    if (t < this.tStrike + 0.05 && t > this.T0 + 0.25 && this.chartVis() && t < this.tWhip + 0.2) {
      const hp = this.headP(t);
      const p = this.pr.p(hp);
      if (p) {
        const drawing = t > this.tDraw;
        const on = drawing ? 1 : cursorBlink(bp < 0 ? bp + 1 : bp);
        const fade = 1 - prog(t, this.tWhip, this.tWhip + 0.2);
        cursorTip(L, p.x, p.y, t, 1.25, on * fade * (0.8 + 0.4 * (this.ctx.audio.hit('kick', t, 0.1))));
        if (drawing) {
          weldSparks(L, t, (tb) => {
            if (tb < this.tDraw || tb > this.tLand + 0.3) return null;
            const q = this.pr.p(this.headP(tb));
            return q;
          }, { rate: 70, life: 0.45, speed: 260, gravity: 900, intensity: 0.8, seed: 5 });
        }
      }
    }
    if (t >= this.tStrike) {
      const hy = this.demandY(t);
      const p = this.pr.p(v3(CH.demandX, hy, 0.05));
      if (p) {
        cursorTip(L, p.x, p.y, t, 2.2, 1.3);
        weldSparks(L, t, (tb) => (tb < this.tStrike ? null : this.pr.p(v3(CH.demandX, this.demandY(tb), 0.05))), { rate: 90, life: 0.3, speed: 380, gravity: 200, intensity: 0.9, seed: 9 });
      }
    }
  }
}

/** CSS colour between two palette keys (k = 0 -> a, 1 -> b), times alpha. */
function mixCss(a: 'bone' | 'signal', b: 'bone' | 'signal' | 'ember', k: number, alpha: number) {
  const hex = (key: 'bone' | 'signal' | 'ember') => {
    const n = parseInt(HEX[key].slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const A = hex(a), B = hex(b);
  const kk = clamp(k);
  return `rgba(${Math.round(lerp(A[0]!, B[0]!, kk))},${Math.round(lerp(A[1]!, B[1]!, kk))},${Math.round(lerp(A[2]!, B[2]!, kk))},${clamp(alpha)})`;
}
