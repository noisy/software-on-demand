// A1 `boot` — "Hello, builder" (12.10 – 27.79 s, instrumental build).
// First frame = open's last: Clarke's sentence as one terminal line, the cursor at its end, seen straight
// down — the terminal is a giant printout lying on the floor of the world. Enter; `build` is typed on the
// 8ths (each keystroke throws a run of plinth slabs into place) while the camera cranes off the page. Then
// B·U·I·L·D·E·R·S, one letter per beat: every keystroke launches that letter's voxels from the typed glyph,
// arcing white-hot into the giant title, bottom row first; the camera orbits and cuts on every other beat.
// 17.97 (Enter, the downbeat): SLAM — the exploded voxels snap tight, flash, shake, a ring and a dust of
// blocks. Then it keeps transforming: a push into the B's counter and through it (the drums enter), the
// voxels peel off letter by letter and re-stack into grey towers (low chase along the baseline, top-down
// over the plan, a crane up a street between the towers) while the old world's city rises around them in
// rings on the kicks. Last beat: the cursor sweeps the frame as a tall gold line and every tower flips to
// bone-on-cobalt blueprint outlines — the paper `oldworld` is drawn on.
import * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '../engine/scene';
import { FSPass, Layer2D, W, H } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { LIN, rgba } from '../engine/palette';
import { F, font, glyphX, layout, measure } from '../engine/type';
import { clamp, ease, hash, lerp, prog, pulse, smoothstep, springStep, TAU, frameIdx } from '../engine/util';
import { cursorBlink, cursorTip, weldSparks } from './_motifs';
import { TERM, drawQuoteRow, quoteLine, toScreen, applyRig, beatsIn, snapBeat, lerpRig, type Rig, type QuoteLine, type RGB } from './boot-kit';
import { BlockSet, blockMaterial, quatAxis } from './boot-blocks';

// ---- world layout (1 unit = one block) ----
const TPX = 0.1; // world units per terminal px (the terminal printout is 192 x 108 units, lying on y = 0)
const tx = (px: number) => px * TPX - 96;
const tz = (py: number) => py * TPX - 54;
const ZT = -24; // front face of the title
const DT = 3; // title depth (voxels)
const CAP = 18; // title cap height (voxels)
const Y0 = 1; // the title stands on a one-block plinth
const LOT = 8, TW = 4; // downtown lot pitch and tower width (voxels)
const DZ0 = -38; // downtown front row
const DT_COLS = 5, DT_ROWS = 4; // downtown lots: columns either side of x = 0, rows back from DZ0
const FOV0 = 40;
const DIST0 = 54 / Math.tan((FOV0 * Math.PI) / 360); // top-down distance at which the printout fills the frame

const TITLE = 'BUILDERS';
const PROMPT = '> ';
const CMD = 'build ';
const CMD2 = 'restack --as skyline';

interface Tower { x: number; z: number; w: number; d: number; h: number; tRise: number; ring: number }
interface Cam { pos: THREE.Vector3; look: THREE.Vector3; up: THREE.Vector3; fov: number; roll: number }

export default class Boot extends Scene {
  cam = new THREE.PerspectiveCamera(FOV0, W / H, 0.05, 4000);
  bg = new FSPass(/* glsl */ `
    uniform float wipe; uniform float t;
    void main() {
      vec2 px = vec2(vUv.x, 1.0 - vUv.y) * vec2(1920.0, 1080.0);
      vec2 p = (vUv - 0.5) * vec2(16.0 / 9.0, 1.0);
      float n = snoise(vec3(p * 1.4, t * 0.05)) * 0.5 + 0.5;
      vec3 ink = C_INK * (0.92 + 0.12 * n) + C_INK2 * 0.22 * smoothstep(1.0, 0.0, length(p + vec2(0.0, 0.25)));
      // cyanotype paper: cobalt with a soft fibre mottling
      float m = fbm(p * 5.0 + 3.1, 4) * 0.5 + 0.5;
      vec3 paper = C_COBALT * (0.82 + 0.3 * m) + C_COBALT * 0.25 * smoothstep(1.1, 0.0, length(p));
      float k = smoothstep(wipe - 30.0, wipe + 30.0, px.x);
      fragColor = vec4(mix(paper, ink, k), 1.0);
    }`, { wipe: { value: -100 }, t: { value: 0 } });
  world = new THREE.Scene();
  blocks!: BlockSet; // title voxels (build + restack)
  boxes!: BlockSet; // plinth slabs, downtown slabs, city towers
  dust!: BlockSet;
  termMesh!: THREE.Mesh;
  term = new Layer2D();
  lines = new LineBatch(40000, { screen2D: false, blend: 'add', depthTest: true });
  fx = new LineBatch(12000, { blend: 'add' });
  hud = new Layer2D();

  private q!: QuoteLine;
  // title voxels (struct of arrays)
  private N = 0;
  private vx!: Float32Array; private vy!: Float32Array; private vz!: Float32Array; // slot
  private vl!: Uint8Array; // letter
  private tl!: Float32Array; private fd!: Float32Array; // launch time, flight duration
  private sx!: Float32Array; private sz!: Float32Array; // source on the printout
  private ax!: Float32Array; private ay!: Float32Array; private az!: Float32Array; private spin!: Float32Array;
  private rx!: Float32Array; private ry!: Float32Array; private rz!: Float32Array; // restack slot
  private rt!: Uint16Array; private td!: Float32Array; private fd2!: Float32Array;
  private letterN: number[] = [];
  private letterX: number[] = [];
  private letterTop: number[] = [];
  private letterDone: number[] = [];
  private X0 = 0; private X1 = 0;
  private counter = new THREE.Vector3();
  // plinth
  private plinth: { x: number; z: number; t: number; src: number }[] = [];
  // towers
  private down: (Tower & { done: number })[] = [];
  private city: Tower[] = [];
  private podiums: { x: number; z: number; w: number }[] = [];
  // times
  private kEnter = 12.56; private kBuild: number[] = []; private kLetter: number[] = []; private kSlam = 17.97;
  private kCmd2: number[] = [];
  private tSwap = 23.87; private tFlip0 = 27.31; private tFlip1 = 27.72;
  private cuts: number[] = [];
  private keysAll: number[] = [];
  private kicks: number[] = [];
  private termKey = '';
  private q4 = [0, 0, 0, 1];

  override async init() {
    const { lyrics, audio } = this.ctx;
    this.q = quoteLine(lyrics.get('Any sufficiently').text);
    const t0 = this.ctx.start, t1 = this.ctx.end;
    const downs = audio.downbeats.filter((d) => d > t0 - 0.2 && d < t1 + 0.2);
    const D = (i: number) => downs[i] ?? t0 + i * 1.95;
    // ---- keystrokes on the grid ----
    this.kEnter = snapBeat(audio, t0 + 0.45);
    const b0 = audio.beatAt(this.kEnter);
    for (let j = 0; j < CMD.length; j++) this.kBuild.push(audio.timeOfBeat(b0 + 0.5 * (j + 1) - (j === CMD.length - 1 ? 0.25 : 0)));
    const dB = D(1); // 14.05
    const bB = audio.beatAt(dB);
    for (let j = 0; j < TITLE.length; j++) this.kLetter.push(audio.timeOfBeat(bB + j));
    this.kSlam = D(3); // 17.97
    const bS = audio.beatAt(this.kSlam);
    for (let j = 0; j < CMD2.length; j++) this.kCmd2.push(audio.timeOfBeat(bS + 2 + j * 0.25));
    this.cuts = [t0, dB, audio.timeOfBeat(bB + 2), D(2), audio.timeOfBeat(bB + 6), audio.timeOfBeat(bB + 7), this.kSlam, audio.timeOfBeat(bS + 2.4), D(4), D(5), D(6), D(7), t1];
    this.tSwap = D(6);
    this.tFlip1 = t1 - 0.07;
    this.tFlip0 = audio.timeOfBeat(audio.beatAt(t1) - 1);
    this.keysAll = [this.kEnter, ...this.kBuild, ...this.kLetter, this.kSlam, ...this.kCmd2];
    this.kicks = audio.events('kick', t0, t1).filter((e) => e[1] > 0.3).map((e) => e[0]);

    this.buildTitle();
    this.buildTowers();

    const mat = blockMaterial();
    this.blocks = new BlockSet(this.N + 16, mat);
    this.boxes = new BlockSet(this.plinth.length + this.down.length + this.city.length + 16, mat);
    this.dust = new BlockSet(400, mat);
    this.world.add(this.blocks.mesh, this.boxes.mesh, this.dust.mesh);
    // the printout on the floor
    const geo = new THREE.PlaneGeometry(192, 108);
    geo.rotateX(-Math.PI / 2);
    this.termMesh = new THREE.Mesh(geo, new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: `precision highp float; in vec3 position; in vec2 uv; uniform mat4 projectionMatrix; uniform mat4 modelViewMatrix; out vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `precision highp float; in vec2 vUv; out vec4 fragColor; uniform sampler2D map; uniform float opacity;
        void main() { vec4 c = texture(map, vUv); fragColor = vec4(c.rgb * c.a, c.a) * opacity; }`,
      uniforms: { map: { value: this.term.texture }, opacity: { value: 1 } },
      transparent: true, depthTest: true, depthWrite: false,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    }));
    this.termMesh.position.set(0, 0.01, 0);
    this.termMesh.renderOrder = 10;
    this.termMesh.frustumCulled = false;
    this.world.add(this.termMesh);
  }

  // ------------------------------------------------------------------ geometry
  private buildTitle() {
    const fam = F.archivo(112, 900);
    const R = 12; // raster px per voxel
    const probe = 200;
    const c0 = document.createElement('canvas').getContext('2d')!;
    c0.font = font(fam, probe);
    const capR = c0.measureText('H').actualBoundingBoxAscent / probe;
    const size = (CAP * R) / capR;
    const trk = R * 1.0;
    const lay = layout(TITLE, fam, size, trk);
    const pad = R * 2;
    const cw = Math.ceil(lay.width + pad * 2), ch = Math.ceil(size * 1.2 + pad * 2);
    const cv = document.createElement('canvas');
    cv.width = cw; cv.height = ch;
    const c = cv.getContext('2d', { willReadFrequently: true })!;
    c.font = font(fam, size);
    c.fillStyle = '#fff';
    c.textBaseline = 'alphabetic';
    const base = pad + size * 0.95;
    for (const g of lay.glyphs) c.fillText(g.ch, pad + g.x, base);
    const img = c.getImageData(0, 0, cw, ch).data;
    const cov = (px: number, py: number) => {
      let s = 0;
      for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) {
        const x = Math.min(cw - 1, Math.max(0, Math.round(px + (a - 1) * R * 0.3))), y = Math.min(ch - 1, Math.max(0, Math.round(py + (b - 1) * R * 0.3)));
        s += img[(y * cw + x) * 4 + 3]! / 255;
      }
      return s / 9;
    };
    const cols = Math.ceil((lay.width + pad) / R);
    const rowsUp = CAP + 1, rowsDown = 1;
    const cells: { c: number; r: number; l: number }[] = [];
    const grid = new Map<string, number>();
    for (let col = 0; col < cols; col++) {
      const px = pad + (col + 0.5) * R - R * 0.5;
      let l = -1;
      for (const g of lay.glyphs) if (px - pad >= g.x - trk * 0.5 && px - pad < g.x + g.w + trk * 0.5) l = g.i;
      if (l < 0) continue;
      for (let r = -rowsDown; r < rowsUp; r++) {
        const py = base - (r + 0.5) * R;
        if (cov(px, py) > 0.5) { cells.push({ c: col, r, l }); grid.set(`${col},${r}`, l); }
      }
    }
    const minC = Math.min(...cells.map((x) => x.c)), maxC = Math.max(...cells.map((x) => x.c));
    const minR = Math.min(...cells.map((x) => x.r));
    const cx0 = -(maxC - minC + 1) / 2;
    const X = (col: number) => cx0 + (col - minC) + 0.5;
    const Y = (r: number) => Y0 + (r - minR) + 0.5;
    this.X0 = cx0; this.X1 = cx0 + (maxC - minC + 1);

    // counters of the B: empty cells enclosed within its columns (flood fill from the outside)
    {
      const bc = cells.filter((x) => x.l === 0);
      const c0b = Math.min(...bc.map((x) => x.c)), c1b = Math.max(...bc.map((x) => x.c));
      const r0 = Math.min(...bc.map((x) => x.r)), r1 = Math.max(...bc.map((x) => x.r));
      const out = new Set<string>();
      const st: [number, number][] = [];
      for (let cc = c0b - 1; cc <= c1b + 1; cc++) { st.push([cc, r0 - 1], [cc, r1 + 1]); }
      for (let rr = r0 - 1; rr <= r1 + 1; rr++) { st.push([c0b - 1, rr], [c1b + 1, rr]); }
      while (st.length) {
        const [cc, rr] = st.pop()!;
        const k = `${cc},${rr}`;
        if (cc < c0b - 1 || cc > c1b + 1 || rr < r0 - 1 || rr > r1 + 1 || out.has(k) || grid.get(k) === 0) continue;
        out.add(k);
        st.push([cc + 1, rr], [cc - 1, rr], [cc, rr + 1], [cc, rr - 1]);
      }
      const inner: [number, number][] = [];
      for (let cc = c0b; cc <= c1b; cc++) for (let rr = r0; rr <= r1; rr++) if (grid.get(`${cc},${rr}`) !== 0 && !out.has(`${cc},${rr}`)) inner.push([cc, rr]);
      const upper = inner.filter((p) => p[1] > (r0 + r1) / 2);
      const use = upper.length ? upper : inner.length ? inner : [[(c0b + c1b) / 2, (r0 + r1) * 0.7] as [number, number]];
      const mc = use.reduce((a, p) => a + p[0], 0) / use.length, mr = use.reduce((a, p) => a + p[1], 0) / use.length;
      this.counter.set(X(mc), Y(mr), ZT - DT / 2);
    }

    // voxels: cells x depth
    const vox: { x: number; y: number; z: number; l: number; r: number; h: number }[] = [];
    for (const cl of cells) for (let k = 0; k < DT; k++) vox.push({ x: X(cl.c), y: Y(cl.r), z: ZT - k - 0.5, l: cl.l, r: cl.r - minR, h: hash(cl.c, cl.r, k, 7) });
    const N = (this.N = vox.length);
    this.vx = new Float32Array(N); this.vy = new Float32Array(N); this.vz = new Float32Array(N);
    this.vl = new Uint8Array(N); this.tl = new Float32Array(N); this.fd = new Float32Array(N);
    this.sx = new Float32Array(N); this.sz = new Float32Array(N);
    this.ax = new Float32Array(N); this.ay = new Float32Array(N); this.az = new Float32Array(N); this.spin = new Float32Array(N);
    this.rx = new Float32Array(N); this.ry = new Float32Array(N); this.rz = new Float32Array(N);
    this.rt = new Uint16Array(N); this.td = new Float32Array(N); this.fd2 = new Float32Array(N);
    const nL = TITLE.length;
    this.letterN = new Array(nL).fill(0); this.letterX = new Array(nL).fill(0); this.letterTop = new Array(nL).fill(0);
    this.letterDone = new Array(nL).fill(0);
    const q = this.q;
    const promptX = q.x0;
    const charPx = measure('M', TERM.fam(), TERM.size);
    // launch order within a letter: bottom row first, a little shuffle
    const byL: number[][] = Array.from({ length: nL }, () => []);
    vox.forEach((v, i) => byL[v.l]!.push(i));
    for (let l = 0; l < nL; l++) {
      const ids = byL[l]!.sort((a, b) => (vox[a]!.r + vox[a]!.h * 1.6) - (vox[b]!.r + vox[b]!.h * 1.6));
      const k = this.kLetter[l]!;
      const win = Math.min(0.78, this.kSlam - 0.03 - k);
      const spread = win * 0.42, fl = win * 0.5;
      const srcX = tx(promptX + glyphX(PROMPT + CMD + TITLE, PROMPT.length + CMD.length + l, TERM.fam(), TERM.size) + charPx / 2);
      ids.forEach((i, j) => {
        const v = vox[i]!;
        this.vx[i] = v.x; this.vy[i] = v.y; this.vz[i] = v.z; this.vl[i] = l;
        this.tl[i] = k + 0.02 + (j / Math.max(1, ids.length - 1)) * spread;
        this.fd[i] = fl * (0.85 + 0.3 * hash(i, 3));
        this.sx[i] = srcX + (hash(i, 4) - 0.5) * 1.4;
        this.sz[i] = tz(TERM.promptBase) + (hash(i, 5) - 0.5) * 1.2;
        const a = hash(i, 6) * TAU, b = Math.acos(2 * hash(i, 8) - 1);
        this.ax[i] = Math.sin(b) * Math.cos(a); this.ay[i] = Math.sin(b) * Math.sin(a); this.az[i] = Math.cos(b);
        this.spin[i] = (hash(i, 9) - 0.5) * TAU * 3;
        this.letterN[l]!++;
        this.letterX[l]! += v.x;
        this.letterTop[l] = Math.max(this.letterTop[l]!, v.y + 0.5);
        this.letterDone[l] = Math.max(this.letterDone[l]!, this.tl[i]! + this.fd[i]!);
      });
      this.letterX[l]! /= Math.max(1, ids.length);
    }
    // plinth slabs (2 x 1 x 2), one run per keystroke of `build`
    const pw = 2;
    const px0 = this.X0 - 3, px1 = this.X1 + 3;
    const nx = Math.ceil((px1 - px0) / pw);
    const nz = Math.ceil((DT + 3) / pw);
    const nk = this.kBuild.length;
    const srcBase = promptX + glyphX(PROMPT + CMD, PROMPT.length, TERM.fam(), TERM.size);
    for (let ix = 0; ix < nx; ix++) for (let iz = 0; iz < nz; iz++) {
      const key = Math.min(nk - 1, Math.floor((ix / nx) * nk));
      const kt = this.kBuild[key]!;
      this.plinth.push({
        x: px0 + (ix + 0.5) * pw, z: ZT + 1.5 - (iz + 0.5) * pw,
        t: kt + 0.02 + (((ix / nx) * nk) % 1) * 0.16 + hash(ix, iz, 2) * 0.05,
        src: tx(srcBase + (key + 0.5) * charPx),
      });
    }
  }

  private buildTowers() {
    const { audio } = this.ctx;
    // downtown: towers of 3x3 voxels on a lot grid behind the title; heights use every voxel of the title
    const lots: { x: number; z: number; w: number }[] = [];
    for (let i = -DT_COLS; i <= DT_COLS; i++) for (let j = 0; j < DT_ROWS; j++) {
      const w = 1 - Math.abs(i) / (DT_COLS + 1) + (j === 1 || j === 2 ? 0.3 : 0);
      lots.push({ x: i * LOT, z: DZ0 - j * LOT - TW / 2, w });
    }
    let nT = Math.max(12, Math.min(lots.length, Math.round(this.N / (TW * TW * 26))));
    lots.sort((a, b) => (hash(a.x, a.z, 4) * 0.8 - a.w) - (hash(b.x, b.z, 4) * 0.8 - b.w));
    const use = lots.slice(0, nT).sort((a, b) => a.x - b.x || b.z - a.z);
    this.podiums = lots.slice(nT);
    nT = use.length;
    const wts = use.map((l, i) => 0.25 + l.w * l.w + 0.8 * hash(i, 77) ** 2);
    const floorsTot = Math.floor(this.N / (TW * TW));
    const sw = wts.reduce((a, b) => a + b, 0);
    const hs = wts.map((w) => Math.max(4, Math.floor((w / sw) * floorsTot)));
    let left = floorsTot - hs.reduce((a, b) => a + b, 0);
    for (let i = 0; left > 0; i = (i + 1) % nT, left--) hs[i]!++;
    // slots (tower, floor, cell) in tower order, voxels sorted by x (then y) -> nearby letters feed nearby towers
    const order = Array.from({ length: this.N }, (_, i) => i).sort((a, b) => this.vx[a]! - this.vx[b]! || this.vy[a]! - this.vy[b]!);
    const bS = audio.beatAt(this.kSlam);
    const dep0 = audio.timeOfBeat(bS + 2.4); // the drums' pickup
    const depEnd = this.tSwap - 1.25;
    let k = 0;
    use.forEach((l, ti) => {
      const h = hs[ti]!;
      const tDep = lerp(dep0, depEnd, ti / Math.max(1, nT - 1));
      let done = 0;
      for (let f = 0; f < h; f++) for (let cc = 0; cc < TW * TW && k < this.N; cc++) {
        const i = order[k++]!;
        this.rx[i] = l.x - TW / 2 + (cc % TW) + 0.5;
        this.rz[i] = l.z - TW / 2 + Math.floor(cc / TW) + 0.5;
        this.ry[i] = f + 0.5;
        this.rt[i] = ti;
        this.td[i] = tDep + (f / h) * 0.5 + hash(i, 12) * 0.08;
        this.fd2[i] = 0.5 + hash(i, 13) * 0.15;
        done = Math.max(done, this.td[i]! + this.fd2[i]!);
      }
      this.down.push({ x: l.x, z: l.z, w: TW, d: TW, h, tRise: tDep, ring: 0, done });
    });
    // leftover voxels (less than one floor) crown the last tower
    while (k < this.N) {
      const i = order[k++]!, T = this.down[this.down.length - 1]!;
      this.rx[i] = T.x - 1 + (k % 3); this.rz[i] = T.z; this.ry[i] = T.h + 0.5; this.rt[i] = this.down.length - 1;
      this.td[i] = T.tRise + 0.5; this.fd2[i] = 0.5;
    }
    // the city of the old world: lots on a coarse grid, rising in rings on the kicks
    const kicks = beatsIn(audio, this.kSlam + 1.9, this.tFlip0 - 0.2);
    for (let gx = -26; gx <= 26; gx++) for (let gz = -46; gz <= 5; gz++) {
      const x = gx * 16 + (hash(gx, gz, 1) - 0.5) * 2, z = gz * 16 + (hash(gx, gz, 2) - 0.5) * 2;
      if (Math.abs(x) < (DT_COLS + 1) * LOT + 6 && z > DZ0 - DT_ROWS * LOT - 10 && z < DZ0 + 6) continue; // downtown
      if (Math.abs(x) < 16 && z > DZ0 - DT_ROWS * LOT - 10) continue; // the avenue into downtown
      const onPage = Math.abs(x) < 104 && z > -64; // the printout (and the title): built over once the title is gone
      const r = Math.hypot(x * 0.8, (z + 60) * 1.0);
      if (hash(gx, gz, 3) > 0.8 - r / 1400) continue;
      const w = 7 + Math.floor(hash(gx, gz, 4) * 6), d = 7 + Math.floor(hash(gx, gz, 5) * 6);
      const fall = Math.exp(-r / 220);
      const h = Math.max(2, Math.round(2 + 7 * hash(gx, gz, 7) + 20 * fall * hash(gx, gz, 6) ** 2.2));
      const ring = Math.floor(r / 55);
      const late = kicks.filter((k) => k >= this.tSwap - 0.05);
      const tRise = onPage ? late[Math.min(late.length - 1, Math.floor(r / 40))] ?? this.tSwap : kicks[Math.min(kicks.length - 1, ring)] ?? this.tSwap;
      this.city.push({ x, z, w, d, h, tRise: tRise + hash(gx, gz, 8) * 0.12, ring });
    }
    for (const p of this.podiums) {
      const h = 2 + Math.round(6 * hash(p.x, p.z, 9) ** 1.5);
      // the podiums come up behind the title on the drums' pickup, row by row away from it
      const tRise = this.cuts[7]! + 0.1 + ((DZ0 - p.z) / (DT_ROWS * LOT)) * 0.5 + hash(p.x, p.z, 10) * 0.12;
      this.city.push({ x: p.x, z: p.z, w: TW + 1, d: TW + 1, h, tRise, ring: 0 });
    }
  }

  // ------------------------------------------------------------------ camera
  private shot(t: number): { i: number; lt: number; u: number } {
    let i = 0;
    for (let k = 0; k < this.cuts.length - 1; k++) if (t >= this.cuts[k]!) i = k;
    const a = this.cuts[i]!, b = this.cuts[i + 1]!;
    return { i, lt: t - a, u: clamp((t - a) / (b - a)) };
  }

  private camAt(t: number): Rig | Cam {
    const { i, u } = this.shot(t);
    const LX = this.letterX, ZC = ZT - DT / 2;
    const P2 = Math.PI / 2;
    const io = ease.inOutCubic, oq = ease.outQuad;
    switch (i) {
      case 0: { // top-down on the printout, then crane off the page
        const k = prog(t, this.kBuild[0]! + 0.1, this.cuts[1]!, io);
        const drift = prog(t, this.cuts[0]!, this.kBuild[0]! + 0.3, ease.inOutQuad);
        return { tx: lerp(0, -18, k), ty: lerp(0, 7, k), tz: lerp(0, -14, k), yaw: lerp(0.0, -0.62, k) + 0.035 * drift * (1 - k), pitch: lerp(P2, 0.42, k),
          dist: lerp(DIST0 - 7 * drift, 98, k), fov: FOV0, roll: 0.015 * drift * (1 - k) };
      }
      case 1: return { tx: lerp(LX[0]! + 6, (LX[0]! + LX[1]!) / 2 + 2, io(u)), ty: 8, tz: ZC + 4, yaw: lerp(-0.62, -0.78, oq(u)), pitch: lerp(0.2, 0.14, u), dist: lerp(74, 56, oq(u)), fov: 38, roll: -0.03 };
      case 2: return { tx: lerp(LX[2]!, LX[3]! + 4, u), ty: 6, tz: ZC, yaw: lerp(0.62, 0.42, oq(u)), pitch: lerp(0.66, 0.54, u), dist: lerp(104, 90, oq(u)), fov: 38, roll: 0.02 };
      case 3: return { tx: lerp(LX[4]! - 8, LX[5]! + 2, io(u)), ty: 10, tz: ZT, yaw: lerp(0.42, 0.3, u), pitch: lerp(0.04, 0.09, u), dist: lerp(36, 30, u), fov: 42, roll: -0.025 };
      case 4: return { tx: LX[6]!, ty: 8, tz: ZC - 2, yaw: lerp(-0.36, -0.28, u), pitch: lerp(0.9, 0.8, u), dist: lerp(126, 110, oq(u)), fov: 38, roll: 0 };
      case 5: { // crash out from the S to the hero elevation, landing on the downbeat
        const k = ease.inOutExpo(u);
        const a: Rig = { tx: LX[7]! - 2, ty: 9, tz: ZT, yaw: 0.75, pitch: 0.12, dist: 30, fov: 40, roll: 0.04 };
        const b: Rig = { tx: 0, ty: 10.5, tz: ZC, yaw: 0, pitch: 0.035, dist: 172, fov: 38, roll: 0 };
        return lerpRig(a, b, k);
      }
      case 6: { // hero, then the push into the B's upper counter
        const k = ease.inQuart(u);
        const C = this.counter;
        const slam = pulse(t, this.kSlam, 0.1);
        return { tx: lerp(0, C.x, ease.inOutCubic(u)), ty: lerp(10.5, C.y, ease.inOutCubic(u)), tz: ZC, yaw: 0.02 * Math.sin(u * 3) * (1 - u), pitch: lerp(0.035, 0.0, ease.inOutCubic(u)),
          dist: lerp(172 - 10 * springStep(t - this.kSlam, 3, 0.5), 1.2, k) * (1 - 0.03 * slam), fov: lerp(38, 50, k), roll: lerp(0, 0.06, k) };
      }
      case 7: { // through the counter, then a whip-around: the letters peel off toward the lens
        const C = this.counter;
        const a = prog(u, 0, 0.25, ease.outCubic), b = prog(u, 0.12, 1, io);
        const pos = new THREE.Vector3(lerp(C.x, C.x + 30, b), lerp(C.y, 16, b), C.z + lerp(0.3, -6, a) + lerp(0, -34, b));
        const phi = Math.PI * 0.86 * prog(u, 0.03, 0.5, io);
        const dir = new THREE.Vector3(Math.sin(phi) * 0.9, -0.34 * Math.sin(prog(u, 0.02, 0.55) * Math.PI) - 0.1 * b, -Math.cos(phi));
        return { pos, look: pos.clone().add(dir), up: new THREE.Vector3(0, 1, 0), fov: lerp(50, 48, b), roll: lerp(0.06, -0.03, b) };
      }
      case 8: { // low chase along the baseline, the letters peeling off ahead
        const k = ease.inOutQuad(u);
        const x = lerp(this.X0 - 30, this.X1 - 10, k);
        return { pos: new THREE.Vector3(x, 2.6, ZT + 17), look: new THREE.Vector3(x + 36, 8, ZT - 6), up: new THREE.Vector3(0, 1, 0), fov: 44, roll: 0.035 };
      }
      case 9: return { tx: lerp(-6, 4, io(u)), ty: 0, tz: DZ0 - 2.5 * LOT, yaw: lerp(0.55, -0.2, io(u)), pitch: lerp(1.56, 1.42, io(u)), dist: lerp(135, 92, oq(u)), fov: 40, roll: 0 };
      case 10: { // crane up a street between the towers
        const sx = this.street();
        const k = io(u);
        return { pos: new THREE.Vector3(sx, lerp(1.6, 48, k), lerp(DZ0 + 8, DZ0 - 16, k)), look: new THREE.Vector3(sx + lerp(0, 8, k), lerp(34, 6, k), lerp(DZ0 - 30, DZ0 - 70, k)), up: new THREE.Vector3(0, 1, 0), fov: lerp(58, 46, k), roll: lerp(-0.04, 0.02, k) };
      }
      default: return { tx: 0, ty: 16, tz: -64, yaw: lerp(0.62, 0.16, io(u)), pitch: lerp(0.3, 0.2, u), dist: lerp(196, 168, oq(u)), fov: 34, roll: lerp(-0.02, 0.01, u) };
    }
  }
  private street() { return TW / 2 + (LOT - TW) / 2; }
  private placeCam(t: number) {
    const c = this.camAt(t);
    const cam = this.cam;
    if ('tx' in c) applyRig(cam, c);
    else {
      cam.position.copy(c.pos); cam.up.copy(c.up); cam.lookAt(c.look);
      if (c.roll) cam.rotateZ(c.roll);
      cam.fov = c.fov; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    }
  }

  // ------------------------------------------------------------------ render
  override render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer } = this.ctx;
    const t = f.t;
    this.placeCam(t);
    const cam = this.cam;
    const slamK = pulse(t, this.kSlam, 0.09);
    // shake: the slam, then every strong kick once the drums are in
    let sh = slamK * 18;
    for (const k of this.kicks) if (t >= k && t < k + 0.3) sh = Math.max(sh, pulse(t, k, 0.05) * 5);
    const shx = (hash(frameIdx(t), 1) - 0.5) * sh, shy = (hash(frameIdx(t), 2) - 0.5) * sh;

    // ---- the flip front (screen x of the gold sweep) ----
    const fu = prog(t, this.tFlip0, this.tFlip1, ease.inOutCubic);
    const wipeX = t < this.tFlip0 ? -200 : lerp(-60, W + 330, fu);
    const flipped = (sxp: number) => clamp((wipeX - sxp) / 260);

    this.bg.u.wipe!.value = wipeX > -150 ? wipeX : -1000;
    this.bg.u.t!.value = t;
    this.bg.render(renderer, out);

    // ---- blocks ----
    this.updateBlocks(t, flipped);
    const m = this.blocks.mesh.material as THREE.RawShaderMaterial;
    (m.uniforms.camPos!.value as THREE.Vector3).copy(cam.position);
    const far = t > this.cuts[9]! ? 1 : 0;
    m.uniforms.fogNear!.value = far ? 110 : 60;
    m.uniforms.fogFar!.value = far ? 280 : 240;
    m.uniforms.t!.value = t;
    // the printout fades once the city stands on it
    const termA = 1 - smoothstep(this.cuts[9]! + 0.4, this.tSwap + 0.6, t) * 0.85 - smoothstep(this.cuts[11]!, this.cuts[11]! + 0.6, t) * 0.15;
    const el = Math.atan2(cam.position.y, Math.hypot(cam.position.x, cam.position.z - 6));
    (this.termMesh.material as THREE.RawShaderMaterial).uniforms.opacity!.value = termA * smoothstep(0.06, 0.2, el);
    this.drawTerminal(t);
    renderer.setRenderTarget(out);
    renderer.clearDepth();
    renderer.render(this.world, cam);

    // ---- 3D lines: lot outlines, the slam ring, the blueprint grid ----
    this.drawLines(t, flipped);
    this.lines.render(renderer, out, cam);

    // ---- cursor, sparks, the sweep (2D) ----
    this.drawFx(t, f.beatPhase, wipeX);
    this.fx.render(renderer, out);

    // ---- annotations ----
    this.drawHud(t, wipeX);
    this.ctx.comp.draw(renderer, this.hud.upload(), out);

    return {
      bloom: 0.6 + slamK * 0.5, flash: pulse(t, this.kSlam, 0.03) * 0.16, shake: [shx, shy], zoom: 1 + slamK * 0.05 + pulse(t, this.kLetter[7]!, 0.08) * 0.015,
      vignette: 0.4, grain: 0.055, ca: 1.2 + slamK * 3,
    };
  }

  // ------------------------------------------------------------------ blocks
  private updateBlocks(t: number, flipped: (sx: number) => number) {
    const B = this.blocks, q = this.q4, cam = this.cam;
    B.begin();
    const slam = t >= this.kSlam;
    const gapS = slam ? 0.86 + 0.14 * Math.min(1.02, springStep(t - this.kSlam, 5, 0.4)) : 0.86;
    const squash = 1 - 0.07 * pulse(t, this.kSlam, 0.07);
    const swap = t >= this.tSwap;
    for (let i = 0; i < this.N; i++) {
      const t0 = this.tl[i]!;
      if (t < t0) continue;
      const tt = this.td[i]!;
      let x: number, y: number, z: number, s = gapS, hot = 0, mode = 0, vox = 1;
      q[0] = 0; q[1] = 0; q[2] = 0; q[3] = 1;
      const land = t0 + this.fd[i]!;
      if (t < land) {
        const u = (t - t0) / this.fd[i]!, e = 1 - (1 - u) * (1 - u);
        const X = this.vx[i]!, Y = this.vy[i]!, Z = this.vz[i]!, SX = this.sx[i]!, SZ = this.sz[i]!;
        const lift = 10 + 0.16 * Math.hypot(X - SX, Z - SZ);
        const mx = (SX + X) / 2, my = Math.max(Y, 0.3) + lift, mz = (SZ + Z) / 2;
        const a = (1 - e) * (1 - e), b = 2 * (1 - e) * e, c = e * e;
        x = a * SX + b * mx + c * X; y = a * 0.3 + b * my + c * Y; z = a * SZ + b * mz + c * Z;
        quatAxis(this.ax[i]!, this.ay[i]!, this.az[i]!, this.spin[i]! * (1 - e) * (1 - e), q);
        s = 0.55 + 0.31 * e;
        hot = 0.72;
      } else if (t < tt) {
        x = this.vx[i]!; y = Y0 + (this.vy[i]! - Y0) * squash; z = this.vz[i]!;
        const a = t - land;
        hot = 0.62 * Math.exp(-a / 0.14) + 0.4 * Math.exp(-a / 0.04) + pulse(t, this.kSlam + Math.abs(x) * 0.0015, 0.1) * 0.95;
        if (!slam) y += 0.35 * Math.exp(-a / 0.05) * Math.sin(a * 40);
      } else {
        const u = clamp((t - tt) / this.fd2[i]!), e = ease.inOutCubic(u);
        if (swap && u >= 1) continue; // fused into the downtown slab
        const X = this.vx[i]!, Y = this.vy[i]!, Z = this.vz[i]!, RX = this.rx[i]!, RY = this.ry[i]!, RZ = this.rz[i]!;
        const lift = 6 + 0.25 * Math.hypot(RX - X, RZ - Z);
        const a = (1 - e) * (1 - e), b = 2 * (1 - e) * e, c = e * e;
        x = a * X + b * ((X + RX) / 2) + c * RX; y = a * Y + b * (Math.max(Y, RY) + lift) + c * RY; z = a * Z + b * ((Z + RZ) / 2) + c * RZ;
        quatAxis(this.ax[i]!, this.ay[i]!, this.az[i]!, this.spin[i]! * 0.5 * Math.sin(e * Math.PI), q);
        const T = this.down[this.rt[i]!]!;
        const since = t - (tt + this.fd2[i]!);
        hot = u < 1 ? 0.12 + 0.3 * Math.sin(u * Math.PI) : Math.exp(-since / 0.12) * 0.85;
        mode = u < 1 ? 0.25 * u : Math.min(1, 0.25 + since / 0.3);
        vox = 1 - smoothstep(T.done, T.done + 0.5, t);
        s = lerp(1, 1, e);
      }
      B.push(x, y, z, s, s, s, q[0]!, q[1]!, q[2]!, q[3]!, hot, mode, vox);
    }
    B.commit();

    // plinth + downtown slabs + the city
    const X = this.boxes;
    X.begin();
    const restack0 = this.cuts[7]!;
    for (const p of this.plinth) {
      if (t < p.t) continue;
      const u = clamp((t - p.t) / 0.34), e = 1 - (1 - u) ** 3;
      const lift = 8 + 0.12 * Math.abs(p.x - p.src);
      const a = (1 - e) * (1 - e), b = 2 * (1 - e) * e, c = e * e;
      const Z0 = tz(TERM.promptBase);
      const x = a * p.src + b * ((p.src + p.x) / 2) + c * p.x, y = a * 0.3 + b * lift + c * 0.5, z = a * Z0 + b * ((Z0 + p.z) / 2) + c * p.z;
      const hot = u < 1 ? 0.7 : 0.9 * Math.exp(-(t - p.t - 0.34) / 0.1) + pulse(t, this.kSlam, 0.1) * 0.6;
      const sp = this.flipOf(p.x, 0.5, p.z, flipped);
      const mode = sp > 0 ? 1 + sp : smoothstep(restack0, restack0 + 1.5, t);
      const s = u < 1 ? 0.6 + 0.4 * e : 0.96;
      const ang = sp * Math.PI;
      const tSink = this.cuts[8]! + 0.3 + ((p.x - this.X0) / (this.X1 - this.X0)) * 2.2;
      const sink = prog(t, tSink, tSink + 0.35, ease.inCubic);
      if (sink >= 1) continue;
      X.push(x, y - sink * 1.1, z, 2 * s, 1 * (u < 1 ? s : 1), 2 * s, 0, Math.sin(ang / 2), 0, Math.cos(ang / 2), hot, mode, 0.6);
    }
    if (t >= this.tSwap) for (const T of this.down) {
      const sp = this.flipOf(T.x, T.h * 0.5, T.z, flipped);
      const ang = sp * Math.PI;
      X.push(T.x, T.h / 2, T.z, T.w, T.h, T.d, 0, Math.sin(ang / 2), 0, Math.cos(ang / 2), 0, sp > 0 ? 1 + sp : 1, 0);
    }
    for (const T of this.city) {
      if (t < T.tRise) continue;
      const u = clamp((t - T.tRise) / 0.36);
      const hh = T.h * clamp(ease.outBack(u, 1.2), 0, 1.15);
      if (hh < 0.05) continue;
      const sp = this.flipOf(T.x, T.h * 0.5, T.z, flipped);
      const ang = sp * Math.PI;
      X.push(T.x, hh / 2, T.z, T.w, hh, T.d, 0, Math.sin(ang / 2), 0, Math.cos(ang / 2), u < 1 ? 0.25 * (1 - u) : 0, sp > 0 ? 1 + sp : 1, 0);
    }
    X.commit();

    // dust of blocks at the slam
    const Dd = this.dust;
    Dd.begin();
    const a = t - this.kSlam;
    if (a >= 0 && a < 1.8) {
      for (let k = 0; k < 360; k++) {
        const i = Math.floor(hash(k, 91) * this.N);
        const x0 = this.vx[i]!, y0 = this.vy[i]!, z0 = this.vz[i]! + 0.6;
        const dx = x0 / (this.X1 - this.X0) * 2, sp = 10 + 26 * hash(k, 92);
        const vx = dx * sp * 0.7 + (hash(k, 93) - 0.5) * 12, vy = 8 + 22 * hash(k, 94), vz = 6 + 22 * hash(k, 95);
        let tt = a;
        const g = 55;
        // land on the floor
        const disc = vy * vy + 2 * g * (y0 - 0.2);
        const tLand = (vy + Math.sqrt(Math.max(0, disc))) / g;
        tt = Math.min(tt, tLand);
        const x = x0 + vx * tt, y = Math.max(0.2, y0 + vy * tt - 0.5 * g * tt * tt), z = z0 + vz * tt;
        const s = (0.18 + 0.34 * hash(k, 96)) * (1 - smoothstep(1.0, 1.8, a));
        if (s < 0.02) continue;
        quatAxis(this.ax[i]!, this.ay[i]!, this.az[i]!, (hash(k, 97) - 0.5) * 20 * tt, this.q4);
        Dd.push(x, y, z, s, s, s, this.q4[0]!, this.q4[1]!, this.q4[2]!, this.q4[3]!, Math.exp(-a / 0.25), 0, 0);
      }
    }
    Dd.commit();
    void cam;
  }

  /** 0..1 flip of a tower whose centre projects left of the sweep. */
  private flipOf(x: number, y: number, z: number, flipped: (sx: number) => number) {
    if (this.bg.u.wipe!.value < -150) return 0;
    const s = toScreen(this.cam, x, y, z);
    return ease.inOutCubic(flipped(s.ok ? s.x : -1e4));
  }

  // ------------------------------------------------------------------ lines
  private drawLines(t: number, flipped: (sx: number) => number) {
    const lb = this.lines;
    lb.clear();
    const g = LIN.graphite, bo = LIN.bone;
    // lot outlines on the ground: marked a beat before each tower rises (the plan of the old world)
    const all = [...this.down.map((d) => ({ ...d, tRise: d.tRise })), ...this.city];
    for (const T of all) {
      const a = smoothstep(T.tRise - 0.5, T.tRise - 0.2, t);
      if (a <= 0) continue;
      const sp = this.flipOf(T.x, 0, T.z, flipped);
      const c = sp > 0.5 ? bo : g;
      const al = (sp > 0.5 ? 0.55 : 0.5) * a;
      const m = 1.2, x0 = T.x - T.w / 2 - m, x1 = T.x + T.w / 2 + m, z0 = T.z - T.d / 2 - m, z1 = T.z + T.d / 2 + m;
      lb.seg(x0, 0.03, z0, x1, 0.03, z0, 1, c[0], c[1], c[2], al);
      lb.seg(x1, 0.03, z0, x1, 0.03, z1, 1, c[0], c[1], c[2], al);
      lb.seg(x1, 0.03, z1, x0, 0.03, z1, 1, c[0], c[1], c[2], al);
      lb.seg(x0, 0.03, z1, x0, 0.03, z0, 1, c[0], c[1], c[2], al);
    }
    // the slam ring on the floor
    const ra = t - this.kSlam;
    if (ra > 0 && ra < 0.9) {
      const R = 6 + 150 * ease.outCubic(ra / 0.9), al = (1 - ra / 0.9) ** 1.5;
      const n = 96;
      for (let k = 0; k < n; k++) {
        const a0 = (k / n) * TAU, a1 = ((k + 1) / n) * TAU;
        lb.seg(Math.cos(a0) * R, 0.05, ZT - 1.5 + Math.sin(a0) * R * 0.6, Math.cos(a1) * R, 0.05, ZT - 1.5 + Math.sin(a1) * R * 0.6, 2.2, LIN.signal[0] * 2, LIN.signal[1] * 2, LIN.signal[2] * 2, al);
      }
    }
    // blueprint grid on the paper, once the sweep has passed
    if (t > this.tFlip0) {
      const k = prog(t, this.tFlip0, this.tFlip1);
      for (let i = -40; i <= 40; i++) {
        const x = i * 10, major = i % 5 === 0;
        const al = (major ? 0.22 : 0.09) * k;
        lb.seg(x, 0.02, -760, x, 0.02, 90, major ? 1.2 : 0.8, bo[0], bo[1], bo[2], al);
      }
      for (let j = -76; j <= 9; j++) {
        const z = j * 10, major = j % 5 === 0;
        const al = (major ? 0.22 : 0.09) * k;
        lb.seg(-420, 0.02, z, 420, 0.02, z, major ? 1.2 : 0.8, bo[0], bo[1], bo[2], al);
      }
    }
  }

  // ------------------------------------------------------------------ cursor & sweep
  private caretWorld(t: number): { top: THREE.Vector3; bot: THREE.Vector3 } {
    const q = this.q;
    let x: number, base: number;
    if (t < this.kEnter) { x = q.caretX; base = TERM.base; }
    else {
      const { row, n } = this.promptState(t);
      base = row;
      x = q.x0 + measure(n, TERM.fam(), TERM.size) + 5;
    }
    const top = base - TERM.size * TERM.capTop, bot = top + TERM.size * TERM.caretH;
    return { top: new THREE.Vector3(tx(x), 0.05, tz(top)), bot: new THREE.Vector3(tx(x), 0.05, tz(bot)) };
  }
  /** The row being typed and its text. */
  private promptState(t: number): { row: number; n: string } {
    const typed = (ks: number[], s: string) => s.slice(0, ks.filter((k) => k <= t).length);
    if (t < this.kSlam) return { row: TERM.promptBase, n: PROMPT + typed(this.kBuild, CMD) + typed(this.kLetter, TITLE) };
    return { row: TERM.promptBase + 88, n: PROMPT + typed(this.kCmd2, CMD2) };
  }

  private drawFx(t: number, beatPhase: number, wipeX: number) {
    const fx = this.fx, cam = this.cam;
    fx.clear();
    const head = (tt: number) => {
      const c = this.caretWorld(tt);
      const s = toScreen(cam, c.bot.x, c.bot.y, c.bot.z);
      return s.ok ? { x: s.x, y: s.y } : null;
    };
    const cw = this.caretWorld(t);
    const a = toScreen(cam, cw.top.x, cw.top.y, cw.top.z), b = toScreen(cam, cw.bot.x, cw.bot.y, cw.bot.z);
    const sinceKey = (() => { let m = 9; for (const k of this.keysAll) if (t >= k) m = Math.min(m, t - k); return m; })();
    const on = sinceKey < 0.25 ? 1 : cursorBlink(beatPhase);
    const vis = 1 - smoothstep(this.cuts[9]!, this.cuts[9]! + 0.3, t);
    if (a.ok && b.ok && vis > 0.01) {
      // the motif caret, laid on the printout (so it follows the page's perspective)
      const h = Math.hypot(b.x - a.x, b.y - a.y), fl = 0.9 + 0.1 * Math.sin(t * 83.1) * Math.sin(t * 51.7), I = on * fl * vis;
      const sig = LIN.signal;
      fx.seg2(a.x, a.y, b.x, b.y, Math.max(3, h * 0.07), [sig[0] * 2 * I, sig[1] * 2 * I, sig[2] * 2 * I], 1);
      fx.seg2(a.x, a.y, b.x, b.y, Math.max(9, h * 0.2), [sig[0] * 0.45 * I, sig[1] * 0.45 * I, sig[2] * 0.45 * I], 0.35);
      cursorTip(fx, b.x, b.y, t, Math.max(0.5, h / 60) * (1 + pulse(t, this.kSlam, 0.2) * 3), I * (1 + 0.8 * pulse(t, t - sinceKey, 0.08)));
      weldSparks(fx, t, head, {
        rate: (tb) => { for (const k of this.keysAll) if (tb >= k && tb < k + 0.07) return 520; return 0; },
        rateMax: 520, life: 0.4, speed: 380, gravity: 800, intensity: vis, seed: 5,
      });
    }
    // the sweep: the cursor as a tall gold line crossing the frame, flipping the world to paper
    if (t >= this.tFlip0 && wipeX < W + 50) {
      const I = 1 - smoothstep(this.tFlip1 - 0.05, this.tFlip1 + 0.02, t) * 0.0;
      const sig = LIN.signal;
      fx.seg2(wipeX, -20, wipeX, H + 20, 3.2, [sig[0] * 2.2 * I, sig[1] * 2.2 * I, sig[2] * 2.2 * I], 1);
      fx.seg2(wipeX, -20, wipeX, H + 20, 16, [sig[0] * 0.4 * I, sig[1] * 0.4 * I, sig[2] * 0.4 * I], 0.4);
      cursorTip(fx, wipeX, H * 0.5 + Math.sin(t * 9) * 4, t, 1.6, 1.2 * I);
      weldSparks(fx, t, (tb) => (tb < this.tFlip0 ? null : { x: lerp(-60, W + 330, prog(tb, this.tFlip0, this.tFlip1, ease.inOutCubic)), y: H * 0.5 }), { rate: 240, life: 0.35, speed: 420, gravity: 500, seed: 9 });
    }
  }

  // ------------------------------------------------------------------ the printout
  private drawTerminal(t: number) {
    const ps = this.promptState(t);
    const nTowers = this.down.filter((d) => t >= d.done).length;
    const key = `${t >= this.kEnter ? 1 : 0}|${ps.n}|${t >= this.kSlam ? 1 : 0}|${nTowers}|${Math.round(smoothstep(this.kEnter, this.kEnter + 0.5, t) * 20)}`;
    if (key === this.termKey) return;
    this.termKey = key;
    const L = this.term, c = L.ctx;
    L.clear();
    drawQuoteRow(c, this.q, () => 1, 999, 1);
    const fam = TERM.fam(), s = TERM.size, x0 = this.q.x0;
    c.font = font(fam, s);
    // bezel of the page (appears after the handoff frame)
    const bz = smoothstep(this.kEnter, this.kEnter + 0.5, t);
    if (bz > 0) {
      c.strokeStyle = rgba('graphite', 0.9 * bz);
      c.lineWidth = 2;
      c.strokeRect(40, 40, W - 80, H - 80);
      c.font = font(TERM.famDim(), 16);
      c.fillStyle = rgba('graphite', bz);
      c.fillText('~/builders — tty1 — 192×108', 64, 76);
      c.textAlign = 'right';
      c.fillText('boot 0.1.0', W - 64, 76);
      c.textAlign = 'left';
      c.font = font(fam, s);
    }
    if (t >= this.kEnter) {
      const pre = t < this.kSlam ? ps.n : PROMPT + CMD + TITLE;
      c.fillStyle = rgba('signal', 1);
      c.fillText(PROMPT, x0, TERM.promptBase);
      c.fillStyle = rgba('bone', 1);
      c.fillText(pre.slice(PROMPT.length), x0 + glyphX(pre, PROMPT.length, fam, s), TERM.promptBase);
    }
    if (t >= this.kSlam) {
      c.font = font(TERM.famDim(), 20);
      c.fillStyle = rgba('ash', 0.95);
      c.fillText(`built BUILDERS · ${this.N.toLocaleString('en-US')} blocks · compile 0.18 s · ok`, x0, TERM.promptBase + 42);
      c.font = font(fam, s);
      c.fillStyle = rgba('signal', 1);
      c.fillText(PROMPT, x0, TERM.promptBase + 88);
      c.fillStyle = rgba('bone', 1);
      c.fillText(ps.n.slice(PROMPT.length), x0 + glyphX(ps.n, PROMPT.length, fam, s), TERM.promptBase + 88);
      c.font = font(TERM.famDim(), 18);
      c.fillStyle = rgba('ash', 0.85);
      for (let k = 0; k < nTowers; k++) {
        const T = this.down[k]!;
        const col = k % 3, row = Math.floor(k / 3);
        c.fillText(`T.${String(k + 1).padStart(2, '0')}  ${String(T.h).padStart(2, ' ')} fl  ok`, x0 + col * 260, TERM.promptBase + 130 + row * 30);
      }
    }
    L.upload();
  }

  // ------------------------------------------------------------------ annotations
  private drawHud(t: number, wipeX: number) {
    const L = this.hud, c = L.ctx, cam = this.cam;
    L.clear();
    const a0 = smoothstep(this.kEnter, this.kEnter + 0.4, t);
    const paper = t > this.tFlip0 ? 1 : 0;
    c.textBaseline = 'alphabetic';
    const mono = (sz: number, wt = 400) => font(F.mono(wt), sz);
    const bar = Math.floor(this.ctx.audio.barAt(t) - this.ctx.audio.barAt(this.ctx.start) + 0.02) + 1;
    let landed = 0;
    for (let i = 0; i < this.N; i++) if (t >= this.tl[i]! + this.fd[i]!) landed++;
    if (a0 > 0.01) {
      c.globalAlpha = a0;
      c.font = mono(14);
      c.fillStyle = rgba(paper ? 'bone' : 'ash', 0.9);
      c.fillText(`BOOT   bar ${String(Math.min(8, bar)).padStart(2, '0')}/08`, 96, 96);
      c.textAlign = 'right';
      c.fillText(`blocks ${landed.toLocaleString('en-US').padStart(5, ' ')} / ${this.N.toLocaleString('en-US')}`, W - 96, 96);
      c.fillStyle = rgba(paper ? 'bone' : 'graphite', 0.95);
      c.fillText(`${t.toFixed(2).padStart(5, '0')} s   ${this.ctx.audio.bpm.toFixed(0)} bpm`, W - 96, H - 84);
      c.textAlign = 'left';
      const p = cam.position;
      c.fillText(`cam  x ${p.x.toFixed(1).padStart(6)}  y ${p.y.toFixed(1).padStart(5)}  z ${p.z.toFixed(1).padStart(6)}   fov ${cam.fov.toFixed(0)}`, 96, H - 84);
      c.globalAlpha = 1;
    }
    // letter callouts as each letter completes
    if (t < this.kSlam + 0.1) {
      for (let l = 0; l < TITLE.length; l++) {
        const d = this.letterDone[l]!;
        const a = smoothstep(d - 0.1, d + 0.05, t) * (1 - smoothstep(d + 0.7, d + 0.95, t));
        if (a < 0.01) continue;
        const s = toScreen(cam, this.letterX[l]!, this.letterTop[l]! + 0.5, ZT);
        if (!s.ok || s.x < 60 || s.x > W - 60 || s.y < 80 || s.y > H - 60) continue;
        const up = 70;
        c.strokeStyle = rgba('ash', 0.8 * a);
        c.lineWidth = 1;
        c.beginPath(); c.moveTo(s.x, s.y - 6); c.lineTo(s.x, s.y - up); c.lineTo(s.x + 18, s.y - up); c.stroke();
        c.font = mono(15, 500);
        c.fillStyle = rgba('bone', 0.95 * a);
        c.fillText(`${TITLE[l]}`, s.x + 24, s.y - up + 5);
        c.font = mono(13);
        c.fillStyle = rgba('ash', 0.9 * a);
        c.fillText(`${this.letterN[l]} blocks`, s.x + 44, s.y - up + 5);
      }
    }
    // the slam: dimension line over the title and the compile time
    {
      const a = smoothstep(this.kSlam, this.kSlam + 0.06, t) * (1 - smoothstep(this.cuts[7]! - 0.4, this.cuts[7]!, t));
      if (a > 0.01) {
        const yT = Y0 + CAP + 3.2;
        const l = toScreen(cam, this.X0, yT, ZT), r = toScreen(cam, this.X1, yT, ZT);
        if (l.ok && r.ok) {
          c.strokeStyle = rgba('bone', 0.8 * a);
          c.lineWidth = 1.2;
          c.beginPath(); c.moveTo(l.x, l.y); c.lineTo(r.x, r.y); c.stroke();
          for (const p of [l, r]) { c.beginPath(); c.moveTo(p.x, p.y - 9); c.lineTo(p.x, p.y + 9); c.stroke(); }
          const mx = (l.x + r.x) / 2, my = (l.y + r.y) / 2;
          c.font = mono(15, 500);
          c.textAlign = 'center';
          c.fillStyle = rgba('ink', 1);
          const lab = `${(this.X1 - this.X0).toFixed(0)} u  ·  ${this.N.toLocaleString('en-US')} blocks  ·  compile 0.18 s`;
          const w = measure(lab, F.mono(500), 15) + 24;
          c.fillRect(mx - w / 2, my - 12, w, 24);
          c.fillStyle = rgba('bone', a);
          c.fillText(lab, mx, my + 5);
          c.textAlign = 'left';
        }
      }
    }
    // the counter callout during the push
    {
      const s0 = this.cuts[6]!, s1 = this.cuts[7]!;
      const a = smoothstep(s0 + 0.35, s0 + 0.5, t) * (1 - smoothstep(s1 - 0.35, s1 - 0.2, t));
      if (a > 0.01) {
        const C = this.counter;
        const s = toScreen(cam, C.x, C.y, ZT);
        if (s.ok) {
          c.strokeStyle = rgba('signal', 0.9 * a);
          c.lineWidth = 1.2;
          c.beginPath(); c.arc(s.x, s.y, 14, 0, TAU); c.stroke();
          c.beginPath(); c.moveTo(s.x + 10, s.y - 10); c.lineTo(s.x + 60, s.y - 60); c.lineTo(s.x + 120, s.y - 60); c.stroke();
          c.font = mono(14);
          c.fillStyle = rgba('bone', a);
          c.fillText(`B.counter  ${C.x.toFixed(1)}, ${C.y.toFixed(1)}, ${C.z.toFixed(1)}`, s.x + 126, s.y - 56);
        }
      }
    }
    // downtown tower tags (top-down and the crane)
    if (t > this.cuts[9]! && t < this.tFlip0) {
      c.font = mono(12);
      for (let k = 0; k < this.down.length; k++) {
        const T = this.down[k]!;
        const a = smoothstep(T.done, T.done + 0.2, t) * (1 - smoothstep(this.cuts[10]! - 0.2, this.cuts[10]!, t));
        if (a < 0.01) continue;
        const s = toScreen(cam, T.x + TW / 2, T.h, T.z - TW / 2);
        if (!s.ok || s.x < 96 || s.x > W - 200) continue;
        c.fillStyle = rgba('ash', 0.85 * a);
        c.fillText(`T.${String(k + 1).padStart(2, '0')} ${T.h}`, s.x + 4, s.y - 4);
      }
    }
    // the street: deadpan zoning notes
    {
      const s0 = this.cuts[10]!, s1 = this.cuts[11]!;
      const a = smoothstep(s0 + 0.2, s0 + 0.4, t) * (1 - smoothstep(s1 - 0.25, s1, t));
      if (a > 0.01) {
        c.font = mono(14);
        c.fillStyle = rgba('ash', 0.9 * a);
        const lines = ['LOT 12 · ZONED 1998', 'FEATURE REQUEST #4127', 'STATUS: AWAITING APPROVAL'];
        const n = Math.floor(clamp((t - s0 - 0.2) / 0.9) * lines.join('').length);
        let acc = 0;
        lines.forEach((ln, i) => { const k = clamp(n - acc, 0, ln.length); acc += ln.length; if (k > 0) c.fillText(ln.slice(0, k), 96, 150 + i * 22); });
      }
    }
    // the sheet label on the paper
    if (t > this.tFlip0) {
      const a = smoothstep(W * 0.8, W + 40, wipeX);
      c.font = mono(14);
      c.fillStyle = rgba('bone', 0.9 * a);
      c.textAlign = 'right';
      c.fillText('SHEET 01 — THE OLD WORLD — AS BUILT', W - 96, 130);
      c.textAlign = 'left';
    }
  }
}
