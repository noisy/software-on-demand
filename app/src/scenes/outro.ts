// OUTRO — "Software on demand" (A6). Three movements:
//  1. 162.6 → 169.3  hook3's magic circle collapses into the cursor; the cursor opens a tunnel of drawing
//     frames and the camera races down it, faster and faster. On every beat one of the video's key objects
//     flies past, engraved in line: block, tower, bell, flywheel, token, globe, GPU die, shard, sigil
//     (FIG. 01–09, each with the plate and second it came from); then a recap at 8ths and 16ths; the
//     tunnel collapses back into the cursor.
//  2. 169.33 → 172.0  "Software on demand." — the last hook, everything at once: SOFTWARE / ON / DEMAND.
//     slammed from blocks bursting out of the cursor (one word per sung word), ON inside a spinning sigil,
//     DEMAND. held and welded by the cursor while an orbit of builders' lights circles the stack; then the
//     blocks implode into one unit block.
//  3. 172.0 → end  that block stands on a cyanotype engineering drawing, BUILDERS · DRAWING NO. 001; the
//     cursor draws the views, types "Everyone can be a builder now.", ticks in the dimensions, fills the
//     title block and the notes (the credits), then parks at the end of the title, blinking to the last
//     beat, while the camera pulls back over the whole sheet; fade to black.
import * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { Layer2D, W, H, SCALE } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { rgba } from '../engine/palette';
import { F, font } from '../engine/type';
import { GLSL_COMMON } from '../engine/glsl/common';
import { clamp, ease, hash, lerp, prog, noise1, TAU } from '../engine/util';
import type { Line } from '../engine/lyrics';
import { cursorTip, cursorCaret, cursorBlink, weldSparks, hookLine } from './_motifs';
import { aim, project, rasterWord, boxGeometry, msaaRT, VS_HEAD, lin, type V3, type RGB } from './longtail-kit';
import { callbackModels, sigil, type Model } from './outro-art';
import { buildSheet, penAt, CUBE, SHEET_W, SHEET_H, type SheetLine, type PenEvent } from './outro-sheet';

const TUN = 5; // tunnel half-size
const FRAME_DZ = 6; // frame spacing
const BLK = 1; // hook block size

// ------------------------------------------------------------------ hook blocks
const BLOCK_VERT = /* glsl */ `${VS_HEAD}
in vec4 iT; in vec4 iM;   // target xyz, word | seed, launch jitter, char, 0
uniform float time, implode, stretch;
uniform vec3 wOn, wEnd;   // word onsets / ends
uniform vec3 cubeC; uniform float cubeS;
out vec3 vN; out vec3 vL; out float vHeat; out float vWord; out float vSung; out float vCool;
float h1(float x) { return fract(sin(x * 127.1) * 43758.5453); }
void main() {
  int w = int(iT.w + 0.5);
  float on = w == 0 ? wOn.x : w == 1 ? wOn.y : wOn.z;
  float en = w == 0 ? wEnd.x : w == 1 ? wEnd.y : wEnd.z;
  float F = 0.24 + 0.08 * iM.y;
  float u = clamp((time - (on - F)) / F, 0.0, 1.0);
  float vis = step(on - F, time);
  vec3 tgt = iT.xyz;
  if (w == 2) tgt.x *= stretch;
  vec3 org = vec3(0.0, tgt.y * 0.1, -240.0) + (vec3(h1(iM.x), h1(iM.x + 2.0), h1(iM.x + 4.0)) - 0.5) * 6.0;
  float e = pow(u, 1.7);
  vec3 c = mix(org, tgt, e);
  // impact: a short spring in depth
  float a = max(time - on, 0.0);
  c.z += sin(a * 38.0) * exp(-a * 14.0) * 1.6 * step(on, time);
  float sc = BLK_S * vis;
  // the implosion into one block
  float k = implode;
  float kk = clamp(k * 1.25 - h1(iM.x + 9.0) * 0.25, 0.0, 1.0);
  kk = kk * kk * kk;
  c = mix(c, cubeC + (vec3(h1(iM.x + 5.0), h1(iM.x + 6.0), h1(iM.x + 7.0)) - 0.5) * cubeS * 0.7, kk);
  sc *= 1.0 - kk * 0.8;
  vec3 wp = c + position * sc;
  vN = normal; vL = position;
  vHeat = exp(-a * 9.0) * step(on, time) + kk * 0.8;
  vWord = float(w);
  vSung = clamp((time - on) / max(en - on, 0.05), 0.0, 1.0) * step(on, time);
  vCool = clamp((time - en - 0.25) / 0.45, 0.0, 1.0);
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}`.replace('BLK_S', BLK.toFixed(2));

const BLOCK_FRAG = /* glsl */ `
in vec3 vN; in vec3 vL; in float vHeat; in float vWord; in float vSung; in float vCool;
out vec4 fragColor;
void main() {
  vec3 n = normalize(vN);
  vec3 L = normalize(vec3(-0.45, 0.65, 0.62));
  float lam = 0.38 + 0.62 * max(dot(n, L), 0.0);
  vec3 q = abs(vL) * 2.0;           // 0 centre .. 1 edge, per axis
  vec3 ax = abs(n);
  vec2 f = ax.x > 0.5 ? q.yz : ax.y > 0.5 ? q.xz : q.xy;
  float ed = 1.0 - max(f.x, f.y);
  float edge = 1.0 - smoothstep(0.0, max(fwidth(ed) * 1.5, 0.06), ed);
  vec3 gold = C_SIGNAL * 0.72;
  vec3 base = gold;
  if (vWord < 0.5) base = mix(gold, C_BONE * 0.8, vCool);      // SOFTWARE cools to bone
  if (vWord > 0.5 && vWord < 1.5) base = C_BONE * 0.85;          // ON: bone, inside the gold sigil
  vec3 col = base * lam;
  col = mix(col, C_INK, edge * 0.55);
  col += (C_EMBER * 1.6 + vec3(0.6)) * vHeat * (0.35 + 0.65 * edge);
  fragColor = vec4(col, 1.0);
}`;

// ------------------------------------------------------------------ the sheet
const SHEET_VERT = /* glsl */ `${VS_HEAD}
in vec2 uv; out vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0); }`;
const SHEET_FRAG = /* glsl */ `
in vec2 vUv; out vec4 fragColor;
uniform sampler2D tex; uniform float time, T0, T1, flood, gridK; uniform vec2 floodC;
void main() {
  vec2 px = vec2(vUv.x * ${SHEET_W.toFixed(1)}, (1.0 - vUv.y) * ${SHEET_H.toFixed(1)});
  vec3 paper = C_COBALT * (0.9 + 0.1 * snoise(px * 0.004) + 0.04 * snoise(px * 0.05));
  // a faint drafting grid: 24 px, heavier every 120 px
  vec2 g = px / 24.0, fw = fwidth(g);
  vec2 d = abs(fract(g + 0.5) - 0.5) / max(fw, vec2(1e-4));
  float minor = max(pxLine(d.x, 0.0, 1.0), pxLine(d.y, 0.0, 1.0)) * (1.0 - smoothstep(0.15, 0.45, max(fw.x, fw.y)));
  vec2 g2 = px / 120.0, fw2 = fwidth(g2);
  vec2 d2 = abs(fract(g2 + 0.5) - 0.5) / max(fw2, vec2(1e-4));
  float major = max(pxLine(d2.x, 0.0, 1.1), pxLine(d2.y, 0.0, 1.1));
  paper += C_BONE * (0.018 * minor + 0.035 * major) * gridK;
  vec4 tx = texture(tex, vUv);
  float cov = tx.r;
  float inv = 1.0 / max(tx.r, 1.0 / 255.0);
  float tA = T0 + clamp(tx.g * inv, 0.0, 1.0) * (T1 - T0);
  float tone = clamp(tx.b * inv, 0.0, 1.0);
  float vis = step(tA, time) * smoothstep(0.02, 0.1, cov);
  float age = time - tA;
  vec3 ink = mix(C_SIGNAL * 1.5 + C_EMBER * 0.6, C_BONE * (0.25 + 0.75 * tone) * 0.92, smoothstep(0.0, 0.4, age));
  vec3 col = mix(paper, ink, clamp(cov * 1.05, 0.0, 1.0) * vis);
  float r = length(px - floodC);
  float fl = 1.0 - smoothstep(flood - 60.0, flood, r);
  col = mix(C_INK, col, fl);
  col += C_SIGNAL * 0.6 * exp(-abs(r - flood) / 14.0) * step(0.0, flood) * (1.0 - smoothstep(1400.0, 2200.0, flood));
  fragColor = vec4(col, 1.0);
}`;

interface Obj { kind: number; T: number; z: number; x: number; y: number; s: number; spin: V3; recap: boolean }

export default class Outro extends Scene {
  private cam = new THREE.PerspectiveCamera(58, W / H, 0.2, 9000);
  private rt3 = msaaRT();
  private lb3 = new LineBatch(90000, { screen2D: false });
  private sheetLb = new LineBatch(20000, { screen2D: false, worldWidth: true });
  private fx = new LineBatch(8000);
  private ui = new Layer2D();
  private models: Model[] = [];
  private sig!: Model;
  private beats: number[] = [];
  private bars: number[] = [];
  private objs: Obj[] = [];
  private figs: { name: string; sub: string }[] = [];
  private hook!: Line;
  private tHook = 0; // tunnel collapse
  private tSheet = 0;
  private blocks = new THREE.Scene();
  private blockMat!: THREE.RawShaderMaterial;
  private wordBoxes: { y: number; w: number; h: number }[] = [];
  private demandBase: { x0: number; x1: number; y: number } = { x0: 0, x1: 0, y: 0 };
  private sheetScene = new THREE.Scene();
  private sheetMat!: THREE.RawShaderMaterial;
  private sheet!: ReturnType<typeof buildSheet>;
  private cubeHookS = 44;

  override init() {
    const { audio: au, lyrics: ly, start, end } = this.ctx;
    for (let i = Math.ceil(au.beatAt(start) - 1e-3); au.timeOfBeat(i) < end + 3; i++) this.beats.push(au.timeOfBeat(i));
    this.bars = au.downbeats.filter((d) => d >= start - 0.05 && d < end);
    this.hook = hookLine(ly, 3);
    this.models = callbackModels();
    this.sig = sigil();
    this.tHook = this.hook.words[0]!.start;
    this.tSheet = this.bars.find((b) => b > this.hook.end + 0.15) ?? this.hook.end + 0.44;
    this.buildTunnel();
    this.buildBlocks();
    this.buildSheetScene();
  }

  // ---------------------------------------------------------------- construction
  private buildTunnel() {
    const { lyrics: ly, audio: au } = this.ctx;
    const sec = (n: string) => au.sections.find((s) => s.name === n)?.start ?? 0;
    const w = (q: string, i: number) => { try { const l = ly.get(q); return l.words[i < 0 ? l.words.length + i : i]!.start; } catch { return 0; } };
    const f2 = (x: number) => x.toFixed(2);
    this.figs = [
      { name: 'BLOCK, UNIT', sub: `boot · t = ${f2(sec('build'))} s` },
      { name: 'TOWER, BIG SOFTWARE CO.', sub: `oldworld · t = ${f2(w('a tower and a name', 1))} s` },
      { name: 'BELL (JEVONS, 1865)', sub: `jevons · t = ${f2(w('rang the bell', -1))} s` },
      { name: 'FLYWHEEL & GOVERNOR', sub: `jevons · t = ${f2(sec('pre1'))} s` },
      { name: 'TOKEN “demand”', sub: `internals · t = ${f2(w('weights and attention', 2))} s` },
      { name: 'GLOBE OF BUILDERS', sub: `hook 2 · t = ${f2(sec('chorus2'))} s` },
      { name: 'GPU DIE', sub: `machine · t = ${f2(sec('inst2'))} s` },
      { name: 'SHARD OF THE GLASS', sub: `glass · t = ${f2(w('breaks the glass', -1))} s` },
      { name: 'SIGIL', sub: `hook 3 · t = ${f2(w('wizard with a plan', 1))} s` },
    ];
    const B = this.beats;
    const objs: Obj[] = [];
    for (let k = 0; k < 9; k++) {
      const T = B[k + 1]!;
      const side = k % 2 ? 1 : -1;
      objs.push({ kind: k, T, z: this.camZ(T) - 6.5, x: side * 2.35, y: (k % 3 - 1) * 0.9, s: 1.55, spin: [0.4 + hash(k, 1), 0.9 + hash(k, 2) * 0.8, 0.2 * hash(k, 3)], recap: false });
    }
    // recap: 8ths, then 16ths, until the collapse
    const r0 = B[10]!, r1 = this.tHook - 0.3;
    let t = r0, n = 0;
    while (t < r1) {
      const ang = hash(n, 7) * TAU;
      objs.push({ kind: n % 9, T: t, z: this.camZ(t) - 5.5, x: Math.cos(ang) * 2.8, y: Math.sin(ang) * 2.2, s: 0.95, spin: [2 + hash(n, 8) * 2, 3 + hash(n, 9) * 2, 1], recap: true });
      const beatLen = (B[11]! - B[10]!);
      t += t < B[12]! ? beatLen / 2 : beatLen / 4;
      n++;
    }
    this.objs = objs;
  }

  /** Camera depth along the tunnel (accelerating). */
  private camZ(t: number) {
    const tau = Math.max(0, t - (this.ctx.start + 0.22));
    return -(20 * tau + 1.35 * tau * tau * tau);
  }

  private buildBlocks() {
    const words = ['SOFTWARE', 'ON', 'DEMAND.'];
    const fams = [F.archivo(112, 900), F.archivo(100, 900), F.archivo(112, 900)];
    const sizes = [200, 170, 200];
    const ys = [27, 3.5, -22];
    const cells: { x: number; y: number; z: number; w: number; ch: number }[] = [];
    words.forEach((word, wi) => {
      const r = rasterWord(word, fams[wi]!, sizes[wi]!, 7, 3);
      const cx = r.cols / 2, cy = r.cap / 2;
      this.wordBoxes.push({ y: ys[wi]!, w: r.cols * BLK, h: r.cap * BLK });
      for (const c of r.cells) cells.push({ x: (c.x - cx + 0.5) * BLK, y: ys[wi]! + (c.y - cy + 0.5) * BLK, z: 0, w: wi, ch: c.ch });
      if (wi === 2) this.demandBase = { x0: -cx * BLK, x1: (r.cols - cx) * BLK, y: ys[wi]! - cy * BLK - 0.6 };
    });
    const n = cells.length;
    const tA = new Float32Array(n * 4), mA = new Float32Array(n * 4);
    cells.forEach((c, i) => { tA.set([c.x, c.y, c.z, c.w], i * 4); mA.set([hash(i, 3) * 100, hash(i, 4), c.ch, 0], i * 4); });
    const g = new THREE.InstancedBufferGeometry();
    const box = boxGeometry(true);
    g.index = box.index; g.setAttribute('position', box.getAttribute('position')); g.setAttribute('normal', box.getAttribute('normal'));
    g.setAttribute('iT', new THREE.InstancedBufferAttribute(tA, 4));
    g.setAttribute('iM', new THREE.InstancedBufferAttribute(mA, 4));
    g.instanceCount = n;
    const ws = this.hook.words;
    this.blockMat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: BLOCK_VERT, fragmentShader: `precision highp float;\n${GLSL_COMMON}\n${BLOCK_FRAG}`,
      uniforms: {
        time: { value: 0 }, implode: { value: 0 }, stretch: { value: 1 },
        wOn: { value: new THREE.Vector3(ws[0]!.start, ws[1]!.start, ws[2]!.start) },
        wEnd: { value: new THREE.Vector3(ws[0]!.end, ws[1]!.end, ws[2]!.end) },
        cubeC: { value: new THREE.Vector3(0, 2, 0) }, cubeS: { value: this.cubeHookS },
      },
    });
    const m = new THREE.Mesh(g, this.blockMat); m.frustumCulled = false;
    this.blocks.add(m);
  }

  private buildSheetScene() {
    const B = this.bars.filter((b) => b >= this.tSheet - 0.02);
    while (B.length < 6) B.push(B[B.length - 1]! + 1.88);
    const K = SCALE > 1 ? 4 : 3;
    this.sheet = buildSheet({ bars: B.slice(0, 6), beats: this.beats.filter((b) => b >= this.tSheet - 0.02), end: this.ctx.end }, K);
    const tex = new THREE.CanvasTexture(this.sheet.canvas);
    tex.colorSpace = THREE.NoColorSpace;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.anisotropy = 8;
    this.sheetMat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: SHEET_VERT, fragmentShader: `precision highp float;\n${GLSL_COMMON}\n${SHEET_FRAG}`,
      uniforms: {
        tex: { value: tex }, time: { value: 0 }, T0: { value: this.sheet.T0 }, T1: { value: this.sheet.T1 },
        flood: { value: 0 }, floodC: { value: new THREE.Vector2(CUBE.x, CUBE.y) }, gridK: { value: 1 },
      },
    });
    const geo = new THREE.PlaneGeometry(SHEET_W, SHEET_H).translate(SHEET_W / 2, -SHEET_H / 2, 0);
    const mesh = new THREE.Mesh(geo, this.sheetMat); mesh.frustumCulled = false;
    this.sheetScene.add(mesh);
    this.sheetBars = B.slice(0, 6);
  }
  private sheetBars: number[] = [];

  // ---------------------------------------------------------------- render
  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const t = f.t;
    if (t < this.tHook - 0.12) return this.renderTunnel(f, out);
    if (t < this.tSheet) return this.renderHook(f, out);
    return this.renderSheet(f, out);
  }

  // ---------------------------------------------------------------- 1. the tunnel
  private renderTunnel(f: Frame, out: THREE.WebGLRenderTarget) {
    const { renderer, comp } = this.ctx;
    const t = f.t, t0 = this.ctx.start, B = this.beats;
    const lb = this.lb3; lb.clear();
    const fx = this.fx; fx.clear();
    const L = this.ui; L.clear();
    const c = L.ctx;
    // camera: races down -z; roll snaps a little on every beat; the tunnel collapses at the end
    const z = this.camZ(t);
    let roll = 0;
    for (let k = 1; k < B.length && B[k]! <= t; k++) roll += (k % 2 ? 0.26 : -0.14) * ease.outExpo(clamp((t - B[k]!) / 0.28));
    const sway: V3 = [noise1(t * 0.9, 3) * 0.5, noise1(t * 0.8, 5) * 0.35, 0];
    const collapse = prog(t, this.tHook - 0.42, this.tHook - 0.14, ease.inCubic);
    const fov = lerp(58, 72, prog(t, B[9]!, this.tHook - 0.4, ease.inQuad)) - 20 * collapse;
    aim(this.cam, [sway[0], sway[1], z], [sway[0] * 0.3, sway[1] * 0.3, z - 50], roll, fov);
    const open = prog(t, t0 + 0.2, t0 + 0.55, ease.outExpo) * (1 - collapse);
    const lastBeat = B.filter((b) => b <= t).pop() ?? t0;
    const bone = lin('bone'), gold = lin('signal'), ash = lin('ash');
    // frames
    if (open > 0.001) {
      const j0 = Math.floor(-z / FRAME_DZ) - 1;
      const S = TUN * open;
      for (let j = j0; j < j0 + 64; j++) {
        const zz = -j * FRAME_DZ, d = z - zz;
        if (d < 0.3) continue;
        const fog = Math.exp(-d / 85) * clamp((d - 0.3) / 3);
        const ring = Math.exp(-Math.abs(d - (t - lastBeat) * 320) / 9) * Math.exp(-(t - lastBeat) * 2.2);
        const I = 0.55 * fog;
        const col: RGB = [bone[0] * I + gold[0] * ring * 2.4 * fog, bone[1] * I + gold[1] * ring * 2.4 * fog, bone[2] * I + gold[2] * ring * 2.4 * fog];
        const q: V3[] = [[-S, -S, zz], [S, -S, zz], [S, S, zz], [-S, S, zz]];
        for (let e = 0; e < 4; e++) { const a = q[e]!, b = q[(e + 1) % 4]!; lb.seg(a[0], a[1], a[2], b[0], b[1], b[2], 1.3, col[0], col[1], col[2], 1); }
        // ruler ticks along the frame (every 1 unit; longer every 5)
        const tk = 0.45 * fog;
        for (let u = -TUN + 1; u < TUN; u++) {
          const l = (u % 5 === 0 ? 0.5 : 0.22) * open, x = u * open;
          lb.seg(x, -S, zz, x, -S + l, zz, 1, ash[0] * tk, ash[1] * tk, ash[2] * tk, 1);
          lb.seg(x, S, zz, x, S - l, zz, 1, ash[0] * tk, ash[1] * tk, ash[2] * tk, 1);
          lb.seg(-S, x, zz, -S + l, x, zz, 1, ash[0] * tk, ash[1] * tk, ash[2] * tk, 1);
          lb.seg(S, x, zz, S - l, x, zz, 1, ash[0] * tk, ash[1] * tk, ash[2] * tk, 1);
        }
        // rails to the next frame
        const z2 = zz - FRAME_DZ, r = 0.3 * fog;
        for (const [x, y] of [[-S, -S], [S, -S], [S, S], [-S, S], [0, -S], [0, S], [-S, 0], [S, 0]] as [number, number][]) lb.seg(x, y, zz, x, y, z2, 1, bone[0] * r, bone[1] * r, bone[2] * r, 1);
      }
    }
    // the magic circle collapsing into the cursor (first frame: hook 3's sigil)
    const col0 = prog(t, t0, t0 + 0.3, ease.inQuart);
    if (col0 < 1) {
      const s = 3.1 * (1 - col0);
      const rot = (t - t0) * 1.2 + col0 * col0 * 5;
      this.drawModel(lb, this.sig, [0, 0, z - 6.2], s, [0.35, 0, rot], 1.2 + col0 * 1.5, 1);
    }
    // the objects
    for (const o of this.objs) {
      const lt0 = t - o.T;
      const dRel = lt0 < 0 ? 6.5 + (o.recap ? 55 : 30) * -lt0 : 6.5 - (o.recap ? 90 : 70) * lt0 * (1 + 6 * lt0);
      o.z = z - dRel;
      const d = dRel;
      if (d < -3 || d > 160) continue;
      const lt = t - o.T;
      const fog = Math.exp(-Math.max(0, d) / 70) * clamp((d + 3) / 3);
      // lettered parts (the tower's sign, the token) rock instead of spinning, so they never read mirrored
      const lettered = o.kind === 1 || o.kind === 4;
      const rot: V3 = lettered ? [0.25 * Math.sin(lt * 2.2), 0.55 * Math.sin(lt * 1.7 + o.kind), 0.15 * Math.sin(lt * 1.3)] : [o.spin[0] * lt + 0.4, o.spin[1] * lt + o.kind, o.spin[2] * lt];
      const hot = Math.exp(-Math.max(0, -lt) * 0) * Math.exp(-Math.abs(lt) * 6) * 0.8;
      this.drawModel(lb, this.models[o.kind]!, [o.x * open, o.y * open, o.z], o.s, rot, fog * (1 + hot), o.recap ? 0.8 : 1);
      if (!o.recap && lt > -0.3 && lt < 0.2) this.drawFig(c, o, lt);
    }
    renderer.setRenderTarget(this.rt3);
    renderer.setClearColor(0x000000, 1);
    renderer.clear(true, true, true);
    lb.render(renderer, this.rt3, this.cam);
    comp.draw(renderer, this.rt3.texture, out, { mode: 'replace' });
    // the cursor at the vanishing point: it leads the camera down the tunnel
    const vp = project(this.cam, [sway[0] * 0.3, sway[1] * 0.3, z - 400]);
    const flare = Math.exp(-Math.max(0, t - (t0 + 0.3)) * 5) * (t > t0 + 0.2 ? 1 : 0);
    cursorTip(fx, vp.x, vp.y, t, 0.6 + 1.6 * flare + 1.4 * collapse, 1);
    if (t > t0 + 0.24) weldSparks(fx, t, (tb) => (tb > t0 + 0.24 ? { x: vp.x, y: vp.y } : null), { rate: 70, speed: 240, life: 0.45, gravity: 200, seed: 5, intensity: 0.8 });
    this.drawTunnelNotes(c, t);
    fx.render(renderer, out);
    comp.draw(renderer, L.upload(), out);
    const kick = f.a.kick;
    const since = t - lastBeat;
    const sh = since < 0.2 ? 4 * Math.exp(-since * 18) : 0;
    return { bloom: 0.8, vignette: 0.5, grain: 0.06, halation: 0.3, ca: 1.6 + 2 * collapse, shake: [sh * Math.sin(t * 91), sh * Math.cos(t * 77)] as [number, number], zoom: 1 + 0.012 * kick };
  }

  /** Push a line-art model into the 3D batch: scale s, Euler rotation, colour gain I. */
  private drawModel(lb: LineBatch, m: Model, p: V3, s: number, r: V3, I: number, w = 1) {
    const [cx, sx] = [Math.cos(r[0]), Math.sin(r[0])], [cy, sy] = [Math.cos(r[1]), Math.sin(r[1])], [cz, sz] = [Math.cos(r[2]), Math.sin(r[2])];
    // R = Rz * Ry * Rx
    const m00 = cz * cy, m01 = cz * sy * sx - sz * cx, m02 = cz * sy * cx + sz * sx;
    const m10 = sz * cy, m11 = sz * sy * sx + cz * cx, m12 = sz * sy * cx - cz * sx;
    const m20 = -sy, m21 = cy * sx, m22 = cy * cx;
    const bone = lin('bone', 0.85 * I), gold = lin('signal', 1.9 * I), dim = lin('ash', 0.38 * I);
    const a = m.segs;
    for (let i = 0; i < m.n; i++) {
      const o = i * 7;
      const ax = a[o]!, ay = a[o + 1]!, az = a[o + 2]!, bx = a[o + 3]!, by = a[o + 4]!, bz = a[o + 5]!, k = a[o + 6]!;
      const col = k === 1 ? gold : k === 2 ? dim : bone;
      lb.seg(
        p[0] + s * (m00 * ax + m01 * ay + m02 * az), p[1] + s * (m10 * ax + m11 * ay + m12 * az), p[2] + s * (m20 * ax + m21 * ay + m22 * az),
        p[0] + s * (m00 * bx + m01 * by + m02 * bz), p[1] + s * (m10 * bx + m11 * by + m12 * bz), p[2] + s * (m20 * bx + m21 * by + m22 * bz),
        (k === 1 ? 1.8 : 1.25) * w, col[0], col[1], col[2], 1,
      );
    }
  }

  private drawFig(c: CanvasRenderingContext2D, o: Obj, lt: number) {
    const s = project(this.cam, [o.x, o.y + o.s * 1.05, o.z]);
    if (!s.on) return;
    const a = prog(lt, -0.3, -0.2) * (1 - prog(lt, 0.1, 0.2));
    const fig = this.figs[o.kind]!;
    const left = s.x > W / 2;
    const x = clamp(s.x + (left ? -40 : 40), 110, W - 110), y = clamp(s.y - 70, 120, H - 200);
    c.save();
    c.globalAlpha = a;
    c.textAlign = left ? 'right' : 'left';
    c.font = font(F.mono(600), 22);
    c.fillStyle = rgba('bone', 0.96);
    c.fillText(`FIG. ${String(o.kind + 1).padStart(2, '0')} — ${fig.name}`, x, y);
    c.font = font(F.mono(400), 16);
    c.fillStyle = rgba('ash', 0.9);
    c.fillText(fig.sub, x, y + 26);
    c.strokeStyle = rgba('bone', 0.5); c.lineWidth = 1;
    c.beginPath(); c.moveTo(x, y + 36); c.lineTo(x + (left ? -1 : 1) * 260, y + 36); c.stroke();
    c.restore();
  }

  private drawTunnelNotes(c: CanvasRenderingContext2D, t: number) {
    const t0 = this.ctx.start;
    const a = prog(t, t0 + 0.4, t0 + 0.6) * (1 - prog(t, this.tHook - 0.5, this.tHook - 0.3));
    if (a <= 0) return;
    const shown = this.objs.filter((o) => !o.recap && o.T <= t + 0.2).length;
    c.save();
    c.globalAlpha = a;
    c.font = font(F.mono(500), 15);
    c.letterSpacing = '3px';
    c.fillStyle = rgba('ash', 0.85);
    c.fillText('PARTS LIST', 120, H - 150);
    c.letterSpacing = '0px';
    c.font = font(F.mono(500), 15);
    for (let i = 0; i < 9; i++) {
      const on = i < shown;
      c.fillStyle = on ? rgba('bone', 0.9) : rgba('graphite', 0.9);
      c.fillText(`${String(i + 1).padStart(2, '0')}`, 120 + i * 38, H - 124);
      if (on) { c.fillStyle = rgba('signal', 1); c.fillRect(120 + i * 38, H - 116, 22, 2); }
    }
    const v = Math.abs(this.camZ(t + 0.01) - this.camZ(t)) / 0.01;
    c.fillStyle = rgba('ash', 0.85);
    c.fillText(`v = ${v.toFixed(0).padStart(3, ' ')} u/s   ·   frame ${String(Math.floor(-this.camZ(t) / FRAME_DZ)).padStart(3, '0')}`, 120, H - 92);
    c.restore();
  }

  // ---------------------------------------------------------------- 2. the last hook
  private hookCam(t: number): { pos: V3; tgt: V3; roll: number; fov: number } {
    const ws = this.hook.words;
    const [w0, w1, w2] = [ws[0]!, ws[1]!, ws[2]!];
    const yS = this.wordBoxes[0]!.y, yO = this.wordBoxes[1]!.y, yD = this.wordBoxes[2]!.y;
    const cutOn = w1.start - 0.06, cutDe = w2.start - 0.04, imp = w2.end;
    if (t < cutOn) {
      const k = prog(t, w0.start - 0.3, cutOn, ease.outCubic);
      return { pos: [lerp(-24, 10, k), yS - 8, lerp(175, 138, k)], tgt: [lerp(-4, 2, k), yS, 0], roll: lerp(0.06, -0.015, k), fov: 50 };
    }
    if (t < cutDe) {
      // whip down to ON, inside the sigil
      const k = prog(t, cutOn, cutOn + 0.18, ease.outExpo);
      return { pos: [lerp(30, 6, k), yO + lerp(18, 6, k), lerp(90, 62, k)], tgt: [0, yO, 0], roll: lerp(-0.2, -0.05, k), fov: 50 };
    }
    if (t < imp) {
      // crash out: the whole stack, DEMAND. held
      const k = prog(t, cutDe, cutDe + 0.4, ease.outExpo);
      const d = prog(t, cutDe + 0.4, imp, ease.linear);
      return { pos: [lerp(0, -18, d), lerp(yD + 2, 4, k), lerp(80, 205 + 12 * d, k)], tgt: [0, lerp(yD, 2.5, k), 0], roll: lerp(0.08, 0.02, k) - 0.02 * d, fov: 50 };
    }
    // implosion: push in on the block
    const k = prog(t, imp, this.tSheet, ease.inOutCubic);
    return { pos: [lerp(-18, 0, k), lerp(4, 2, k), lerp(217, 110, k)], tgt: [0, 2, 0], roll: lerp(0.0, 0, k), fov: 50 };
  }

  private renderHook(f: Frame, out: THREE.WebGLRenderTarget) {
    const { renderer, comp } = this.ctx;
    const t = f.t;
    const ws = this.hook.words;
    const [w0, w1, w2] = [ws[0]!, ws[1]!, ws[2]!];
    const cv = this.hookCam(t);
    aim(this.cam, cv.pos, cv.tgt, cv.roll, cv.fov);
    const u = this.blockMat.uniforms;
    u.time!.value = t;
    u.stretch!.value = 1 + 0.1 * prog(t, w2.start, w2.end, ease.outCubic);
    const imp = prog(t, w2.end, this.tSheet - 0.06, ease.inExpo);
    u.implode!.value = imp;
    renderer.setRenderTarget(this.rt3);
    renderer.setClearColor(0x000000, 1);
    renderer.clear(true, true, true);
    renderer.render(this.blocks, this.cam);
    // sigil around ON, orbit of lights around the stack, the final block
    const lb = this.lb3; lb.clear();
    const yO = this.wordBoxes[1]!.y;
    const sigA = prog(t, w1.start - 0.05, w1.start + 0.12, ease.outExpo) * (1 - imp);
    if (sigA > 0) this.drawModel(lb, this.sig, [0, yO, -10], 34 * lerp(1.6, 1, sigA), [0.3 + 0.1 * Math.sin(t), 0.2, t * 0.9], 0.5 * sigA, 1.3);
    const orbA = prog(t, w2.start, w2.start + 0.3) * (1 - imp);
    if (orbA > 0) {
      const g = lin('signal', 1.4 * orbA), e = lin('ember', 1.2 * orbA);
      for (let i = 0; i < 240; i++) {
        const a = (i / 240) * TAU + t * 0.7;
        const r = 128 + 6 * Math.sin(i * 1.7);
        const x = Math.cos(a) * r, zz = Math.sin(a) * r;
        const y = 2 + zz * 0.22 + Math.sin(i * 3.1) * 1.2;
        const c = i % 7 === 0 ? e : g;
        lb.seg(x, y, zz * 0.6, x + 0.01, y, zz * 0.6, i % 7 === 0 ? 4 : 2.4, c[0], c[1], c[2], 1);
      }
    }
    if (imp > 0.6) {
      // the unit block, assembled
      const k = prog(imp, 0.6, 1, ease.outCubic);
      const S = this.cubeHookS * 0.5 * k;
      const I = 1.2 + 2 * k;
      const col = lin('signal', I);
      // it turns to the three-quarter view it will have on the drawing
      const ry = -0.62 * k, rx = 0.55 * k, cy = Math.cos(ry), sy0 = Math.sin(ry), cx = Math.cos(rx), sx0 = Math.sin(rx);
      const v = (sx: number, sy: number, sz: number): V3 => {
        const x1 = sx * cy + sz * sy0, z1 = -sx * sy0 + sz * cy;
        const y2 = sy * cx - z1 * sx0, z2 = sy * sx0 + z1 * cx;
        return [x1 * S, 2 + y2 * S, z2 * S];
      };
      const E: [V3, V3][] = [];
      for (const a of [-1, 1]) for (const b of [-1, 1]) { E.push([v(-1, a, b), v(1, a, b)]); E.push([v(a, -1, b), v(a, 1, b)]); E.push([v(a, b, -1), v(a, b, 1)]); }
      for (const [p, q] of E) lb.seg(p[0], p[1], p[2], q[0], q[1], q[2], 3, col[0], col[1], col[2], 1);
    }
    lb.render(renderer, this.rt3, this.cam);
    comp.draw(renderer, this.rt3.texture, out, { mode: 'replace' });
    // the cursor: bursts the blocks out of the vanishing point, then welds DEMAND.
    const fx = this.fx; fx.clear();
    const L = this.ui; L.clear();
    if (t < w0.start) {
      const p = project(this.cam, [0, 2, -240]);
      cursorTip(fx, p.x, p.y, t, 2.2, 1);
    }
    if (t >= w2.start && t < w2.end + 0.1) {
      const b = this.demandBase;
      const headAt = (tb: number) => {
        if (tb < w2.start || tb > w2.end) return null;
        const k = prog(tb, w2.start, w2.end, ease.inOutQuad);
        const st = 1 + 0.1 * prog(tb, w2.start, w2.end, ease.outCubic);
        const q = project(this.cam, [lerp(b.x0, b.x1, k) * st, b.y, 1.2]);
        return q.on ? { x: q.x, y: q.y } : null;
      };
      weldSparks(fx, t, headAt, { rate: 220, speed: 320, life: 0.5, gravity: 800, seed: 13, intensity: 1.1 });
      const h = headAt(Math.min(t, w2.end));
      if (h) cursorTip(fx, h.x, h.y, t, 1.3, 1);
    }
    fx.render(renderer, out);
    this.drawHookNotes(L.ctx, t);
    comp.draw(renderer, L.upload(), out);
    // hits: one per sung word
    let sh: [number, number] = [0, 0], flash = 0;
    for (const w of ws) {
      const a = t - w.start;
      if (a >= 0 && a < 0.35) { const k = 16 * Math.exp(-a * 12); sh = [sh[0] + k * Math.sin(a * 97), sh[1] + k * Math.cos(a * 83)]; flash = Math.max(flash, 0.022 * Math.exp(-a * 22)); }
    }
    return { bloom: 0.85, vignette: 0.45, grain: 0.06, halation: 0.3, shake: sh, flash, zoom: 1 + 0.03 * Math.exp(-Math.max(0, t - w2.start) * 6) * (t > w2.start ? 1 : 0) };
  }

  private drawHookNotes(c: CanvasRenderingContext2D, t: number) {
    const ws = this.hook.words;
    const a = prog(t, ws[2]!.start + 0.15, ws[2]!.start + 0.3) * (1 - prog(t, ws[2]!.end, ws[2]!.end + 0.15));
    if (a <= 0) return;
    c.save();
    c.globalAlpha = a;
    c.font = font(F.mono(500), 16);
    c.fillStyle = rgba('ash', 0.9);
    c.fillText('FIG. 10 — SOFTWARE ON DEMAND, ALL AT ONCE', 120, H - 120);
    c.fillText('blocks: 3 words · 1 cursor · 0 meetings', 120, H - 96);
    c.restore();
  }

  // ---------------------------------------------------------------- 3. the drawing
  private sheetCam(t: number): { pos: V3; tgt: V3; roll: number; fov: number } {
    const B = this.sheetBars;
    const P = (x: number, y: number, z = 0): V3 => [x, -y, z];
    const orbit = (tg: V3, dist: number, az: number, el: number): V3 => [tg[0] + dist * Math.cos(el) * Math.sin(az), tg[1] - dist * Math.cos(el) * Math.cos(az), tg[2] + dist * Math.sin(el)];
    const cubeT = P(CUBE.x, CUBE.y, CUBE.s / 2);
    type Shot = { tg: V3; dist: number; az: number; el: number; roll: number; fov: number };
    const shot = (i: number, u: number): Shot => {
      if (i === 0) { // the block, then the views being drawn
        const tg: V3 = [lerp(cubeT[0], 700, ease.inOutCubic(u)), lerp(cubeT[1], -610, ease.inOutCubic(u)), lerp(cubeT[2], 40, u)];
        return { tg, dist: lerp(820, 1250, ease.inOutCubic(u)), az: lerp(-0.62, -0.28, u), el: lerp(0.62, 0.95, ease.inOutQuad(u)), roll: lerp(0.05, 0.02, u), fov: 34 };
      }
      if (i === 1) { // tracking along the title as it is typed
        const x = lerp(560, 780, ease.inOutQuad(u));
        return { tg: P(x, 215, 0), dist: lerp(1060, 1180, u), az: lerp(-0.2, 0.1, u), el: lerp(0.85, 0.95, u), roll: lerp(-0.04, 0.02, u), fov: 34 };
      }
      if (i === 2) { // over the views, dimensions ticking in
        return { tg: P(lerp(900, 1000, u), lerp(620, 590, u), 0), dist: lerp(900, 760, ease.inOutQuad(u)), az: lerp(0.3, 0.05, u), el: lerp(1.05, 1.2, u), roll: lerp(0.06, -0.02, u), fov: 34 };
      }
      if (i === 3) { // the title block
        return { tg: P(lerp(1500, 1580, u), lerp(860, 870, u), 0), dist: lerp(760, 690, u), az: lerp(-0.25, 0.08, u), el: lerp(1.0, 1.15, u), roll: lerp(-0.05, 0.01, u), fov: 34 };
      }
      if (i === 4) { // the notes (credits)
        return { tg: P(lerp(430, 520, ease.inOutQuad(u)), 950, 0), dist: lerp(860, 900, u), az: lerp(0.28, 0.1, u), el: lerp(1.0, 1.1, u), roll: lerp(0.03, -0.01, u), fov: 34 };
      }
      // the whole sheet, pulling back and levelling off
      const k = ease.outCubic(clamp(u * 1.6));
      return { tg: P(960, 548, 0), dist: lerp(1100, 1790 + 110 * u, k), az: lerp(0.18, 0.0, k), el: lerp(1.1, 1.4, k), roll: lerp(0.03, 0, k), fov: 34 };
    };
    let i = 0; for (let k = 0; k < B.length; k++) if (t >= B[k]! - 1e-4) i = k;
    const b0 = B[i]!, b1 = i < 5 ? B[i + 1]! : this.ctx.end;
    const u = clamp((t - b0) / (b1 - b0));
    let s = shot(i, u);
    // bars 2-5 arrive with a short, eased swing from the previous framing (no dead cuts)
    if (i > 0 && i < 5) {
      const prev = shot(i - 1, 1), k = ease.inOutCubic(prog(t, b0 - 0.02, b0 + 0.38));
      s = { tg: [lerp(prev.tg[0], s.tg[0], k), lerp(prev.tg[1], s.tg[1], k), lerp(prev.tg[2], s.tg[2], k)], dist: lerp(prev.dist, s.dist, k), az: lerp(prev.az, s.az, k), el: lerp(prev.el, s.el, k), roll: lerp(prev.roll, s.roll, k), fov: s.fov };
    } else if (i === 5) {
      const prev = shot(4, 1), k = ease.inOutCubic(prog(t, b0, b0 + 1.1));
      s = { tg: [lerp(prev.tg[0], s.tg[0], k), lerp(prev.tg[1], s.tg[1], k), lerp(prev.tg[2], s.tg[2], k)], dist: lerp(prev.dist, s.dist, k), az: lerp(prev.az, s.az, k), el: lerp(prev.el, s.el, k), roll: lerp(prev.roll, s.roll, k), fov: s.fov };
    }
    const drift: V3 = [noise1(t * 0.5, 21) * 12, noise1(t * 0.45, 22) * 9, 0];
    const tg: V3 = [s.tg[0] + drift[0], s.tg[1] + drift[1], s.tg[2]];
    return { pos: orbit(tg, s.dist, s.az, s.el), tgt: tg, roll: s.roll, fov: s.fov };
  }

  private renderSheet(f: Frame, out: THREE.WebGLRenderTarget) {
    const { renderer, comp } = this.ctx;
    const t = f.t;
    const B = this.sheetBars;
    const cv = this.sheetCam(t);
    aim(this.cam, cv.pos, cv.tgt, cv.roll, cv.fov, [0, 0, 1]);
    const u = this.sheetMat.uniforms;
    u.time!.value = t;
    u.flood!.value = t < B[0]! + 0.8 ? 180 + 2600 * ease.outCubic(prog(t, B[0]!, B[0]! + 0.8)) : 1e5;
    u.gridK!.value = prog(t, B[0]! + 0.1, B[0]! + 0.7);
    renderer.setRenderTarget(this.rt3);
    renderer.setClearColor(0x000000, 1);
    renderer.clear(true, true, true);
    renderer.render(this.sheetScene, this.cam);
    // lines on the paper, and the block standing on it
    const lb = this.sheetLb; lb.clear();
    this.drawSheetLines(lb, t);
    this.drawCube(lb, t);
    lb.render(renderer, this.rt3, this.cam);
    comp.draw(renderer, this.rt3.texture, out, { mode: 'replace' });
    // the cursor
    const fx = this.fx; fx.clear();
    const pe = penAt(this.sheet.pens, t);
    if (pe) {
      const w = (p: V3): V3 => [p[0], -p[1], p[2] + 0.5];
      if (pe.caret > 0) {
        const top = project(this.cam, w(pe.p)), bot = project(this.cam, w([pe.p[0], pe.p[1] + pe.caret * 1.18, pe.p[2]]));
        const idle = !pe.drawing || t > B[5]! + 0.2;
        const on = idle ? cursorBlink(f.beatPhase) : 1;
        if (top.on) cursorCaret(fx, top.x, top.y, Math.max(6, bot.y - top.y), on, t);
      } else {
        const p = project(this.cam, w(pe.p));
        if (p.on) {
          cursorTip(fx, p.x, p.y, t, pe.drawing ? 0.8 : 0.6, 1);
          if (pe.drawing) weldSparks(fx, t, (tb) => { const q = penAt(this.sheet.pens, tb); if (!q || !q.drawing || q.caret > 0) return null; const s = project(this.cam, w(q.p)); return s.on ? { x: s.x, y: s.y } : null; }, { rate: 90, speed: 150, life: 0.3, gravity: 380, seed: 17, intensity: 0.7 });
        }
      }
    }
    fx.render(renderer, out);
    const since = t - B[0]!;
    const fade = prog(t, this.ctx.end - 2.1, this.ctx.end - 0.04, ease.inOutQuad);
    return { bloom: 0.55, bloomThreshold: 0.9, vignette: 0.38, grain: 0.05, halation: 0.18, flash: since < 0.1 ? 0.025 * (1 - since / 0.1) : 0, fade };
  }

  private drawSheetLines(lb: LineBatch, t: number) {
    const bone = lin('bone', 0.8), dim = lin('bone', 0.4), hot = lin('signal', 1.8);
    for (const L of this.sheet.lines) {
      if (t < L.t0) continue;
      const u = clamp((t - L.t0) / Math.max(1e-3, L.t1 - L.t0));
      const age = t - L.t1;
      const base = L.k === 2 ? dim : bone;
      const k = clamp(age / 0.35);
      const col: RGB = [lerp(hot[0], base[0], k), lerp(hot[1], base[1], k), lerp(hot[2], base[2], k)];
      const ax = L.a[0], ay = -L.a[1], bx = L.b[0], by = -L.b[1];
      if (!L.dash) { lb.seg(ax, ay, 0.3, lerp(ax, bx, u), lerp(ay, by, u), 0.3, L.w, col[0], col[1], col[2], 1); continue; }
      const len = Math.hypot(bx - ax, by - ay), [on, off] = L.dash;
      for (let s = 0; s < len * u; s += on + off) {
        const e = Math.min(s + on, len * u);
        lb.seg(ax + ((bx - ax) * s) / len, ay + ((by - ay) * s) / len, 0.3, ax + ((bx - ax) * e) / len, ay + ((by - ay) * e) / len, 0.3, L.w, col[0], col[1], col[2], 1);
        if (off > 4 && s + on + 2 < len * u) { const m = s + on + off / 2; lb.seg(ax + ((bx - ax) * m) / len, ay + ((by - ay) * m) / len, 0.3, ax + ((bx - ax) * (m + 0.5)) / len, ay + ((by - ay) * (m + 0.5)) / len, 0.3, L.w, col[0], col[1], col[2], 1); }
      }
    }
  }

  /** The unit block standing on the sheet: arrives white-hot from the hook, cools to bone; hatched faces. */
  private drawCube(lb: LineBatch, t: number) {
    const B = this.sheetBars;
    const s = CUBE.s, x0 = CUBE.x - s / 2, x1 = CUBE.x + s / 2, y0 = -(CUBE.y - s / 2), y1 = -(CUBE.y + s / 2);
    const k = clamp((t - B[0]!) / 0.6);
    const hot = lin("signal", lerp(2.2, 0.0, k)), bone = lin("bone", lerp(0.4, 0.8, k));
    const col: RGB = [hot[0] + bone[0], hot[1] + bone[1], hot[2] + bone[2]];
    const v = (x: number, y: number, z: number): V3 => [x, y, z];
    const E: [V3, V3][] = [];
    for (const z of [0, s]) { E.push([v(x0, y0, z), v(x1, y0, z)], [v(x1, y0, z), v(x1, y1, z)], [v(x1, y1, z), v(x0, y1, z)], [v(x0, y1, z), v(x0, y0, z)]); }
    for (const [x, y] of [[x0, y0], [x1, y0], [x1, y1], [x0, y1]] as [number, number][]) E.push([v(x, y, 0), v(x, y, s)]);
    for (const [p, q] of E) lb.seg(p[0], p[1], p[2], q[0], q[1], q[2], 3.2, col[0], col[1], col[2], 1);
    // section hatch on the front face (y = y1) and the top, drawn in after the block cools
    const hk = prog(t, B[0]! + 0.5, B[0]! + 1.3);
    const g = lin('bone', 0.35);
    const n = 14;
    for (let i = 1; i < n; i++) {
      if (i / n > hk) break;
      const a = (i / n) * s;
      lb.seg(x0 + a, y1, 0, x0, y1, a, 1.4, g[0], g[1], g[2], 1);
      lb.seg(x1, y1, a, x0 + a, y1, s, 1.4, g[0], g[1], g[2], 1);
    }
    // its shadow on the paper, offset (ink)
    void x1;
  }
}

export type { SheetLine, PenEvent };
