// `internals` — "What it is made of" (verse 2).
//   Made of weights and attention,        a transformer-block cutaway rises out of long tail's grid of lights;
//                                         the sung words are the token sequence, attention arcs reach back.
//   trained on tokens through the night,  pull back: a river of tokens flows into the block under the stars;
//                                         the cursor draws the loss curve in the sky, the words ride it.
//   Once we trusted the compiler,         the ladder of abstraction: the camera climbs one floor per beat,
//                                         the line set on every floor in that floor's language.
//   now we trust the words we write.      ENGLISH, the top floor: typed; "words" held; on "write" the
//                                         sentence compiles down every floor, an app assembles and drops like a pin.
import * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '../engine/scene';
import { FSPass, Layer2D, W, H } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { LIN, rgba } from '../engine/palette';
import { F, font, layout, measure, plain, type TextLayout } from '../engine/type';
import { Lyrics, type Line, type Word } from '../engine/lyrics';
import { clamp, lerp, ease, prog, pulse, smoothstep, hash, noise1, TAU, frameIdx } from '../engine/util';
import { cursorCaret, cursorTip, cursorBlink, weldSparks } from './_motifs';
import {
  Cam3, Blocks, MatrixPanel, planeTransform, beatsIn, beatBefore, findWord, grouped, heatCss, orbit, lerp3, lerpPose, quatAxis, quatMul,
  type P3, type CamPose, type RGB,
} from './internals-kit';
import { TOKENS, ATTN, RIVER_VOCAB, FLOORS, ASM_A, C_A, PY_A, ASM_B, C_B, PY_B, APP_ART, type Listing } from './internals-data';

// ------------------------------------------------------------------ world constants
const TOK_H = 0.78; // token tile height
const TOK_D = 0.16;
const COL_TOP = 7.5; // residual stream top
const Y_ATT = 2.05; // attention arc base
const Y_MLP_IN = 4.75, Y_NEU = 5.65, Y_MLP_OUT = 6.6;
const BZ0 = -2.8, BZ1 = 2.8, BX = 6.6; // block shell
const LAYER_PITCH = 8.3;
// river & chart
const RIVER_Z0 = 3.2, RIVER_Z1 = 96;
const riverX = (z: number) => 7.5 * Math.sin(z * 0.045 + 0.4) * smoothstep(RIVER_Z0, 26, z) - 7.5 * Math.sin(RIVER_Z0 * 0.045 + 0.4) * 0;
const CH = { z: -24, x0: -25, x1: 25, y0: 10.5, y1: 31 }; // loss chart plane, hung in the sky behind the block
const RIDE_SIZE = 2.2; // riding lyric cap size (world)
// ladder
const LAD_X = 0, LAD_Y0 = 0, PY = 4.1; // floor pitch
const FL_W = 14.4, FL_H = 3.4, FL_D = 4.6;
const TOP_W = 17.0, TOP_H = 4.3;
const GROUND_Y = -5.5;

const mulc = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k];
const mix3 = (a: RGB, b: RGB, k: number): RGB => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];

interface TokTile { x: number; w: number; t: number; tEnd: number }
interface Ride { ch: string; x: number; w: number; t0: number; t1: number }
interface Typed { ch: string; t: number; word: number; x: number }
interface AppCell { gx: number; gy: number; kind: string; t: number; from: P3; seed: number }

export default class Internals extends Scene {
  cam = new Cam3(35, 0.05, 900);
  lines = new LineBatch(60000, { screen2D: false, depthTest: true, blend: 'add' });
  lines2 = new LineBatch(6000, { blend: 'add' });
  blocks = new Blocks(2600, { freq: 16, edge: 0.7 });
  panelScene = new THREE.Scene();
  panels: MatrixPanel[] = [];
  text = new Layer2D();
  bg = new FSPass(/* glsl */ `
    uniform float uSky, uGrid, uCobalt, uT; uniform vec2 uHA, uHB; uniform float uFlash;
    void main() {
      vec2 px = FRAG_PX; px.y = ${H.toFixed(1)} - px.y; // y down, logical px
      vec2 d = normalize(uHB - uHA); vec2 nrm = vec2(-d.y, d.x);
      float s = dot(px - uHA, nrm); // < 0 above the horizon (sky)
      vec3 c = C_INK;
      // night sky: ink going faintly cobalt toward the horizon
      float sky = smoothstep(0.0, -1.0, s);
      float glow = exp(-max(-s, 0.0) / 380.0);
      c = mix(c, mix(C_INK, C_COBALT * 0.42, glow), uSky * sky);
      // ground: ink with engraved hairlines receding to the horizon
      float g = smoothstep(0.0, 1.0, s);
      float lines = hatch(log(max(s, 1.0)) * 9.0, 0.06);
      c += C_GRAPHITE * lines * g * uSky * 0.08 * smoothstep(0.0, 40.0, s);
      // drafting grid (block and ladder shots)
      vec2 q = px / 48.0;
      float gl = max(hatch(q.x, 0.03), hatch(q.y, 0.03));
      c += C_GRAPHITE * gl * 0.05 * uGrid;
      c = mix(c, C_COBALT * 0.35, uCobalt * (0.6 + 0.4 * vUv.y));
      c += C_BONE * uFlash;
      fragColor = vec4(c, 1.0);
    }`, { uSky: { value: 0 }, uGrid: { value: 0 }, uCobalt: { value: 0 }, uT: { value: 0 }, uHA: { value: new THREE.Vector2() }, uHB: { value: new THREE.Vector2() }, uFlash: { value: 0 } });

  // timing
  T0 = 0; T1 = 0;
  L1!: Line; L2!: Line; L3!: Line; L4!: Line;
  tS2 = 0; tPull = 0; tLow = 0; tRise = 0; tLad = 0; tTop = 0; tEng2 = 0; tEng3 = 0; tBack = 0; tWrite = 0; tDrop = 0;
  fl: number[] = []; // floor arrival times
  beats: number[] = [];
  // content
  tiles: TokTile[] = [];
  ride: Ride[] = [];
  rideX0 = 0;
  penEnd = 0;
  stars: { p: P3; b: number; w: number }[] = [];
  river: { ph: number; lane: number; len: number; tok: number; gold: boolean; seed: number }[] = [];
  neurons: { x: number; act: number }[] = [];
  lossPts: { x: number; y: number }[] = [];
  appCells: AppCell[] = [];
  floorText: { a: Typed[][]; b: string[] }[] = [];
  l0Chars: { ch: string; t: number; word: number }[] = [];
  l0CharsB: string = '';
  wordsL3: Word[] = [];
  wordsL4: Word[] = [];

  override async init() {
    const ly = this.ctx.lyrics, au = this.ctx.audio;
    this.T0 = this.ctx.start; this.T1 = this.ctx.end;
    this.L1 = ly.get('Made of weights');
    this.L2 = ly.get('trained on tokens');
    this.L3 = ly.get('trusted the compiler');
    this.L4 = ly.get('the words we write');
    this.wordsL3 = this.L3.words; this.wordsL4 = this.L4.words;
    const dbs = au.downbeats.filter((d) => d > this.T0 + 0.1 && d < this.T1);
    const dbAfter = (t: number) => dbs.find((d) => d >= t - 0.02) ?? t;
    const attn = findWord(this.L1, 'attention');
    this.tS2 = dbAfter(this.T0 + 1.2);
    this.tPull = attn.end - 0.1;
    this.tLow = dbAfter(this.tPull + 0.2);
    this.tRise = dbAfter(findWord(this.L2, 'night').start);
    this.tLad = beatBefore(au, this.L3.start, 0.02);
    const b0 = Math.round(au.beatAt(this.tLad));
    this.fl = [0, 1, 2, 3, 4, 5].map((k) => au.timeOfBeat(b0 + k));
    this.tTop = this.fl[5]!;
    this.tEng2 = dbAfter(this.L4.start - 0.3);
    this.tEng3 = dbAfter(findWord(this.L4, 'words').start);
    const wl = this.L4.words;
    this.tWrite = wl[wl.length - 1]!.start;
    this.tBack = wl[wl.length - 2]!.start;
    this.tDrop = wl[wl.length - 1]!.end + 0.06;
    this.beats = beatsIn(au, this.T0 - 0.5, this.T1 + 0.5);

    // token tiles: widths from their mono text
    const cw = 0.205;
    let x = 0;
    const widths = TOKENS.map((tk) => 0.34 + cw * tk.s.length);
    const total = widths.reduce((a, b) => a + b, 0) + 0.24 * (TOKENS.length - 1);
    x = -total / 2;
    TOKENS.forEach((tk, i) => {
      const w = widths[i]!;
      const word = tk.w >= 0 ? this.L1.words[tk.w]! : null;
      let t = word ? word.start : this.T0 + 0.55;
      let tEnd = word ? word.end : this.T0 + 0.8;
      if (i === TOKENS.length - 1) { t = attn.end - 0.12; tEnd = attn.end + 0.1; }
      this.tiles.push({ x: x + w / 2, w, t, tEnd });
      x += w + 0.24;
    });

    // riding lyric: "trained on tokens through the night." laid along the chart's x axis
    const famR = F.archivo(100, 800);
    const words2 = this.L2.words;
    const text2 = words2.map((w) => w.w).join(' ');
    const lay = layout(text2, famR, 100);
    const sc = RIDE_SIZE / 72; // cap height ≈ 0.72 em
    this.rideX0 = CH.x0 + 2.6;
    let ci = 0;
    for (const w of words2) {
      const n = Array.from(w.w).length;
      for (let j = 0; j < n; j++) {
        const g = lay.glyphs[ci + j]!;
        this.ride.push({ ch: g.ch, x: this.rideX0 + g.x * sc, w: g.w * sc, t0: lerp(w.start, w.end, j / n), t1: lerp(w.start, w.end, (j + 1) / n) });
      }
      ci += n + 1;
    }
    this.penEnd = CH.x1 - 1.2;
    for (let i = 0; i <= 400; i++) {
      const xx = lerp(CH.x0 + 0.6, this.penEnd, i / 400);
      this.lossPts.push({ x: xx, y: this.lossY(xx, true) });
    }

    // stars
    const r = (i: number, k: number) => hash(i, k, 77);
    for (let i = 0; i < 1500; i++) {
      const az = r(i, 1) * TAU, el = Math.asin(0.03 + 0.95 * Math.pow(r(i, 2), 1.6));
      const R = 320;
      const b = Math.pow(r(i, 3), 3);
      this.stars.push({ p: { x: Math.cos(az) * Math.cos(el) * R, y: Math.sin(el) * R, z: Math.sin(az) * Math.cos(el) * R }, b, w: 1.1 + 2.2 * b });
    }
    // river tokens
    for (let i = 0; i < 520; i++) {
      this.river.push({ ph: r(i, 11), lane: (r(i, 12) * 2 - 1), len: 0.55 + 0.9 * r(i, 13), tok: Math.floor(r(i, 14) * RIVER_VOCAB.length), gold: r(i, 15) < 0.05, seed: r(i, 16) });
    }
    // MLP neurons (sparse activations)
    for (let i = 0; i < 44; i++) this.neurons.push({ x: lerp(-5.9, 5.9, i / 43), act: Math.max(0, hash(i, 5) * 1.6 - 0.7) });

    // matrix panels
    const mk = (w: number, h: number, c: number, rr: number, seed: number, x: number, y: number, z: number) => {
      const p = new MatrixPanel(w, h, c, rr, seed);
      p.mesh.position.set(x, y, z);
      this.panels.push(p); this.panelScene.add(p.mesh);
      return p;
    };
    [-4.5, -1.5, 1.5, 4.5].forEach((px, i) => mk(2.72, 2.0, 24, 18, 1.3 + i * 2.1, px, 3.0, BZ0 + 0.3));
    mk(6.0, 1.45, 48, 12, 9.1, -3.1, 5.65, BZ0 + 0.3);
    mk(6.0, 1.45, 48, 12, 11.7, 3.1, 5.65, BZ0 + 0.3);

    // ladder floors: the first sung line rendered in each floor's language
    this.buildFloors();
    // the app, block by block (lands between "words" and "write")
    const wWords = findWord(this.L4, 'words');
    const cells: AppCell[] = [];
    APP_ART.forEach((row, gy) => Array.from(row).forEach((k, gx) => { if (k !== '.') cells.push({ gx, gy, kind: k, t: 0, from: { x: 0, y: 0, z: 0 }, seed: hash(gx, gy, 3) }); }));
    // assemble frame first (bottom-up), then contents
    cells.sort((a, b) => (a.kind === '#' ? 0 : 1) - (b.kind === '#' ? 0 : 1) || (b.gy - a.gy) || (a.gx - b.gx) || 0);
    const tA = wWords.start, tB = this.tWrite + 0.02;
    cells.forEach((c, i) => {
      c.t = lerp(tA, tB, Math.pow(i / (cells.length - 1), 0.9)) + (hash(i, 9) - 0.5) * 0.03;
      const fi = Math.floor(hash(i, 4) * 5);
      c.from = { x: lerp(-6, 6, hash(i, 6)), y: LAD_Y0 + fi * PY, z: 2.6 };
    });
    this.appCells = cells;
  }

  // ---------------------------------------------------------------- content builders
  buildFloors() {
    const ws = this.wordsL3;
    const eng = 'Once we trusted the compiler,';
    // per-char times of the sung line (spaces land with the next word)
    let k = 0;
    ws.forEach((w, wi) => {
      const n = w.w.length;
      for (let j = 0; j < n; j++) this.l0Chars.push({ ch: w.w[j]!, t: lerp(w.start, w.end, j / n), word: wi });
      if (wi < ws.length - 1) this.l0Chars.push({ ch: ' ', t: ws[wi + 1]!.start, word: -1 });
      k += n + 1;
    });
    void k; void eng;
    this.l0CharsB = plain(this.L4.text);
    const listing = (L: Listing, i: number): Typed[][] => {
      // syntax (-1) is typed with the next word; context (-2) rattles in as the camera nears the floor
      const out: Typed[][] = [];
      const tCtx = this.fl[i]! - 0.45;
      let ctxN = 0;
      for (const line of L) {
        const row: Typed[] = [];
        const flat: { ch: string; word: number }[] = [];
        for (const [s, wi] of line) for (const ch of Array.from(s)) flat.push({ ch, word: wi });
        // times
        let x = 0;
        for (let j = 0; j < flat.length; j++) {
          const c = flat[j]!;
          let t: number;
          if (c.word === -2) t = tCtx + (ctxN++) * 0.006;
          else if (c.word >= 0) {
            const w = ws[c.word]!;
            // index of this char within its run of the same word
            let a = j; while (a > 0 && flat[a - 1]!.word === c.word) a--;
            let b = j; while (b < flat.length - 1 && flat[b + 1]!.word === c.word) b++;
            t = lerp(w.start, w.end, (j - a) / (b - a + 1));
          } else {
            let nx = j; while (nx < flat.length && flat[nx]!.word < 0) nx++;
            const w = nx < flat.length ? ws[flat[nx]!.word]! : ws[ws.length - 1]!;
            t = nx < flat.length ? w.start - 0.02 : w.end;
          }
          row.push({ ch: c.ch, t, word: c.word, x: x++ });
        }
        out.push(row);
      }
      return out;
    };
    const flatStr = (L: Listing) => L.map((ln) => ln.map((p) => p[0]).join(''));
    this.floorText = [
      { a: [], b: [] },
      { a: [], b: [] },
      { a: listing(ASM_A, 2), b: flatStr(ASM_B) },
      { a: listing(C_A, 3), b: flatStr(C_B) },
      { a: listing(PY_A, 4), b: flatStr(PY_B) },
      { a: [], b: [] },
    ];
  }

  lossY(x: number, noisy: boolean) {
    const s = clamp((x - CH.x0) / (CH.x1 - CH.x0));
    let l = 0.1 + 0.82 * Math.exp(-3.4 * s) + 0.06 * Math.exp(-((s - 0.18) ** 2) / 0.003) * 0.6;
    if (noisy) l += (0.05 * noise1(s * 90, 3) + 0.025 * noise1(s * 260, 5)) * (0.35 + 0.65 * Math.exp(-2.5 * s));
    return CH.y0 + 1.2 + (CH.y1 - CH.y0 - 3.2) * l;
  }
  /** Chart x of the pen: follows the riding lyric as it is sung, then runs out to the end of the chart. */
  penX(t: number) {
    const first = this.ride[0]!;
    let x = this.rideX0 - 1.4 + 1.4 * prog(t, this.tPull + 0.1, first.t0, ease.outCubic);
    if (t < this.tPull) return CH.x0 + 0.6;
    for (const g of this.ride) {
      if (t < g.t0) break;
      x = g.x + g.w * clamp((t - g.t0) / Math.max(0.02, g.t1 - g.t0));
    }
    const last = this.ride[this.ride.length - 1]!;
    const lastEnd = last.x + last.w;
    x = lerp(x, this.penEnd, prog(t, last.t1 + 0.05, this.tLad - 0.12, ease.inOutCubic) * 1);
    return Math.max(CH.x0 + 0.6, Math.min(x, lastEnd + (this.penEnd - lastEnd) * prog(t, last.t1, this.tLad - 0.12)));
  }

  floorY(i: number) { return LAD_Y0 + i * PY; }

  // ---------------------------------------------------------------- camera
  camera(t: number): CamPose {
    const blockTgt = { x: 0, y: 3.5, z: 0 };
    if (t < this.tS2) {
      const k = prog(t, this.T0, this.T0 + 1.25, ease.inOutCubic);
      const pitch = lerp(1.545, 0.46, k);
      const yaw = lerp(0.0, -0.42, k) + 0.08 * prog(t, this.T0 + 1.0, this.tS2);
      const dist = lerp(22, 18.2, k) - 1.2 * prog(t, this.T0 + 1.2, this.tS2);
      const tgt = lerp3({ x: 0, y: 0, z: 0 }, blockTgt, k);
      return { pos: orbit(tgt, yaw, pitch, dist), tgt, roll: lerp(0.0, -0.03, k), fov: 35 };
    }
    if (t < this.tPull) {
      // close, low, along the token row: the arcs in perspective
      const lt = t - this.tS2;
      const cur = this.curTile(t);
      const tgt = { x: lerp(this.tiles[1]!.x, this.tiles[cur]!.x, 0.55) + 0.6, y: 2.2, z: 0.2 };
      const push = prog(t, findWord(this.L1, 'attention').start - 0.05, this.tPull, ease.outCubic);
      return { pos: orbit(tgt, 0.55 - 0.05 * lt - 0.1 * push, 0.2 + 0.03 * lt, 12.2 - 0.4 * lt - 1.0 * push), tgt, roll: -0.035 + 0.02 * push, fov: 36 };
    }
    if (t < this.tLow) {
      // pull back and up: the river flows into the block, the chart hangs in the sky
      const a = this.camera(this.tPull - 1e-4);
      const k = prog(t, this.tPull, this.tLow + 0.25, ease.inOutCubic);
      const b: CamPose = { pos: { x: 10, y: 5.5, z: 50 }, tgt: { x: -1, y: 14.5, z: -12 }, roll: 0.02, fov: 42 };
      return lerpPose(a, b, k);
    }
    if (t < this.tRise) {
      // low over the river, racing toward the block, looking up at the chart
      const k = prog(t, this.tLow, this.tRise, ease.linear);
      const z = lerp(40, 19, k);
      const pos = { x: riverX(z) + 2.2, y: 2.0 + 0.2 * Math.sin(t * 2.1), z };
      const tgt = { x: lerp(-4, 4, k), y: lerp(19, 21, k), z: CH.z };
      return { pos, tgt, roll: 0.05 * Math.sin((t - this.tLow) * 1.6) - 0.02, fov: 50 };
    }
    if (t < this.tLad) {
      // crane up to the end of the curve; the pen runs off to its minimum
      const a = this.camera(this.tRise - 1e-4);
      const px = this.penX(t), py = this.lossY(px, false);
      const k = prog(t, this.tRise, this.tLad, ease.inOutCubic);
      const tgt = lerp3(a.tgt, { x: px - 1.0, y: py + 0.8, z: CH.z }, prog(t, this.tRise, this.tRise + 0.7, ease.inOutCubic));
      const pos = lerp3(a.pos, { x: px + 3.0, y: py + 2.6, z: CH.z + 15 }, k);
      return { pos, tgt, roll: lerp(a.roll, -0.06, k), fov: lerp(42, 34, k) };
    }
    if (t < this.tBack) return this.ladderCam(t);
    // pull back to the whole ladder, then follow the app down
    const a = this.ladderCam(this.tBack);
    const top = this.floorY(5);
    const wide: CamPose = { pos: { x: 14, y: top + 3, z: 30 }, tgt: { x: 0, y: top * 0.5 + 1, z: 0 }, roll: -0.05, fov: 38 };
    const w = lerpPose(a, wide, prog(t, this.tBack, this.tWrite + 0.2, ease.inOutCubic));
    if (t < this.tDrop) return w;
    // dive with the pin: the map rushes up
    const ap = this.appPos(t);
    const k = prog(t, this.tDrop, this.tDrop + 0.22, ease.inOutCubic);
    const follow: CamPose = { pos: { x: ap.x + 1.6, y: ap.y + 8.5, z: ap.z + 3.6 }, tgt: { x: ap.x - 0.1, y: ap.y - 4, z: ap.z - 0.3 }, roll: 0.1 + 0.2 * prog(t, this.tDrop, this.T1), fov: 46 };
    return lerpPose(w, follow, k);
  }

  ladderPose(i: number, t: number): CamPose {
    const y = this.floorY(i);
    const yaw = [0.3, -0.28, 0.26, -0.26, 0.24, -0.16][i]!;
    const pitch = [0.16, -0.06, 0.12, -0.04, 0.1, 0.06][i]!;
    const hold = t - this.fl[i]!;
    const w = i === 5 ? TOP_W : FL_W;
    const tgt = { x: 0.3 * Math.sign(yaw), y: y + (i === 5 ? 0.2 : 0), z: FL_D / 2 };
    const dist = (i === 5 ? 15.2 : 13.2) * (w / FL_W) ** 0.2 - 0.9 * clamp(hold / 0.5);
    return { pos: orbit(tgt, yaw - 0.1 * clamp(hold / 0.5) * Math.sign(yaw), pitch, dist), tgt, roll: -0.02 * Math.sign(yaw), fov: 36 };
  }
  ladderCam(t: number): CamPose {
    let i = 0;
    while (i < 5 && t >= this.fl[i + 1]! - 0.04) i++;
    let pose = this.ladderPose(i, t);
    if (i > 0) {
      const k = prog(t, this.fl[i]! - 0.04, this.fl[i]! + 0.3, ease.outExpo);
      if (k < 1) pose = lerpPose(this.ladderPose(i - 1, this.fl[i]! - 0.04), pose, k);
    }
    if (i === 5 && t >= this.tEng2) {
      // ENGLISH: push in on the sentence, then (on "words") high over the roof where the app assembles
      const y = this.floorY(5);
      const tgt = { x: 0, y: y + 0.4, z: FL_D / 2 };
      const lt = t - this.tEng2;
      const p2: CamPose = { pos: orbit({ x: tgt.x - 1.2, y: tgt.y, z: tgt.z }, -0.14 + 0.05 * lt, 0.1 + 0.02 * lt, 16.8 - 0.6 * lt), tgt: { x: tgt.x - 1.2, y: tgt.y, z: tgt.z }, roll: 0.015, fov: 36 };
      const k2 = prog(t, this.tEng2 - 0.05, this.tEng2 + 0.3, ease.outExpo);
      pose = lerpPose(pose, p2, k2);
      if (t >= this.tEng3) {
        const lt3 = t - this.tEng3;
        const tgt3 = { x: 0.6, y: y + 1.5, z: 0.6 };
        const p3: CamPose = { pos: orbit(tgt3, 0.34 + 0.06 * lt3, 0.42 + 0.02 * lt3, 15 - 0.4 * lt3), tgt: tgt3, roll: -0.03, fov: 36 };
        pose = p3;
      }
    }
    return pose;
  }

  floorAt(t: number) {
    let i = 0;
    while (i < 5 && t >= this.fl[i + 1]! - 0.04) i++;
    return i;
  }

  curTile(t: number) {
    let c = 0;
    this.tiles.forEach((tl, i) => { if (t >= tl.t) c = i; });
    return c;
  }

  appOrigin(): P3 { return { x: 0.6, y: this.floorY(5) + TOP_H / 2, z: 0.3 }; }
  appPos(t: number): P3 {
    const o = this.appOrigin();
    const cy = o.y + 1.3;
    if (t < this.tDrop) return { x: o.x, y: cy, z: o.z };
    const dt = t - this.tDrop;
    const lift = 0.6 * Math.sin(Math.min(1, dt / 0.08) * Math.PI / 2);
    const fall = Math.max(0, dt - 0.06);
    const y = cy + lift - 0.5 * 280 * fall * fall;
    const xo = 6.5 * ease.outCubic(clamp(dt / 0.35));
    return { x: o.x + xo, y: Math.max(GROUND_Y + 1.2, y), z: o.z + 5.5 * ease.outCubic(clamp(dt / 0.35)) };
  }

  // ---------------------------------------------------------------- render
  override render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer, comp } = this.ctx;
    const t = f.t;
    const pose = this.camera(t);
    this.cam.set(pose);
    const inBlock = t < this.tLow + 0.6;
    const inRiver = t >= this.tPull - 0.2 && t < this.tLad;
    const inLadder = t >= this.tLad;

    // background
    const u = this.bg.u;
    const hz = (dx: number) => {
      const p = this.cam.proj(pose.pos.x + dx * 400 + (pose.tgt.x - pose.pos.x) * 400, 0, pose.pos.z + (pose.tgt.z - pose.pos.z) * 400);
      return p;
    };
    const hA = hz(-1), hB = hz(1);
    if (hA && hB) { (u.uHA!.value as THREE.Vector2).set(hA.x, hA.y); (u.uHB!.value as THREE.Vector2).set(hB.x, hB.y); }
    else { (u.uHA!.value as THREE.Vector2).set(0, -5000); (u.uHB!.value as THREE.Vector2).set(W, -5000); }
    u.uSky!.value = inLadder ? 0 : prog(t, this.tPull - 0.1, this.tPull + 0.5);
    u.uGrid!.value = inLadder ? 0.9 : 0.6 * (1 - prog(t, this.tPull, this.tPull + 0.4));
    u.uCobalt!.value = 0;
    u.uFlash!.value = 0.05 * pulse(t, this.tWrite, 0.08);
    this.bg.render(renderer, out);
    renderer.setRenderTarget(out);
    renderer.clearDepth();

    const L = this.lines; L.clear();
    const B = this.blocks; B.clear();
    const T = this.text; T.clear();
    const L2 = this.lines2; L2.clear();
    const c = T.ctx;

    if (inBlock || inRiver) this.drawLattice(t, L);
    if (inBlock || inRiver) this.drawBlock3D(t, L, B);
    if (inRiver) { this.drawStars(t, L); this.drawRiver(t, B, L); this.drawChart3D(t, L); }
    if (inLadder) this.drawLadder3D(t, L, B);

    const fogBg: RGB = inLadder ? LIN.ink : LIN.ink;
    B.render(renderer, out, this.cam, fogBg, inRiver ? 30 : 26, inRiver ? 60 : 40);
    // matrix panels (block only)
    if (inBlock) {
      this.updatePanels(t);
      renderer.setRenderTarget(out);
      renderer.render(this.panelScene, this.cam.cam);
    }
    L.render(renderer, out, this.cam.cam);

    if (inBlock) this.drawBlockText(t, c);
    if (inRiver) { this.drawRiverText(t, c); this.drawChartText(t, c, L2); }
    if (inLadder) this.drawLadderText(t, c, L2);
    comp.draw(renderer, T.upload(), out);
    L2.render(renderer, out);

    const shakeA = 5 * pulse(t, this.tWrite, 0.09) + 3 * f.a.kick * (inLadder ? 1 : 0.4);
    return {
      bloom: 0.62, vignette: 0.34, grain: 0.05,
      shake: [shakeA * noise1(t * 37, 1), shakeA * noise1(t * 41, 2)],
      flash: 0.1 * pulse(t, this.tWrite, 0.06),
      zoom: 1 + 0.012 * pulse(t, this.ctx.audio.timeOfBeat(Math.floor(f.beat)), 0.08) * (inLadder ? 1 : 0),
    };
  }

  // ---------------------------------------------------------------- the lattice (long tail's lights → network nodes)
  drawLattice(t: number, L: LineBatch) {
    const sg = LIN.signal, bn = LIN.bone, gr = LIN.graphite;
    const S = 0.62, NX = 36, NZ = 24;
    const cool = (d: number) => prog(t, this.T0 + 0.1 + d * 0.02, this.T0 + 0.7 + d * 0.02, ease.inOutQuad);
    const netA = 1 - prog(t, this.tS2 - 0.2, this.tS2 + 0.6); // long tail's grid arrives already wired
    const far = t > this.tPull ? 1 : 0;
    const NXX = far ? 70 : NX, NZZ = far ? 110 : NZ;
    for (let i = -NXX; i <= NXX; i++) for (let j = -NZZ; j <= NZZ; j++) {
      const x = i * S, z = j * S + (far ? 30 : 0);
      if (far && Math.abs(x - riverX(z)) < 2.4 && z > RIVER_Z0) continue;
      const d = Math.hypot(i, j);
      const k = cool(d);
      const h = hash(i, j, 3);
      const col = mix3(mulc(mix3(sg, LIN.ember, 0.55), 1.5 + 0.9 * h), mulc(h > 0.94 ? bn : gr, h > 0.94 ? 0.5 : 0.55), k);
      L.seg(x, 0, z, x + 0.001, 0, z, far ? 1.6 : lerp(5.2, 2.2, k), col[0], col[1], col[2], 1);
      if (netA > 0 && !far && i < NX && j < NZ) {
        // the network's edges (random, like the long tail's wiring), dimming as the block rises
        const g = netA * clamp(1.4 - d / 30) * lerp(0.55, 0.3, k);
        if (g > 0.02) {
          if (hash(i, j, 41) < 0.5) L.seg(x, 0, z, x + S, 0, z, 1, gr[0] * g, gr[1] * g, gr[2] * g, 1);
          if (hash(i, j, 42) < 0.5) L.seg(x, 0, z, x, 0, z + S, 1, gr[0] * g, gr[1] * g, gr[2] * g, 1);
        }
      }
    }
  }

  // ---------------------------------------------------------------- the transformer block
  buildK(t: number) {
    // staged assembly on the beats after the plate starts
    const b = this.beats.filter((x) => x > this.T0 + 0.2);
    return {
      tiles: prog(t, this.T0 + 0.25, this.T0 + 0.55, ease.outCubic),
      cols: prog(t, b[0]! - 0.1, b[0]! + 0.35, ease.outExpo),
      attn: prog(t, b[0]!, b[0]! + 0.4, ease.outCubic),
      mlp: prog(t, b[1]!, b[1]! + 0.4, ease.outCubic),
      shell: prog(t, b[2]!, b[2]! + 0.5, ease.outCubic),
      ghost: prog(t, b[3]!, b[3]! + 0.6, ease.outCubic),
    };
  }

  drawBlock3D(t: number, L: LineBatch, B: Blocks) {
    const K = this.buildK(t);
    const bn = LIN.bone, ash = LIN.ash, gr = LIN.graphite, sg = LIN.signal, em = LIN.ember;
    const cur = this.curTile(t);
    const seg = (a: P3, b: P3, w: number, c: RGB, al = 1) => L.seg(a.x, a.y, a.z, b.x, b.y, b.z, w, c[0], c[1], c[2], al);
    // token tiles
    this.tiles.forEach((tl, i) => {
      const land = prog(t, tl.t - 0.02, tl.t + 0.22, (x) => ease.outBack(x, 2.2));
      const ghost = K.tiles;
      if (land <= 0) {
        // slot outline
        if (ghost > 0) {
          const a = 0.5 * ghost;
          const x0 = tl.x - tl.w / 2, x1 = tl.x + tl.w / 2;
          seg({ x: x0, y: 0.01, z: -TOK_D }, { x: x1, y: 0.01, z: -TOK_D }, 1, mulc(gr, a));
          seg({ x: x0, y: 0.01, z: TOK_D }, { x: x1, y: 0.01, z: TOK_D }, 1, mulc(gr, a));
        }
        return;
      }
      const hot = i === cur ? 1 : 0;
      const heatK = hot * (0.4 + 0.35 * Math.exp(-(t - tl.t) / 0.18)) + (1 - hot) * 0.3 * Math.exp(-(t - tl.tEnd) / 0.25) * (t > tl.tEnd ? 1 : 0);
      const y = TOK_H / 2 + (1 - land) * 3.2;
      B.add({ x: tl.x, y, z: 0 }, { x: tl.w, y: TOK_H, z: TOK_D * 2 }, heatK, 1, 0, i);
    });
    // residual streams + the gold forward pass of the current token
    this.tiles.forEach((tl, i) => {
      const land = prog(t, tl.t, tl.t + 0.2);
      const topY = TOK_H + (COL_TOP - TOK_H) * K.cols;
      const a = 0.18 + 0.4 * land;
      seg({ x: tl.x, y: TOK_H, z: 0 }, { x: tl.x, y: topY, z: 0 }, 1.4, mulc(bn, a));
      // residual "+" nodes at the two adds
      for (const yy of [4.2, COL_TOP - 0.3]) {
        if (yy > topY) continue;
        seg({ x: tl.x - 0.12, y: yy, z: 0 }, { x: tl.x + 0.12, y: yy, z: 0 }, 1.3, mulc(bn, a * 1.4));
        seg({ x: tl.x, y: yy - 0.12, z: 0 }, { x: tl.x, y: yy + 0.12, z: 0 }, 1.3, mulc(bn, a * 1.4));
      }
      // embedding vector cells above the tile
      const nC = Math.max(3, Math.round(tl.w / 0.18));
      for (let k = 0; k < nC; k++) {
        const cx = tl.x - tl.w / 2 + (k + 0.5) * (tl.w / nC);
        const v = hash(i, k, 21);
        const lit = land * (0.25 + 0.75 * v);
        const col = i === cur ? mix3(mulc(bn, 0.5), mulc(sg, 1.8), v) : mulc(bn, 0.32);
        seg({ x: cx, y: TOK_H + 0.18, z: 0 }, { x: cx, y: TOK_H + 0.18 + 0.12 + 0.3 * v * K.cols, z: 0 }, 3.5 * (tl.w / nC / 0.18), col, lit);
      }
      if (t >= tl.t && K.cols > 0) {
        const pt = t - tl.t;
        const head = TOK_H + (COL_TOP - TOK_H) * ease.outCubic(clamp(pt / 0.75));
        const tail = TOK_H + (COL_TOP - TOK_H) * ease.outCubic(clamp((pt - 0.18) / 0.75));
        const I = i === cur ? 1 : 0.35;
        if (pt < 1.1) seg({ x: tl.x, y: tail, z: 0 }, { x: tl.x, y: head, z: 0 }, 3.2, mulc(sg, 2.2 * I));
        if (i === cur) seg({ x: tl.x, y: TOK_H, z: 0 }, { x: tl.x, y: head, z: 0 }, 2.0, mulc(sg, 0.9));
      }
    });
    // attention arcs: current token back to the ones before it; head 0 in front, 7 more heads behind
    const nH = 8;
    this.tiles.forEach((tl, c) => {
      if (c === 0 || t < tl.t) return;
      const age = t - tl.t;
      const isCur = c === cur;
      const fadeOld = isCur ? 1 : Math.exp(-(t - (this.tiles[c + 1]?.t ?? t)) / 0.35) * 0.5;
      if (fadeOld < 0.02) return;
      const burst = c >= 5 ? 1 : 0; // "attention": every head fans out
      for (let h = 0; h < nH; h++) {
        if (h > 0 && !burst && h > 2) continue;
        const z = -h * 0.36;
        const hd = h * 0.045;
        const grow = prog(age, hd, hd + 0.28, ease.outCubic) * K.attn;
        if (grow <= 0) continue;
        const row = ATTN[c]!;
        for (let j = 0; j < c; j++) {
          let wgt = row[j]!;
          if (h > 0) { const r = hash(c, j, h); wgt = Math.pow(r, 3) * (h % 3 === 1 && j === c - 1 ? 3 : 1); wgt = Math.min(1, wgt); }
          if (wgt < 0.03) continue;
          const x0 = tl.x, x1 = this.tiles[j]!.x;
          const hgt = 0.45 + 2.2 * wgt + 0.12 * Math.abs(x1 - x0);
          const N = 26;
          const I = (h === 0 ? 1 : 0.35) * fadeOld * (0.35 + 1.4 * wgt);
          let prev: P3 | null = null;
          const nS = Math.ceil(N * grow);
          for (let s = 0; s <= nS; s++) {
            const u = Math.min(s / N, grow);
            const x = lerp(x0, x1, u), y = Y_ATT + hgt * Math.sin(Math.PI * u);
            const p = { x, y, z };
            const hotK = Math.exp(-Math.abs(u - grow) * 9) * (grow < 1 ? 1 : 0);
            if (prev) seg(prev, p, (h === 0 ? 1.6 + 2.6 * wgt : 1.1), mix3(mulc(sg, 1.4 * I), mulc(em, 3 * I), hotK));
            prev = p;
          }
          if (grow >= 1 && h === 0) seg({ x: x1, y: Y_ATT, z }, { x: x1 + 0.001, y: Y_ATT, z }, 6 + 8 * wgt, mulc(sg, 2 * I));
        }
        if (h === 0) seg({ x: tl.x, y: Y_ATT, z }, { x: tl.x + 0.001, y: Y_ATT, z }, 9, mulc(em, 2.2 * fadeOld));
      }
    });
    // MLP fan: current token → sparse neurons → back into the stream
    {
      const tl = this.tiles[cur]!;
      const pt = t - tl.t;
      const on = prog(pt, 0.3, 0.45) * (1 - prog(pt, 1.2, 1.6) * 0.6) * K.mlp;
      for (let n = 0; n < this.neurons.length; n++) {
        const ne = this.neurons[n]!;
        const act = Math.max(0, hash(n, cur, 8) * 1.7 - 0.8);
        const a = K.mlp;
        seg({ x: ne.x, y: Y_NEU, z: -1.3 }, { x: ne.x + 0.001, y: Y_NEU, z: -1.3 }, 3.2 + 5 * act * on, act * on > 0.05 ? mulc(sg, 1.2 + 2 * act * on) : mulc(bn, 0.45 * a));
        if (on > 0 && act > 0.05) {
          const I = on * act;
          seg({ x: tl.x, y: Y_MLP_IN, z: 0 }, { x: ne.x, y: Y_NEU, z: -1.3 }, 1, mulc(sg, 0.9 * I));
          seg({ x: ne.x, y: Y_NEU, z: -1.3 }, { x: tl.x, y: Y_MLP_OUT, z: 0 }, 1, mulc(sg, 0.6 * I));
        }
      }
    }
    // shell: cutaway box with section hatching on the cut walls, layer norms, echoes of the layers above
    const sA = K.shell;
    if (sA > 0) {
      const y1 = COL_TOP + 0.3;
      const box = (yo: number, a: number) => {
        const c1 = mulc(bn, 0.55 * a), c2 = mulc(ash, 0.3 * a);
        const P = (x: number, y: number, z: number) => ({ x, y: y + yo, z });
        const e = (p: P3, q: P3, cc: RGB, w = 1.2) => seg(p, q, w, cc);
        // back rectangle
        e(P(-BX, 0, BZ0), P(BX, 0, BZ0), c1); e(P(-BX, y1, BZ0), P(BX, y1, BZ0), c1);
        e(P(-BX, 0, BZ0), P(-BX, y1, BZ0), c1); e(P(BX, 0, BZ0), P(BX, y1, BZ0), c1);
        // floor and sides (front edge cut away above the tiles)
        e(P(-BX, 0, BZ0), P(-BX, 0, BZ1), c1); e(P(BX, 0, BZ0), P(BX, 0, BZ1), c1); e(P(-BX, 0, BZ1), P(BX, 0, BZ1), c2);
        e(P(-BX, y1, BZ0), P(-BX, y1, BZ1 * 0.35), c1); e(P(BX, y1, BZ0), P(BX, y1, BZ1 * 0.35), c1);
        // cut edges (stepped: the cutaway)
        e(P(-BX, y1, BZ1 * 0.35), P(-BX, 1.2, BZ1), c1); e(P(-BX, 1.2, BZ1), P(-BX, 0, BZ1), c1);
        e(P(BX, y1, BZ1 * 0.35), P(BX, 1.2, BZ1), c1); e(P(BX, 1.2, BZ1), P(BX, 0, BZ1), c1);
        if (yo === 0) {
          // section hatch along the cut (wall thickness 0.22)
          for (const sx of [-BX, BX]) {
            for (let k = 0; k < 34; k++) {
              const u0 = k / 34;
              const pA = lerp3(P(sx, y1, BZ1 * 0.35), P(sx, 1.2, BZ1), u0);
              const pB = { x: pA.x - Math.sign(sx) * 0.22, y: pA.y - 0.22, z: pA.z };
              e(pA, pB, mulc(ash, 0.5 * a), 1);
            }
          }
          // back wall engraving
          for (let k = 1; k < 60; k++) {
            const x = lerp(-BX, BX, k / 60);
            e(P(x, 0.02, BZ0 - 0.01), P(x, y1 - 0.02, BZ0 - 0.01), mulc(gr, 0.18 * a), 1);
          }
        }
      };
      box(0, sA);
      // layer norms
      for (const yy of [1.55, 4.45]) {
        const a = 0.5 * sA;
        seg({ x: -BX + 0.3, y: yy, z: BZ0 + 0.3 }, { x: BX - 0.3, y: yy, z: BZ0 + 0.3 }, 1, mulc(ash, a));
        seg({ x: -BX + 0.3, y: yy, z: 1.2 }, { x: BX - 0.3, y: yy, z: 1.2 }, 1, mulc(ash, a));
        for (let k = 0; k <= 40; k++) { const x = lerp(-BX + 0.3, BX - 0.3, k / 40); seg({ x, y: yy, z: BZ0 + 0.3 }, { x, y: yy, z: 1.2 }, 1, mulc(gr, a * 0.5)); }
      }
      const gA = K.ghost * (1 - prog(t, this.tPull - 0.1, this.tPull + 0.3));
      for (let g = 1; g <= 3; g++) if (gA > 0) box(g * LAYER_PITCH * lerp(0.3, 1, gA), gA * 0.5 / g);
    }
  }

  updatePanels(t: number) {
    const K = this.buildK(t);
    const cur = this.curTile(t);
    const tl = this.tiles[cur]!;
    const wWeights = findWord(this.L1, 'weights');
    const sweep = prog(t, wWeights.start - 0.05, wWeights.end + 0.35, ease.inOutQuad);
    this.panels.forEach((p, i) => {
      const u = p.u;
      const isMlp = i >= 4;
      const k = isMlp ? K.mlp : K.attn;
      u.uReveal!.value = k;
      u.uAlpha!.value = 0.5;
      u.uT!.value = t;
      const pt = t - tl.t;
      u.uHot!.value = isMlp ? prog(pt, 0.3, 0.5) * (1 - prog(pt, 0.9, 1.4) * 0.7) : prog(pt, 0.05, 0.2) * (1 - prog(pt, 0.6, 1.2) * 0.7);
      u.uHotRow!.value = (cur * 3 + i * 5) % 18;
      u.uHotCol!.value = isMlp ? (cur * 7 + i * 11) % 48 : -9;
      u.uSweep!.value = sweep > 0 && sweep < 1 ? sweep * 1.2 - 0.1 + i * 0.02 : -1;
    });
  }

  drawBlockText(t: number, c: CanvasRenderingContext2D) {
    const K = this.buildK(t);
    const cur = this.curTile(t);
    const fadeOut = 1 - prog(t, this.tPull + 0.1, this.tPull + 0.5);
    if (fadeOut <= 0) return;
    const mono = F.mono(500);
    // token text on the tiles' front faces
    this.tiles.forEach((tl, i) => {
      const land = prog(t, tl.t - 0.02, tl.t + 0.22, (x) => ease.outBack(x, 2.2));
      if (land <= 0) return;
      const y = TOK_H + (1 - land) * 3.2;
      const o = { x: tl.x - tl.w / 2, y, z: TOK_D + 0.002 };
      if (!planeTransform(c, this.cam, o, { x: 1, y: 0, z: 0 }, { x: 0, y: -1, z: 0 }, 100)) return;
      const tk = TOKENS[i]!;
      const hot = i === cur;
      c.font = font(mono, 31);
      c.textAlign = 'center'; c.textBaseline = 'alphabetic';
      const txt = tk.s;
      // the BPE space marker in ash, the word itself bright
      const wAll = c.measureText(txt).width;
      let x0 = tl.w * 50 - wAll / 2;
      c.textAlign = 'left';
      for (const ch of Array.from(txt)) {
        const isMark = ch === '·';
        c.fillStyle = hot ? (isMark ? rgba('blood', fadeOut) : rgba('ink', fadeOut)) : isMark ? rgba('graphite', fadeOut) : rgba('bone', 0.95 * fadeOut);
        c.fillText(ch, x0, 44);
        x0 += c.measureText(ch).width;
      }
      c.font = font(F.mono(400), 13);
      c.textAlign = 'center';
      c.fillStyle = hot ? rgba('ink', 0.8 * fadeOut) : rgba('ash', 0.8 * fadeOut);
      c.fillText(String(tk.id), tl.w * 50, 68);
    });
    c.setTransform(1, 0, 0, 1, 0, 0);
    // weights on head-0 arcs (current token)
    const tl = this.tiles[cur]!;
    if (cur > 0 && t >= tl.t) {
      const row = ATTN[cur]!;
      const a = prog(t - tl.t, 0.2, 0.35) * K.attn * fadeOut;
      c.font = font(F.mono(500), 15);
      c.textAlign = 'center';
      row.forEach((wgt, j) => {
        if (wgt < 0.04) return;
        const x = lerp(tl.x, this.tiles[j]!.x, 0.5);
        const hgt = 0.45 + 2.2 * wgt + 0.12 * Math.abs(this.tiles[j]!.x - tl.x);
        const p = this.cam.proj(x, Y_ATT + hgt + 0.18, 0);
        if (!p) return;
        c.fillStyle = rgba('signal', a * (0.5 + 0.5 * wgt));
        c.fillText(wgt.toFixed(2), p.x, p.y);
      });
    }
    // labels with leader lines
    const lab = (anchor: P3, dx: number, dy: number, s1: string, s2: string, a: number) => {
      if (a <= 0.01) return;
      const p = this.cam.p(anchor);
      if (!p) return;
      c.font = font(F.mono(500), 15);
      const tw = Math.max(c.measureText(s1).width, s2 ? c.measureText(s2).width * 0.9 : 0) + 40;
      if (dx < 0 && p.x + dx - tw < 110) dx = -dx;
      if (dx > 0 && p.x + dx + tw > W - 110) dx = -dx;
      const q = { x: p.x + dx, y: p.y + dy };
      c.strokeStyle = rgba('ash', 0.7 * a); c.lineWidth = 1;
      c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(q.x, q.y); c.lineTo(q.x + (dx > 0 ? 18 : -18), q.y); c.stroke();
      c.fillStyle = rgba('bone', 0.9 * a);
      c.beginPath(); c.arc(p.x, p.y, 2.2, 0, TAU); c.fill();
      c.textAlign = dx > 0 ? 'left' : 'right';
      const tx = q.x + (dx > 0 ? 24 : -24);
      c.font = font(F.mono(500), 15); c.letterSpacing = '1.5px';
      c.fillText(s1, tx, q.y + 5);
      if (s2) { c.font = font(F.mono(400), 13); c.fillStyle = rgba('ash', 0.85 * a); c.fillText(s2, tx, q.y + 24); }
      c.letterSpacing = '0px';
    };
    const S2 = t >= this.tS2;
    const lA = fadeOut * (S2 ? 0.8 : 1);
    lab({ x: -BX + 0.2, y: 3.9, z: BZ0 + 0.3 }, -70, -40, 'MULTI-HEAD ATTENTION', 'h = 32 · softmax(QKᵗ/√d)·V'.replace('ᵗ', '^T'), K.attn * lA);
    lab({ x: BX - 0.2, y: 6.3, z: BZ0 + 0.3 }, 60, -50, 'MLP', '4·d_model · GELU', K.mlp * lA);
    lab({ x: this.tiles[0]!.x, y: COL_TOP, z: 0 }, -90, -30, 'RESIDUAL STREAM', 'd_model = 4,096', K.shell * lA * (S2 ? 0 : 1));
    lab({ x: BX, y: 0.02, z: BZ1 }, 70, 30, 'TOKENS', `ctx ${this.tiles.filter((x) => t >= x.t).length} / 8,192`, K.tiles * lA);
    lab({ x: BX, y: COL_TOP + LAYER_PITCH * 0.5, z: BZ0 }, 60, 0, 'LAYER 17 / 32', '× 32 identical blocks', K.ghost * lA * (S2 ? 0 : 1));
    // matrix names on the panels
    const names = ['W_Q', 'W_K', 'W_V', 'W_O', 'W_in', 'W_out'];
    c.font = font(F.mono(600), 16); c.textAlign = 'left';
    this.panels.forEach((pn, i) => {
      const k = i >= 4 ? K.mlp : K.attn;
      const pp = pn.mesh.position;
      const p = this.cam.proj(pp.x - pn.w / 2, pp.y + pn.h / 2 + 0.16, pp.z);
      if (!p || k <= 0) return;
      c.fillStyle = rgba('bone', 0.85 * k * fadeOut);
      c.fillText(names[i]!, p.x, p.y);
      c.fillStyle = rgba('ash', 0.7 * k * fadeOut);
      c.font = font(F.mono(400), 12);
      c.fillText(i >= 4 ? '4096 × 16384 · bf16' : '4096 × 4096 · bf16', p.x + 52, p.y);
      c.font = font(F.mono(600), 16);
    });
    // a deadpan footnote
    const fa = prog(t, this.T0 + 1.0, this.T0 + 1.3) * fadeOut;
    if (fa > 0) {
      c.font = font(F.mono(400), 14); c.textAlign = 'left'; c.letterSpacing = '1px';
      c.fillStyle = rgba('ash', 0.8 * fa);
      c.fillText('FIG. 7 — ONE TRANSFORMER BLOCK, CUTAWAY. 70 B PARAMETERS, NONE OF THEM MAGIC.', 110, H - 96);
      c.letterSpacing = '0px';
    }
  }

  // ---------------------------------------------------------------- night: stars, river, loss chart
  drawStars(t: number, L: LineBatch) {
    const a = prog(t, this.tPull, this.tPull + 0.6);
    if (a <= 0) return;
    const rot = t * 0.006;
    const cs = Math.cos(rot), sn = Math.sin(rot);
    const fi = frameIdx(t);
    for (let i = 0; i < this.stars.length; i++) {
      const s = this.stars[i]!;
      const x = s.p.x * cs - s.p.z * sn, z = s.p.x * sn + s.p.z * cs;
      const tw = 0.8 + 0.2 * Math.sin(i * 1.7 + fi * 0.21 * (0.5 + hash(i, 2)));
      const I = a * (0.18 + 1.1 * s.b) * tw;
      const col = s.b > 0.7 ? mulc(LIN.ember, I * 1.1) : mulc(LIN.bone, I * 0.7);
      L.seg(x, s.p.y, z, x + 0.01, s.p.y, z, s.w, col[0], col[1], col[2], 1);
    }
  }

  riverChip(r: Internals['river'][number], t: number) {
    const speed = 13;
    const len = RIVER_Z1 - RIVER_Z0;
    const s = ((r.ph + (t * speed) / len) % 1 + 1) % 1;
    const z = RIVER_Z1 - s * len;
    const x = riverX(z) + r.lane * 3.1;
    const dz = 0.5, dx = riverX(z - dz) - riverX(z);
    const yaw = Math.atan2(dx, -dz) + Math.PI;
    const bob = 0.05 * Math.sin(t * 3 + r.seed * 20);
    const dive = smoothstep(RIVER_Z0 + 4, RIVER_Z0, z);
    return { x, y: 0.3 + bob - dive * 0.3, z, yaw, s, fade: (1 - dive) * smoothstep(RIVER_Z1, RIVER_Z1 - 20, z) };
  }

  drawRiver(t: number, B: Blocks, L: LineBatch) {
    const a = prog(t, this.tPull - 0.2, this.tPull + 0.4);
    if (a <= 0) return;
    for (const r of this.river) {
      const p = this.riverChip(r, t);
      if (p.fade <= 0.01) continue;
      const q = quatAxis(0, 1, 0, p.yaw);
      const heat = r.gold ? 0.9 : 0;
      B.add({ x: p.x, y: p.y, z: p.z }, { x: r.len, y: 0.46, z: 0.08 }, heat, a * p.fade, 0, r.seed, q);
    }
    // banks: hairlines with bone ticks
    const bn = LIN.bone;
    for (const side of [-1, 1]) {
      let prev: P3 | null = null;
      for (let z = RIVER_Z0 + 1; z <= RIVER_Z1; z += 0.8) {
        const p = { x: riverX(z) + side * 3.9, y: 0.01, z };
        const fade = a * 0.45 * smoothstep(RIVER_Z1, RIVER_Z1 - 30, z);
        if (prev) L.seg(prev.x, prev.y, prev.z, p.x, p.y, p.z, 1.2, bn[0] * fade, bn[1] * fade, bn[2] * fade, 1);
        prev = p;
      }
    }
    // flow lines on the water
    for (let k = 0; k < 90; k++) {
      const lane = hash(k, 31) * 2 - 1;
      const ph = hash(k, 32);
      const z0 = RIVER_Z1 - (((ph + t * 0.22) % 1) * (RIVER_Z1 - RIVER_Z0));
      const z1 = z0 - 2.5;
      const g = a * 0.35 * smoothstep(RIVER_Z1, RIVER_Z1 - 20, z0) * smoothstep(RIVER_Z0, RIVER_Z0 + 4, z1);
      if (g <= 0.01) continue;
      L.seg(riverX(z0) + lane * 3.5, 0.02, z0, riverX(z1) + lane * 3.5, 0.02, z1, 1, LIN.ash[0] * g, LIN.ash[1] * g, LIN.ash[2] * g, 1);
    }
  }

  drawRiverText(t: number, c: CanvasRenderingContext2D) {
    const a = prog(t, this.tPull, this.tPull + 0.4);
    if (a <= 0) return;
    c.textBaseline = 'alphabetic';
    for (const r of this.river) {
      const p = this.riverChip(r, t);
      if (p.fade < 0.05) continue;
      const pr = this.cam.proj(p.x, p.y, p.z);
      if (!pr || pr.s < 34 || pr.s > 170 || pr.x < -200 || pr.x > W + 200 || pr.y < -100 || pr.y > H + 100) continue;
      const cy = Math.cos(p.yaw), sy = Math.sin(p.yaw);
      // the chip's +z face (in its own frame) faces the camera chasing the flow
      const ux = { x: cy, y: 0, z: -sy }, nz = { x: sy, y: 0, z: cy };
      const o = { x: p.x - ux.x * r.len / 2 + nz.x * 0.045, y: p.y + 0.23, z: p.z - ux.z * r.len / 2 + nz.z * 0.045 };
      if (!planeTransform(c, this.cam, o, ux, { x: 0, y: -1, z: 0 }, 100)) continue;
      const al = a * p.fade * clamp((pr.s - 34) / 70) * 0.7;
      c.font = font(F.mono(500), 22);
      c.textAlign = 'center';
      c.fillStyle = r.gold ? rgba('ink', al) : rgba('bone', 0.9 * al);
      c.fillText(RIVER_VOCAB[r.tok]!, r.len * 50, 32);
    }
    c.setTransform(1, 0, 0, 1, 0, 0);
  }

  drawChart3D(t: number, L: LineBatch) {
    const a = prog(t, this.tPull, this.tPull + 0.45);
    if (a <= 0) return;
    const bn = LIN.bone, ash = LIN.ash, gr = LIN.graphite, sg = LIN.signal, em = LIN.ember;
    const z = CH.z;
    const draw = prog(t, this.tPull, this.tPull + 0.5, ease.outExpo);
    const s = (x0: number, y0: number, x1: number, y1: number, w: number, cc: RGB, al = 1) => L.seg(x0, y0, z, x1, y1, z, w, cc[0], cc[1], cc[2], al * a);
    s(CH.x0, CH.y0, CH.x0, lerp(CH.y0, CH.y1, draw), 1.6, mulc(bn, 0.8));
    s(CH.x0, CH.y0, lerp(CH.x0, CH.x1, draw), CH.y0, 1.6, mulc(bn, 0.8));
    for (let k = 1; k <= 6; k++) {
      const y = lerp(CH.y0, CH.y1, k / 6);
      s(CH.x0 - 0.35, y, CH.x0, y, 1.3, mulc(bn, 0.8));
      for (let x = CH.x0 + 0.5; x < lerp(CH.x0, CH.x1, draw); x += 0.7) s(x, y, x + 0.1, y, 1, mulc(gr, 0.5));
    }
    for (let k = 1; k <= 10; k++) { const x = lerp(CH.x0, CH.x1, k / 10); s(x, CH.y0, x, CH.y0 - 0.3, 1.3, mulc(bn, 0.8)); }
    // the loss curve up to the pen, hot near the pen
    const px = this.penX(t);
    let prev: { x: number; y: number } | null = null;
    for (const p of this.lossPts) {
      if (p.x > px) break;
      if (prev) {
        const k = Math.exp(-(px - p.x) / 1.2);
        const col = mix3(mulc(sg, 1.1), mulc(em, 2.6), k);
        s(prev.x, prev.y, p.x, p.y, 2.4 + 1.2 * k, col);
      }
      prev = p;
    }
    if (prev) s(prev.x, prev.y, px, this.lossY(px, true), 3, mulc(em, 2.6));
    // smoothed trend (ash, dashed) ahead of time: where the loss is going
    for (let x = CH.x0 + 0.6; x < px; x += 0.5) s(x, this.lossY(x, false) - 0.02, x + 0.22, this.lossY(x + 0.22, false) - 0.02, 1, mulc(ash, 0.5));
  }

  drawChartText(t: number, c: CanvasRenderingContext2D, L2: LineBatch) {
    const a = prog(t, this.tPull + 0.1, this.tPull + 0.5);
    if (a <= 0) return;
    const z = CH.z;
    const uX = { x: 1, y: 0, z: 0 }, vY = { x: 0, y: -1, z: 0 };
    const px = this.penX(t);
    const prg = clamp((px - (CH.x0 + 0.6)) / (this.penEnd - CH.x0 - 0.6));
    c.textBaseline = 'alphabetic';
    // axis labels (on the chart plane)
    if (planeTransform(c, this.cam, { x: CH.x0, y: CH.y1 + 1.0, z }, uX, vY, 100)) {
      c.font = font(F.mono(500), 52); c.textAlign = 'left'; c.letterSpacing = '6px';
      c.fillStyle = rgba('bone', 0.85 * a);
      c.fillText('TRAIN / LOSS', 0, 0);
      c.font = font(F.mono(400), 40); c.letterSpacing = '2px';
      c.fillStyle = rgba('ash', 0.85 * a);
      c.fillText(`step ${grouped(1204000 * prg)}   tokens seen ${(15.6 * prg).toFixed(2)} T   lr 3e-4 cosine`, 0, 70);
      c.letterSpacing = '0px';
    }
    if (planeTransform(c, this.cam, { x: CH.x1 - 0.2, y: CH.y1 + 1.0, z }, uX, vY, 100)) {
      c.font = font(F.mono(600), 64); c.textAlign = 'right';
      const loss = lerp(10.8, 1.62, 1 - Math.exp(-3.4 * prg)) + 0.05 * noise1(prg * 80, 4);
      c.fillStyle = rgba('signal', 0.95 * a);
      c.fillText(`loss ${loss.toFixed(3)}`, 0, 0);
    }
    for (let k = 0; k <= 10; k++) {
      const x = lerp(CH.x0, CH.x1, k / 10);
      if (!planeTransform(c, this.cam, { x, y: CH.y0 - 0.55, z }, uX, vY, 100)) continue;
      c.font = font(F.mono(400), 34); c.textAlign = 'center'; c.fillStyle = rgba('ash', 0.8 * a);
      c.fillText(k === 0 ? '0' : `${(k * 120.4).toFixed(0)}k`, 0, 26);
    }
    // the riding lyric: glyphs stand on the curve as they are sung (cooling from white-hot)
    const famR = F.archivo(100, 800);
    c.font = font(famR, 100);
    c.textAlign = 'left';
    for (const g of this.ride) {
      if (t < g.t0 - 0.02 || g.ch === ' ') continue;
      const ap = prog(t, g.t0 - 0.02, g.t0 + 0.14, (x) => ease.outBack(x, 2));
      const xm = g.x + g.w / 2;
      const y0 = this.lossY(g.x, false), y1 = this.lossY(g.x + g.w, false);
      const ang = Math.atan2(y1 - y0, g.w) * 0.8;
      const ux = { x: Math.cos(ang), y: Math.sin(ang), z: 0 }, vy = { x: Math.sin(ang), y: -Math.cos(ang), z: 0 };
      const base = { x: g.x, y: lerp(y0, y1, 0.5) + 0.42 + (xm - g.x) * 0 , z: z + 0.01 };
      const scl = RIDE_SIZE / 0.72; // world em
      if (!planeTransform(c, this.cam, base, ux, vy, 100 / scl)) continue;
      const heat = Math.exp(-(t - g.t1) / 0.35);
      c.save();
      c.scale(1, 0.25 + 0.75 * ap);
      c.fillStyle = heatCss(t < g.t1 ? 1 : heat, a);
      c.fillText(g.ch, 0, 0);
      c.restore();
    }
    c.setTransform(1, 0, 0, 1, 0, 0);
    // the cursor draws the curve
    const pp = this.cam.proj(px, this.lossY(px, true), z);
    if (pp && t > this.tPull + 0.05) {
      const sc = clamp(pp.s / 45, 0.6, 1.6);
      cursorTip(L2, pp.x, pp.y, t, sc, 1.1);
      weldSparks(L2, t, (tb) => {
        if (tb < this.tPull + 0.1) return null;
        const x = this.penX(tb);
        const q = this.cam.proj(x, this.lossY(x, true), z);
        return q ? { x: q.x, y: q.y } : null;
      }, { rate: 60, speed: 200 * sc, life: 0.4, intensity: 0.8, seed: 5 });
    }
    // footnote
    c.font = font(F.mono(400), 14); c.textAlign = 'left'; c.letterSpacing = '1px';
    c.fillStyle = rgba('ash', 0.75 * a * (1 - prog(t, this.tRise, this.tRise + 0.3)));
    c.fillText('FIG. 8 — PRE-TRAINING. THE RIVER IS THE INTERNET, TOKENISED; IT RAN ALL NIGHT FOR SEVERAL MONTHS.', 110, H - 96);
    c.letterSpacing = '0px';
  }

  // ---------------------------------------------------------------- the ladder of abstraction
  drawLadder3D(t: number, L: LineBatch, B: Blocks) {
    const bn = LIN.bone, ash = LIN.ash, sg = LIN.signal;
    const cascade = (i: number) => pulse(t, this.tWrite + 0.07 * (5 - i), 0.12);
    for (let i = 0; i < 6; i++) {
      const y = this.floorY(i);
      const top = i === 5;
      const w = top ? TOP_W : FL_W, h = top ? TOP_H : FL_H;
      const reach = prog(t, this.fl[i]! - 1.5, this.fl[i]! - 0.3);
      const heat = 0.3 * cascade(i) + 0.12 * pulse(t, this.fl[i]!, 0.08) * (t >= this.fl[i]! ? 1 : 0);
      B.add({ x: LAD_X, y, z: 0 }, { x: w, y: h, z: FL_D }, heat, 0.5 + 0.5 * Math.max(reach, i === 0 ? 1 : 0), 1, i);
      // rung between floors
      if (i < 5) {
        const y0 = y + h / 2, y1 = this.floorY(i + 1) - (i + 1 === 5 ? TOP_H : FL_H) / 2;
        for (const sx of [-1, 1]) {
          const x = sx * (FL_W / 2 - 0.9);
          B.add({ x, y: (y0 + y1) / 2, z: 0 }, { x: 0.35, y: Math.max(0.05, y1 - y0), z: 0.35 }, 0, 1, 0, 9);
        }
      }
    }
    // the rails of the ladder
    for (const sx of [-1, 1]) {
      const x = sx * (TOP_W / 2 + 0.7);
      L.seg(x, GROUND_Y, FL_D / 2, x, this.floorY(5) + TOP_H, FL_D / 2, 2, bn[0] * 0.5, bn[1] * 0.5, bn[2] * 0.5, 1);
      for (let k = 0; k < 60; k++) {
        const yy = lerp(GROUND_Y, this.floorY(5) + TOP_H, k / 60);
        L.seg(x, yy, FL_D / 2, x - sx * 0.3, yy + 0.3, FL_D / 2, 1, ash[0] * 0.3, ash[1] * 0.3, ash[2] * 0.3, 1);
      }
    }
    // the compile pulse running down the rails
    if (t > this.tWrite - 0.05) {
      const k = prog(t, this.tWrite, this.tWrite + 0.42, ease.inQuad);
      const yT = lerp(this.floorY(5) + TOP_H / 2, GROUND_Y, k);
      const I = 1 - prog(t, this.tWrite + 0.42, this.tWrite + 0.7);
      for (const sx of [-1, 1]) {
        const x = sx * (TOP_W / 2 + 0.7);
        L.seg(x, yT, FL_D / 2, x, yT + 3, FL_D / 2, 4, sg[0] * 2.5 * I, sg[1] * 2.5 * I, sg[2] * 2.5 * I, 1);
      }
    }
    // the app on the roof, block by block
    this.drawApp(t, B, L);
    // the map below (for the drop)
    const mA = prog(t, this.tBack, this.tWrite + 0.4);
    if (mA > 0) {
      for (let i = -40; i <= 40; i++) for (let j = -40; j <= 40; j++) {
        const x = i * 0.9 + 6, z = j * 0.9 + 4;
        const h = hash(i, j, 12);
        const g = mA * (0.25 + 0.4 * h) * smoothstep(38, 18, Math.hypot(x - 6, z - 4));
        if (g < 0.02) continue;
        L.seg(x, GROUND_Y, z, x + 0.001, GROUND_Y, z, 2.2, bn[0] * g, bn[1] * g, bn[2] * g, 1);
      }
      // landing target rings
      const ap = this.appPos(this.T1 + 0.2);
      const ra = prog(t, this.tDrop + 0.05, this.tDrop + 0.3);
      for (let r = 0; r < 3; r++) {
        const R = (0.8 + r * 0.9) * (0.5 + 0.5 * ra) + 0.3 * ((t * 2 + r / 3) % 1);
        let prev: P3 | null = null;
        for (let k = 0; k <= 48; k++) {
          const an = (k / 48) * TAU;
          const p = { x: ap.x + Math.cos(an) * R, y: GROUND_Y + 0.01, z: ap.z + Math.sin(an) * R };
          const I = ra * (0.9 - r * 0.25);
          if (prev) L.seg(prev.x, prev.y, prev.z, p.x, p.y, p.z, 1.5, sg[0] * I, sg[1] * I, sg[2] * I, 1);
          prev = p;
        }
      }
    }
  }

  appCellPos(cell: AppCell, t: number): { p: P3; land: number; q: [number, number, number, number] } {
    const o = this.appOrigin();
    const S = 0.25;
    const gw = APP_ART[0]!.length, gh = APP_ART.length;
    // app local: x across, y up, standing on the roof facing the camera
    const lx = (cell.gx - (gw - 1) / 2) * S, ly = ((gh - 1) - cell.gy) * S + S / 2;
    const land = prog(t, cell.t - 0.3, cell.t, ease.outCubic);
    let p: P3 = { x: o.x + lx, y: o.y + ly, z: o.z };
    let q: [number, number, number, number] = [0, 0, 0, 1];
    if (land < 1) {
      const k = land;
      const arc = Math.sin(k * Math.PI) * 1.2;
      p = { x: lerp(cell.from.x, p.x, k), y: lerp(cell.from.y, p.y, k) + arc, z: lerp(cell.from.z, p.z, k) + arc * 0.5 };
      q = quatAxis(hash(cell.seed, 1) - 0.5, 1, hash(cell.seed, 2) - 0.5, (1 - k) * 5);
    }
    if (t >= this.tDrop) {
      // drop like a pin: the whole app tips forward flat and falls
      const ap = this.appPos(t);
      const tip = ease.outCubic(clamp((t - this.tDrop) / 0.25));
      const qt = quatAxis(1, 0, 0, -tip * Math.PI / 2);
      const cx = lx, cy = ly - (gh * S) / 2;
      // rotate local offset about x
      const ca = Math.cos(-tip * Math.PI / 2), sa = Math.sin(-tip * Math.PI / 2);
      const ry = cy * ca, rz = cy * sa;
      const shrink = lerp(1, 0.7, tip);
      p = { x: ap.x + cx * shrink, y: ap.y + ry * shrink, z: ap.z + rz * shrink };
      q = quatMul(qt, q);
    }
    return { p, land, q };
  }

  drawApp(t: number, B: Blocks, L: LineBatch) {
    const S = 0.25;
    const sg = LIN.signal;
    const lit = prog(t, this.tWrite + 0.05, this.tWrite + 0.3);
    for (const cell of this.appCells) {
      if (t < cell.t - 0.3) continue;
      const { p, land, q } = this.appCellPos(cell, t);
      const fresh = Math.exp(-Math.max(0, t - cell.t) / 0.25) * (land >= 1 ? 1 : 0.6);
      const kindHeat = cell.kind === '=' ? 0.55 : cell.kind === 'o' ? 0.7 : cell.kind === '-' ? 0.25 : 0;
      const heat = Math.max(fresh * 0.9, kindHeat * lit, 0.15 * lit);
      const size = t >= this.tDrop ? S * lerp(1, 0.7, clamp((t - this.tDrop) / 0.25)) : S;
      B.add(p, { x: size * 0.96, y: size * 0.96, z: cell.kind === '#' ? size * 1.2 : size * 0.6 }, heat, 1, cell.kind === '#' ? 2 : 0, cell.seed, q);
    }
    // the pin's needle below the falling app
    if (t >= this.tDrop) {
      const ap = this.appPos(t);
      const k = prog(t, this.tDrop + 0.05, this.tDrop + 0.2);
      L.seg(ap.x, ap.y - 0.2, ap.z, ap.x, ap.y - 0.2 - 1.6 * k, ap.z, 3, sg[0] * 2, sg[1] * 2, sg[2] * 2, 1);
    }
  }

  drawLadderText(t: number, c: CanvasRenderingContext2D, L2: LineBatch) {
    c.textBaseline = 'alphabetic';
    const uX = { x: 1, y: 0, z: 0 }, vY = { x: 0, y: -1, z: 0 };
    let caret: { x: number; y: number; h: number } | null = null;
    const camY = this.cam.position.y;
    for (let i = 0; i < 6; i++) {
      const y = this.floorY(i);
      const top = i === 5;
      const w = top ? TOP_W : FL_W, h = top ? TOP_H : FL_H;
      if (Math.abs(camY - y) > 16 && t < this.tBack) continue;
      const o = { x: LAD_X - w / 2, y: y + h / 2, z: FL_D / 2 + 0.003 };
      if (!planeTransform(c, this.cam, o, uX, vY, 100, 600)) continue;
      const casc = pulse(t, this.tWrite + 0.07 * (5 - i), 0.14);
      const compiled = t >= this.tWrite + 0.07 * (5 - i);
      // floor label (left) and year (right)
      c.font = font(F.mono(600), 26); c.textAlign = 'left'; c.letterSpacing = '4px';
      c.fillStyle = rgba('bone', 0.9);
      c.fillText(`L${i}  ${FLOORS[i]!.name}`, 40, 52);
      c.letterSpacing = '1px';
      c.font = font(F.mono(400), 20); c.textAlign = 'right';
      c.fillStyle = rgba('ash', 0.85);
      c.fillText(`${FLOORS[i]!.year} · ${FLOORS[i]!.note}`, w * 100 - 40, 52);
      c.letterSpacing = '0px';
      // hairline under the label
      c.fillStyle = rgba('bone', 0.25);
      c.fillRect(40, 68, w * 100 - 80, 1.5);
      const r = this.drawFloorContent(i, t, c, compiled, casc, w, h);
      if (r && i === this.floorAt(t)) caret = r;
    }
    c.setTransform(1, 0, 0, 1, 0, 0);
    if (caret && t < this.tDrop) {
      cursorCaret(L2, caret.x, caret.y, caret.h, cursorBlink(((t - this.fl[0]!) * 2.1) % 1) * (t > this.tWrite ? 1 - prog(t, this.tWrite, this.tWrite + 0.2) : 1), t);
    }
    if (t < this.tDrop) this.appSparks(t, L2);
    // footnote
    c.font = font(F.mono(400), 14); c.textAlign = 'left'; c.letterSpacing = '1px';
    c.fillStyle = rgba('ash', 0.75 * (1 - prog(t, this.tBack, this.tBack + 0.3)));
    c.fillText('FIG. 9 — THE LADDER OF ABSTRACTION. EACH FLOOR TRUSTS THE ONE BELOW IT.', 110, H - 96);
    c.letterSpacing = '0px';
  }

  appSparks(t: number, L2: LineBatch) {
    const cells = this.appCells;
    weldSparks(L2, t, (tb) => {
      // the most recently landed block
      let best: AppCell | null = null;
      for (const cl of cells) if (cl.t <= tb && tb - cl.t < 0.12) best = cl;
      if (!best) return null;
      const { p } = this.appCellPos(best, best.t);
      const q = this.cam.proj(p.x, p.y, p.z + 0.15);
      return q ? { x: q.x, y: q.y } : null;
    }, { rate: 110, speed: 260, life: 0.45, intensity: 1, seed: 17 });
  }

  /** Content of floor i in floor-local px (current transform = the floor's front face, 100 px/unit). Returns the caret (screen px) if this floor is being typed on. */
  drawFloorContent(i: number, t: number, c: CanvasRenderingContext2D, compiled: boolean, casc: number, w: number, h: number): { x: number; y: number; h: number } | null {
    const mono = F.mono(500);
    const x0 = 40, yTop = 118;
    let caretLocal: { x: number; y: number; h: number } | null = null;
    const colFor = (word: number, tt: number, active: boolean) => {
      if (casc > 0.05) return heatCss(0.5 + casc, 1);
      if (word === -2) return rgba('ash', 0.9);
      if (word === -1) return rgba('ash', 0.95);
      if (active) return heatCss(0.55 + 0.45 * Math.exp(-(t - tt) / 0.15), 1);
      return rgba('bone', 0.96);
    };
    const curWord = (() => { let k = -1; this.wordsL3.forEach((wd, wi) => { if (t >= wd.start - 0.02 && t < wd.end + 0.3) k = wi; }); return k; })();
    if (i === 0) {
      // bits: one column of 8 transistors per character, the character beneath
      const src = compiled ? Array.from(this.l0CharsB).map((ch) => ({ ch, t: 0, word: -2 })) : this.l0Chars;
      const pitch = compiled ? 40 : 46;
      const cs = compiled ? 16 : 23;
      src.forEach((cc, k) => {
        if (!compiled && t < cc.t) return;
        const code = cc.ch.charCodeAt(0);
        const X = x0 + 10 + k * pitch;
        const fresh = compiled ? 0 : Math.exp(-(t - cc.t) / 0.25);
        for (let b = 0; b < 8; b++) {
          const on = (code >> (7 - b)) & 1;
          const Y = yTop - 30 + b * (cs + 3);
          if (on) {
            c.fillStyle = casc > 0.05 ? heatCss(0.6 + casc, 1) : heatCss(0.5 + 0.5 * fresh, 0.95);
            c.fillRect(X, Y, cs, cs);
          } else {
            c.strokeStyle = rgba('graphite', 0.9); c.lineWidth = 1.2;
            c.strokeRect(X + 0.6, Y + 0.6, cs - 1.2, cs - 1.2);
          }
          // gate line (a transistor, schematically)
          c.fillStyle = rgba('ash', 0.35);
          c.fillRect(X - 3, Y + cs / 2 - 0.5, 3, 1);
        }
        c.font = font(mono, compiled ? 22 : 28);
        c.textAlign = 'center';
        c.fillStyle = cc.word >= 0 && cc.word === curWord ? heatCss(0.55 + 0.45 * fresh, 1) : rgba('bone', 0.95);
        if (casc > 0.05) c.fillStyle = heatCss(0.5 + casc, 1);
        c.font = font(mono, compiled ? 22 : 30);
        c.fillText(cc.ch === ' ' ? '·' : cc.ch, X + cs / 2, yTop - 30 + 8 * (cs + 3) + 32);
        if (!compiled && k === src.length - 1 || (!compiled && src[k + 1] && t < src[k + 1]!.t)) caretLocal = { x: X + pitch - 4, y: yTop - 30, h: 8 * (cs + 4) + 40 };
      });
    } else if (i === 1) {
      // hexdump, 16 bytes a row, with the ASCII gutter
      const src = compiled ? Array.from(this.l0CharsB).map((ch) => ({ ch, t: 0, word: -2 })) : this.l0Chars;
      c.font = font(mono, 28);
      c.textAlign = 'left';
      const adv = c.measureText('0').width;
      for (let row = 0; row < 2; row++) {
        const Y = yTop + 50 + row * 80;
        c.fillStyle = rgba('ash', 0.85);
        c.fillText((0x00401000 + row * 16).toString(16).padStart(8, '0'), x0, Y);
        for (let k = 0; k < 16; k++) {
          const idx = row * 16 + k;
          const cc = src[idx];
          const X = x0 + adv * (10 + k * 3 + (k >= 8 ? 1 : 0));
          const XA = x0 + adv * (10 + 16 * 3 + 2) + adv * k;
          if (!cc) { if (idx === src.length) { c.fillStyle = rgba('graphite', 0.9); c.fillText('00', X, Y); } continue; }
          if (!compiled && t < cc.t) continue;
          const active = cc.word >= 0 && cc.word === curWord;
          c.fillStyle = colFor(cc.word >= 0 ? cc.word : -3, cc.t, active);
          if (cc.word === -1 || cc.ch === ' ') c.fillStyle = casc > 0.05 ? heatCss(0.5 + casc, 1) : rgba('bone', 0.6);
          c.fillText(cc.ch.charCodeAt(0).toString(16).padStart(2, '0'), X, Y);
          c.fillText(cc.ch === ' ' ? '·' : cc.ch, XA, Y);
          if (!compiled && (idx === src.length - 1 || t < (src[idx + 1]?.t ?? 1e9))) caretLocal = { x: XA + adv + 2, y: Y - 26, h: 34 };
        }
        c.fillStyle = rgba('graphite', 1);
        c.fillText('|', x0 + adv * (10 + 16 * 3 + 1), Y); c.fillText('|', x0 + adv * (10 + 16 * 3 + 2 + 16), Y);
      }
    } else if (i >= 2 && i <= 4) {
      const ft = this.floorText[i]!;
      const size = i === 2 ? 34 : i === 3 ? 48 : 52;
      c.font = font(mono, size);
      c.textAlign = 'left';
      const adv = c.measureText('0').width;
      const lh = i === 2 ? size * 1.4 : size * 1.55;
      if (compiled) {
        ft.b.forEach((s, li) => {
          c.fillStyle = casc > 0.05 ? heatCss(0.5 + casc, 1) : (s.startsWith(';') || s.startsWith('#') ? rgba('ash', 0.9) : rgba('bone', 0.96));
          c.fillText(s, x0, yTop + 14 + li * lh);
        });
      } else {
        ft.a.forEach((row, li) => {
          const Y = yTop + 14 + li * lh;
          let lastX = -1;
          for (const ch of row) {
            if (t < ch.t) break;
            const active = ch.word >= 0 && ch.word === curWord;
            c.fillStyle = colFor(ch.word, ch.t, active);
            c.fillText(ch.ch, x0 + ch.x * adv, Y);
            lastX = ch.x;
          }
          if (lastX >= 0 && row.some((ch) => ch.word >= 0) && (row[lastX + 1] ? t < row[lastX + 1]!.t : true) && t < this.wordsL3[this.wordsL3.length - 1]!.end + 0.3) {
            // caret on the line that is being typed
            if (row.some((ch) => ch.word >= 0 && t >= ch.t)) caretLocal = { x: x0 + (lastX + 1) * adv + 3, y: Y - size * 0.82, h: size * 1.05 };
          }
        });
      }
    } else {
      // ENGLISH: the sentence typed in Archivo, "words" held (stretched), two lines
      const ws = this.wordsL4;
      const lines = [ws.slice(0, 3), ws.slice(3)];
      const size = 132;
      c.textAlign = 'left';
      let caret: { x: number; y: number; h: number } | null = null;
      lines.forEach((lw, li) => {
        let x = x0 + 20;
        const Y = yTop + 110 + li * 150;
        for (const wd of lw) {
          if (t < wd.start - 0.02) break;
          const pr = Lyrics.wordProgress(wd, t);
          const held = wd.end - wd.start > 0.9;
          const wdt = held ? lerp(62, 125, ease.inOutQuad(pr)) : 100;
          const fam = F.archivo(wdt, 800);
          const avail = [62, 75, 87.5, 100, 112.5, 125];
          const near = avail.reduce((a, b) => (Math.abs(b - wdt) < Math.abs(a - wdt) ? b : a));
          const sx = held ? wdt / near : 1;
          const lay = layout(wd.w, fam, size);
          const n = lay.glyphs.length;
          const typed = held ? n : Math.ceil(pr * n - 1e-6);
          const active = t < wd.end + 0.25;
          c.save();
          c.translate(x, Y); c.scale(sx, 1);
          c.font = font(fam, size);
          for (let k = 0; k < Math.max(1, typed) && k < n; k++) {
            const g = lay.glyphs[k]!;
            const kt = lerp(wd.start, wd.end, k / n);
            let col = active ? heatCss(0.55 + 0.45 * Math.exp(-(t - kt) / 0.12), 1) : rgba('bone', 0.97);
            if (held && active) col = heatCss(0.5 + 0.2 * Math.sin(pr * 12), 1);
            if (casc > 0.05) col = heatCss(0.55 + casc * 0.5, 1);
            c.fillStyle = col;
            c.fillText(g.ch, g.x, 0);
          }
          c.restore();
          const drawnW = (typed >= n ? lay.width : (lay.glyphs[Math.min(typed, n - 1)]?.x ?? 0)) * sx;
          if (active && t < this.tWrite + 0.3) caret = { x: x + drawnW + 10, y: Y - size * 0.78, h: size * 0.95 };
          x += lay.width * sx + size * 0.26;
        }
      });
      if (caret) caretLocal = caret;
      // before the sentence: a prompt line
      if (t < this.L4.start) {
        c.font = font(F.mono(400), 30); c.textAlign = 'left';
        c.fillStyle = rgba('ash', 0.85);
        c.fillText('> _', x0 + 20, yTop + 70);
        caretLocal = { x: x0 + 20 + 40, y: yTop + 44, h: 34 };
      }
    }
    if (!caretLocal) return null;
    const cl: { x: number; y: number; h: number } = caretLocal;
    // local → screen
    const m = c.getTransform();
    const sx = m.a * cl.x + m.c * cl.y + m.e, sy = m.b * cl.x + m.d * cl.y + m.f;
    const hy = Math.hypot(m.c, m.d) * cl.h;
    void w; void h;
    return { x: sx, y: sy, h: hy };
  }
}
