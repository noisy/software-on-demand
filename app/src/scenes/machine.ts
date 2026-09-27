// `machine` — "How the magic works" (instrumental, three movements).
//   (a) high energy: hook 2's satellites converge into a grid and become a GPU die; a macro fly-over,
//       the SM tiles computing a matrix multiply as systolic wavefronts, a gold pulse on every kick.
//   (b) breakdown: the die's grid rises into an engraved loss landscape; the cursor tip, a heavy bead,
//       rolls by momentum down into the valley; the gradient field and the optimiser's state annotated.
//   (c) build: "software on ___" and the next-token distribution sharpening beat by beat; "demand" wins,
//       its bar goes white-hot; white-out settling toward the cobalt night (→ glass).
import * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '../engine/scene';
import { FSPass, Layer2D, W, H } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { LIN, rgba } from '../engine/palette';
import { F, font } from '../engine/type';
import { GLSL_COMMON } from '../engine/glsl/common';
import { clamp, lerp, ease, prog, pulse, hash, noise1, TAU, frameIdx, keys } from '../engine/util';
import { cursorCaret, cursorTip, cursorBlink, weldSparks } from './_motifs';
import { Cam3, Blocks, planeTransform, beatsIn, heatCss, orbit, lerp3, lerpPose, type P3, type CamPose, type RGB } from './internals-kit';
import { CANDIDATES, BAR_ORDER, LOSS_GLSL, lossH, lossGrad, descend } from './machine-data';

const NX = 16, NZ = 10; // SM tiles shown
const TILE = 0.86;
const mulc = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k];
const mix3 = (a: RGB, b: RGB, k: number): RGB => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];

const TERRAIN_VERT = /* glsl */ `
precision highp float;
in vec3 position;
uniform mat4 modelMatrix; uniform mat4 viewMatrix; uniform mat4 projectionMatrix;
uniform float uRise;
out vec3 vW;
${LOSS_GLSL}
void main() {
  vec3 p = (modelMatrix * vec4(position, 1.0)).xyz;
  p.y = lossH(p.xz) * uRise;
  vW = p;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;

const TERRAIN_FRAG = /* glsl */ `
precision highp float;
precision highp int;
in vec3 vW;
out vec4 fragColor;
${GLSL_COMMON}
${LOSS_GLSL}
uniform float uRise, uReveal, uFade, uFogStart, uFogLen, uHmin, uPulse;
uniform vec3 uCam, uBead;
float contour(float c, float wpx) {
  float fwP = max(fwidth(c), 1e-5);
  float d = abs(fract(c + 0.5) - 0.5) / fwP;
  float cov = pxLine(d, wpx * 0.5 - 0.5, wpx * 0.5 + 0.5);
  float fw = fwP * PX_SCALE;
  return mix(cov, clamp(wpx * fw, 0.0, 1.0) * 0.4, smoothstep(0.2, 0.5, fw));
}
void main() {
  vec2 q = vW.xz;
  float e = 0.03;
  float hx = (lossH(q + vec2(e, 0.0)) - lossH(q - vec2(e, 0.0))) / (2.0 * e) * uRise;
  float hz = (lossH(q + vec2(0.0, e)) - lossH(q - vec2(0.0, e))) / (2.0 * e) * uRise;
  vec3 n = normalize(vec3(-hx, 1.0, -hz));
  vec3 L = normalize(vec3(-0.5, 0.75, 0.35));
  float lam = sat(dot(n, L));
  float y = vW.y - uHmin * uRise;
  float minor = contour(y / 0.32, 1.0);
  float major = contour(y / 1.6, 2.0);
  // engraved shading: hatch along the contours' normal direction, denser in shadow
  vec2 gdir = normalize(vec2(hx, hz) + 1e-4);
  float slope = length(vec2(hx, hz));
  float camD = length(vW - uCam);
  float hk = hatch(dot(q, vec2(0.7, 0.7)) * 7.0, (1.0 - lam) * 0.55 * sat(slope * 0.8 + 0.2) * smoothstep(3.0, 9.0, camD));
  vec3 col = C_INK + C_INK2 * lam * 0.8;
  col += C_BONE * minor * mix(0.16, 0.42, lam);
  col += C_BONE * major * mix(0.35, 0.9, lam);
  col += C_ASH * hk * 0.16;
  // a travelling beat pulse down the contour levels from the bead
  float pb = exp(-abs(y - uPulse) * 3.0) * step(0.0, uPulse);
  col += C_BONE * (minor + major) * pb * 0.5;
  // the bead's warm light on the ground around it
  float bd = length(vW - uBead);
  col += C_SIGNAL * exp(-bd * bd / 0.8) * 0.35 + C_BLOOD * exp(-bd * bd / 6.0) * 0.12;
  float dist = length(vW - uCam);
  float fog = exp(-max(dist - uFogStart, 0.0) / uFogLen);
  float rv = length(q);
  float reveal = smoothstep(uReveal, uReveal - 2.5, rv);
  float front = exp(-abs(rv - uReveal) * 1.5) * step(0.5, uReveal) * (1.0 - smoothstep(20.0, 30.0, uReveal));
  float edge = smoothstep(21.5, 17.0, max(abs(q.x), abs(q.y)));
  col = mix(C_INK, col, fog * reveal * edge * uFade);
  col += C_BONE * (minor + major) * front * 0.8 * fog * edge * uFade;
  fragColor = vec4(col, 1.0);
}`;

export default class Machine extends Scene {
  cam = new Cam3(38, 0.05, 900);
  lines = new LineBatch(60000, { screen2D: false, depthTest: true, blend: 'add' });
  lines2 = new LineBatch(8000, { blend: 'add' });
  blocks = new Blocks(3600, { freq: 44, edge: 0.8, hatch: 0.35, heatTop: true });
  terrScene = new THREE.Scene();
  terrMat!: THREE.RawShaderMaterial;
  text = new Layer2D();
  bg = new FSPass(/* glsl */ `
    uniform float uGrid, uCobalt, uWhite;
    void main() {
      vec2 px = FRAG_PX;
      vec3 c = C_INK;
      vec2 q = px / 40.0;
      c += C_GRAPHITE * max(hatch(q.x, 0.03), hatch(q.y, 0.03)) * 0.05 * uGrid;
      // the cobalt night the glass plate opens in: darker at the top
      vec3 night = mix(C_COBALT * 0.62, C_COBALT * 0.22, vUv.y);
      c = mix(c, night, uCobalt);
      c = mix(c, vec3(1.0, 0.97, 0.9), uWhite);
      fragColor = vec4(c, 1.0);
    }`, { uGrid: { value: 0 }, uCobalt: { value: 0 }, uWhite: { value: 0 } });

  T0 = 0; T1 = 0;
  D: number[] = [];
  B: number[] = [];
  kicks: [number, number][] = [];
  sats: { from: P3; ax: number; w: number }[] = [];
  path: ReturnType<typeof descend> = [];
  pathN = 600;
  hmin = 0;
  labels: { x: number; z: number; txt: string }[] = [];
  tTrap = { x: 1.2, z: 5.6 };

  override async init() {
    const au = this.ctx.audio;
    this.T0 = this.ctx.start; this.T1 = this.ctx.end;
    this.D = au.downbeats.filter((d) => d >= this.T0 - 0.02 && d <= this.T1 + 0.05);
    while (this.D.length < 10) this.D.push(this.D[this.D.length - 1]! + 1.905);
    this.B = beatsIn(au, this.T0 - 0.02, this.T1 + 0.05);
    this.kicks = au.events('kick', this.T0 - 0.4, this.D[2]! + 0.05);
    for (let i = 0; i < NX * NZ; i++) {
      const az = hash(i, 1) * TAU, el = (hash(i, 2) - 0.5) * 1.3, r = 15 + 9 * hash(i, 3);
      this.sats.push({ from: { x: Math.cos(az) * Math.cos(el) * r, y: 4 + Math.sin(el) * r * 0.6, z: Math.sin(az) * Math.cos(el) * r }, ax: hash(i, 4) - 0.5, w: 0.6 + 0.8 * hash(i, 5) });
    }
    this.path = descend(this.pathN);
    let hm = Infinity;
    for (let x = -20; x <= 20; x += 0.25) for (let z = -20; z <= 20; z += 0.25) hm = Math.min(hm, lossH(x, z));
    this.hmin = hm;
    for (const [x, z] of [[-6.5, 3.5], [-2.2, 6.5], [2.5, 2.0], [-7.5, -3.5], [9.5, -1.0], [3.0, -8.5], [10.5, -6.5], [-1.0, -6.0]] as const) {
      this.labels.push({ x, z, txt: `L ${this.lossVal(lossH(x, z)).toFixed(2)}` });
    }
    const geo = new THREE.PlaneGeometry(44, 44, 280, 280);
    geo.rotateX(-Math.PI / 2);
    this.terrMat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: TERRAIN_VERT, fragmentShader: TERRAIN_FRAG,
      uniforms: {
        uRise: { value: 0 }, uReveal: { value: 0 }, uFade: { value: 1 }, uFogStart: { value: 18 }, uFogLen: { value: 26 }, uHmin: { value: this.hmin },
        uPulse: { value: -1 }, uCam: { value: new THREE.Vector3() }, uBead: { value: new THREE.Vector3() },
      },
      depthTest: true, depthWrite: true, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 2,
    });
    const mesh = new THREE.Mesh(geo, this.terrMat);
    mesh.frustumCulled = false;
    this.terrScene.add(mesh);
  }

  lossVal(h: number) { return (h - this.hmin) * 0.42 + 0.03; }

  // ---------------------------------------------------------------- timing helpers
  get tB() { return this.D[2]!; }
  get tC() { return this.D[6]!; }
  /** Beat time k beats after t0 (on the analysed grid). */
  beatAfter(t0: number, k: number) {
    const au = this.ctx.audio;
    return au.timeOfBeat(Math.round(au.beatAt(t0)) + k);
  }

  // ---------------------------------------------------------------- (a) the die
  tileC(i: number, j: number): P3 { return { x: i - (NX - 1) / 2, y: 0, z: j - (NZ - 1) / 2 }; }
  tileHeat(i: number, j: number, t: number) {
    let h = 0;
    const d = i + j * 0.9;
    for (const [tk, s] of this.kicks) {
      if (tk > t) break;
      const w = (t - tk) * 30 - 2;
      if (w > 34) continue;
      h = Math.max(h, s * 1.05 * Math.exp(-((d - w) ** 2) / 1.6));
    }
    return h;
  }
  tileDone(i: number, j: number, t: number) { return prog(t, this.T0 + 0.8 + ((i + j) / (NX + NZ)) * 2.6, this.T0 + 1.0 + ((i + j) / (NX + NZ)) * 2.6); }
  satPos(k: number, t: number): P3 {
    const s = this.sats[k]!;
    const i = k % NX, j = Math.floor(k / NX);
    const tc = this.tileC(i, j);
    const a = (t - this.T0 + 1.0) * s.w * 0.6;
    const ca = Math.cos(a), sa = Math.sin(a);
    const from = { x: s.from.x * ca - s.from.z * sa, y: s.from.y + s.ax * 3 * Math.sin(a), z: s.from.x * sa + s.from.z * ca };
    const k0 = prog(t, this.T0 - 0.05 + hash(k, 7) * 0.08, this.T0 + 0.42 + hash(k, 8) * 0.1, ease.outExpo);
    return lerp3(from, { x: tc.x, y: 0.14, z: tc.z }, k0);
  }

  // ---------------------------------------------------------------- cameras
  camera(t: number): CamPose {
    const D = this.D;
    const a2 = this.beatAfter(D[0]!, 2), a4 = this.beatAfter(D[1]!, 2);
    if (t < a2) {
      const k = prog(t, this.T0 + 0.1, a2, ease.inOutCubic);
      const tgt = { x: 0, y: 0, z: 0 };
      return { pos: orbit(tgt, lerp(0.0, 0.15, k), lerp(1.53, 0.92, k), lerp(17.5, 19, k)), tgt, roll: lerp(0.0, 0.02, k), fov: 40 };
    }
    if (t < D[1]!) {
      // crash-zoom onto one SM: the tensor cores
      const tc = this.tileC(10, 6);
      const tgt = { x: tc.x, y: 0.1, z: tc.z };
      const k = prog(t, a2 - 0.02, a2 + 0.3, ease.outExpo);
      const lt = t - a2;
      const far = this.camera(a2 - 1e-4);
      const near: CamPose = { pos: orbit(tgt, 0.7 + 0.12 * lt, 0.62 - 0.05 * lt, 3.4 - 0.4 * lt), tgt, roll: -0.08, fov: 38 };
      return lerpPose(far, near, k);
    }
    if (t < a4) {
      // low grazing run along a row of tiles, packets racing beside us
      const k = prog(t, D[1]!, a4, ease.linear);
      const x = lerp(-9.5, 3.5, k);
      return { pos: { x, y: 0.62, z: 2.9 }, tgt: { x: x + 5.5, y: 0.0, z: 0.4 }, roll: 0.12 - 0.08 * k, fov: 46 };
    }
    if (t < this.tB) {
      // whip up and over: the whole die, the output matrix done
      const k = prog(t, a4, this.tB + 0.3, ease.inOutCubic);
      const a = this.camera(a4 - 1e-4);
      const tgt = { x: 0, y: 0, z: 0 };
      const b: CamPose = { pos: orbit(tgt, -0.5, 1.28, 23), tgt, roll: -0.35, fov: 40 };
      return lerpPose(a, b, k);
    }
    if (t < this.tC) return this.landCam(t);
    return this.tokenCam(t);
  }

  landCam(t: number): CamPose {
    const D = this.D;
    const center = { x: 0, y: 0, z: 0 };
    if (t < D[3]!) {
      // the rise: from over the die, crane to an oblique survey
      const a = this.camera(this.tB - 1e-4);
      const k = prog(t, this.tB, D[3]!, ease.inOutCubic);
      const b: CamPose = { pos: orbit(center, lerp(-0.5, -0.9, k), lerp(1.28, 0.62, k), lerp(23, 25, k)), tgt: { x: 0, y: -1, z: 0 }, roll: lerp(-0.35, 0.02, k), fov: 40 };
      return k < 1 ? lerpPose(a, b, prog(t, this.tB, this.tB + 0.8, ease.inOutCubic)) : b;
    }
    const bp = this.beadP(t);
    if (t < D[4]!) {
      // behind the bead, low, looking downhill
      const lt = (t - D[3]!) / (D[4]! - D[3]!);
      const vel = this.beadVel(t);
      const back = { x: bp.x - vel.x * 6.5 + 1.5, y: bp.y + 2.4 + 0.6 * lt, z: bp.z - vel.z * 6.5 + 1.0 };
      const tgt = { x: bp.x + vel.x * 4, y: bp.y - 0.4, z: bp.z + vel.z * 4 };
      return { pos: back, tgt, roll: 0.06 * Math.sin(lt * 3), fov: 46 };
    }
    if (t < D[5]!) {
      // top-down: the contour map, the path, the annotations
      const k = prog(t, D[4]!, D[5]!, ease.linear);
      const tgt = { x: lerp(1.0, 2.5, k), y: -1, z: lerp(0.5, -1.5, k) };
      const p = orbit(tgt, lerp(0.1, 0.55, k), 1.42, lerp(27, 24, k));
      return { pos: p, tgt, roll: lerp(0.0, 0.25, k), fov: 40 };
    }
    // low at the basin as the bead settles
    const bas = { x: 6.2, y: lossH(6.2, -4) - 0.2, z: -4 };
    const k = prog(t, D[5]!, this.tC, ease.linear);
    const rise = prog(t, this.tC - 0.35, this.tC, ease.inCubic);
    const pos = orbit(bas, lerp(1.1, 1.75, k), lerp(0.5, 0.62, k) + 0.5 * rise, lerp(11.5, 9.0, k) + 6 * rise);
    pos.y = Math.max(pos.y, lossH(pos.x, pos.z) + 2.2);
    return { pos, tgt: { x: bas.x, y: bas.y + 0.6 + 4 * rise, z: bas.z }, roll: -0.03, fov: 42 };
  }

  tokenCam(t: number): CamPose {
    const D = this.D;
    const c2 = this.beatAfter(D[6]!, 2), c4 = this.beatAfter(D[7]!, 2), c6 = this.beatAfter(D[8]!, 2);
    const barTop = this.barTopDemand(t);
    if (t < c2) {
      const lt = t - D[6]!;
      const tgt = { x: -2.2, y: 6.0, z: -3 };
      return { pos: { x: 1.8 - 0.6 * lt, y: 5.1 + 0.2 * lt, z: 7.0 - 1.2 * lt }, tgt, roll: 0.04, fov: 38 };
    }
    if (t < D[7]!) {
      const k = prog(t, c2, D[7]!, ease.outCubic);
      const tgt = { x: 0.4, y: 3.4, z: 0 };
      return { pos: orbit(tgt, lerp(0.5, 0.35, k), lerp(0.05, 0.14, k), lerp(10, 14, k)), tgt, roll: lerp(0.06, 0.0, k), fov: 40 };
    }
    if (t < c4) {
      const k = prog(t, D[7]!, c4, ease.linear);
      const tgt = { x: 0.4, y: 3.6, z: 0 };
      return { pos: orbit(tgt, lerp(0.35, -0.3, k), lerp(0.14, 0.24, k), 14), tgt, roll: lerp(0.0, -0.04, k), fov: 40 };
    }
    if (t < D[8]!) {
      const k = prog(t, c4, D[8]!, ease.inOutCubic);
      const tgt = { x: 0.4, y: lerp(3.6, 4.6, k), z: 0 };
      return { pos: orbit(tgt, lerp(-0.3, -0.45, k), lerp(0.24, 0.45, k), lerp(14, 13, k)), tgt, roll: -0.04, fov: 40 };
    }
    if (t < c6) {
      const k = prog(t, D[8]!, c6, ease.outCubic);
      const tgt = { x: lerp(barTop.x - 4.6, barTop.x - 4.4, k), y: lerp(4.6, barTop.y, k), z: -1 };
      return { pos: orbit(tgt, lerp(-0.45, -0.1, k), lerp(0.45, 0.12, k), lerp(14.5, 14, k)), tgt, roll: lerp(-0.04, 0.03, k), fov: 40 };
    }
    // rise up the white-hot bar into its top
    const k = prog(t, c6, this.T1, ease.inCubic);
    const tgt = { x: lerp(barTop.x - 4.4, barTop.x, k), y: lerp(barTop.y, barTop.y + 1.5, k), z: lerp(-1, barTop.z, k) };
    return { pos: orbit(tgt, -0.1 + 0.3 * k, lerp(0.12, 0.8, k), lerp(14, 3.5, k)), tgt, roll: 0.03 + 0.3 * k, fov: lerp(40, 58, k) };
  }

  // ---------------------------------------------------------------- bead (b)
  beadIdx(t: number) {
    const D = this.D;
    const u = prog(t, this.tB + 0.9, D[5]! + 1.0);
    const s = u * u * (3 - 2 * u) * 0.35 + u * 0.65;
    return s * (this.pathN - 1);
  }
  pathAt(fi: number) {
    const i = clamp(Math.floor(fi), 0, this.pathN - 2), f = clamp(fi - i, 0, 1);
    const a = this.path[i]!, b = this.path[i + 1]!;
    return { x: lerp(a.x, b.x, f), z: lerp(a.z, b.z, f), p: a };
  }
  beadP(t: number): P3 {
    const q = this.pathAt(this.beadIdx(t));
    const rise = this.rise(t);
    return { x: q.x, y: lossH(q.x, q.z) * rise + 0.28, z: q.z };
  }
  beadVel(t: number) {
    const a = this.beadP(t - 0.25), b = this.beadP(t + 0.25);
    const l = Math.hypot(b.x - a.x, b.z - a.z);
    return l > 1e-3 ? { x: (b.x - a.x) / l, z: (b.z - a.z) / l } : { x: 0.7, z: -0.7 };
  }
  rise(t: number) { return prog(t, this.tB - 0.1, this.tB + 1.1, ease.inOutCubic); }

  // ---------------------------------------------------------------- (c) tokens
  temp(t: number) {
    // the distribution sharpens on every beat of the build
    const D = this.D;
    const b0 = this.beatAfter(D[6]!, 2);
    const au = this.ctx.audio;
    const bi = au.beatAt(t) - au.beatAt(b0);
    const n = Math.floor(bi), f = bi - n;
    // six beats of sharpening to the downbeat, then the snap to T = 1 (demand 0.93)
    const nb = Math.max(1, Math.round(au.beatAt(D[8]!) - au.beatAt(b0)));
    const step = (k: number) => (k >= nb ? 1.0 : lerp(5.5, 1.7, clamp(k / (nb - 1)) ** 0.9));
    if (bi < 0) return 5.5;
    if (n <= 0) return lerp(5.5, step(0), ease.outExpo(clamp(bi / 0.3)));
    return lerp(step(n - 1), step(n), ease.outExpo(clamp(f / 0.3)));
  }
  probs(t: number) {
    const T = this.temp(t);
    const l = CANDIDATES.map((c) => Math.log(c.p) / T);
    const m = Math.max(...l);
    const e = l.map((x) => Math.exp(x - m));
    const s = e.reduce((a, b) => a + b, 0);
    return e.map((x) => x / s);
  }
  barX(slot: number) { return (slot - 3.5) * 1.6; }
  barH(p: number, t: number) {
    const grow = prog(t, this.beatAfter(this.D[6]!, 2) - 0.05, this.beatAfter(this.D[6]!, 2) + 0.4, (x) => ease.outBack(x, 1.6));
    const win = prog(t, this.D[8]!, this.D[8]! + 0.5, ease.outCubic);
    return (0.3 + 7.0 * p) * grow * (p > 0.5 ? 1 + 0.06 * win : 1 - 0.4 * win);
  }
  barTopDemand(t: number): P3 {
    const slot = BAR_ORDER.indexOf(0);
    return { x: this.barX(slot), y: this.barH(this.probs(t)[0]!, t), z: 0.8 };
  }

  // ---------------------------------------------------------------- render
  override render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer, comp } = this.ctx;
    const t = f.t;
    const pose = this.camera(t);
    this.cam.set(pose);
    const mA = t < this.tB + 1.2, mB = t >= this.tB - 0.1 && t < this.tC, mC = t >= this.tC;
    const tw0 = this.beatAfter(this.D[8]!, 3);
    const end = prog(t, tw0 + 0.02, tw0 + 0.2, ease.inOutQuad);

    const u = this.bg.u;
    u.uGrid!.value = mC ? 0.5 * (1 - end) : mA && !mB ? 0.4 : 0;
    u.uCobalt!.value = end;
    u.uWhite!.value = 0;
    this.bg.render(renderer, out);
    renderer.setRenderTarget(out);
    renderer.clearDepth();

    const L = this.lines; L.clear();
    const Bk = this.blocks; Bk.clear();
    const T = this.text; T.clear();
    const L2 = this.lines2; L2.clear();
    const c = T.ctx;

    if (mB) {
      const tu = this.terrMat.uniforms;
      const rise = this.rise(t);
      tu.uRise!.value = rise;
      tu.uReveal!.value = 1 + 32 * prog(t, this.tB - 0.05, this.tB + 1.4, ease.outCubic);
      tu.uFade!.value = 1 - prog(t, this.tC - 0.25, this.tC, ease.inQuad);
      (tu.uCam!.value as THREE.Vector3).copy(this.cam.cam.position);
      const bp = this.beadP(t);
      (tu.uBead!.value as THREE.Vector3).set(bp.x, bp.y - 0.28, bp.z);
      // a contour pulse falls from the bead on every beat
      const bi = this.ctx.audio.beatAt(t), age = (bi - Math.floor(bi)) * 0.49;
      tu.uPulse!.value = (bp.y - this.hmin * rise) - age * 5;
      renderer.setRenderTarget(out);
      renderer.render(this.terrScene, this.cam.cam);
    }
    if (mA) this.drawDie(t, Bk, L);
    if (mC && end < 0.97) this.drawTokens3D(t, Bk, L, end);
    Bk.render(renderer, out, this.cam, LIN.ink, 24, 40);
    if (mB) this.drawLand3D(t, L);
    L.render(renderer, out, this.cam.cam);

    if (mA) this.drawDieText(t, c, L2);
    if (mB) this.drawLandText(t, c, L2);
    if (mC) this.drawTokenText(t, c, L2, end);
    comp.draw(renderer, T.upload(), out);
    if (end > 0) this.drawNight(t, L2, end);
    L2.render(renderer, out);

    // white-out on the last kick, settling into the cobalt night
    const tw = this.beatAfter(this.D[8]!, 3);
    // (held white through the cut: glass opens on the white-out and settles it into the cobalt night itself)
    const white = keys(t, [[tw - 0.3, 0], [tw, 1.25, ease.inCubic], [tw + 0.18, 1.05, ease.outQuad], [this.T1, 1.1, ease.inOutCubic]]);
    const hitA = mA ? f.a.kick : 0;
    const shakeA = 6 * hitA + 8 * pulse(t, this.D[4]! - 0.05, 0.12) + (mC ? 3 * f.a.kick : 0);
    return {
      bloom: mC ? 0.7 + 0.4 * prog(t, this.D[8]!, tw) : 0.62,
      vignette: 0.36 * (1 - end * 0.5),
      flash: white,
      shake: [shakeA * noise1(t * 37, 1), shakeA * noise1(t * 41, 2)],
      zoom: 1 + 0.02 * hitA + 0.03 * pulse(t, this.D[4]! - 0.05, 0.1),
      ca: 1.2 + 2.5 * hitA,
    };
  }

  /** The cobalt night the white-out settles into (the glass plate's sky): faint stars, drifting down. */
  drawNight(t: number, L2: LineBatch, end: number) {
    for (let i = 0; i < 260; i++) {
      const x = hash(i, 1) * W, y0 = Math.pow(hash(i, 2), 1.3) * H * 0.85;
      const y = y0 + (t - this.T1) * 30 * (0.5 + hash(i, 4));
      const b = Math.pow(hash(i, 3), 3);
      const I = end * (0.15 + 0.9 * b);
      const col = b > 0.6 ? LIN.ember : LIN.bone;
      L2.seg2(x, y, x + 0.01, y, 1.2 + 2 * b, [col[0] * I, col[1] * I, col[2] * I], 1);
    }
  }

  // ---------------------------------------------------------------- (a) draw
  drawDie(t: number, B: Blocks, L: LineBatch) {
    const bn = LIN.bone, sg = LIN.signal, em = LIN.ember, ash = LIN.ash, gr = LIN.graphite;
    const fadeOut = 1 - prog(t, this.tB, this.tB + 0.6, ease.inQuad);
    const sink = prog(t, this.tB - 0.05, this.tB + 0.6, ease.inCubic) * 3.5;
    if (fadeOut <= 0.02) return;
    const mat = prog(t, this.T0 - 0.1, this.T0 + 0.3, ease.outCubic); // tiles extrude from the flat grid
    const sub = prog(t, this.T0 + 0.1, this.T0 + 0.6, ease.outCubic);
    // satellites converging (first ~0.5 s): gold points with streaks
    if (t < this.T0 - 1) {
      for (let k = 0; k < NX * NZ; k++) {
        const p = this.satPos(k, t), q = this.satPos(k, t - 0.035);
        const I = 1 - prog(t, this.T0 + 0.4, this.T0 + 0.65);
        L.seg(q.x, q.y, q.z, p.x, p.y, p.z, 2.4, sg[0] * 2 * I, sg[1] * 2 * I, sg[2] * 2 * I, 1);
        L.seg(p.x, p.y, p.z, p.x + 0.001, p.y, p.z, 5, em[0] * 2 * I, em[1] * 2 * I, em[2] * 2 * I, 1);
      }
    }
    if (mat <= 0) return;
    // substrate, interposer, HBM stacks
    if (sub > 0) {
      B.add({ x: 0, y: -0.16 - sink, z: 0 }, { x: NX + 1.4, y: 0.3, z: NZ + 1.4 }, 0, fadeOut * sub, 0, 1);
      B.add({ x: 0, y: -0.42 - sink, z: 0 }, { x: NX + 9.5, y: 0.22, z: NZ + 4.2 }, 0, fadeOut * sub * 0.9, 0, 2);
      for (const sx of [-1, 1]) for (let s = 0; s < 3; s++) {
        const x = sx * (NX / 2 + 3.4), z = (s - 1) * 3.4;
        const hh = 1.1 * sub;
        for (let l = 0; l < 8; l++) B.add({ x, y: -0.3 + (l + 0.5) * (hh / 8) - sink, z }, { x: 2.0, y: hh / 8 * 0.9, z: 2.9 }, 0, fadeOut, 0, 10 + l);
        // bundles of traces from the die edge
        for (let w = 0; w < 14; w++) {
          const zz = z - 1.2 + (w / 13) * 2.4;
          const I = 0.35 * sub * fadeOut;
          L.seg(sx * (NX / 2 + 0.7), -0.3 - sink, zz, sx * (NX / 2 + 2.4), -0.3 - sink, zz, 1, bn[0] * I, bn[1] * I, bn[2] * I, 1);
        }
      }
    }
    // SM tiles and their tensor cores
    for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
      const tc = this.tileC(i, j);
      const hk = this.tileHeat(i, j, t);
      const done = this.tileDone(i, j, t);
      const mh = clamp(mat * 1.3 - hash(i, j, 9) * 0.3);
      if (mh <= 0) continue;
      const th = 0.12 * mh;
      // hook 2 hands over a solid gold grid: it cools from the centre out into the engraved die
      const dc = Math.hypot(i - (NX - 1) / 2, j - (NZ - 1) / 2);
      const g0 = (1 - prog(t, this.T0 + 0.05 + dc * 0.035, this.T0 + 0.45 + dc * 0.035, ease.inQuad)) * (0.5 + 0.2 * hash(i, j, 2));
      B.add({ x: tc.x, y: th / 2 - sink, z: tc.z }, { x: TILE, y: th, z: TILE }, Math.max(Math.min(0.85, hk * 0.75), g0), fadeOut, 0, hash(i, j));
      // 4x4 tensor cores on each tile
      const near = true;
      if (near) for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) {
        const ph = ((t * 7.3 + (a * 4 + b) / 16 + hash(i, j, 3)) % 1 + 1) % 1;
        const lit = hk * (ph < 0.25 ? 1 : 0.3) + done * 0.28 * (ph < 0.12 ? 1 : 0.4);
        B.add({ x: tc.x - 0.3 + a * 0.2, y: th + 0.03 - sink, z: tc.z - 0.3 + b * 0.2 }, { x: 0.13, y: 0.06 * mh, z: 0.13 }, Math.max(Math.min(1.1, lit * 1.0), g0 * 1.1), fadeOut, 0, a * 4 + b);
      }
    }
    // data packets along the rows (A) and columns (B)
    const I0 = mat * fadeOut;
    for (let j = 0; j < NZ; j++) {
      const z = this.tileC(0, j).z + 0.5;
      L.seg(-NX / 2, 0.02 - sink, z, NX / 2, 0.02 - sink, z, 1, gr[0] * 0.8 * I0, gr[1] * 0.8 * I0, gr[2] * 0.8 * I0, 1);
      for (let p = 0; p < 3; p++) {
        const x = -NX / 2 + (((t * 1.9 + hash(j, p, 1)) % 1) * NX);
        L.seg(x - 0.6, 0.03 - sink, z, x, 0.03 - sink, z, 2.4, sg[0] * 1.8 * I0, sg[1] * 1.8 * I0, sg[2] * 1.8 * I0, 1);
      }
    }
    for (let i = 0; i < NX; i++) {
      const x = this.tileC(i, 0).x + 0.5;
      L.seg(x, 0.02 - sink, -NZ / 2, x, 0.02 - sink, NZ / 2, 1, gr[0] * 0.8 * I0, gr[1] * 0.8 * I0, gr[2] * 0.8 * I0, 1);
      for (let p = 0; p < 2; p++) {
        const z = -NZ / 2 + (((t * 1.5 + hash(i, p, 2)) % 1) * NZ);
        L.seg(x, 0.03 - sink, z - 0.5, x, 0.03 - sink, z, 2.0, bn[0] * 1.2 * I0, bn[1] * 1.2 * I0, bn[2] * 1.2 * I0, 1);
      }
    }
    // operand matrices A (left) and B (back) as engraved bars feeding the array
    for (let j = 0; j < NZ; j++) {
      const z = this.tileC(0, j).z;
      for (let k = 0; k < 6; k++) {
        const x = -NX / 2 - 0.9 - k * 0.32;
        const v = hash(j, k, 4);
        const I = (0.25 + 0.6 * v) * I0;
        L.seg(x, 0.02 - sink, z - 0.3, x, 0.02 - sink, z + 0.3, 3, ash[0] * I, ash[1] * I, ash[2] * I, 1);
      }
    }
    for (let i = 0; i < NX; i++) {
      const x = this.tileC(i, 0).x;
      for (let k = 0; k < 4; k++) {
        const z = -NZ / 2 - 0.9 - k * 0.32;
        const v = hash(i, k, 5);
        const I = (0.25 + 0.6 * v) * I0;
        L.seg(x - 0.3, 0.02 - sink, z, x + 0.3, 0.02 - sink, z, 3, ash[0] * I, ash[1] * I, ash[2] * I, 1);
      }
    }
    void mix3; void mulc;
  }

  drawDieText(t: number, c: CanvasRenderingContext2D, L2: LineBatch) {
    const a = prog(t, this.T0 + 0.4, this.T0 + 0.8) * (1 - prog(t, this.tB, this.tB + 0.5));
    if (a <= 0) return;
    const uX = { x: 1, y: 0, z: 0 }, vZ = { x: 0, y: 0, z: 1 };
    c.textBaseline = 'alphabetic';
    // engraved on the substrate margins
    if (planeTransform(c, this.cam, { x: -NX / 2 - 0.5, y: 0.001, z: NZ / 2 + 0.25 }, uX, vZ, 100)) {
      c.font = font(F.mono(600), 34); c.textAlign = 'left'; c.letterSpacing = '4px';
      c.fillStyle = rgba('bone', 0.9 * a);
      c.fillText('C = A · B', 0, 30);
      c.font = font(F.mono(400), 22); c.letterSpacing = '1px';
      c.fillStyle = rgba('ash', 0.9 * a);
      c.fillText('M = N = K = 8,192 · bf16 → fp32 accumulate · 1.1 T multiply-adds', 230, 28);
      c.letterSpacing = '0px';
    }
    // the FLOP/s counter, gold, on the front edge
    if (planeTransform(c, this.cam, { x: NX / 2 + 0.5, y: 0.001, z: -NZ / 2 - 1.05 }, uX, vZ, 100)) {
      const act = clamp(this.tileHeatSum(t) / 12);
      const v = 612 + 377 * act + 3 * hash(frameIdx(t), 3);
      c.font = font(F.mono(600), 52); c.textAlign = 'right';
      c.fillStyle = rgba('signal', 0.95 * a);
      c.fillText(`${v.toFixed(1)} TFLOP/s`, 0, 48);
    }
    if (planeTransform(c, this.cam, { x: -NX / 2 - 0.5, y: 0.001, z: -NZ / 2 - 0.35 }, uX, { x: 0, y: 0, z: 1 }, 100)) {
      c.font = font(F.mono(500), 24); c.textAlign = 'left'; c.letterSpacing = '3px';
      c.fillStyle = rgba('bone', 0.75 * a);
      c.fillText('B  →  COLUMNS', 0, -12);
      c.letterSpacing = '0px';
    }
    if (planeTransform(c, this.cam, { x: -NX / 2 - 2.75, y: 0.001, z: -NZ / 2 }, { x: 0, y: 0, z: 1 }, { x: -1, y: 0, z: 0 }, 100)) {
      c.font = font(F.mono(500), 24); c.textAlign = 'left'; c.letterSpacing = '3px';
      c.fillStyle = rgba('bone', 0.75 * a);
      c.fillText('A  →  ROWS', 0, 0);
      c.letterSpacing = '0px';
    }
    // SM ids on the tiles near the camera
    c.font = font(F.mono(500), 11);
    c.textAlign = 'left';
    for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
      const tc = this.tileC(i, j);
      const p = this.cam.proj(tc.x - TILE / 2, 0.13, tc.z + TILE / 2);
      if (!p || p.s < 70) continue;
      if (!planeTransform(c, this.cam, { x: tc.x - TILE / 2 + 0.04, y: 0.125, z: tc.z + TILE / 2 - 0.04 }, uX, { x: 0, y: 0, z: 1 }, 100)) continue;
      const hk = this.tileHeat(i, j, t);
      c.fillStyle = hk > 0.4 ? rgba('ink', 0.8 * a) : rgba('bone', 0.55 * a);
      c.fillText(`SM ${String(j * NX + i).padStart(3, '0')}`, 2, -3);
    }
    c.setTransform(1, 0, 0, 1, 0, 0);
    // close-up callout
    const a2 = this.beatAfter(this.D[0]!, 2);
    const ca = prog(t, a2 + 0.2, a2 + 0.4) * (1 - prog(t, this.D[1]! - 0.1, this.D[1]!));
    if (ca > 0) {
      const tc = this.tileC(10, 6);
      const p = this.cam.proj(tc.x + 0.1, 0.2, tc.z - 0.1);
      if (p) {
        const q = { x: p.x + 160, y: p.y - 150 };
        c.strokeStyle = rgba('ash', 0.8 * ca); c.lineWidth = 1;
        c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(q.x, q.y); c.lineTo(q.x + 24, q.y); c.stroke();
        c.font = font(F.mono(600), 22); c.fillStyle = rgba('bone', 0.95 * ca); c.textAlign = 'left'; c.letterSpacing = '2px';
        c.fillText('TENSOR CORES × 4 × 4', q.x + 32, q.y + 7);
        c.font = font(F.mono(400), 17); c.fillStyle = rgba('ash', 0.9 * ca); c.letterSpacing = '1px';
        c.fillText('D = A × B + C,  16 × 8 × 16 per clock', q.x + 32, q.y + 34);
        c.fillText('the whole trick: multiply, add, repeat', q.x + 32, q.y + 58);
        c.letterSpacing = '0px';
      }
    }
    // a white-hot spark rides the leading wavefront
    const lastK = this.kicks.filter(([tk]) => tk <= t).pop();
    if (lastK && t - lastK[0] < 0.9 && t < this.tB) {
      const w = (t - lastK[0]) * 30 - 2;
      const i = clamp(w * 0.55, 0, NX - 1), j = clamp((w - i) / 0.9, 0, NZ - 1);
      const tc = { x: i - (NX - 1) / 2, z: j - (NZ - 1) / 2 };
      const p = this.cam.proj(tc.x, 0.2, tc.z);
      if (p && w < 30) cursorTip(L2, p.x, p.y, t, clamp(p.s / 60, 0.4, 1.4), 0.9 * lastK[1]);
    }
    // footnote
    c.font = font(F.mono(400), 14); c.textAlign = 'left'; c.letterSpacing = '1px';
    c.fillStyle = rgba('ash', 0.75 * a);
    c.fillText('FIG. 10 — ONE ACCELERATOR, 16 × 10 OF ITS STREAMING MULTIPROCESSORS. EACH GOLD WAVE IS ONE TILE OF A MATRIX MULTIPLY.', 110, H - 96);
    c.letterSpacing = '0px';
  }

  tileHeatSum(t: number) {
    let s = 0;
    for (let j = 0; j < NZ; j += 2) for (let i = 0; i < NX; i += 2) s += this.tileHeat(i, j, t);
    return s;
  }

  // ---------------------------------------------------------------- (b) draw
  drawLand3D(t: number, L: LineBatch) {
    const rise = this.rise(t);
    if (rise <= 0) return;
    const sg = LIN.signal, em = LIN.ember, bn = LIN.bone, ash = LIN.ash, bl = LIN.blood;
    const fade = 1 - prog(t, this.tC - 0.25, this.tC, ease.inQuad);
    const H3 = (x: number, z: number) => lossH(x, z) * rise;
    // gradient field: small arrows pointing downhill (-grad), dimmer far from the bead
    const bp = this.beadP(t);
    const fieldA = prog(t, this.tB + 0.8, this.tB + 1.6) * fade;
    if (fieldA > 0) {
      for (let i = -9; i <= 9; i++) for (let j = -9; j <= 9; j++) {
        const x = i * 2.0 + 0.5, z = j * 2.0 - 0.3;
        const [gx, gz] = lossGrad(x, z);
        const gl = Math.hypot(gx, gz);
        if (gl < 0.02) continue;
        const len = Math.min(0.9, 0.25 + gl * 0.5);
        const dx = -gx / gl * len, dz = -gz / gl * len;
        const y0 = H3(x, z) + 0.06, y1 = H3(x + dx, z + dz) + 0.06;
        const near = Math.exp(-((x - bp.x) ** 2 + (z - bp.z) ** 2) / 40);
        const cp = this.cam.cam.position;
        if ((x - cp.x) ** 2 + (y0 - cp.y) ** 2 + (z - cp.z) ** 2 < 36) continue;
        const I = fieldA * (0.2 + 0.5 * near);
        L.seg(x, y0, z, x + dx, y1, z + dz, 1.1, ash[0] * I, ash[1] * I, ash[2] * I, 1);
        // arrow head
        const hx = -dz * 0.3, hz = dx * 0.3;
        const tx = x + dx * 0.7, tz = z + dz * 0.7;
        L.seg(x + dx, y1, z + dz, tx + hx, H3(tx + hx, tz + hz) + 0.06, tz + hz, 1.1, ash[0] * I, ash[1] * I, ash[2] * I, 1);
        L.seg(x + dx, y1, z + dz, tx - hx, H3(tx - hx, tz - hz) + 0.06, tz - hz, 1.1, ash[0] * I, ash[1] * I, ash[2] * I, 1);
      }
    }
    // the optimiser's trail: gold near the bead, cooling to rust, step ticks every 50 steps
    const fi = this.beadIdx(t);
    let prev: P3 | null = null;
    const n = Math.floor(fi);
    for (let i = 0; i <= n; i += 2) {
      const p = this.path[i]!;
      const q = { x: p.x, y: H3(p.x, p.z) + 0.1, z: p.z };
      if (prev) {
        const k = Math.exp(-(fi - i) / 60);
        const col = mix3(mulc(bl, 0.9), mulc(sg, 2.0), k);
        L.seg(prev.x, prev.y, prev.z, q.x, q.y, q.z, 2.2 + 1.6 * k, col[0] * fade, col[1] * fade, col[2] * fade, 1);
      }
      prev = q;
      if (i % 50 === 0 && i > 0) L.seg(q.x, q.y, q.z, q.x, q.y + 0.35, q.z, 1.4, bn[0] * 0.8 * fade, bn[1] * 0.8 * fade, bn[2] * 0.8 * fade, 1);
    }
    if (prev) L.seg(prev.x, prev.y, prev.z, bp.x, bp.y - 0.18, bp.z, 3.6, em[0] * 2 * fade, em[1] * 2 * fade, em[2] * 2 * fade, 1);
    // velocity (gold) and downhill gradient (bone) vectors at the bead
    const st = this.pathAt(fi).p;
    const vl = Math.hypot(st.vx, st.vz);
    if (vl > 1e-4) {
      const k = Math.min(2.2, vl * 30);
      const tx = bp.x + (st.vx / vl) * k, tz = bp.z + (st.vz / vl) * k;
      L.seg(bp.x, bp.y, bp.z, tx, H3(tx, tz) + 0.3, tz, 2.2, sg[0] * 1.6 * fade, sg[1] * 1.6 * fade, sg[2] * 1.6 * fade, 1);
    }
    const gl = Math.hypot(st.gx, st.gz);
    if (gl > 1e-4) {
      const k = Math.min(2.4, gl * 1.2);
      const tx = bp.x - (st.gx / gl) * k, tz = bp.z - (st.gz / gl) * k;
      L.seg(bp.x, bp.y, bp.z, tx, H3(tx, tz) + 0.3, tz, 1.6, bn[0] * 0.9 * fade, bn[1] * 0.9 * fade, bn[2] * 0.9 * fade, 1);
    }
    // a ring around the bead on the ground; at the end: converged rings
    const settle = prog(t, this.D[5]! + 0.6, this.tC);
    for (let r = 0; r < (settle > 0 ? 4 : 1); r++) {
      const R = r === 0 ? 0.55 : 0.6 + ((t * 0.9 + r / 3) % 1) * 3.5 * settle;
      const I = r === 0 ? 0.9 : (1 - ((t * 0.9 + r / 3) % 1)) * settle;
      let pp: P3 | null = null;
      for (let k = 0; k <= 40; k++) {
        const an = (k / 40) * TAU;
        const x = bp.x + Math.cos(an) * R, z = bp.z + Math.sin(an) * R;
        const q = { x, y: H3(x, z) + 0.05, z };
        if (pp) L.seg(pp.x, pp.y, pp.z, q.x, q.y, q.z, 1.4, sg[0] * I * fade, sg[1] * I * fade, sg[2] * I * fade, 1);
        pp = q;
      }
    }
    // the local minimum it skipped, circled
    {
      const x = this.tTrap.x, z = this.tTrap.z;
      const I = 0.7 * prog(t, this.D[4]!, this.D[4]! + 0.4) * fade;
      let pp: P3 | null = null;
      for (let k = 0; k <= 36; k++) {
        const an = (k / 36) * TAU;
        const xx = x + Math.cos(an) * 1.1, zz = z + Math.sin(an) * 1.1;
        const q = { x: xx, y: H3(xx, zz) + 0.05, z: zz };
        if (pp && k % 2 === 0) L.seg(pp.x, pp.y, pp.z, q.x, q.y, q.z, 1.2, bn[0] * I, bn[1] * I, bn[2] * I, 1);
        pp = q;
      }
    }
  }

  drawLandText(t: number, c: CanvasRenderingContext2D, L2: LineBatch) {
    const rise = this.rise(t);
    if (rise <= 0) return;
    const fade = 1 - prog(t, this.tC - 0.25, this.tC, ease.inQuad);
    const la = prog(t, this.tB + 1.0, this.tB + 1.6) * fade;
    c.textBaseline = 'middle';
    // contour labels lying on the terrain, along the contour
    for (const lb of this.labels) {
      if (la <= 0) break;
      const [gx, gz] = lossGrad(lb.x, lb.z);
      const gl = Math.hypot(gx, gz) || 1;
      let ux = { x: -gz / gl, y: 0, z: gx / gl };
      // keep text reading left → right on screen
      const p0 = this.cam.proj(lb.x, lossH(lb.x, lb.z) * rise, lb.z), p1 = this.cam.proj(lb.x + ux.x, lossH(lb.x + ux.x, lb.z + ux.z) * rise, lb.z + ux.z);
      if (!p0 || !p1 || p0.s > 110) continue;
      if (p1.x < p0.x) ux = { x: -ux.x, y: 0, z: -ux.z };
      const vz = { x: -ux.z, y: 0, z: ux.x };
      const o = { x: lb.x, y: lossH(lb.x, lb.z) * rise + 0.04, z: lb.z };
      if (!planeTransform(c, this.cam, o, ux, vz, 100)) continue;
      c.font = font(F.mono(500), 30); c.textAlign = 'center';
      const w = c.measureText(lb.txt).width;
      c.fillStyle = rgba('ink', 0.9 * la);
      c.fillRect(-w / 2 - 8, -20, w + 16, 40);
      c.fillStyle = rgba('bone', 0.85 * la);
      c.fillText(lb.txt, 0, 1);
    }
    c.setTransform(1, 0, 0, 1, 0, 0);
    // the bead: the cursor's white-hot tip, rolling
    const bp = this.beadP(t);
    const p = this.cam.proj(bp.x, bp.y, bp.z);
    if (p) {
      const sc = clamp(p.s / 55, 0.5, 1.8);
      cursorTip(L2, p.x, p.y, t, sc * 1.3, 1.2);
      // the optimiser's readout next to it
      const fi = this.beadIdx(t);
      const st = this.pathAt(fi).p;
      const ra = prog(t, this.tB + 1.2, this.tB + 1.5) * fade * (1 - prog(t, this.D[5]! + 0.4, this.D[5]! + 0.6));
      if (ra > 0) {
        const x = p.x + 46, y = p.y - 70;
        c.strokeStyle = rgba('ash', 0.7 * ra); c.lineWidth = 1;
        c.beginPath(); c.moveTo(p.x + 12, p.y - 10); c.lineTo(x - 8, y + 10); c.stroke();
        c.textAlign = 'left'; c.textBaseline = 'alphabetic';
        c.font = font(F.mono(600), 20); c.fillStyle = rgba('signal', 0.95 * ra);
        c.fillText(`step ${Math.floor(fi * 25).toLocaleString('en-US')}`, x, y);
        c.font = font(F.mono(400), 17); c.fillStyle = rgba('bone', 0.9 * ra);
        const f2 = (v: number) => (v < 0 ? '−' : '+') + Math.abs(v).toFixed(3);
        c.fillText(`loss      ${this.lossVal(st.h).toFixed(3)}`, x, y + 26);
        c.fillText(`∂L/∂θ     (${f2(st.gx)}, ${f2(st.gz)})`, x, y + 48);
        c.fillText(`velocity  ${Math.hypot(st.vx, st.vz).toFixed(3)}`, x, y + 70);
        c.fillStyle = rgba('ash', 0.85 * ra);
        c.fillText('lr 1.05e−2 · momentum 0.955', x, y + 92);
      }
    }
    // the skipped local minimum
    const ta = prog(t, this.D[4]! + 0.2, this.D[4]! + 0.5) * fade;
    if (ta > 0) {
      const q = this.cam.proj(this.tTrap.x + 1.2, lossH(this.tTrap.x, this.tTrap.z) * rise, this.tTrap.z);
      if (q) {
        c.textAlign = 'left'; c.textBaseline = 'alphabetic';
        c.font = font(F.mono(500), 18); c.fillStyle = rgba('bone', 0.9 * ta);
        c.fillText('local min.', q.x + 8, q.y - 6);
        c.font = font(F.mono(400), 15); c.fillStyle = rgba('ash', 0.9 * ta);
        c.fillText('rolled past it: momentum', q.x + 8, q.y + 14);
      }
    }
    const ga = prog(t, this.D[5]! + 0.5, this.D[5]! + 0.8) * fade;
    if (ga > 0) {
      const q = this.cam.proj(6.3, lossH(6.3, -4) * rise, -4);
      if (q) {
        c.textAlign = 'left'; c.textBaseline = 'alphabetic';
        c.font = font(F.mono(600), 22); c.fillStyle = rgba('signal', 0.95 * ga);
        c.font = font(F.mono(600), 30);
        c.fillText('converged', q.x + 90, q.y - 120);
        c.font = font(F.mono(400), 19); c.fillStyle = rgba('bone', 0.9 * ga);
        c.fillText(`loss ${this.lossVal(this.path[this.pathN - 1]!.h).toFixed(3)} · step 15,000`, q.x + 90, q.y - 90);
        c.fillStyle = rgba('ash', 0.9 * ga);
        c.fillText('good enough to build with', q.x + 90, q.y - 64);
        c.strokeStyle = rgba('ash', 0.7 * ga); c.lineWidth = 1;
        c.beginPath(); c.moveTo(q.x + 14, q.y - 14); c.lineTo(q.x + 80, q.y - 112); c.stroke();
      }
    }
    c.font = font(F.mono(400), 14); c.textAlign = 'left'; c.textBaseline = 'alphabetic'; c.letterSpacing = '1px';
    c.fillStyle = rgba('ash', 0.75 * la);
    c.fillText('FIG. 11 — GRADIENT DESCENT WITH MOMENTUM ON A LOSS SURFACE (TWO OF ITS SEVENTY BILLION DIMENSIONS).', 110, H - 96);
    c.letterSpacing = '0px';
  }

  // ---------------------------------------------------------------- (c) draw
  drawTokens3D(t: number, B: Blocks, L: LineBatch, end: number) {
    const gr = LIN.graphite, sg = LIN.signal;
    const fade = 1 - end;
    // engraved floor
    const fa = prog(t, this.tC, this.tC + 0.4) * fade;
    for (let k = -16; k <= 16; k++) {
      const I = 0.4 * fa * (k % 4 === 0 ? 1.6 : 1);
      L.seg(k * 0.9, 0, -9, k * 0.9, 0, 9, 1, gr[0] * I, gr[1] * I, gr[2] * I, 1);
      L.seg(-15, 0, k * 0.55, 15, 0, k * 0.55, 1, gr[0] * I, gr[1] * I, gr[2] * I, 1);
    }
    const P = this.probs(t);
    const win = prog(t, this.D[8]!, this.D[8]! + 0.6);
    BAR_ORDER.forEach((ci, slot) => {
      const p = P[ci]!;
      const h = Math.max(0.02, this.barH(p, t));
      const x = this.barX(slot);
      const isW = ci === 0;
      const heat = isW ? clamp(p * 0.9) * 0.8 + win * 0.9 + 0.2 * pulse(t, this.ctx.audio.timeOfBeat(Math.floor(this.ctx.audio.beatAt(t))), 0.1) : 0;
      B.add({ x, y: h / 2, z: 0.8 }, { x: 1.15, y: h, z: 1.15 }, heat, fade, 3, slot);
      // a hairline gauge beside each bar (tick per 0.1)
      for (let k = 1; k <= 10; k++) {
        const y = 0.3 + k;
        L.seg(x - 0.72, y, 1.38, x - 0.62, y, 1.38, 1, gr[0] * 0.7 * fa, gr[1] * 0.7 * fa, gr[2] * 0.7 * fa, 1);
      }
      if (isW && win > 0) {
        // the winner radiates
        const I = win * 1.5 * fade;
        L.seg(x, h, 0.8, x, h + 2.5 * win, 0.8, 10 * win, sg[0] * I, sg[1] * I, sg[2] * I, 0.5);
      }
    });
  }

  drawTokenText(t: number, c: CanvasRenderingContext2D, L2: LineBatch, end: number) {
    const fade = 1 - end;
    if (fade <= 0) return;
    const uX = { x: 1, y: 0, z: 0 }, vY = { x: 0, y: -1, z: 0 };
    c.textBaseline = 'alphabetic';
    // the prompt, typed; the blank waits with the cursor; "demand" fills it on the downbeat
    const prompt = 'software on ';
    const tType0 = this.tC + 0.05, tType1 = this.tC + 0.62;
    const nT = Math.floor(prompt.length * prog(t, tType0, tType1));
    const tFill = this.D[8]! + 0.02;
    const fillN = Math.floor(6 * prog(t, tFill, tFill + 0.32));
    let caret: { x: number; y: number; h: number } | null = null;
    if (planeTransform(c, this.cam, { x: -8.4, y: 7.6, z: -3 }, uX, vY, 100, 800)) {
      c.font = font(F.mono(600), 140); c.textAlign = 'left';
      const adv = c.measureText('0').width;
      c.fillStyle = rgba('bone', 0.96 * fade);
      c.fillText(prompt.slice(0, nT), 0, 0);
      const bx = adv * prompt.length;
      if (fillN > 0) {
        const s = 'demand'.slice(0, fillN);
        c.fillStyle = heatCss(0.7 + 0.3 * pulse(t, tFill + 0.3, 0.2), fade);
        c.fillText(s, bx, 0);
      }
      // the blank
      if (nT >= prompt.length) {
        c.fillStyle = rgba('signal', (fillN > 0 ? 0.3 : 0.8) * fade);
        c.fillRect(bx, 22, adv * 6, 6);
      }
      const cx = nT < prompt.length ? adv * nT : bx + adv * fillN;
      const m = c.getTransform();
      caret = { x: m.a * (cx + 6) + m.c * -112 + m.e, y: m.b * (cx + 6) + m.d * -112 + m.f, h: Math.hypot(m.c, m.d) * 140 };
      c.font = font(F.mono(400), 34); c.fillStyle = rgba('ash', 0.85 * fade * prog(t, tType1, tType1 + 0.2));
      c.fillText('next-token distribution · temperature ' + this.temp(t).toFixed(2), 4, 90);
    }
    // bar labels (front faces) and probabilities (above the tops)
    const P = this.probs(t);
    const barsA = prog(t, this.beatAfter(this.D[6]!, 2) - 0.05, this.beatAfter(this.D[6]!, 2) + 0.3) * fade;
    if (barsA > 0) BAR_ORDER.forEach((ci, slot) => {
      const p = P[ci]!;
      const h = this.barH(p, t);
      const x = this.barX(slot);
      const isW = ci === 0;
      const win = prog(t, this.D[8]!, this.D[8]! + 0.6);
      if (planeTransform(c, this.cam, { x: x - 0.575, y: Math.min(h, 0.9) - 0.12, z: 1.38 }, uX, vY, 100)) {
        const s = CANDIDATES[ci]!.s;
        c.font = font(F.mono(600), s.length > 6 ? 19 : 25); c.textAlign = 'center';
        c.fillStyle = isW && win > 0.1 ? rgba('ink', barsA) : rgba('bone', 0.95 * barsA);
        c.fillText(s, 57.5, 26);
      }
      if (planeTransform(c, this.cam, { x: x - 0.575, y: h + 0.25, z: 1.38 }, uX, vY, 100)) {
        c.font = font(F.mono(isW ? 600 : 500), isW ? 44 : 30); c.textAlign = 'center';
        c.fillStyle = isW ? heatCss(0.5 + 0.5 * win, barsA) : rgba('ash', 0.9 * barsA);
        c.fillText(p.toFixed(p < 0.01 ? 3 : 2), 57.5, 0);
      }
    });
    c.setTransform(1, 0, 0, 1, 0, 0);
    if (caret && t < this.T1 - 0.4) cursorCaret(L2, caret.x, caret.y, caret.h, cursorBlink(((t - this.tC) * 2.05) % 1) * fade, t);
    // sparks off the winning bar's top
    const win = prog(t, this.D[8]!, this.D[8]! + 0.3);
    if (win > 0) {
      weldSparks(L2, t, (tb) => {
        if (tb < this.D[8]!) return null;
        const bt = this.barTopDemand(tb);
        const q = this.cam.proj(bt.x + (hash(Math.floor(tb * 90), 1) - 0.5) * 1.1, bt.y, bt.z + 0.575);
        return q ? { x: q.x, y: q.y } : null;
      }, { rate: 160, speed: 380, life: 0.6, intensity: 1.3 * fade, seed: 23 });
    }
    c.font = font(F.mono(400), 14); c.textAlign = 'left'; c.letterSpacing = '1px';
    c.fillStyle = rgba('ash', 0.75 * fade * prog(t, this.tC + 0.3, this.tC + 0.6));
    c.fillText('FIG. 12 — SAMPLING. EVERYTHING ABOVE, FOR ONE WORD; THEN AGAIN FOR THE NEXT.', 110, H - 96);
    c.letterSpacing = '0px';
  }
}
