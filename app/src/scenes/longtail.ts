// LONGTAIL — "Finally worth building for" (instrumental 1, 6 bars). A6.
// The long tail as a landscape at dusk: 10,000 structures along a curving road, heights following the
// demand curve h(i) ∝ 1/(1+ik)^a, so the skyline IS the long-tail distribution (a few tall "head"
// towers, then thousands of tiny huts to the horizon). One sub-cut per bar:
//   bar 1  DEMAND (hook1's slam, as blocks) peels off letter by letter; the blocks stream along the road
//          and land as the first lit structures; the camera chases the stream.
//   bar 2  low chase down the aisle, banking; on every beat the gold front snaps further down the tail.
//          Callout `market size: too small (1999)`.
//   bar 3  top-down over the lots (a plan drawing); the callout is struck out → `worth it (2026)`.
//   bar 4  crane-up from the head towers to the whole tail; the cursor draws the demand curve over it.
//   bar 5  four whip-panned shots, one per beat (rank 1 … rank 10,000).
//   bar 6  the camera pulls straight up; the lights compress into a regular 40×23 grid of dots
//          (the nodes of a network) → internals.
import * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { FSPass, Layer2D, W, H } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { rgba } from '../engine/palette';
import { F, font } from '../engine/type';
import { GLSL_COMMON } from '../engine/glsl/common';
import { clamp, ease, hash, lerp, prog, keys, noise1 } from '../engine/util';
import { cursorTip, weldSparks } from './_motifs';
import { aim, project, rasterWord, boxGeometry, msaaRT, VS_HEAD, GLSL_ROT, lin, type V3 } from './longtail-kit';

// ------------------------------------------------------------------ the world
const RA = 60, RL = 300; // road: z = RA sin(s / RL)
const road = (s: number): V3 => [s, 0, RA * Math.sin(s / RL)];
const tangent = (s: number): V3 => { const dz = (RA / RL) * Math.cos(s / RL); const l = Math.hypot(1, dz); return [1 / l, 0, dz / l]; };
const side = (s: number): V3 => { const T = tangent(s); return [-T[2], 0, T[0]]; };
const add = (a: V3, b: V3, k = 1): V3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const at = (s: number, lat: number, y: number): V3 => add(add(road(s), side(s), lat), [0, y, 0]);

const N = 10000; // structures (6 head towers + 9,994 tail)
const N_HEAD = 6;
const S_TAIL0 = 74, DS = 2.4, DL = 2.4, AISLE = 1.5;
const S_MAX = 1300;
const heightOf = (rank: number) => Math.max(0.55, 62 / Math.pow(1 + rank * 0.35, 0.8));
const WORD_S = -45, WORD_Y0 = 3, BLOCK = 0.9;
const FOV = 40;
const LAT_COLS = 40, LAT_ROWS = 23, LAT_PX = 48; // the closing grid of dots

const GROUND_FRAG = /* glsl */ `
in vec3 vW; out vec4 fragColor;
uniform vec3 cameraPosition; uniform float fogK, env; uniform vec3 hz;
void main() {
  float d = length(vW - cameraPosition);
  vec3 col = C_INK * 0.55;
  // survey grid: 50-unit squares, hairlines fading with distance
  vec2 g = vW.xz / 50.0;
  vec2 fw = fwidth(g);
  vec2 q = abs(fract(g) - 0.5) / max(fw, vec2(1e-5));
  float ln = max(pxLine(0.5 / max(fw.x, 1e-5) - q.x, 0.0, 1.2), pxLine(0.5 / max(fw.y, 1e-5) - q.y, 0.0, 1.2));
  ln *= 1.0 - smoothstep(0.05, 0.5, max(fw.x, fw.y));
  col += C_GRAPHITE * 0.22 * ln;
  float f = 1.0 - exp(-d * fogK);
  fragColor = vec4(mix(col, hz, f) * env, 1.0);
}`;

const STRUCT_VERT = /* glsl */ `${VS_HEAD}
in vec4 iLot; in vec4 iSize; in vec4 iWord; in vec4 iMisc;
uniform float time, litS, blockSize;
out vec3 vN; out vec3 vW; out vec2 vF; out vec2 vD; out float vLit; out float vHeat; out float vHead; out float vFront; out float vTop; out float vKind; out float vSeed;
${GLSL_ROT}
vec3 road(float s) { return vec3(s, 0.0, ${RA.toFixed(1)} * sin(s / ${RL.toFixed(1)})); }
float h1(float x) { return fract(sin(x * 127.1) * 43758.5453); }
float outBack(float x) { float c1 = 2.2, c3 = c1 + 1.0; return 1.0 + c3 * pow(x - 1.0, 3.0) + c1 * pow(x - 1.0, 2.0); }
void main() {
  vec3 size = iSize.xyz;
  vec3 base = vec3(iLot.x, 0.0, iLot.y);
  mat3 R = yawRot(iLot.z);
  float lit = step(iLot.w + iSize.w, litS);
  float heat = 0.0, kind = 0.0;
  vec3 wp; vec3 nrm;
  if (iWord.w > -0.5) {
    float b = blockSize;
    float u = (time - iWord.w) / iMisc.z;
    if (u < 1.0) {
      float e = clamp(u, 0.0, 1.0);
      e = e * e * (3.0 - 2.0 * e);
      vec3 P0 = iWord.xyz;
      vec3 P2 = base + vec3(0.0, b * 0.5, 0.0);
      float sm = mix(P0.x, iLot.w, 0.55);
      vec3 P1 = road(sm) + vec3(0.0, 11.0 + 0.05 * abs(iLot.w - P0.x), 0.0);
      P1.z = mix(P1.z, 0.5 * (P0.z + P2.z), 0.25);
      vec3 c = mix(mix(P0, P1, e), mix(P1, P2, e), e);
      vec3 ax = normalize(vec3(h1(iMisc.x) - 0.5, h1(iMisc.x + 3.1) - 0.5, h1(iMisc.x + 7.7) - 0.5) + 1e-3);
      mat3 T = axisRot(ax, e * (4.0 + 9.0 * h1(iMisc.x + 1.3)));
      wp = c + T * ((position - vec3(0.0, 0.5, 0.0)) * b);
      nrm = T * normal;
      kind = u > 0.0 ? 2.0 : 1.0;
      heat = u > 0.0 ? 1.0 : 0.0;
      lit = 0.0;
      size = vec3(b);
    } else {
      float g = clamp((time - iWord.w - iMisc.z) / 0.32, 0.0, 1.0);
      vec3 s3 = mix(vec3(b), size, outBack(g));
      wp = base + R * (position * s3);
      nrm = R * normal;
      size = s3;
      lit = 1.0; heat = 1.0 - g; kind = 3.0;
    }
  } else {
    wp = base + R * (position * size);
    nrm = R * normal;
  }
  vec3 q = (position - vec3(0.0, 0.5, 0.0)) * size;
  if (abs(normal.x) > 0.5) { vF = q.zy; vD = size.zy; }
  else if (abs(normal.y) > 0.5) { vF = q.xz; vD = size.xz; }
  else { vF = q.xy; vD = size.xy; }
  vTop = normal.y;
  vN = nrm; vW = wp; vLit = lit; vHeat = heat; vHead = iMisc.y; vKind = kind; vSeed = iMisc.x;
  vFront = lit * exp(-max(litS - iLot.w - iSize.w, 0.0) / 22.0) * step(iWord.w, -0.5);
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}`;

const STRUCT_FRAG = /* glsl */ `
in vec3 vN; in vec3 vW; in vec2 vF; in vec2 vD; in float vLit; in float vHeat; in float vHead; in float vFront; in float vTop; in float vKind; in float vSeed;
out vec4 fragColor;
uniform vec3 cameraPosition; uniform vec3 sunDir; uniform vec3 hz; uniform float fogK, env, beat, wordA;
void main() {
  vec3 n = normalize(vN);
  float d = length(vW - cameraPosition);
  vec2 e2 = vD * 0.5 - abs(vF);
  float ed = min(e2.x, e2.y);
  float edge = pxLine(ed / max(fwidth(ed), 1e-5), 0.4, 1.4);
  float lam = max(dot(n, sunDir), 0.0);
  vec3 col;
  if (vKind > 0.5 && vKind < 1.5) {
    // the word (hook1's DEMAND, as blocks): bone, extruded, each block outlined in ink
    vec3 L = normalize(vec3(-0.5, 0.7, -0.6));
    float k = 0.42 + 0.58 * max(dot(n, L), 0.0);
    col = C_BONE * k * 0.95;
    col = mix(col, C_INK, edge * 0.55);
    fragColor = vec4(col * wordA, 1.0);
    return;
  }
  if (vKind > 1.5 && vKind < 2.5) {
    // in flight: molten gold, white-hot edges
    float k = 0.55 + 0.45 * abs(n.y);
    col = C_SIGNAL * 0.62 * k + C_BLOOD * 0.25 + C_EMBER * 1.5 * edge;
    fragColor = vec4(col, 1.0);
    return;
  }
  // landscape
  vec3 baseC = mix(C_INK * 1.1, C_INK2 * 1.5, 0.3 + 0.7 * max(n.y, 0.0));
  baseC += C_BLOOD * 0.06 * lam;
  float f = 1.0 - exp(-d * fogK);
  vec3 emis = vec3(0.0);
  vec3 gold = C_SIGNAL * (0.78 + 0.3 * beat) + C_EMBER * vFront * 1.0;
  float lit = vLit;
  if (abs(vTop) < 0.5) {
    // windows: a grid of cells fitted to the face
    float nc = max(1.0, floor(vD.x / 0.42)), nr = max(1.0, floor(vD.y / 0.4));
    vec2 g = (vF + vD * 0.5) / (vD / vec2(nc, nr));
    vec2 fr = fract(g), id = floor(g);
    vec2 fw = fwidth(g);
    vec2 a0 = vec2(0.26, 0.24), a1 = vec2(0.74, 0.72);
    vec2 wx = smoothstep(a0 - fw, a0 + fw, fr) * (1.0 - smoothstep(a1 - fw, a1 + fw, fr));
    float win = wx.x * wx.y;
    win = mix(win, 0.22, smoothstep(0.1, 0.4, max(fw.x, fw.y)));
    float on = step(0.32, fract(sin(dot(id, vec2(12.9898, 78.233)) + vSeed * 17.0) * 43758.5453));
    if (vHead > 0.5) {
      // the head: dark glass slabs, floor lines and mullions (engraved), a few lit floors
      vec2 hg = (vF + vD * 0.5) / vec2(1.5, 1.6);
      vec2 hf = abs(fract(hg) - 0.5) / max(fwidth(hg), vec2(1e-4));
      float grid = max(pxLine(hf.y * 0.0 + (0.5 / max(fwidth(hg.y), 1e-4) - hf.y), 0.0, 1.0), 0.45 * pxLine(0.5 / max(fwidth(hg.x), 1e-4) - hf.x, 0.0, 1.0));
      grid *= 1.0 - smoothstep(0.2, 0.6, max(fwidth(hg.x), fwidth(hg.y)));
      float floorOn = step(0.86, fract(sin(floor(hg.y) * 91.7 + vSeed) * 43758.5453));
      emis = C_BONE * (0.1 * grid + 0.1 * floorOn * (1.0 - grid));
      baseC = mix(baseC, C_INK2 * 1.3, 0.5) + C_GRAPHITE * 0.05 * (1.0 - abs(n.x));
    } else {
      emis = gold * win * on * lit;
      baseC += C_GRAPHITE * 0.05 * win * (1.0 - lit);
    }
  } else if (vTop > 0.5) {
    // roofs: a skylight on every lit hut (reads from above)
    vec2 r = abs(vF) / (vD * 0.5);
    float m = max(r.x, r.y);
    float sky = 1.0 - smoothstep(0.34 - fwidth(m), 0.34 + fwidth(m), m);
    emis = gold * 0.85 * sky * lit * (1.0 - vHead);
  }
  vec3 edgeC = vHead > 0.5 ? C_BONE * 0.5 : mix(C_GRAPHITE * 0.45, C_SIGNAL * 0.9 + C_EMBER * vFront, lit);
  vec3 c = baseC + edgeC * edge;
  c += vHeat * (C_SIGNAL * 0.55 + C_EMBER * edge);
  c = mix(c, hz, f);
  c += emis * (1.0 - 0.75 * f);
  fragColor = vec4(c * env, 1.0);
}`;

const PAD_VERT = /* glsl */ `${VS_HEAD}
in vec4 iLot; in vec4 iSize; in vec4 iWord; in vec4 iMisc;
uniform float time, litS;
out vec2 vUv; out vec2 vDim; out float vLit; out float vFront; out vec3 vW;
${GLSL_ROT}
void main() {
  vec2 dim = iSize.xz + vec2(0.9);
  float lit = step(iLot.w + iSize.w, litS);
  if (iWord.w > -0.5) lit = step(iWord.w + iMisc.z, time);
  vec3 p = vec3(position.x * dim.x, 0.02, position.y * dim.y);
  vec3 wp = vec3(iLot.x, 0.0, iLot.y) + yawRot(iLot.z) * p;
  vUv = position.xy; vDim = dim; vLit = lit; vW = wp;
  vFront = lit * exp(-max(litS - iLot.w - iSize.w, 0.0) / 22.0) * step(iWord.w, -0.5);
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}`;
const PAD_FRAG = /* glsl */ `
in vec2 vUv; in vec2 vDim; in float vLit; in float vFront; in vec3 vW; out vec4 fragColor;
uniform vec3 cameraPosition; uniform float fogK, env;
void main() {
  vec2 q = (0.5 - abs(vUv)) * vDim;
  float ed = min(q.x, q.y);
  float ln = pxLine(ed / max(fwidth(ed), 1e-5), 0.3, 1.2);
  float r = length(vUv * 2.0);
  float glow = exp(-r * r * 2.2);
  float f = exp(-length(vW - cameraPosition) * fogK * 0.8);
  vec3 c = mix(C_GRAPHITE * 0.16, C_SIGNAL * 0.55, vLit) * ln + C_SIGNAL * (0.2 + 0.5 * vFront) * glow * vLit;
  fragColor = vec4(c * f * env, 1.0);
}`;

const SKY = /* glsl */ `
uniform mat4 invVP; uniform vec3 camPos; uniform vec3 sunDir; uniform vec3 hz; uniform float env;
void main() {
  vec4 w = invVP * vec4(vUv * 2.0 - 1.0, 1.0, 1.0);
  vec3 d = normalize(w.xyz / w.w - camPos);
  float el = d.y;
  vec3 col = mix(hz, C_INK * 0.5, smoothstep(0.0, 0.32, el));
  vec2 sd2 = normalize(d.xz + 1e-5);
  float sd = max(dot(sd2, normalize(sunDir.xz)), 0.0);
  col += C_BLOOD * 0.14 * exp(-abs(el) * 26.0) * pow(sd, 5.0);
  col += C_SIGNAL * 0.22 * exp(-abs(el - 0.004) * 300.0) * pow(sd, 30.0);
  fragColor = vec4(col * env, 1.0);
}`;

interface Lot { x: number; z: number; yaw: number; s: number; lat: number; w: number; h: number; d: number; jit: number; rank: number }

export default class Longtail extends Scene {
  private cam = new THREE.PerspectiveCamera(FOV, W / H, 0.4, 7000);
  private rt3 = msaaRT();
  private world = new THREE.Scene();
  private sky = new FSPass(SKY, { invVP: { value: new THREE.Matrix4() }, camPos: { value: new THREE.Vector3() }, sunDir: { value: new THREE.Vector3() }, hz: { value: new THREE.Vector3() }, env: { value: 1 } });
  private structMat!: THREE.RawShaderMaterial;
  private padMat!: THREE.RawShaderMaterial;
  private groundMat!: THREE.RawShaderMaterial;
  private lines3 = new LineBatch(60000, { screen2D: false, depthTest: true });
  private over3 = new LineBatch(30000, { screen2D: false });
  private fx = new LineBatch(6000);
  private ui = new Layer2D();
  private lots: Lot[] = [];
  private sSorted = new Float32Array(0);
  private word: { idx: number; launch: number; dur: number; pos: V3 }[] = [];
  private wordLand: number[] = [];
  private landT = new Float32Array(N).fill(Infinity);
  private lattice: { x: number; z: number }[] = [];
  private curve: V3[] = [];
  private beats: number[] = [];
  private bars: number[] = [];
  private frontK: number[] = [];
  private tipLot = 0;
  private sW = 390;
  private near: (s: number) => number = () => 0;
  private calloutLots: number[] = [];
  private lead = { launch: 0, dur: 2, pos: [0, 0, 0] as V3, lot: 0 };
  private latCenter: V3 = [0, 0, 0];
  private latH = 1000;
  private latG = 30;

  override init() {
    const { audio: au, start, end } = this.ctx;
    this.beats = []; for (let i = Math.ceil(au.beatAt(start) - 1e-3); au.timeOfBeat(i) < end - 1e-3; i++) this.beats.push(au.timeOfBeat(i));
    this.bars = au.downbeats.filter((d) => d >= start - 0.05 && d < end - 0.05);
    if (this.bars.length < 6) { const bp = (end - start) / 6; this.bars = Array.from({ length: 6 }, (_, i) => start + i * bp); }
    this.buildLots();
    this.buildWord();
    this.buildLattice();
    this.buildMeshes();
    // the gold front: snaps further down the tail on every beat from bar 2 on (18 beats)
    const b1 = this.bars[1]!;
    const fb = this.beats.filter((b) => b >= b1 - 0.02).slice(0, 18);
    this.frontK = fb;
    this.sW = Math.max(...this.word.map((w) => this.lots[w.idx]!.s)) + 4;
    // the B2 callout sits under the camera when it is struck out (3rd beat of bar 3)
    const b2 = this.bars[2]!, b3 = this.bars[3]!;
    const tS = this.beats.filter((b) => b >= b2 - 0.02)[2] ?? b2 + 0.97;
    const sCam = lerp(this.frontAt(4) + 10, this.frontAt(4) + 85, ease.inOutQuad(clamp((tS - b2) / (b3 - b2))));
    this.calloutLots = [this.near(this.sW + 95), this.near(sCam + 6)];
  }

  // ---------------------------------------------------------------- construction
  private buildLots() {
    const lots: Lot[] = [];
    // the head: six tall towers flanking the road (the needs that were always served)
    for (let i = 0; i < N_HEAD; i++) {
      const s = 6 + i * 11, lat = (i % 2 ? 1 : -1) * (9 + (i % 3) * 1.5);
      const p = at(s, lat, 0), T = tangent(s);
      const fp = 7.5 - i * 0.5;
      lots.push({ x: p[0], z: p[2], yaw: Math.atan2(-T[2], T[0]), s, lat, w: fp, h: heightOf(i), d: fp * 0.8, jit: 0, rank: i });
    }
    let rank = N_HEAD;
    for (let r = 0; rank < N; r++) {
      const n = 4 + Math.floor(r * 0.07);
      const sRow = S_TAIL0 + r * DS;
      for (let k = 0; k < n && rank < N; k++) {
        const sideSign = k % 2 ? 1 : -1, j = Math.floor(k / 2);
        const s = sRow + (hash(rank, 1) - 0.5) * 0.5;
        const lat = sideSign * (AISLE + 0.6 + j * DL + (hash(rank, 2) - 0.5) * 0.5);
        const p = at(s, lat, 0), T = tangent(s);
        const h0 = heightOf(rank);
        const niche = hash(rank, 5) < 0.025 ? 1.8 + hash(rank, 6) * 2.2 : 1; // the odd taller niche
        const w = 0.85 + hash(rank, 3) * 0.75, d = 0.85 + hash(rank, 4) * 0.75;
        lots.push({ x: p[0], z: p[2], yaw: Math.atan2(-T[2], T[0]) + (hash(rank, 7) - 0.5) * 0.12, s, lat, w, h: h0 * (0.75 + 0.5 * hash(rank, 8)) * niche, d, jit: hash(rank, 9) * 14, rank });
        rank++;
      }
    }
    this.lots = lots;
    this.sSorted = Float32Array.from(lots.slice(N_HEAD).map((l) => l.s + l.jit)).sort();
    // the demand curve over the rooftops: tallest structure per ~row
    const pts: V3[] = [];
    for (let i = 0; i < N_HEAD; i++) { const l = lots[i]!; pts.push(at(l.s, 0, l.h)); }
    let s0 = S_TAIL0, hmax = 0;
    for (let i = N_HEAD; i < N; i++) {
      const l = lots[i]!;
      if (l.s - s0 > 9) { pts.push(at(s0 + 4.5, 0, hmax + 0.15)); s0 = l.s; hmax = 0; }
      hmax = Math.max(hmax, heightOf(l.rank));
    }
    this.curve = pts;
    // callout lots (near the aisle)
    const near = (s: number) => { let best = N_HEAD; for (let i = N_HEAD; i < N; i++) if (Math.abs(lots[i]!.s - s) + Math.abs(Math.abs(lots[i]!.lat) - 3) * 0.3 < Math.abs(lots[best]!.s - s) + Math.abs(Math.abs(lots[best]!.lat) - 3) * 0.3) best = i; return best; };
    this.near = near;
  }

  private buildWord() {
    const ras = rasterWord('DEMAND', F.archivo(100, 900), 200, 8, 2);
    const cells = ras.cells.slice().sort((a, b) => a.x - b.x || a.y - b.y);
    const zc = road(WORD_S)[2];
    const start = this.ctx.start;
    this.word = cells.map((c, j) => {
      const idx = N_HEAD + j;
      const xn = c.x / ras.cols;
      const launch = start + 0.03 + xn * 0.42 + hash(j, 11) * 0.08;
      const lot = this.lots[idx]!;
      const dur = 0.65 + 0.85 * clamp((lot.s - S_TAIL0) / 330);
      const pos: V3 = [WORD_S, WORD_Y0 + (c.y + 0.5) * BLOCK, zc + (c.x - ras.cols / 2) * BLOCK];
      return { idx, launch, dur, pos };
    });
    this.wordLand = this.word.map((w) => w.launch + w.dur).sort((a, b) => a - b);
    for (const w of this.word) this.landT[w.idx] = w.launch + w.dur;
    // the stream's leader (carries the cursor tip): first off the word, to the farthest block's lot
    const far = this.word.reduce((a, b) => (this.lots[b.idx]!.s > this.lots[a.idx]!.s ? b : a));
    this.lead = { launch: start + 0.03, dur: far.dur + 0.35, pos: this.word[0]!.pos, lot: far.idx };
  }

  /** The closing grid: 40×23 nodes that exactly fill the final top-down frame (48 px pitch). */
  private buildLattice() {
    const cx = 640;
    const c = road(cx);
    this.latCenter = [cx, 0, c[2]];
    this.latH = 1150;
    const vis = 2 * this.latH * Math.tan((FOV * Math.PI) / 360); // world height of the frame
    this.latG = (vis * LAT_PX) / H;
    // columns by equal counts along the road, rows by equal counts across it
    const order = this.lots.map((l, i) => i).sort((a, b) => this.lots[a]!.s - this.lots[b]!.s);
    const per = Math.ceil(N / LAT_COLS);
    const out: { x: number; z: number }[] = new Array(N);
    for (let col = 0; col < LAT_COLS; col++) {
      const ids = order.slice(col * per, (col + 1) * per).sort((a, b) => this.lots[a]!.lat - this.lots[b]!.lat);
      ids.forEach((id, k) => {
        const row = Math.min(LAT_ROWS - 1, Math.floor((k * LAT_ROWS) / ids.length));
        out[id] = { x: this.latCenter[0] + (col - (LAT_COLS - 1) / 2) * this.latG, z: this.latCenter[2] + (row - (LAT_ROWS - 1) / 2) * this.latG };
      });
    }
    this.lattice = out;
  }

  private buildMeshes() {
    const lotA = new Float32Array(N * 4), sizeA = new Float32Array(N * 4), wordA = new Float32Array(N * 4), miscA = new Float32Array(N * 4);
    this.lots.forEach((l, i) => {
      lotA.set([l.x, l.z, l.yaw, l.s], i * 4);
      sizeA.set([l.w, l.h, l.d, l.jit], i * 4);
      wordA.set([0, 0, 0, -1], i * 4);
      miscA.set([hash(i, 21) * 100, i < N_HEAD ? 1 : 0, 1, 0], i * 4);
    });
    for (const w of this.word) { wordA.set([...w.pos, w.launch], w.idx * 4); miscA[w.idx * 4 + 2] = w.dur; }
    const attrs = () => ({
      iLot: new THREE.InstancedBufferAttribute(lotA, 4), iSize: new THREE.InstancedBufferAttribute(sizeA, 4),
      iWord: new THREE.InstancedBufferAttribute(wordA, 4), iMisc: new THREE.InstancedBufferAttribute(miscA, 4),
    });
    const common = {
      time: { value: 0 }, litS: { value: 0 }, blockSize: { value: BLOCK }, sunDir: { value: new THREE.Vector3(1, 0.07, 0.3).normalize() },
      hz: { value: new THREE.Vector3() }, fogK: { value: 0.0016 }, env: { value: 1 }, beat: { value: 0 }, wordA: { value: 1 },
    };
    const mk = (vs: string, fs: string, o: Partial<THREE.ShaderMaterialParameters> = {}) => new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: vs,
      fragmentShader: `precision highp float;\n${GLSL_COMMON}\n${fs}`, uniforms: common, ...o,
    });
    // ground
    const gg = new THREE.PlaneGeometry(9000, 9000).rotateX(-Math.PI / 2).translate(600, 0, 0);
    this.groundMat = mk(`${VS_HEAD}out vec3 vW; void main(){ vW = (modelMatrix * vec4(position,1.0)).xyz; gl_Position = projectionMatrix * viewMatrix * vec4(vW,1.0); }`, GROUND_FRAG, { depthWrite: false });
    const ground = new THREE.Mesh(gg, this.groundMat); ground.frustumCulled = false; ground.renderOrder = 0;
    // structures
    const sg = new THREE.InstancedBufferGeometry();
    const box = boxGeometry();
    sg.index = box.index; sg.setAttribute('position', box.getAttribute('position')); sg.setAttribute('normal', box.getAttribute('normal'));
    for (const [k, v] of Object.entries(attrs())) sg.setAttribute(k, v);
    sg.instanceCount = N;
    this.structMat = mk(STRUCT_VERT, STRUCT_FRAG);
    const structs = new THREE.Mesh(sg, this.structMat); structs.frustumCulled = false; structs.renderOrder = 1;
    // lot pads (additive)
    const pg = new THREE.InstancedBufferGeometry();
    const quad = new THREE.PlaneGeometry(1, 1);
    pg.index = quad.index; pg.setAttribute('position', quad.getAttribute('position')); pg.setAttribute('normal', quad.getAttribute('normal'));
    for (const [k, v] of Object.entries(attrs())) pg.setAttribute(k, v);
    pg.instanceCount = N;
    this.padMat = mk(PAD_VERT, PAD_FRAG, { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const pads = new THREE.Mesh(pg, this.padMat); pads.frustumCulled = false; pads.renderOrder = 2;
    this.world.add(ground, structs, pads);
  }

  // ---------------------------------------------------------------- time helpers
  /** Front position along the road (s): snaps on each beat from bar 2 (outExpo), reaching the end. */
  private litS(t: number) {
    const fb = this.frontK;
    let s = 0;
    const n = fb.length;
    for (let k = 0; k < n; k++) {
      if (t < fb[k]!) break;
      const s0 = this.frontAt(k), s1 = this.frontAt(k + 1);
      s = lerp(s0, s1, ease.outExpo(clamp((t - fb[k]!) / 0.38)));
    }
    return s;
  }
  /** Front position after k beats of waves. */
  private frontAt(k: number) { return this.sW + (S_MAX + 20 - this.sW) * Math.pow(k / this.frontK.length, 1.2); }
  private served(t: number, litS: number) {
    // binary search: tail structures whose s + jitter is behind the front
    let lo = 0, hi = this.sSorted.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (this.sSorted[m]! < litS) lo = m + 1; else hi = m; }
    let landed = 0;
    for (const x of this.wordLand) if (x <= t) landed++; else break;
    return N_HEAD + Math.max(lo, landed);
  }
  /** Top-down shot (bar 3): the camera rides just ahead of the gold front. */
  private sB2(t: number) {
    const b0 = this.bars[2]!, b1 = this.bars[3]!;
    return lerp(this.frontAt(4) + 15, this.frontAt(8) + 5, ease.inOutQuad(clamp((t - b0) / (b1 - b0))));
  }
  private barIdx(t: number) { let b = 0; for (let i = 0; i < this.bars.length; i++) if (t >= this.bars[i]! - 1e-4) b = i; return b; }
  private leadPos(t: number): V3 | null {
    const L = this.lead;
    const u = (t - L.launch) / L.dur;
    if (u < 0 || u > 1) return null;
    const e = u * u * (3 - 2 * u);
    const P0 = L.pos, lot = this.lots[L.lot]!;
    const P2: V3 = [lot.x, BLOCK * 0.5, lot.z];
    const sm = lerp(P0[0], lot.s, 0.55);
    const P1 = add(road(sm), [0, 11 + 0.05 * Math.abs(lot.s - P0[0]), 0]);
    P1[2] = lerp(P1[2], 0.5 * (P0[2] + P2[2]), 0.25);
    const m = (a: V3, b: V3, k: number): V3 => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
    return m(m(P0, P1, e), m(P1, P2, e), e);
  }

  // ---------------------------------------------------------------- camera
  private camera(t: number): { pos: V3; tgt: V3; roll: number; fov: number; up?: V3 } {
    const B = this.bars, bi = this.barIdx(t);
    const lt = t - B[bi]!;
    const b0 = B[bi]!, b1 = B[bi + 1] ?? this.ctx.end;
    const bp = clamp((t - b0) / (b1 - b0));
    const shake = (a: number) => noise1(t * 7.3, 11) * a;
    if (bi === 0) {
      // hook1's DEMAND, framed as it slammed; then the chase along the stream
      const zc = road(WORD_S)[2], wy = WORD_Y0 + 8.2;
      const k = ease.inOutQuad(prog(t, b0 + 0.3, b1));
      const s = keys(t, [[b0, -146], [b0 + 0.3, -140, ease.outQuad], [b1, 215, ease.inOutQuad]]);
      const y = keys(t, [[b0 + 0.3, wy], [b0 + 1.0, 24, ease.inOutCubic], [b1, 21, ease.inOutQuad]]);
      const look = keys(t, [[b0 + 0.3, 100], [b1, 60, ease.inOutQuad]]);
      const ty = keys(t, [[b0 + 0.3, wy], [b1, 1.5, ease.inOutQuad]]);
      const roll = keys(t, [[b0 + 0.45, 0], [b0 + 1.2, -0.14, ease.inOutCubic], [b1, 0.06, ease.inOutCubic]]) + shake(0.004);
      const p = at(s, -4 * k, y), q = at(s + look, 0, ty);
      const m = 1 - prog(t, b0 + 0.3, b0 + 0.9, ease.inOutQuad); // hold the word's centre line at first
      p[2] = lerp(p[2], zc, m); q[2] = lerp(q[2], zc, m);
      return { pos: p, tgt: q, roll, fov: FOV };
    }
    if (bi === 1) {
      // low chase down the aisle, banking
      const s = lerp(this.sW - 60, this.frontAt(4) - 20, bp);
      const y = 2.35 + 0.18 * Math.sin(lt * 6.1);
      const lat = 0.45 * Math.sin(lt * 2.4);
      const roll = 0.2 * Math.sin(lt * 2.3 + 0.6) - 0.05 + shake(0.01);
      return { pos: at(s, lat, y), tgt: at(s + 30, lat * 0.5, 0.9), roll, fov: 56 };
    }
    if (bi === 2) {
      // top-down over the lots, racing; slow yaw
      const s = this.sB2(t);
      const yaw = lerp(-0.35, 0.3, ease.inOutCubic(bp));
      const T = tangent(s), S = side(s);
      const up: V3 = [T[0] * Math.cos(yaw) + S[0] * Math.sin(yaw), 0, T[2] * Math.cos(yaw) + S[2] * Math.sin(yaw)];
      const hgt = lerp(60, 46, ease.inOutQuad(bp));
      return { pos: at(s - 6, 0, hgt), tgt: at(s + 4, 0, 0), roll: 0, fov: FOV, up };
    }
    if (bi === 3) {
      // crane-up from beside the head towers to the whole tail
      const k = ease.inOutCubic(prog(t, b0 + 0.08, b1 - 0.05));
      const pos0 = at(-34, 34, 2.5), pos1 = at(-150, 165, 112);
      const tg0 = at(80, 4, 16), tg1 = at(430, -12, -4);
      const pos: V3 = [lerp(pos0[0], pos1[0], k), lerp(pos0[1], pos1[1], Math.pow(k, 1.3)), lerp(pos0[2], pos1[2], k)];
      const tgt: V3 = [lerp(tg0[0], tg1[0], k), lerp(tg0[1], tg1[1], k), lerp(tg0[2], tg1[2], k)];
      return { pos, tgt, roll: lerp(-0.08, 0.02, k) + shake(0.003), fov: lerp(46, 36, k) };
    }
    if (bi === 4) {
      // four whip-panned shots, one per beat
      const bs = this.beats.filter((b) => b >= b0 - 0.02 && b < b1 - 0.02);
      let j = 0; for (let i = 0; i < bs.length; i++) if (t >= bs[i]!) j = i;
      const s0 = bs[j]!, s1 = bs[j + 1] ?? b1;
      const u = clamp((t - s0) / (s1 - s0));
      const whipIn = -0.5 * Math.pow(1 - ease.outExpo(clamp((t - s0) / 0.16)), 1);
      const whipOut = 0.5 * ease.inExpo(clamp((t - (s1 - 0.1)) / 0.1));
      const whip = (j === 0 ? whipIn * 0.4 : whipIn) + (j === bs.length - 1 ? 0 : whipOut);
      let pos: V3, tgt: V3, roll = 0, fov = FOV;
      if (j === 0) { // high in the tail, looking back at the head towers
        pos = at(lerp(760, 730, u), 18, 46); tgt = at(20, 0, 22); fov = 34; roll = 0.04;
      } else if (j === 1) { // grazing across the roofs, sideways
        pos = at(lerp(420, 462, u), 13, 2.4); tgt = at(lerp(446, 488, u), -24, 0.2); fov = 50; roll = -0.09;
      } else if (j === 2) { // racing along the road, from above-behind
        pos = at(lerp(880, 960, u), 0, 11); tgt = at(lerp(960, 1040, u), 0, 0); fov = 52; roll = 0.12 * Math.sin(u * 3);
      } else { // over the far end: the last huts lighting
        pos = at(lerp(1080, 1130, u), -30, 26); tgt = at(1250, 8, 0); fov = 40; roll = lerp(0.3, 0.05, ease.outCubic(u));
      }
      // whip: yaw the target around the camera
      const dx = tgt[0] - pos[0], dz = tgt[2] - pos[2];
      const c = Math.cos(whip), sn = Math.sin(whip);
      tgt = [pos[0] + dx * c - dz * sn, tgt[1], pos[2] + dx * sn + dz * c];
      return { pos, tgt, roll, fov };
    }
    // bar 6: straight up; the road turns to horizontal; the lights compress into a grid
    const k = ease.inOutCubic(prog(t, b0, b0 + 1.35));
    const s = lerp(870, this.latCenter[0], ease.inOutQuad(prog(t, b0, b0 + 1.2)));
    const c = road(s);
    const hgt = Math.exp(lerp(Math.log(70), Math.log(this.latH), k)) * (1 + 0.012 * (1 - prog(t, b1 - 0.5, b1)) * prog(t, b0 + 1.3, b1));
    const yaw = lerp(0, Math.PI / 2, ease.inOutCubic(prog(t, b0 + 0.1, b0 + 1.3)));
    const T = tangent(s);
    // start: screen-up = road tangent; end: screen-up = -z (road horizontal, left → right)
    const up0: V3 = [T[0], 0, T[2]], up1: V3 = [0, 0, -1];
    const up: V3 = [lerp(up0[0], up1[0], yaw / (Math.PI / 2)), 0, lerp(up0[2], up1[2], yaw / (Math.PI / 2))];
    const z = lerp(c[2], this.latCenter[2], k);
    return { pos: [s, hgt, z], tgt: [s + 0.0001, 0, z], roll: 0, fov: FOV, up };
  }

  // ---------------------------------------------------------------- render
  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const { renderer, comp } = this.ctx;
    const t = f.t;
    const B = this.bars, bi = this.barIdx(t);
    const cv = this.camera(t);
    aim(this.cam, cv.pos, cv.tgt, cv.roll, cv.fov, cv.up ?? [0, 1, 0]);
    const litS = this.litS(t);
    const env = 0.08 + 0.92 * prog(t, B[0]! + 0.05, B[0]! + 0.6, ease.inOutQuad);
    const hz = lin('ink2', 1.05);
    const hzV = new THREE.Vector3(hz[0] + 0.004, hz[1] + 0.0025, hz[2] + 0.001);
    // bar 6: the landscape dissolves into the dots
    const b5 = B[5]!;
    const dotK = bi === 5 ? prog(t, b5 + 0.45, b5 + 1.05, ease.inOutQuad) : 0;
    const u = this.structMat.uniforms;
    u.time!.value = t; u.litS!.value = litS; u.env!.value = env * (1 - dotK); (u.hz!.value as THREE.Vector3).copy(hzV);
    u.beat!.value = f.a.kick * 0.6 + (bi >= 4 ? 0.3 : 0);
    u.wordA!.value = 1;
    u.fogK!.value = bi === 3 || bi === 5 ? 0.0009 : bi === 1 ? 0.0028 : 0.0016;

    // sky + world into the MSAA target
    const rt = this.rt3;
    renderer.setRenderTarget(rt);
    renderer.clear(true, true, true);
    const su = this.sky.u;
    (su.invVP!.value as THREE.Matrix4).multiplyMatrices(this.cam.projectionMatrix, this.cam.matrixWorldInverse).invert();
    (su.camPos!.value as THREE.Vector3).copy(this.cam.position);
    (su.sunDir!.value as THREE.Vector3).copy(u.sunDir!.value as THREE.Vector3);
    (su.hz!.value as THREE.Vector3).copy(hzV);
    su.env!.value = env * (1 - dotK);
    this.sky.render(renderer, rt);
    renderer.render(this.world, this.cam);

    // 3D lines: the axis on the ground, the demand curve, the dots
    const L3 = this.lines3; L3.clear();
    const O3 = this.over3; O3.clear();
    this.drawAxis(L3, t, env * (1 - dotK));
    if (bi === 3 || bi === 4) this.drawCurve(O3, t, bi);
    if (bi === 5) this.drawDots(O3, t, dotK);
    if (dotK <= 0) this.drawFar(L3, t, litS, env);
    L3.render(renderer, rt, this.cam);
    O3.render(renderer, rt, this.cam);
    comp.draw(renderer, rt.texture, out, { mode: 'replace' });

    // 2D: cursor, sparks, callouts, counter
    const fx = this.fx; fx.clear();
    const Lr = this.ui; Lr.clear();
    const c = Lr.ctx;
    this.drawStream(fx, t);
    this.drawCallouts(c, fx, t, bi, litS);
    this.drawCounter(c, t, litS, bi, dotK);
    comp.draw(renderer, Lr.upload(), out);
    fx.render(renderer, out);

    // hits: a small kick on every downbeat
    let shake: [number, number] = [0, 0];
    const since = t - B[bi]!;
    if (bi > 0 && since < 0.25) { const a = 5 * Math.exp(-since * 16); shake = [a * Math.sin(since * 90), a * Math.cos(since * 70)]; }
    const calm = bi === 5 ? prog(t, B[5]! + 0.6, B[5]! + 1.4) : 0;
    return { bloom: lerp(0.75, 0.12, calm), bloomThreshold: lerp(0.8, 1.2, calm), vignette: lerp(0.42, 0.2, calm), grain: 0.055, halation: lerp(0.3, 0, calm), shake };
  }

  // ---------------------------------------------------------------- drawing helpers
  private drawAxis(L: LineBatch, t: number, a: number) {
    if (a < 0.02) return;
    const g = lin('graphite', 0.55 * a), ash = lin('ash', 0.45 * a);
    let prev = road(-60);
    for (let s = -50; s <= S_MAX + 40; s += 10) {
      const p = road(s);
      if (Math.floor(s / 10) % 2 === 0) L.seg(prev[0], 0.03, prev[2], p[0], 0.03, p[2], 1.1, g[0], g[1], g[2], 1);
      prev = p;
    }
    // rank ticks: 1, 10, 100, 1,000, 10,000 (a log scale laid on a linear road)
    for (const r of [0, 9, 99, 999, N - 1]) {
      const l = this.lots[r]!;
      const a0 = at(l.s, -3.5, 0.03), a1 = at(l.s, 3.5, 0.03);
      L.seg(a0[0], a0[1], a0[2], a1[0], a1[1], a1[2], 1.4, ash[0], ash[1], ash[2], 1);
    }
  }

  /** The demand curve over the rooftops, drawn by the cursor during the crane-up (bar 4); held in bar 5. */
  private drawCurve(L: LineBatch, t: number, bi: number) {
    const b0 = this.bars[3]!, b1 = this.bars[4]!;
    const k = bi === 3 ? prog(t, b0 + 0.25, b1 - 0.15, ease.inOutQuad) : 1;
    const pts = this.curve;
    const n = Math.max(1, Math.floor(k * (pts.length - 1)));
    const fade = bi === 4 ? 0.55 : 1;
    const gold = lin('signal', 2.2 * fade), glow = lin('signal', 0.5 * fade);
    for (let i = 1; i <= n; i++) {
      const p = pts[i - 1]!, q = pts[i]!;
      L.seg(p[0], p[1], p[2], q[0], q[1], q[2], 2.2, gold[0], gold[1], gold[2], 1);
      L.seg(p[0], p[1], p[2], q[0], q[1], q[2], 9, glow[0], glow[1], glow[2], 0.35);
    }
    if (bi === 3 && k < 1) this.tipLot = n;
  }

  /** Far field: each lit structure also as a px-sized light, so the carpet reads to the horizon. */
  private drawFar(L: LineBatch, t: number, litS: number, env: number) {
    const cp = this.cam.position;
    const g = lin('signal', 0.95 * env), e = lin('ember', 0.8 * env), ash = lin('ash', 0.5 * env);
    for (let i = N_HEAD; i < N; i++) {
      const l = this.lots[i]!;
      const lit = l.s + l.jit < litS || this.landT[i]! <= t;
      if (!lit && this.landT[i]! < Infinity) continue; // an empty lot waiting for its block
      const dx = l.x - cp.x, dz = l.z - cp.z, dy = l.h - cp.y;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (!lit && d > 650) continue;
      const a = clamp((d - 70) / 160) * (lit ? Math.min(1, 320 / d) : 0.12 * (1 - d / 650));
      if (a <= 0.01) continue;
      const c = !lit ? ash : hash(i, 5) < 0.1 ? e : g;
      const k = a * (0.55 + 0.45 * hash(i, 13));
      L.seg(l.x, l.h + 0.1, l.z, l.x + 0.001, l.h + 0.1, l.z, 2.3, c[0] * k * 1.35, c[1] * k * 1.35, c[2] * k * 1.35, 1);
    }
  }

  private drawDots(L: LineBatch, t: number, dotK: number) {
    if (dotK <= 0) return;
    const b5 = this.bars[5]!, end = this.ctx.end;
    const m = prog(t, b5 + 0.75, b5 + 1.55, ease.inOutCubic);
    const settle = 1 + 0.02 * Math.sin((t - b5) * 9) * (1 - prog(t, b5 + 1.55, end));
    const beatP = Math.pow(1 - clamp((t - this.ctx.audio.nearestBeat(t - 0.24)) / 0.3), 2) * 0.35;
    const I = lerp(1.4, 0.055, m) * dotK * (1 + beatP);
    const col = lin('signal', I), hot = lin('ember', I * 0.7);
    for (let i = 0; i < N; i++) {
      const l = this.lots[i]!, g = this.lattice[i]!;
      const d = clamp(m * 1.15 - hash(i, 31) * 0.15);
      const e = ease.inOutCubic(d);
      const x = lerp(l.x, (g.x - this.latCenter[0]) * settle + this.latCenter[0], e), z = lerp(l.z, (g.z - this.latCenter[2]) * settle + this.latCenter[2], e);
      const y = lerp(Math.min(l.h, 4), 0, e);
      const c = i < N_HEAD ? lin('bone', I) : hash(i, 5) < 0.1 ? hot : col;
      L.seg(x, y, z, x + 0.001, y, z, lerp(3.2, 6, m), c[0], c[1], c[2], 1);
    }
    // the network: hairlines between neighbouring nodes, ticking in on the last beat
    const nk = prog(t, end - 0.55, end - 0.08, ease.outCubic);
    if (nk > 0) {
      const G = this.latG, cx = this.latCenter[0], cz = this.latCenter[2];
      const ln = lin('ash', 0.32 * nk);
      for (let i = 0; i < LAT_COLS; i++) for (let j = 0; j < LAT_ROWS; j++) {
        const x = cx + (i - (LAT_COLS - 1) / 2) * G, z = cz + (j - (LAT_ROWS - 1) / 2) * G;
        const r = hash(i, j, 41);
        if (r < nk * 0.7 && i < LAT_COLS - 1) L.seg(x, 0, z, x + G * clamp(nk * 1.4 - r), 0, z, 1, ln[0], ln[1], ln[2], 1);
        if (hash(i, j, 43) < nk * 0.5 && j < LAT_ROWS - 1) L.seg(x, 0, z, x, 0, z + G * clamp(nk * 1.4 - r), 1, ln[0], ln[1], ln[2], 1);
      }
    }
  }

  private drawStream(fx: LineBatch, t: number) {
    const headAt = (tt: number) => { const p = this.leadPos(tt); if (!p) return null; const s = project(this.cam, p); return s.z > 0.5 ? { x: s.x, y: s.y } : null; };
    const h = headAt(t);
    if (!h) return;
    weldSparks(fx, t, headAt, { rate: 120, speed: 160, life: 0.4, gravity: 300, seed: 7, intensity: 0.8 });
    cursorTip(fx, h.x, h.y, t, 0.9, 1);
    if (this.barIdx(t) === 3) return;
  }

  private label(c: CanvasRenderingContext2D, fx: LineBatch, p: V3, text: string, o: { dx?: number; dy?: number; a?: number; size?: number; col?: string; strike?: number; sub?: string; subK?: number; t: number }) {
    const s = project(this.cam, p);
    if (!s.on || s.z < 1) return;
    const a = o.a ?? 1;
    if (a <= 0.01) return;
    const size = o.size ?? 22;
    c.font = font(F.mono(500), size);
    const tw = Math.max(c.measureText(text).width, o.sub ? c.measureText(o.sub).width : 0);
    let dx = o.dx ?? 60, dy = o.dy ?? -70;
    if (s.y + dy < 150) dy = Math.abs(dy);
    if (s.y + dy > H - 150) dy = -Math.abs(dy);
    const left = s.x + Math.abs(dx) + 44 + tw > W - 96;
    dx = left ? -Math.abs(dx) : Math.abs(dx);
    const x1 = s.x + dx, y1 = s.y + dy;
    const tx = left ? x1 - 26 - tw : x1 + 26;
    c.save();
    c.globalAlpha = a;
    c.strokeStyle = rgba('bone', 0.7); c.lineWidth = 1.2;
    c.beginPath(); c.moveTo(s.x, s.y); c.lineTo(x1, y1); c.lineTo(x1 + (left ? -18 : 18), y1); c.stroke();
    c.fillStyle = rgba('bone', 0.95);
    c.fillRect(s.x - 3, s.y - 3, 6, 6);
    c.textBaseline = 'middle';
    c.fillStyle = rgba('ink2', 0.94);
    c.fillRect(tx - 10, y1 - size * 0.8, tw + 20, size * (o.sub ? 3.0 : 1.6));
    c.fillStyle = o.col ?? rgba('bone', 0.95);
    c.fillText(text, tx, y1);
    if (o.strike !== undefined && o.strike > 0) {
      // the cursor strikes a part of the label out (from ': ' on)
      const i0 = text.indexOf(': ') + 2;
      const xs = tx + c.measureText(text.slice(0, i0)).width - 4;
      const xe = tx + c.measureText(text).width + 6;
      const xh = lerp(xs, xe, o.strike);
      const g = lin('signal', 2.2);
      fx.seg2(xs, y1 + 1, xh, y1 + 1, 3, g, 1);
      if (o.strike < 1) cursorTip(fx, xh, y1 + 1, o.t, 0.7, 1);
    }
    if (o.sub && (o.subK ?? 0) > 0) {
      const i0 = text.indexOf(': ') + 2;
      const xs = tx + c.measureText(text.slice(0, i0)).width;
      const n = Math.ceil(o.sub.length * (o.subK ?? 0));
      c.font = font(F.mono(600), size);
      c.fillStyle = rgba('signal', 1);
      c.fillText(o.sub.slice(0, n), xs, y1 + size * 1.35);
      if ((o.subK ?? 0) < 1) c.fillRect(xs + c.measureText(o.sub.slice(0, n)).width + 3, y1 + size * 0.75, 3, size * 1.2);
    }
    c.restore();
  }

  private drawCallouts(c: CanvasRenderingContext2D, fx: LineBatch, t: number, bi: number, litS: number) {
    const B = this.bars;
    const lotTop = (i: number): V3 => { const l = this.lots[i]!; return [l.x, l.h + 0.05, l.z]; };
    if (bi === 1) {
      const a = prog(t, B[1]! + 0.5, B[1]! + 0.7) * (1 - prog(t, B[2]! - 0.12, B[2]!));
      this.label(c, fx, lotTop(this.calloutLots[0]!), 'market size: too small (1999)', { a, dx: 80, dy: -120, t });
    }
    if (bi === 2) {
      const bs = this.beats.filter((b) => b >= B[2]! - 0.02 && b < B[3]! - 0.02);
      const tS = bs[2] ?? B[2]! + 0.97;
      const strike = prog(t, tS - 0.12, tS + 0.1, ease.inOutQuad);
      const subK = prog(t, tS + 0.1, tS + 0.55);
      this.label(c, fx, at(this.sB2(t) + 3, 3.4, 1.0), 'market size: too small (1999)', { a: prog(t, B[2]!, B[2]! + 0.12), dx: 90, dy: -90, strike, sub: 'worth it (2026)', subK, t, col: strike > 0.5 ? rgba('ash', 0.8) : undefined });
    }
    if (bi === 3) {
      // the chart's labels, set on the landscape
      const b0 = B[3]!;
      const a = prog(t, b0 + 0.9, b0 + 1.2);
      const head = this.lots[0]!;
      this.label(c, fx, [head.x, head.h + 1, head.z], 'demand', { a, dx: -40, dy: -70, t, size: 20 });
      const tip = this.curve[this.tipLot] ?? this.curve[this.curve.length - 1]!;
      if (t < B[4]! - 0.15) {
        const s = project(this.cam, tip);
        if (s.on) { cursorTip(fx, s.x, s.y, t, 1.0, 1); weldSparks(fx, t, (tt) => { const k = prog(tt, b0 + 0.25, B[4]! - 0.15, ease.inOutQuad); const i = Math.floor(k * (this.curve.length - 1)); const q = project(this.cam, this.curve[i]!); return q.on ? { x: q.x, y: q.y } : null; }, { rate: 90, speed: 120, life: 0.35, gravity: 260, seed: 3, intensity: 0.7 }); }
      }
      const mid = this.curve[Math.floor(this.curve.length * 0.55)]!;
      this.label(c, fx, mid, 'every niche  →', { a: prog(t, b0 + 1.3, b0 + 1.5), dx: 30, dy: -60, t, size: 20 });
    }
    if (bi === 4) {
      const bs = this.beats.filter((b) => b >= B[4]! - 0.02 && b < B[5]! - 0.02);
      let j = 0; for (let i = 0; i < bs.length; i++) if (t >= bs[i]!) j = i;
      const a = prog(t, bs[j]! + 0.06, bs[j]! + 0.14);
      const ids = [0, 180 + 40 * 3, 4000, N - 1];
      const txt = ['rank 1 · served since 1999', 'rank 301 · a choir’s rota', 'rank 4,000 · one street', 'rank 10,000 · one person'];
      const i = ids[j]!;
      this.label(c, fx, lotTop(i), plainMono(txt[j]!), { a, dx: j === 0 ? 70 : 60, dy: j === 0 ? 40 : -80, t, size: 20 });
    }
    void litS;
  }

  private drawCounter(c: CanvasRenderingContext2D, t: number, litS: number, bi: number, dotK: number) {
    const B = this.bars;
    const a = prog(t, B[0]! + 0.5, B[0]! + 0.8) * (1 - prog(t, B[5]! + 0.9, B[5]! + 1.2));
    if (a <= 0) return;
    const n = Math.min(N, this.served(t, litS));
    const x = 120 + (bi === 2 ? 8 : 0), y = 140;
    c.save();
    c.globalAlpha = a;
    c.textBaseline = 'alphabetic';
    c.font = font(F.mono(500), 17);
    c.letterSpacing = '3px';
    c.fillStyle = rgba('ash', 0.9);
    c.fillText('NEEDS SERVED', x, y);
    c.letterSpacing = '0px';
    c.font = font(F.mono(500), 54);
    c.fillStyle = rgba('graphite', 1);
    c.fillText('6 →', x, y + 62);
    const w0 = c.measureText('6 → ').width;
    const done = n >= N;
    c.fillStyle = done ? rgba('bone', 1) : rgba('signal', 1);
    c.font = font(F.mono(600), 54);
    c.fillText(n.toLocaleString('en-US'), x + w0, y + 62);
    // instrument: a log scale 1 … 10,000 with the gold fill
    const bw = 360, by = y + 90;
    c.fillStyle = rgba('graphite', 0.9);
    c.fillRect(x, by, bw, 1);
    for (let k = 0; k <= 4; k++) { const tx = x + (bw * k) / 4; c.fillRect(tx, by - (k % 2 ? 4 : 7), 1, k % 2 ? 4 : 7); }
    c.font = font(F.mono(400), 12);
    c.fillStyle = rgba('graphite', 1);
    ['1', '10', '100', '1k', '10k'].forEach((s, k) => c.fillText(s, x + (bw * k) / 4 - 3, by + 18));
    c.fillStyle = rgba('signal', 1);
    c.fillRect(x, by - 2, (bw * Math.log10(Math.max(1, n))) / 4, 3);
    c.font = font(F.mono(400), 13);
    c.fillStyle = rgba('ash', 0.75);
    c.fillText('h(i) ∝ 1 / (1 + i·k)^a   ·   FIG. 5 — THE LONG TAIL, AT DUSK', x, by + 48);
    c.restore();
    void dotK;
  }
}

const plainMono = (s: string) => s.replace(/’/g, "'");
