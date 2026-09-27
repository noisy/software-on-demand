// HOOK ×3 — "Now everyone's a builder, / one mind, a thousand hands. / Just say it, and it's standing: /
// software on demand."  (A4). One chorus template, escalating (ctx.params.n):
//   n=1 the workbench — BUILDER dropped in block by block on the syllables and welded by the cursor, the
//       faceless builder behind it; a thousand arms unfold around them, doubling on every 16th; the sung
//       words stack up as the floors of a tower; SOFTWARE / ON / DEMAND slam in bone, extruded; DEMAND
//       shatters into lit blocks streaming away along a long curve (→ longtail).
//   n=2 a planet of builders — one light pulls back to an engraved night-side globe whose city lights ignite
//       in waves on the beat; BUILDER is launched up from them; a thousand satellites are the thousand hands;
//       the words ride an orbit ring; the tower rises out of the planet; the hook slams in gold in orbit and
//       the satellites converge into a grid (→ machine's GPU die).
//   n=3 the magician (hook-magic.ts).
import * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '../engine/scene';
import { FSPass, Layer2D, W, H } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { rgba } from '../engine/palette';
import { F, font } from '../engine/type';
import type { Line, Word } from '../engine/lyrics';
import { clamp, ease, hash, lerp, noise1, prog, pulse, smoothstep, TAU } from '../engine/util';
import { weldSparks, cursorBlink, cursorTip, hookLine } from './_motifs';
import {
  Blocks, WordPlane, XF, applyCam, camIn, lin, mix3, orbit, quat, scl3, solidMaterials, solidWord, toScreen, v3, voxelText,
  type CamState, type RGB, type SolidWord, type Voxel,
} from './hook-kit';
import { Figure, armPose, box3, caret3D, circle3, drawArm, makeArms, type Arm } from './hook-parts';
import { PLANET_R, Planet, drawSat, drawStars, makeSats, makeStars, satPos, surf, surfFrame, type Sat } from './hook-planet';
import { Magic } from './hook-magic';

type Cut = { t: number; id: string };

/** The chorus's lyric lines and the times everything keys on (all from the data). */
export interface Timing {
  la: Line; lb: Line; lc: Line; ld: Line;
  /** BUILDER: one letter per syllable (Now · ev-ery-one’s · a · buil-der). */
  syl: number[];
  /** the hook words */
  hw: Word[];
}

/** The builder stands a little right of centre, behind BUILDER (clear of the lead-in words). */
const FIG_X = 7;
const HOOK_FAMS = [F.archivo(112.5, 900), F.archivo(125, 900), F.archivo(100, 900)];
/** Chorus 2: the home light, and the orbit ring the words ride. */
const HOME_N = v3(0.18, 0.72, 0.67).normalize();
const RING_R = 162, HOOK_R = 196;
/** The die the satellites converge into: tile pitch and cell pitch (world), sized to machine's opening grid (≈0.71 W × 0.78 H at the last camera). */
const DIE = { px: 4.95, py: 3.97, cx: 1.45, cy: 1.16 };
/** Lights ignite in rings around home, one ring (this many radians wider) per beat. */
const WAVE_STEP = 0.14;

export default class Hook extends Scene {
  n = 1;
  cam = new THREE.PerspectiveCamera(35, W / H, 0.5, 6000);
  world = new THREE.Scene();
  hookScene = new THREE.Scene();
  vox = new Blocks(9000, { edgeW: 0.07 });
  slabs = new Blocks(600, { edgeW: 0.09, grid: 2 });
  hvox = new Blocks(7000, { edgeW: 0.05 });
  L3 = new LineBatch(90000, { screen2D: false, depthTest: true, blend: 'add' });
  fx = new LineBatch(14000, { blend: 'add' });
  hud = new Layer2D();
  figure = new Figure();
  bg = new FSPass(/* glsl */ `
    uniform float t; uniform float lift; uniform vec2 glowC; uniform float glowR; uniform vec3 glowCol;
    void main() {
      vec2 p = (vUv - 0.5) * vec2(16.0 / 9.0, 1.0);
      vec3 c = C_INK;
      c += C_INK2 * lift * smoothstep(1.1, 0.0, length(p - vec2(0.0, -0.1)));
      c += glowCol * smoothstep(glowR, 0.0, length((vUv - glowC) * vec2(16.0 / 9.0, 1.0)));
      fragColor = vec4(c, 1.0);
    }`, { t: { value: 0 }, lift: { value: 0.8 }, glowC: { value: new THREE.Vector2(0.5, 0.5) }, glowR: { value: 0.5 }, glowCol: { value: new THREE.Vector3(0, 0, 0) } });

  T!: Timing;
  cuts: Cut[] = [];
  impactT = 0;
  shatterT = 0;
  collapseT = 0;
  // ---- BUILDER in blocks
  vw!: { cells: Voxel[]; width: number; letters: { x0: number; x1: number }[] };
  vx0 = 0;
  cellDrop: { d: number; h: number; spin: number; sx: number; sz: number }[] = [];
  leadPlanes: { p: WordPlane; w: Word; x: number }[] = [];
  xfB = new XF();
  xfT = new XF();
  // ---- the arms (n=1)
  arms: Arm[] = [];
  armC = v3(FIG_X, 8, -18);
  ringText: { p: WordPlane; w: Word; x: number; y: number; rot: number }[] = [];
  // ---- the tower
  floors: { w: Word; h: number; t0: number; dur: number; plane: WordPlane }[] = [];
  towerX = [-21, 21]; towerZ = [-5, 9];
  // ---- the hook
  hookWords: { sw: SolidWord; group: THREE.Group; letters: THREE.Mesh[]; mats: ReturnType<typeof solidMaterials>; xf: XF }[] = [];
  shatter: { x: number; y: number; z: number; s: number; d: number; lane: number; sz: number }[] = [];
  // ---- chorus 2
  planet: Planet | null = null;
  sats: Sat[] = [];
  stars = makeStars(1400, 2600);
  ringQ = new THREE.Quaternion();
  ringWords: { p: WordPlane; w: Word; th: number }[] = [];
  thFront = 0;
  ign0 = 0;
  gridXF = new XF();
  // ---- chorus 3
  magic: Magic | null = null;

  override async init() {
    const { lyrics, params, start, end } = this.ctx;
    this.n = Number(params.n ?? 1);
    const lines = lyrics.linesIn(start - 0.1, end);
    const find = (re: RegExp) => lines.find((l) => re.test(l.text))!;
    const la = find(/everyone/i), lb = find(/thousand|wizard/i), lc = find(/standing/i), ld = hookLine(lyrics, this.n - 1);
    this.T = { la, lb, lc, ld, syl: this.sylTimes(la), hw: ld.words.slice(0, 3) };

    this.world.add(this.vox.mesh, this.slabs.mesh);
    this.hookScene.add(this.hvox.mesh);
    if (this.n === 1) this.world.add(this.figure.group);
    this.buildBuilder();
    if (this.n === 1) this.buildArms();
    this.buildTower();
    this.buildHook();
    if (this.n === 2) this.buildPlanet();
    this.buildCuts();
    if (this.n === 3) { this.magic = new Magic(this); await this.magic.init(); }
  }

  // ================================================================== timing
  /** Seven letter times for B-U-I-L-D-E-R over "Now everyone's a builder": 1 + 3 + 1 + 2 syllables. */
  private sylTimes(l: Line) {
    const w = l.words;
    const split = (x: Word, k: number) => Array.from({ length: k }, (_, i) => x.start + ((x.end - x.start) * i) / k);
    const out = [w[0]!.start, ...split(w[1]!, 3), w[2]!.start, ...split(w[3]!, 2)];
    return out.slice(0, 7);
  }
  beatT(t: number, k = 0) { const au = this.ctx.audio; return au.timeOfBeat(Math.round(au.beatAt(t)) + k); }
  downbeatAfter(t: number) { return this.ctx.audio.downbeats.find((d) => d >= t - 1e-3) ?? t; }

  private buildCuts() {
    const T = this.T, s = this.ctx.start;
    const wStand = T.lc.words[T.lc.words.length - 1]!;
    const hooks: Cut[] = [
      { t: T.hw[0]!.start, id: 'h0' },
      { t: this.beatT(T.hw[0]!.start + 0.25), id: 'h0b' },
      { t: T.hw[1]!.start, id: 'h1' },
      { t: T.hw[2]!.start, id: 'h2' },
    ];
    if (this.n === 1) {
      this.impactT = this.beatT(s, 1);
      this.cuts = [
        { t: s, id: 'plunge' },
        { t: this.beatT(T.la.end + 0.1), id: 'weld' },
        { t: this.downbeatAfter(T.la.end + 0.4), id: 'arms' },
        { t: this.downbeatAfter(T.lb.words[T.lb.words.length - 1]!.start - 0.1), id: 'dish' },
        { t: this.downbeatAfter(T.lb.end + 0.3), id: 'tower' },
        { t: wStand.start, id: 'standing' },
        ...hooks,
      ];
      this.collapseT = this.cuts.find((c) => c.id === 'tower')!.t;
    } else if (this.n === 2) {
      this.cuts = [
        { t: s, id: 'pull' },
        { t: T.la.words[0]!.start - 0.02, id: 'asm' },
        { t: this.downbeatAfter(T.la.words[1]!.end), id: 'asm2' },
        { t: this.beatT(T.la.end + 0.12), id: 'waves' },
        { t: this.downbeatAfter(T.lb.words[0]!.start - 0.5), id: 'sats' },
        { t: this.downbeatAfter(T.lb.words[T.lb.words.length - 1]!.start - 0.1), id: 'swarm' },
        { t: this.downbeatAfter(T.lc.words[0]!.start - 0.4), id: 'tower' },
        { t: wStand.start, id: 'standing' },
        ...hooks,
      ];
      this.collapseT = this.cuts.find((c) => c.id === 'tower')!.t;
    }
    this.shatterT = this.beatT(T.hw[2]!.end + 0.02);
    if (this.shatterT < T.hw[2]!.end) this.shatterT = this.beatT(T.hw[2]!.end, 1);
    this.shatterT = Math.min(this.shatterT, this.ctx.end - 0.3);
  }
  cutAt(t: number) {
    let c = this.cuts[0]!;
    for (const x of this.cuts) if (t >= x.t) c = x;
    return c;
  }

  // ================================================================== builders
  private buildBuilder() {
    this.vw = voxelText('BUILDER', F.archivo(100, 900), 9, 0.02);
    this.vx0 = -this.vw.width / 2;
    this.cellDrop = this.vw.cells.map((c, i) => ({ d: c.y * 0.011 + hash(i, 3) * 0.035, h: 12 + hash(i, 4) * 10, spin: hash(i, 5) * 2 - 1, sx: hash(i, 6) * 2 - 1, sz: hash(i, 7) * 2 - 1 }));
    const fam = F.archivo(100, 800);
    let x = this.vx0;
    for (const w of this.T.la.words.slice(0, 3)) {
      const p = new WordPlane(w.w.toUpperCase(), fam, 2.3, { px: 140 });
      this.world.add(p.mesh);
      this.leadPlanes.push({ p, w, x });
      x += p.w + 1.25;
    }
  }

  private buildArms() {
    const lb = this.T.lb, au = this.ctx.audio;
    const one = lb.words[0]!, hands = lb.words[lb.words.length - 1]!;
    const bH = au.beatAt(hands.start);
    const step = (s: number) => au.timeOfBeat(bH - (10 - s) / 4);
    this.arms = makeArms(1000, this.armC, 8.5, 3.3, (i) => (i === 0 ? one.start : step(Math.min(10, Math.ceil(Math.log2(i + 1))))), { dish: 1.5, tilt: 0.5, scaleK: 0.06 });
    const fam = F.archivo(100, 800), capH = 4.4, R = 55;
    const words = lb.words;
    const setArc = (ws: Word[], isTop: boolean) => {
      const chars: { ch: string; w: Word }[] = [];
      ws.forEach((w, i) => { for (const ch of w.w.toUpperCase()) chars.push({ ch, w }); if (i < ws.length - 1) chars.push({ ch: ' ', w }); });
      const planes = chars.map((c) => (c.ch === ' ' ? null : new WordPlane(c.ch, fam, capH, { px: 140, ax: 0.5, ay: 0 })));
      const adv = chars.map((c, i) => (c.ch === ' ' ? capH * 0.55 : planes[i]!.w + capH * 0.14));
      const total = adv.reduce((a, b) => a + b, 0);
      const r = isTop ? R : R + capH;
      let s = -total / 2;
      chars.forEach((c, i) => {
        const mid = s + adv[i]! / 2;
        s += adv[i]!;
        const p = planes[i];
        if (!p) return;
        const th = isTop ? Math.PI / 2 - mid / r : -Math.PI / 2 + mid / r;
        const x = this.armC.x + Math.cos(th) * r, y = this.armC.y + Math.sin(th) * r;
        const rot = isTop ? th - Math.PI / 2 : th + Math.PI / 2;
        this.world.add(p.mesh);
        this.ringText.push({ p, w: c.w, x, y, rot });
      });
    };
    setArc(words.slice(0, 2), true);
    setArc(words.slice(2), false);
  }

  private buildTower() {
    const fam = F.archivo(62, 900);
    const ws = this.T.lc.words;
    const W0 = this.towerX[1]! - this.towerX[0]!;
    ws.forEach((w, i) => {
      const last = i === ws.length - 1;
      const h = last ? 8.5 : i < 2 ? 5.6 : 4.4;
      const txt = w.w.toUpperCase();
      let cap = h * 0.6;
      const probe = new WordPlane(txt, fam, cap, { px: 150, ax: 0.5, ay: 0 });
      if (probe.w > W0 * 0.86) cap *= (W0 * 0.86) / probe.w;
      const plane = cap === h * 0.6 ? probe : new WordPlane(txt, fam, cap, { px: 150, ax: 0.5, ay: 0 });
      plane.set({ aDim: 0 });
      this.world.add(plane.mesh);
      this.floors.push({ w, h, t0: w.start, dur: w.end - w.start, plane });
    });
  }

  private buildHook() {
    const looks = this.n === 1
      ? { face: lin('bone', 0.8), side: lin('graphite', 0.55), hatch: lin('ash', 0.5) }
      : { face: lin('signal', 0.92), side: lin('blood', 0.5), hatch: lin('signal', 0.7) };
    this.T.hw.forEach((w, i) => {
      const txt = w.w.replace(/[^A-Za-z]/g, '').toUpperCase();
      const sw = solidWord(txt, HOOK_FAMS[i]!, 10, this.n === 1 ? 3.4 : 4.4, 0.0, 0.035);
      const mats = solidMaterials(looks, sw.depth);
      const group = new THREE.Group();
      const letters = sw.glyphs.map((g) => {
        const m = new THREE.Mesh(g.geo, mats.mats);
        m.position.set(g.cx - sw.width / 2, g.cy - 5, 0);
        m.frustumCulled = false;
        group.add(m);
        return m;
      });
      group.visible = false;
      (this.n === 1 ? this.hookScene : this.world).add(group);
      this.hookWords.push({ sw, group, letters, mats, xf: new XF() });
    });
    if (this.n !== 1) return;
    // DEMAND as blocks (longtail's resolution: 17 cells to the cap height), for the hand-off
    const dw = this.hookWords[2]!.sw;
    const CAPC = 17;
    const vt = voxelText(this.T.hw[2]!.w.replace(/[^A-Za-z]/g, '').toUpperCase(), HOOK_FAMS[2]!, CAPC);
    const cs = 10 / CAPC;
    const sx = dw.width / (vt.width * cs);
    vt.cells.forEach((c, i) => {
      this.shatter.push({
        x: -dw.width / 2 + (c.x + 0.5) * cs * sx, y: (c.y + 0.5) * cs - 5, z: dw.depth / 2, s: hash(i, 11),
        d: hash(i, 12), lane: hash(i, 13) * 2 - 1, sz: cs,
      });
    });
  }

  private buildPlanet() {
    const T = this.T, au = this.ctx.audio;
    this.planet = new Planet(HOME_N);
    this.world.add(this.planet.mesh);
    this.ign0 = Math.round(au.beatAt(this.ctx.start)) + 1;
    // BUILDER hovers above the home light, standing on the planet's surface normal, facing +z-ish
    const hf = surfFrame(HOME_N);
    this.xfB = XF.basis(surf(HOME_N, 20), hf.right, hf.up, hf.fwd);
    // the tower rises out of the planet a little way round from home (so the lit coast is behind it)
    const tn = HOME_N.clone().applyAxisAngle(hf.right, 0.12).normalize();
    const tf = surfFrame(tn);
    this.xfT = XF.basis(surf(tn, -0.8), tf.right, tf.up, tf.fwd);
    // the orbit ring: tilted so its front passes in front of home
    this.ringQ.setFromEuler(new THREE.Euler(0.32, 0, -0.18));
    this.thFront = this.ringAngleNear(hf.fwd.clone().add(HOME_N).normalize());
    // satellites: one on "one", then doubling on every 16th up to "hands."
    const lb = T.lb, one = lb.words[0]!, hands = lb.words[lb.words.length - 1]!;
    const bH = au.beatAt(hands.start);
    const step = (s: number) => au.timeOfBeat(bH - (10 - s) / 4);
    this.sats = makeSats(1000, HOME_N, (i) => (i === 0 ? one.start : step(Math.min(10, Math.ceil(Math.log2(i + 1))))));
    // line B rides the ring
    const fam = F.archivo(100, 800);
    const planes = lb.words.map((w) => new WordPlane(w.w.toUpperCase(), fam, 11, { px: 160, ax: 0.5, ay: 0.5 }));
    const gap = 7;
    const total = planes.reduce((a, p) => a + p.w, 0) + gap * (planes.length - 1);
    let s = -total / 2;
    planes.forEach((p, i) => {
      const mid = s + p.w / 2;
      s += p.w + gap;
      this.world.add(p.mesh);
      this.ringWords.push({ p, w: lb.words[i]!, th: this.thFront - mid / RING_R });
    });
    // the hook words sit on an outer ring, SOFTWARE / ON / DEMAND a little apart
    [-0.5, -0.12, 0.22].forEach((d, i) => {
      const th = this.thFront + d;
      const hw = this.hookWords[i]!;
      hw.xf = this.ringXF(th, HOOK_R);
    });
    // the grid the satellites converge into, behind DEMAND
    const dx = this.hookWords[2]!.xf;
    this.gridXF = new XF(); this.gridXF.o.copy(dx.apply(0, 0, -38)); this.gridXF.q.copy(dx.q);
  }
  /** Ring point (world) at angle th, radius r. */
  ringPos(th: number, r = RING_R) { return v3(Math.cos(th) * r, 0, Math.sin(th) * r).applyQuaternion(this.ringQ); }
  ringNormal() { return v3(0, 1, 0).applyQuaternion(this.ringQ); }
  ringAngleNear(dir: THREE.Vector3) {
    const l = dir.clone().applyQuaternion(this.ringQ.clone().invert());
    return Math.atan2(l.z, l.x);
  }
  /** A frame on the ring: x along the ring (reading direction from outside), y = ring normal, z = outward. */
  ringXF(th: number, r: number) {
    const o = this.ringPos(th, r), out = o.clone().normalize(), up = this.ringNormal();
    const right = new THREE.Vector3().crossVectors(up, out).normalize();
    const up2 = new THREE.Vector3().crossVectors(out, right).normalize();
    return XF.basis(o, right, up2, out);
  }

  // ================================================================== render
  override render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    if (this.n === 3 && this.magic) return this.magic.render(f, out);
    const t = f.t, { renderer } = this.ctx;
    const cut = this.cutAt(t);
    const isHook = cut.id.startsWith('h');
    const o: PostOverrides = { bloom: 0.6, bloomThreshold: 0.95, bloomKnee: 0.3, vignette: 0.42, ca: 1.0, grain: 0.055 };
    let shake = 0;
    this.fx.clear(); this.L3.clear(); this.vox.clear(); this.slabs.clear(); this.hvox.clear();
    this.hud.clear();
    const planetMode = this.n === 2;

    if (planetMode) {
      shake += this.drawPlanetWorld(t, f, cut, o);
      this.bg.u.lift!.value = 0.25;
      this.bg.render(renderer, out);
      renderer.setRenderTarget(out); renderer.clearDepth();
      this.vox.commit(); this.slabs.commit();
      renderer.render(this.world, this.cam);
      this.L3.render(renderer, out, this.cam);
    } else if (!isHook) {
      applyCam(this.cam, this.workbenchCam(t, cut));
      shake += this.drawWorkbench(t, f, cut);
      this.bg.u.lift!.value = 0.9;
      this.bg.render(renderer, out);
      renderer.setRenderTarget(out); renderer.clearDepth();
      this.vox.commit(); this.slabs.commit();
      renderer.render(this.world, this.cam);
      this.L3.render(renderer, out, this.cam);
    } else {
      shake += this.drawHook1(t, cut, o);
      this.bg.u.lift!.value = 0.5;
      this.bg.render(renderer, out);
      renderer.setRenderTarget(out); renderer.clearDepth();
      this.hvox.commit();
      renderer.render(this.hookScene, this.cam);
      this.L3.render(renderer, out, this.cam);
    }
    this.fx.render(renderer, out);
    this.drawHud(t, cut);
    this.ctx.comp.draw(renderer, this.hud.upload(), out);

    const sinceCut = t - cut.t;
    o.exposure = (o.exposure ?? 1) + 0.3 * pulse(sinceCut, 0, 0.05) * (cut.t > this.ctx.start + 0.01 ? 1 : 0);
    if (shake > 0.05) o.shake = [noise1(t * 55, 1) * shake, noise1(t * 55, 2) * shake];
    return o;
  }

  // ------------------------------------------------------------------ shared: BUILDER, the caret, the tower
  /**
   * BUILDER in blocks, in this.xfB's frame (local: letters on y = 0, facing +z). `mode` 'drop' falls from above
   * (the bench), 'rise' launches each block from the surface far below (the planet), with a gold trail.
   */
  drawBuilder(t: number, mode: 'drop' | 'rise', collapse = 0, fade = 1, src?: (i: number, x: number, y: number) => [number, number, number]): number {
    const V = this.vox, syl = this.T.syl, L3 = this.L3;
    const bone = lin('bone'), gold = lin('signal');
    const cells = this.vw.cells;
    V.xf = this.xfB;
    let shake = 0;
    for (let i = 0; i < cells.length; i++) {
      const c = cells[i]!, dp = this.cellDrop[i]!;
      const tl = syl[c.letter]!;
      const dur = mode === 'drop' ? 0.16 : 0.42;
      const t0 = tl - (mode === 'drop' ? 0.13 : 0.36) + dp.d;
      const u = (t - t0) / dur;
      if (u < 0) continue;
      let x = this.vx0 + c.x + 0.5, y = c.y + 0.5, z = 0, rx = 0, rz = 0;
      if (mode === 'drop') {
        if (u < 1) { const e = u * u; y += dp.h * (1 - e); rx = dp.spin * (1 - e) * 1.2; rz = -dp.spin * (1 - e) * 0.8; }
        else { const b = u - 1; y += 0.35 * Math.max(0, Math.sin(b * 22)) * Math.exp(-b * 9); }
      } else if (u < 1) {
        // from a city light straight below, on a climbing arc
        const e = ease.outCubic(u);
        const [sx, sy, sz] = src ? src(i, x, y) : [x * 1.8 + dp.sx * 14, -24 - Math.abs(dp.sz) * 4, dp.sz * 16];
        const px = lerp(sx, x, e), py = lerp(sy, y, ease.outQuart(u)), pz = lerp(sz, 0, e);
        const p0 = this.xfB.apply(px, py, pz, new THREE.Vector3());
        const tb = Math.max(0, u - 0.18), eb = ease.outCubic(tb);
        const p1 = this.xfB.apply(lerp(sx, x, eb), lerp(sy, y, ease.outQuart(tb)), lerp(sz, 0, eb), new THREE.Vector3());
        L3.seg(p1.x, p1.y, p1.z, p0.x, p0.y, p0.z, 1.3, gold[0] * 1.6, gold[1] * 1.6, gold[2] * 1.6, 0.8 * (1 - u));
        x = px; y = py; z = pz; rx = dp.spin * (1 - e) * 2; rz = dp.sx * (1 - e) * 2;
      } else { const b = u - 1; y += 0.25 * Math.max(0, Math.sin(b * 22)) * Math.exp(-b * 9); }
      const landT = t0 + dur;
      const heat = u >= 1 ? Math.exp(-(t - landT) * 3.2) : 0.6;
      let col = mix3(scl3(bone, 0.62), scl3(gold, 1.7), heat);
      let sy = 0.94;
      if (collapse > 0) {
        y = lerp(y, 0.35 + (c.y % 2) * 0.5, collapse); sy = lerp(0.94, 0.45, collapse);
        x = lerp(x, x * 0.66, collapse);
        col = mix3(col, scl3(gold, 1.2), collapse * (1 - collapse) * 4);
      }
      if (collapse >= 1 || fade <= 0.001) continue;
      const q = rx || rz ? quat(rx, 0, rz) : null;
      for (const zz of [-0.5, 0.5]) V.add(x, y, z + zz, 0.94 * fade, sy * fade, 0.94 * fade, q, col, heat * 0.5);
    }
    V.xf = null;
    for (let i = 0; i < 7; i++) shake += 3.2 * pulse(t, syl[i]! + 0.05, 0.05);
    // the lead-in words above BUILDER
    for (const { p, w, x } of this.leadPlanes) {
      const pr = clamp((t - w.start) / Math.max(0.12, w.end - w.start));
      this.xfB.place(p.mesh, x, 10.9, 0.6);
      const on = smoothstep(w.start - 0.3, w.start, t);
      p.set({ prog: pr, done: smoothstep(w.end, w.end + 0.5, t), opacity: on * fade * (1 - collapse) });
    }
    return shake;
  }
  /** Caret x (local): left of the next letter to drop. */
  caretX(t: number) {
    const L = this.vw.letters, S = this.T.syl;
    let x = this.vx0 + L[0]!.x0 - 0.9;
    for (let i = 0; i < 7; i++) {
      const land = S[i]! + 0.06;
      const nx = this.vx0 + L[i]!.x1 + 1.9;
      const k = prog(t, land, land + 0.09, ease.outExpo);
      x = lerp(x, nx, k);
    }
    return x;
  }
  towerTop(t: number) {
    let y = 1.4;
    for (const fl of this.floors) y += this.floorH(fl, t);
    return y;
  }
  floorH(fl: { h: number; t0: number; dur: number }, t: number) {
    const d = clamp(fl.dur, 0.14, 0.9);
    return fl.h * ease.outExpo(clamp((t - fl.t0 + 0.03) / d));
  }

  /** The tower of sung words, in this.xfT's frame (local y up, facade on +z). */
  drawTower(t: number, f: Frame, o: { plinth?: boolean; fogFar?: [number, number]; floorCol?: RGB; caret?: boolean } = {}): number {
    const S = this.slabs, L3 = this.L3, cam = this.cam, X = this.xfT;
    const [x0, x1] = this.towerX as [number, number], [z0, z1] = this.towerZ as [number, number];
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, wx = x1 - x0, wz = z1 - z0;
    const bone = lin('bone'), gold = lin('signal');
    const seg = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, w: number, c: RGB, a: number) => {
      const A = X.apply(ax, ay, az, new THREE.Vector3()), B = X.apply(bx, by, bz, new THREE.Vector3());
      L3.seg(A.x, A.y, A.z, B.x, B.y, B.z, w, c[0], c[1], c[2], a);
    };
    S.xf = X;
    const plK = prog(t, this.collapseT, this.collapseT + 0.2, ease.outExpo);
    if (o.plinth !== false) S.add(cx, 0.7 * plK, cz, wx + 4, 1.4 * plK, wz + 4, null, scl3(lin('graphite'), 0.8));
    else S.add(cx, -1.5, cz, wx + 6, 4.4, wz + 6, null, scl3(lin('graphite'), 0.7));
    let y = 1.4, shake = 0, topFloor = -1;
    this.floors.forEach((fl, i) => {
      const h = this.floorH(fl, t);
      if (h <= 0.01) { fl.plane.set({ opacity: 0 }); return; }
      topFloor = i;
      const heat = Math.pow(Math.exp(-Math.max(0, t - fl.w.end) * 3.5), 2);
      const base = mix3(o.floorCol ?? scl3(lin('graphite'), 0.32), scl3(gold, 1.1), heat * 0.9);
      S.add(cx, y + h / 2, cz, wx, h - 0.12, wz, null, base, heat * 0.3);
      S.add(cx, y + h - 0.2, cz, wx + 0.8, 0.4, wz + 0.8, null, scl3(lin('ash'), 0.55));
      const pr = clamp((t - fl.w.start) / Math.max(0.1, fl.w.end - fl.w.start));
      X.place(fl.plane.mesh, cx, y + h * 0.18, z1 + 0.45);
      fl.plane.mesh.scale.set(X.s, X.s * clamp(h / fl.h), X.s);
      fl.plane.set({ prog: pr, done: smoothstep(fl.w.end, fl.w.end + 0.4, t), opacity: 1, aDim: 0 });
      const ff = o.fogFar ?? [200, 800];
      fl.plane.fog(ff[0], ff[1]);
      shake += 4 * pulse(t, fl.t0 + 0.05, 0.05);
      y += h;
    });
    const top = y;
    if (topFloor >= 0) {
      const fl = this.floors[topFloor]!;
      const live = t < fl.w.end + 0.2;
      if (live) {
        const bx0 = x0 - 1.2, bx1 = x1 + 1.2, bz0 = z0 - 1.2, bz1 = z1 + 1.2, y0 = top - 0.2, y1 = top + 4;
        const sc = scl3(bone, 0.35);
        for (const [ax, az, bx, bz] of [[bx0, bz0, bx1, bz0], [bx1, bz0, bx1, bz1], [bx1, bz1, bx0, bz1], [bx0, bz1, bx0, bz0]] as const) {
          seg(ax, y0, az, bx, y0, bz, 1, sc, 0.8); seg(ax, y1, az, bx, y1, bz, 1, sc, 0.8); seg(ax, y0, az, ax, y1, az, 1, sc, 0.8);
        }
        for (let k = 0; k <= 8; k++) { const xx = lerp(bx0, bx1, k / 8); seg(xx, top - 6, bz1, xx, y1, bz1, 1, scl3(bone, 0.3), 0.7); }
      }
      if (o.caret !== false) {
        const cxr = x1 + 0.2;
        const blink = cursorBlink(f.beatPhase);
        caret3D(L3, this.fx, cam, X.apply(cxr, top, z1 + 0.6, new THREE.Vector3()), X.apply(cxr, top + 7.5, z1 + 0.6, new THREE.Vector3()), live ? 1 : blink, t);
        const lastEnd = this.floors[this.floors.length - 1]!.w.end;
        weldSparks(this.fx, t, (tb) => {
          const p = X.apply(cxr, this.towerTop(tb), z1 + 0.6);
          const s = toScreen(cam, p.x, p.y, p.z);
          return s.ok && tb > this.collapseT ? { x: s.x, y: s.y } : null;
        }, { rate: (tb) => (tb < lastEnd ? 160 : 20), rateMax: 160, life: 0.5, speed: 420, gravity: 1200, intensity: 1 });
      }
    }
    const lastW = this.floors[this.floors.length - 1]!.w;
    const sp = prog(t, lastW.end - 0.05, lastW.end + 0.2, ease.outExpo);
    if (sp > 0) {
      S.add(cx, top + 0.6, cz, wx * 0.6, 1.2, wz * 0.6, null, scl3(lin('graphite'), 0.9));
      S.add(cx, top + 1.2 + 7 * sp, cz, 0.8, 14 * sp, 0.8, null, scl3(lin('ash'), 0.8));
      const bp = X.apply(cx, top + 1.2 + 14 * sp, cz);
      const b = toScreen(cam, bp.x, bp.y, bp.z);
      if (b.ok) { const bl = 0.6 + 0.4 * cursorBlink(f.beatPhase); this.fx.seg2(b.x, b.y, b.x + 0.01, b.y, 16, scl3(gold, 2.2 * bl), 0.9); this.fx.seg2(b.x, b.y, b.x + 0.01, b.y, 5, scl3(lin('ember'), 4 * bl), 1); }
      shake += 10 * pulse(t, lastW.end, 0.07);
    }
    S.xf = null;
    return shake;
  }
  hideTower() { for (const fl of this.floors) fl.plane.set({ opacity: 0 }); }

  // ------------------------------------------------------------------ n = 1: the workbench
  private workbenchCam(t: number, cut: Cut): CamState {
    const T = this.T;
    const lt = t - cut.t;
    const xLand = this.caretX(this.ctx.start);
    if (cut.id === 'plunge') {
      const tip = this.plungeTip(t);
      const kI = prog(t, this.impactT, this.impactT + 0.1, ease.outCubic);
      const k = prog(t, this.impactT + 0.02, T.la.words[1]!.start + 0.25, ease.inOutCubic);
      const k2 = prog(t, T.la.words[1]!.start + 0.25, this.cuts[1]!.t, (x) => x);
      const follow = Math.max(tip, 0);
      // jevons hands over a vertical gold line, centred, its tip three-quarters down the frame
      const p0 = v3(xLand, follow + 6.2, 48), g0 = v3(xLand, follow + 7.7, 0);
      const p1 = v3(-44 + 22 * k2, 23 - 4 * k2, 100 - 8 * k2), g1 = v3(-2 + 3 * k2, 6.5, -3);
      const pos = p0.clone().lerp(p1, k); const tg = g0.clone().lerp(g1, k);
      pos.y -= 1.8 * kI * (1 - k);
      return { pos, target: tg, fov: lerp(36, 33, k), roll: lerp(0, 0.015, k) };
    }
    if (cut.id === 'weld') {
      const x = this.weldX(t);
      return { pos: v3(x + 13 - lt * 1.5, 2.6 + lt * 0.8, 21 - lt * 1.2), target: v3(x - 5, 4.5 + lt * 0.8, -2), fov: 38, roll: 0.03 };
    }
    if (cut.id === 'arms') {
      const T0 = T.lb.words[0]!.start;
      const k = prog(t, T0 + 0.2, T.lb.words[T.lb.words.length - 1]!.start + 0.1, (x) => ease.inOutCubic(x));
      const kk = Math.pow(k, 1.6);
      const d = lerp(74, 172, kk);
      return { pos: v3(FIG_X + Math.sin(lt * 0.4) * 5, 14 + kk * 2, d), target: v3(FIG_X, lerp(13, 8, kk), -12), fov: 38, roll: -0.012 + kk * 0.02 };
    }
    if (cut.id === 'dish') {
      const yaw = lerp(-0.62, -0.25, ease.outCubic(clamp(lt / 2.2)));
      return { pos: orbit(this.armC, yaw, lerp(0.26, 0.16, clamp(lt / 2)), lerp(185, 165, clamp(lt / 2))), target: this.armC.clone().add(v3(3, -4, 0)), fov: 36, roll: 0.03 };
    }
    if (cut.id === 'tower') {
      const top = this.towerTop(t);
      return { pos: v3(-34 + lt * 3, 1.5 + top * 0.25, 58 - lt * 2), target: v3(0, Math.max(4, top - 3), 2), fov: 40, roll: -0.04 };
    }
    const top = this.towerTop(t);
    const whip = prog(t, T.hw[0]!.start - 0.3, T.hw[0]!.start, ease.inCubic);
    return { pos: v3(34 - lt * 5, -4 + lt * 2.5, 112 - lt * 9), target: v3(0, 17 + top * 0.1 + whip * 26, 0), fov: 36 - whip * 6, roll: 0.02 + whip * 0.18 };
  }
  private plungeTip(t: number) {
    const k = prog(t, this.ctx.start - 0.35, this.impactT, ease.inQuad);
    return lerp(95, 0, k);
  }
  private weldX(t: number) {
    const cut = this.cuts.find((c) => c.id === 'weld')!.t, nx = this.cuts.find((c) => c.id === 'arms')!.t;
    const k = prog(t, cut, nx, ease.inOutQuad);
    return lerp(this.vx0 + this.vw.width + 1, this.vx0 - 1, k);
  }

  private drawWorkbench(t: number, f: Frame, cut: Cut): number {
    const T = this.T, V = this.vox, S = this.slabs, L3 = this.L3, cam = this.cam;
    let shake = 0;
    const bone = lin('bone'), gold = lin('signal');
    const towerOn = cut.id === 'tower' || cut.id === 'standing';
    const collapseT = this.collapseT;

    // bench
    S.add(0, -1.25, -3, 112, 2.5, 20, null, scl3(lin('ink2'), 1.35), 0, 0);
    S.add(0, -4.2, 6.4, 108, 3.4, 1.2, null, scl3(lin('ink2'), 1.1), 0, 0);
    for (const [x, z] of [[-52, -11], [52, -11], [-52, 5], [52, 5]] as const) S.add(x, -13.5, z, 3, 20, 3, null, scl3(lin('ink2'), 1.0), 0, 0);
    S.add(0, -19, -3, 104, 1.4, 1.4, null, scl3(lin('ink2'), 0.9), 0, 0);
    for (const z of [-9, -5, -1, 3]) L3.seg(-56, 0.01, z, 56, 0.01, z, 1, bone[0] * 0.18, bone[1] * 0.18, bone[2] * 0.18, 0.8);
    // tools: a mallet, a square, spare blocks
    S.add(-45, 1.6, 2.5, 5.5, 3.2, 3.2, quat(0, 0.25, 0), scl3(lin('graphite'), 0.9), 0, 0);
    S.add(-38.5, 0.45, 4.2, 11, 0.9, 0.9, quat(0, 0.25, 0), scl3(lin('graphite'), 0.7), 0, 0);
    S.add(40, 0.2, -7.5, 12, 0.4, 1.4, null, scl3(lin('ash'), 0.7), 0, 0);
    S.add(45.3, 0.2, -3.2, 1.4, 0.4, 9.8, null, scl3(lin('ash'), 0.7), 0, 0);
    for (let i = 0; i < 14; i++) {
      const x = 38 + (i % 4) * 1.05, y = 0.5 + Math.floor(i / 8) * 1.02, z = 3 + (Math.floor(i / 4) % 2) * 1.05;
      V.add(x, y, z, 0.95, 0.95, 0.95, null, i % 5 === 2 ? scl3(gold, 0.8) : scl3(bone, 0.5));
    }
    for (let i = -50; i <= 50; i++) {
      const L = i % 10 === 0 ? 1.6 : i % 5 === 0 ? 1.0 : 0.55;
      L3.seg(i, 0.02, 7, i, 0.02, 7 - L, 1, bone[0] * 0.5, bone[1] * 0.5, bone[2] * 0.5, 0.7);
    }
    for (let i = -24; i <= 24; i++) L3.seg(i * 8, -23, -200, i * 8, -23, 120, 1, bone[0] * 0.3, bone[1] * 0.3, bone[2] * 0.3, 0.22 * (1 - Math.abs(i) / 25));
    for (let j = -25; j <= 15; j++) L3.seg(-192, -23, j * 8, 192, -23, j * 8, 1, bone[0] * 0.3, bone[1] * 0.3, bone[2] * 0.3, 0.18 * (1 - Math.abs(j + 5) / 21));

    // BUILDER, dropped in letter by letter (slumping into the tower's plinth on the cut)
    const coll = prog(t, collapseT - 0.02, collapseT + 0.22, ease.inCubic);
    if (t < collapseT + 0.3) shake += this.drawBuilder(t, 'drop', coll);
    else for (const { p } of this.leadPlanes) p.set({ opacity: 0 });

    // the cursor: plunge, the caret at the insertion point, the weld pass
    const blink = cursorBlink(f.beatPhase);
    let tipP: THREE.Vector3 | null = null;
    if (cut.id === 'plunge') {
      const xL = this.caretX(this.ctx.start);
      const tip = this.plungeTip(t);
      // jevons' line is a hairline: start that thin and thicken into the caret as it plunges
      if (t < this.impactT) { const g = prog(t, this.ctx.start, this.impactT, ease.inQuad); caret3D(L3, this.fx, cam, v3(xL, tip, 1.3), v3(xL, tip + 240, 1.3), 1, t, lerp(1.15, 1.3, g), lerp(0.28, 1, g)); }
      else {
        const x = this.caretX(t);
        const topY = lerp(240, 10.6, prog(t, this.impactT, this.impactT + 0.22, ease.outExpo));
        caret3D(L3, this.fx, cam, v3(x, 0, 1.3), v3(x, topY, 1.3), t > T.la.end + 0.1 ? blink : 1, t);
        tipP = v3(x, 0, 1.3);
        shake += 18 * pulse(t, this.impactT, 0.06);
      }
    } else if (cut.id === 'weld') {
      const x = this.weldX(t);
      caret3D(L3, this.fx, cam, v3(x, 0, 1.3), v3(x, 10.6, 1.3), 1, t);
      tipP = v3(x, 0.1, 1.2);
    }
    const head = (tb: number): { x: number; y: number } | null => {
      const cc = this.cutAt(tb);
      let p: THREE.Vector3 | null = null;
      if (cc.id === 'plunge' && tb >= this.impactT) p = v3(this.caretX(tb), 0.1, 1.3);
      else if (cc.id === 'weld') p = v3(this.weldX(tb), 0.1, 1.2);
      if (!p) return null;
      const s = toScreen(cam, p.x, p.y, p.z);
      return s.ok ? { x: s.x, y: s.y } : null;
    };
    const syl = T.syl;
    const burst = (tb: number) => {
      let r = 25 + 900 * pulse(tb, this.impactT, 0.07);
      for (const s of syl) r += 320 * pulse(tb, s + 0.06, 0.05);
      if (this.cutAt(tb).id === 'weld') r = 170;
      return Math.min(r, 900);
    };
    if (tipP || cut.id === 'plunge') weldSparks(this.fx, t, head, { rate: burst, rateMax: 900, life: 0.55, speed: 520, gravity: 1300, intensity: 1.1, width: 1.8 });

    // the builder
    const kLift = smoothstep(collapseT - 0.1, collapseT + 0.6, t);
    const xr = cut.id === 'weld' ? this.weldX(t) : this.caretX(t);
    const reachR = v3(clamp(xr * 0.35 + 6, 2, 16), 1.5, -3.5).lerp(v3(15, 23, -6), kLift).add(v3(FIG_X, 0, 0));
    const reachL = v3(-9 + Math.sin(t * 2.1) * 0.6, 1.2, -4).lerp(v3(-15, 23, -6), kLift).add(v3(FIG_X, 0, 0));
    const lookAt = cut.id === 'arms' ? v3(0, 10, 60) : towerOn ? v3(0, 30, 0) : v3(xr, 2, 0);
    const fig = this.figure.pose(v3(FIG_X, -1, -16), 1, reachL, reachR, lookAt, Math.sin(t * 2.4));
    const mindT = T.lb.words[1]!.start;
    const mindGlow = cut.id === 'arms' || cut.id === 'dish' ? smoothstep(mindT - 0.05, mindT + 0.1, t) * (0.55 + 0.45 * pulse(t, mindT, 0.25)) : 0;
    this.figure.set({ cam: cam.position, key: tipP ?? v3(0, 30, 30), keyI: tipP ? 1.2 : 0.08, fog: [150, 700], glow: mindGlow * 0.12 });
    if (mindGlow > 0) circle3(L3, fig.head, v3(1, 0, 0), v3(0, 1, 0), 4.3 + pulse(t, mindT, 0.2) * 2, 2.2, scl3(gold, 1.8 * mindGlow), 1, 64);

    const armsOn = !['plunge', 'weld'].includes(cut.id);
    if (armsOn) this.drawArms(t, f, towerOn ? 0.35 : 1);
    else for (const r of this.ringText) r.p.set({ opacity: 0 });

    if (towerOn) shake += this.drawTower(t, f);
    else this.hideTower();

    const far = cut.id === 'arms' || cut.id === 'dish' ? [220, 900] : cut.id === 'standing' ? [200, 700] : [110, 420];
    V.fog(far[0]!, far[1]!); S.fog(far[0]!, far[1]!);
    for (const { p } of this.leadPlanes) p.fog(far[0]!, far[1]!);
    return shake;
  }

  private drawArms(t: number, f: Frame, dim: number) {
    const T = this.T, L3 = this.L3, V = this.vox;
    const hands = T.lb.words[T.lb.words.length - 1]!;
    const grip = smoothstep(hands.start, hands.start + 0.12, t);
    const work = smoothstep(hands.end - 0.2, hands.end + 0.3, t);
    const bone = lin('bone'), gold = lin('signal');
    for (const a of this.arms) {
      const ps = armPose(a, t, f.beat, work, grip);
      if (!ps) continue;
      const flash = pulse(t, a.tU + 0.05, 0.12);
      const far = 1 - a.ring * 0.035;
      const col = mix3(scl3(bone, 0.5 * far), scl3(gold, 1.6), flash * 0.8 + (a.i === 0 ? 0.7 : 0));
      const jc = mix3(scl3(bone, 0.7 * far), scl3(gold, 1.4), Math.max(flash, grip * 0.6));
      drawArm(L3, a, ps, scl3(col, dim), scl3(jc, dim), Math.min(1, ps.k * 3) * (0.6 + 0.4 * far), 1.35);
      if (grip > 0) {
        const p = ps.p[3]!.clone().addScaledVector(ps.dir, a.l[2] * 0.75);
        const s = 0.62 * (a.l[0] / 2.3) * grip;
        const hot = pulse(t, hands.start + a.ring * 0.012, 0.18);
        V.add(p.x, p.y, p.z, s, s, s, quat(a.ph * 3, a.wob * 2, 0), scl3(mix3(scl3(gold, 1.0), scl3(lin('ember'), 1.6), hot), dim), (0.55 + hot * 0.4) * dim);
      }
    }
    const id = this.cutAt(t).id, inRing = id === 'arms' || id === 'dish';
    for (const r of this.ringText) {
      const w = r.w;
      const s = w.start <= t ? 1 + 0.5 * pulse(t, w.start, 0.06) : 0;
      r.p.mesh.position.set(r.x, r.y, this.armC.z + 3);
      r.p.mesh.rotation.set(0, 0, r.rot);
      r.p.mesh.scale.setScalar(Math.max(0.001, s));
      r.p.set({ prog: 1, done: smoothstep(w.end, w.end + 0.6, t), opacity: inRing && t >= w.start ? dim : 0 });
      r.p.fog(300, 1200);
    }
    if (inRing) {
      const c = v3(this.armC.x, this.armC.y, this.armC.z + 3);
      circle3(L3, c, v3(1, 0, 0), v3(0, 1, 0), 53.4, 1.2, scl3(bone, 0.35 * dim), 1, 160);
      circle3(L3, c, v3(1, 0, 0), v3(0, 1, 0), 60.9, 1.0, scl3(bone, 0.25 * dim), 1, 160);
    }
  }

  // ---- n = 1 hook: SOFTWARE / ON / DEMAND in bone on a ground grid, DEMAND shatters
  private drawHook1(t: number, cut: Cut, o: PostOverrides): number {
    const T = this.T, cam = this.cam, L3 = this.L3;
    const wi = cut.id === 'h0' || cut.id === 'h0b' ? 0 : cut.id === 'h1' ? 1 : 2;
    const w = T.hw[wi]!;
    const lt = t - w.start;
    let shake = 0;
    this.hookWords.forEach((hw, i) => (hw.group.visible = i === wi));
    const hw = this.hookWords[wi]!;
    const e = ease.outExpo(clamp(lt / 0.13));
    hw.group.position.set(0, 0, lerp(wi === 1 ? 16 : 45, 0, e));
    hw.group.rotation.set(lerp(-0.25, 0, e), 0, 0);
    shake += (wi === 2 ? 22 : 15) * pulse(t, w.start + 0.05, 0.06);
    o.flash = lt >= 0 && lt < 0.034 ? 0.045 : 0;
    hw.mats.u.heat.value = 0;
    const fov = 30;
    const dFit = this.fitDist(hw.sw, fov);
    let cs: CamState;
    if (cut.id === 'h0') {
      const k = clamp((t - cut.t) / 0.4);
      cs = { pos: v3(lerp(-14, -8, k), lerp(-4, -2.5, k), dFit * lerp(1.02, 0.97, k)), target: v3(-1, 0.3, 0), fov, roll: -0.02 };
    } else if (cut.id === 'h0b') {
      const k = clamp((t - cut.t) / 0.9);
      cs = { pos: v3(lerp(30, 36, k), lerp(9, 11, k), dFit * lerp(1.0, 0.97, k)), target: v3(4, 0, 0), fov, roll: 0.04 };
    } else if (cut.id === 'h1') {
      const k = clamp(lt / 0.25);
      cs = { pos: v3(lerp(8, 12, k), lerp(14, 16, k), 36 - k * 3), target: v3(0, 0.5, 1.5), fov: 38, roll: -0.12 };
    } else {
      const k = clamp(lt / 0.3);
      cs = { pos: v3(lerp(-3, 0, k), lerp(-3, -1.5, k), dFit * lerp(1.0, 0.95, k)), target: v3(0, 0.6, 0), fov, roll: 0.01 };
    }
    if (wi === 2 && t >= this.shatterT) {
      // DEMAND turns into blocks (a gold ripple runs through it) and settles face-on: longtail streams them away
      hw.group.visible = false;
      shake += this.drawBlockify(t);
      const k = prog(t, this.shatterT, this.ctx.end - 0.06, ease.inOutCubic);
      const dEnd = 10 / (2 * Math.tan((fov * Math.PI) / 360) * 0.204) + hw.sw.depth;
      cs = { pos: cs.pos.clone().lerp(v3(0, 0, dEnd), k), target: cs.target.clone().lerp(v3(0, 0, 0), k), fov, roll: lerp(0.01, 0, k) };
    } else if (wi === 2) {
      hw.mats.u.heat.value = 0.25 * smoothstep(this.shatterT - 0.12, this.shatterT, t);
    }
    applyCam(cam, cs);
    // (longtail's opening has no ground grid: fade it out under the blocks)
    const gridA = wi === 2 ? 1 - smoothstep(this.shatterT, this.ctx.end - 0.05, t) : 1;
    groundGrid(L3, cam.position, -5.02, 6, 240, lin('bone', 0.3), 0.55 * gridA);
    return shake;
  }
  fitDist(sw: SolidWord, fov: number, margin = 1.1) {
    const tanH = Math.tan((fov * Math.PI) / 360) * (W / H);
    return ((sw.width / 2) * margin) / tanH + sw.depth;
  }
  /** DEMAND as bone blocks: each block pops in on a left-to-right gold ripple, then cools. */
  private drawBlockify(t: number): number {
    const V = this.hvox, gold = lin('signal'), ember = lin('ember'), bone = lin('bone');
    const u = t - this.shatterT;
    const span = Math.max(0.2, this.ctx.end - this.shatterT - 0.12);
    for (const b of this.shatter) {
      const xn = (b.x + 40) / 80;
      const tb = xn * span * 0.55 + b.d * 0.05;
      const k = clamp((u - tb) / 0.12);
      const pop = k <= 0 ? 0.55 : 1 + 0.25 * Math.sin(k * Math.PI) ;
      const heat = k <= 0 ? 0.35 : Math.exp(-(u - tb) * 7);
      const col = mix3(scl3(bone, 1.55), mix3(scl3(gold, 1.6), scl3(ember, 2), heat), Math.min(1, heat * 1.2));
      const z = b.z + (1 - Math.min(1, k * 1.5)) * (0.8 + b.lane);
      const sz = b.sz * 0.94 * pop;
      // (longtail sets the word 5 % wider: its raster is tracked; ease into its layout)
      const xw = b.x * lerp(1, 1.05, smoothstep(this.shatterT + 0.1, this.ctx.end - 0.05, t));
      V.add(xw, b.y, z, sz, sz, b.sz * 2.6, null, col, heat * 0.6);
    }
    V.fog(400, 1600);
    return 14 * pulse(t, this.shatterT, 0.05);
  }

  // ------------------------------------------------------------------ n = 2: the planet of builders
  private drawPlanetWorld(t: number, f: Frame, cut: Cut, o: PostOverrides): number {
    const T = this.T, L3 = this.L3, cam = this.cam, P = this.planet!;
    const lt = t - cut.t;
    let shake = 0;
    const gold = lin('signal'), bone = lin('bone');
    const hf = surfFrame(HOME_N);
    const homeP = surf(HOME_N, 0);
    const isHook = cut.id.startsWith('h');

    // BUILDER drifts up into orbit after its line
    const drift = prog(t, T.la.end + 0.2, this.cuts.find((c) => c.id === 'sats')!.t, ease.inOutCubic);
    const xfB = XF.basis(surf(HOME_N.clone().applyAxisAngle(hf.right, -0.35 * drift).normalize(), 20 + 45 * drift), hf.right, hf.up.clone().applyAxisAngle(hf.right, -0.35 * drift), hf.fwd.clone().applyAxisAngle(hf.right, -0.35 * drift));
    this.xfB = xfB;

    // ---- camera
    let cs: CamState;
    const hXF = XF.basis(homeP, hf.right, hf.up, hf.fwd);
    if (cut.id === 'pull') {
      // one light, pulling back: exponential dolly from the home light, swinging from overhead to the side
      const k = prog(t, this.ctx.start, T.la.words[0]!.start, (x) => x);
      const d = 0.7 * Math.pow(210 / 0.7, ease.inOutQuad(k) * 0.6 + k * 0.4);
      const ph = lerp(0.04, 1.02, ease.inOutCubic(k));
      const pos = hXF.apply(0, Math.cos(ph) * d, Math.sin(ph) * d, new THREE.Vector3());
      const tg = hXF.apply(0, lerp(0, 16, Math.pow(k, 3)), 0, new THREE.Vector3());
      const up = hXF.dir(0, Math.sin(ph), -Math.cos(ph));
      cs = { pos, target: tg, fov: 36, roll: 0.03 * k, up };
    } else if (cut.id === 'asm') {
      const k = clamp(lt / 1.3);
      cs = camIn(xfB, [lerp(-40, -8, ease.outCubic(k)), lerp(20, 15, k), lerp(104, 88, k)], [0, 6, 0], 36, 0.02);
    } else if (cut.id === 'asm2') {
      const k = clamp(lt / 0.6);
      cs = camIn(xfB, [lerp(44, 38, k), lerp(2, 5, k), lerp(64, 58, k)], [14, 6, 0], 38, -0.05);
    } else if (cut.id === 'waves') {
      const k = clamp(lt / 1.5);
      const yaw = lerp(0.55, -0.15, ease.inOutCubic(k));
      const pos = orbit(v3(0, 0, 0), yaw, lerp(0.62, 0.48, k), lerp(300, 270, k));
      cs = { pos, target: v3(0, 22, 0).lerp(xfB.o, 0.25), fov: 36, roll: -0.04 };
    } else if (cut.id === 'sats') {
      const k = prog(t, T.lb.words[0]!.start - 0.1, T.lb.words[T.lb.words.length - 1]!.start + 0.2, ease.inOutCubic);
      const dirv = HOME_N.clone().multiplyScalar(0.55).add(hf.fwd.clone().multiplyScalar(0.84)).normalize();
      const pos = dirv.multiplyScalar(lerp(300, 500, Math.pow(k, 1.3))).add(v3(lt * 6, 0, 0));
      const wordsAt = this.ringPos(this.ringAngleNear(pos.clone().normalize()) + 0.12, RING_R);
      cs = { pos, target: homeP.clone().lerp(wordsAt, 0.72).multiplyScalar(lerp(1, 0.7, k)), fov: 40, roll: 0.02 };
    } else if (cut.id === 'swarm') {
      const k = clamp(lt / 1.9);
      const pos = orbit(v3(0, 0, 0), lerp(-0.2, 0.08, k), lerp(0.22, 0.3, k), lerp(420, 390, k));
      cs = { pos, target: this.ringPos(this.thFront).multiplyScalar(0.3), fov: 36, roll: 0.05 };
    } else if (cut.id === 'tower') {
      const top = this.towerTop(t);
      cs = camIn(this.xfT, [-38 + lt * 5, 3 + top * 0.3, 62 - lt * 3], [0, Math.max(6, top - 2), 2], 40, -0.03);
    } else if (cut.id === 'standing') {
      const whip = prog(t, T.hw[0]!.start - 0.3, T.hw[0]!.start, ease.inCubic);
      cs = camIn(this.xfT, [52 - lt * 10, 4 + lt * 5, 104 - lt * 8], [0, 19 + whip * 26, 0], 36 - whip * 6, 0.02 + whip * 0.16);
    } else {
      cs = this.hookCam2(t, cut);
    }
    applyCam(cam, cs);

    // ---- planet, stars
    P.set({ cam: cam.position, beat: f.beat, ign0: this.ign0, waveStep: WAVE_STEP, dim: isHook ? 0.8 * (1 - 0.75 * prog(t, T.hw[2]!.start + 0.3, this.ctx.end, ease.inQuad)) : 1 });
    drawStars(L3, this.stars, cam.position, 0.8);
    // the home light as the cursor's tip (it is the first builder)
    const hs = toScreen(cam, homeP.x, homeP.y, homeP.z);
    if (hs.ok && !isHook && cut.id !== 'tower' && cut.id !== 'standing') {
      const dist = cam.position.distanceTo(homeP);
      const vis = HOME_N.dot(cam.position.clone().sub(homeP).normalize());
      if (vis > 0) cursorTip(this.fx, hs.x, hs.y, t, Math.max(clamp(40 / dist, 0.45, 2.2), lerp(2.6, 0, prog(t, this.ctx.start, this.ctx.start + 0.5))), clamp(vis * 3, 0, 1));
      // niche dives into this light: it starts as a big soft glow
      const g0 = 1 - prog(t, this.ctx.start, this.ctx.start + 0.45, ease.outQuad);
      if (vis > 0 && g0 > 0) { for (const [w, k] of [[170, 0.12], [110, 0.18], [64, 0.3]] as const) this.fx.seg2(hs.x, hs.y, hs.x + 0.01, hs.y, w, scl3(gold, k * g0), 0.35); }
    }
    // wave fronts on the beat: bone rings racing outward over the globe from home
    const bNow = f.beat - this.ign0;
    if (!isHook && bNow > -0.2) {
      const kb = Math.floor(bNow), fr = bNow - kb;
      const ang = (kb + ease.outCubic(fr)) * WAVE_STEP;
      if (ang < 2.6) {
        const r = Math.sin(ang) * (PLANET_R + 0.4), h = Math.cos(ang) * (PLANET_R + 0.4);
        circle3(L3, HOME_N.clone().multiplyScalar(h), hf.right, hf.fwd, r, 1.4, scl3(gold, 1.2 * (1 - fr) * 0.8), 1, 120);
      }
    }

    // ---- BUILDER, launched from the lights
    const laFade = 1 - smoothstep(this.cuts.find((c) => c.id === 'sats')!.t - 0.3, this.cuts.find((c) => c.id === 'sats')!.t, t);
    if (laFade > 0) {
      shake += this.drawBuilder(t, 'rise', 0, laFade) * 0.6;
      // the caret at the insertion point, in orbit
      const x = this.caretX(t);
      if (t > T.la.words[0]!.start - 0.4 && t < T.la.end + 0.6) {
        const on = t > T.la.end ? cursorBlink(f.beatPhase) : 1;
        caret3D(L3, this.fx, cam, xfB.apply(x, 0, 1.3, new THREE.Vector3()), xfB.apply(x, 10.6, 1.3, new THREE.Vector3()), on * laFade, t);
        weldSparks(this.fx, t, (tb) => {
          if (tb < T.la.words[0]!.start - 0.1 || tb > T.la.end + 0.3) return null;
          const p = xfB.apply(this.caretX(tb), 0.1, 1.3);
          const s = toScreen(cam, p.x, p.y, p.z);
          return s.ok ? { x: s.x, y: s.y } : null;
        }, { rate: (tb) => { let r = 20; for (const s of T.syl) r += 300 * pulse(tb, s + 0.06, 0.05); return Math.min(r, 700); }, rateMax: 700, life: 0.5, speed: 420, gravity: 500, intensity: 1 });
      }
    } else for (const { p } of this.leadPlanes) p.set({ opacity: 0 });

    // ---- satellites and the ring
    const hands = T.lb.words[T.lb.words.length - 1]!;
    const conv = isHook ? prog(t, T.hw[2]!.start + 0.12, this.ctx.end - 0.08, ease.inOutCubic) : 0;
    const satDim = cut.id === 'tower' ? 0.5 : 1;
    const V = this.vox;
    for (const s of this.sats) {
      const flash = pulse(t, s.tL + 0.5, 0.15);
      const lit = t > hands.start ? 0.35 + 0.65 * pulse(t, hands.start + s.hot * 0.3, 0.3) : 0;
      const col = mix3(scl3(gold, 1.3), scl3(lin('ember'), 3), Math.max(flash, lit * 0.5));
      if (conv <= 0) { drawSat(L3, s, t, scl3(col, satDim), scl3(bone, 0.45 * satDim), 1, 9); continue; }
      // converge into the grid (the die): 13 x 10 tiles of 3 x 3 cells behind DEMAND (machine's opening frame)
      const sp = satPos(s, t);
      if (!sp) continue;
      // 7–8 satellites per tile: they gather on the tile's cells, then the tile closes into one solid gold tile
      const tile = s.i % 130, sub = Math.floor(s.i / 130);
      const tx = (tile % 13) - 6, ty = 4.5 - Math.floor(tile / 13);
      const gxw = tx * DIE.px + ((sub % 3) - 1) * DIE.cx, gyw = ty * DIE.py + (Math.floor(sub / 3) - 1) * DIE.cy;
      const tileX = tx * DIE.px, tileY = ty * DIE.py;
      const dly = hash(s.i, 31) * 0.35;
      const k = ease.inOutCubic(clamp((conv - dly) / (1 - 0.35)));
      const g = this.gridXF.apply(gxw, gyw, 0, new THREE.Vector3());
      const p = sp.p.clone().lerp(g, k);
      if (k < 1) L3.seg(p.x, p.y, p.z, p.x, p.y, p.z + 0.01, 3.2, col[0], col[1], col[2], 1);
      if (k > 0.6) {
        V.xf = this.gridXF;
        const tk = smoothstep(0.6, 1, k);
        const pl = this.gridXF.q.clone().invert();
        const lp = p.clone().sub(this.gridXF.o).applyQuaternion(pl);
        const heat = hash(s.i, 33) < 0.3 ? 1 : 0.45;
        const cc = scl3(mix3(scl3(gold, 0.9), scl3(lin('ember'), 1.5), heat * pulse(t, this.ctx.end - 0.25 + hash(s.i, 34) * 0.2, 0.08)), 1);
        const close = smoothstep(0.55, 0.95, conv);
        if (close < 1) V.add(lp.x, lp.y, lp.z, DIE.cx * 0.9 * tk, DIE.cy * 0.9 * tk, 0.35, null, cc, 0.35 + 0.3 * heat);
        if (s.i < 130 && close > 0) V.add(tileX, tileY, 0, DIE.px * 0.88 * close, DIE.py * 0.86 * close, 0.4, null, scl3(mix3(gold, lin('ember'), 0.35), 1.15), 0.5, DIE.cx);
        V.xf = null;
      }
    }
    if (conv > 0.7) {
      // the die's outline and bus lines
      const a = smoothstep(0.7, 1, conv);
      const G = this.gridXF, E = DIE.px * 6.5 + 1.2, EY = DIE.py * 5 + 1.2;
      const pts = [[-E, -EY], [E, -EY], [E, EY], [-E, EY], [-E, -EY]].map(([x, y]) => G.apply(x!, y!, 0, new THREE.Vector3()));
      for (let i = 1; i < pts.length; i++) L3.seg(pts[i - 1]!.x, pts[i - 1]!.y, pts[i - 1]!.z, pts[i]!.x, pts[i]!.y, pts[i]!.z, 1.6, bone[0] * 0.8, bone[1] * 0.8, bone[2] * 0.8, a);
      for (let i = -3; i <= 3; i++) {
        const A = G.apply(i * 8, -EY, 0, new THREE.Vector3()), B = G.apply(i * 8, -EY - 3, 0, new THREE.Vector3());
        L3.seg(A.x, A.y, A.z, B.x, B.y, B.z, 1.2, bone[0] * 0.5, bone[1] * 0.5, bone[2] * 0.5, a);
      }
    }
    // the ring and the words riding it (line B)
    const ringA = cut.id === 'sats' || cut.id === 'swarm' || cut.id === 'waves' ? 1 : isHook ? 0.4 : cut.id === 'pull' ? 0 : 0.25;
    circle3(L3, v3(0, 0, 0), v3(1, 0, 0).applyQuaternion(this.ringQ), v3(0, 0, 1).applyQuaternion(this.ringQ), RING_R, 1.2, scl3(bone, 0.4 * ringA), 1, 220);
    if (isHook) circle3(L3, v3(0, 0, 0), v3(1, 0, 0).applyQuaternion(this.ringQ), v3(0, 0, 1).applyQuaternion(this.ringQ), HOOK_R, 1.4, scl3(gold, 0.6), 1, 260);
    const ride = (tt: number) => 0.02 * Math.max(0, tt - T.lb.words[0]!.start);
    const thCam = this.ringAngleNear(cam.position.clone().normalize()) + 0.02;
    for (const rw of this.ringWords) {
      const on = t >= rw.w.start && (cut.id === 'sats' || cut.id === 'swarm');
      if (!on) { rw.p.set({ opacity: 0 }); continue; }
      // a train: the newest word arrives at the front; each arrival pushes the earlier ones along the ring
      let push = 0;
      const i0 = this.ringWords.indexOf(rw);
      for (let j = i0 + 1; j < this.ringWords.length; j++) {
        const o2 = this.ringWords[j]!;
        push += ((o2.p.w / 2 + rw.p.w / 2 * (j === i0 + 1 ? 1 : 0) + (j > i0 + 1 ? this.ringWords[j - 1]!.p.w / 2 : 0) + 8) / RING_R) * ease.outExpo(clamp((t - o2.w.start) / 0.16));
      }
      const xf = this.ringXF(thCam + push + ride(t) * 0.5, RING_R + 2);
      const st = 1 + 0.45 * (1 - ease.outExpo(clamp((t - rw.w.start) / 0.12)));
      xf.place(rw.p.mesh, 0, 0, 0, 0, st);
      rw.p.set({ prog: clamp((t - rw.w.start) / Math.max(0.1, rw.w.end - rw.w.start)), done: smoothstep(rw.w.end, rw.w.end + 0.5, t), opacity: 1 });
      rw.p.fog(400, 1400);
      shake += 3 * pulse(t, rw.w.start, 0.05);
    }

    // ---- the tower out of the planet
    if (cut.id === 'tower' || cut.id === 'standing') shake += this.drawTower(t, f, { plinth: false, fogFar: [300, 1200], floorCol: scl3(lin('graphite'), 0.22) });
    else this.hideTower();

    // ---- the hook, in orbit
    if (isHook) shake += this.drawHook2(t, cut, o);
    else for (const hw of this.hookWords) hw.group.visible = false;

    this.vox.fog(600, 2600); this.slabs.fog(600, 2600);
    for (const { p } of this.leadPlanes) p.fog(500, 2000);
    return shake;
  }

  private hookCam2(t: number, cut: Cut): CamState {
    const T = this.T;
    const wi = cut.id === 'h0' || cut.id === 'h0b' ? 0 : cut.id === 'h1' ? 1 : 2;
    const hw = this.hookWords[wi]!;
    const lt = t - cut.t;
    const fov = 32;
    const d = this.fitDist(hw.sw, fov, 1.12);
    const X = hw.xf;
    if (cut.id === 'h0') { const k = clamp(lt / 0.35); return camIn(X, [lerp(-12, -7, k), lerp(-9, -6, k), d * lerp(1.04, 0.98, k)], [-1, 0, 0], fov, -0.05); }
    if (cut.id === 'h0b') { const k = clamp(lt / 0.9); return camIn(X, [lerp(-40, -46, k), lerp(14, 17, k), d * lerp(0.86, 0.8, k)], [-2, -1, 0], fov, 0.06); }
    if (cut.id === 'h1') { const k = clamp(lt / 0.3); return camIn(X, [lerp(10, 16, k), lerp(-12, -14, k), 40 - k * 4], [0, 0, 2], 40, 0.14); }
    // DEMAND, then the satellites converge behind it; the camera pushes to the die as the word flies past
    const k = clamp(lt / 0.3);
    const conv = prog(t, T.hw[2]!.start + 0.12, this.ctx.end - 0.08, ease.inOutCubic);
    const push = ease.inOutCubic(prog(t, this.ctx.end - 0.4, this.ctx.end, (x) => x));
    return camIn(X, [lerp(-2, 0, k) * (1 - push), lerp(-4, -1, k) * (1 - push), lerp(d, 30, push) + conv * 6], [0, 0, lerp(0, -38, push)], lerp(fov, 38, push), 0.01 * (1 - push));
  }

  private drawHook2(t: number, cut: Cut, o: PostOverrides): number {
    const T = this.T;
    const wi = cut.id === 'h0' || cut.id === 'h0b' ? 0 : cut.id === 'h1' ? 1 : 2;
    const w = T.hw[wi]!;
    const lt = t - w.start;
    let shake = 0;
    this.hookWords.forEach((hw, i) => {
      // earlier words stay on the ring (seen in the background of the later shots)
      hw.group.visible = i <= wi;
      const X = hw.xf;
      const e = i === wi ? ease.outExpo(clamp(lt / 0.13)) : 1;
      let z = lerp(i === 1 ? 16 : 45, 0, e);
      if (i === 2) z += 90 * ease.inExpo(prog(t, this.ctx.end - 0.3, this.ctx.end, (x) => x)); // flies past the camera
      X.place(hw.group, 0, 0, z);
      hw.group.rotateX(lerp(-0.3, 0, e));
      hw.mats.u.heat.value = i === wi ? 0.6 * pulse(t, w.start, 0.12) : 0;
      hw.mats.u.fogNear.value = 300; hw.mats.u.fogFar.value = 1300;
    });
    shake += (wi === 2 ? 24 : 16) * pulse(t, w.start + 0.05, 0.06);
    o.flash = 0;
    o.bloom = 0.75;
    return shake;
  }

  // ------------------------------------------------------------------ mono annotations
  drawHud(t: number, cut: Cut) {
    const c = this.hud.ctx, T = this.T;
    c.textBaseline = 'alphabetic';
    const mono = F.mono(500), monoL = F.mono(400);
    c.font = font(mono, 13);
    c.letterSpacing = '2px';
    c.fillStyle = rgba('bone', 0.55);
    const secs = ['NOW EVERYONE’S A BUILDER', T.lb.text.toUpperCase().replace(/[.]/g, ''), 'JUST SAY IT', 'SOFTWARE ON DEMAND'];
    const si = t < T.lb.words[0]!.start - 0.3 ? 0 : t < T.lc.words[0]!.start - 0.3 ? 1 : t < T.hw[0]!.start - 0.05 ? 2 : 3;
    c.fillText(`CHORUS ${this.n}/3 · ${String(si + 1).padStart(2, '0')} ${plainUp(secs[si]!)}`, 96, 78);
    c.textAlign = 'right';
    c.fillText(`FIG. ${this.n}.${si + 1}`, W - 96, 78);
    c.textAlign = 'left';
    c.letterSpacing = '0px';
    const cnt = (list: { tL?: number; tU?: number }[]) => list.filter((a) => t >= (a.tU ?? a.tL ?? 1e9)).length;
    if (cut.id === 'plunge' || cut.id === 'weld' || cut.id === 'asm' || cut.id === 'asm2' || cut.id === 'pull') {
      const n = this.vw.cells.filter((cc) => t >= T.syl[cc.letter]! + 0.05).length * 2;
      c.font = font(monoL, 14);
      c.fillStyle = rgba('bone', 0.7);
      c.fillText(`blocks placed  ${String(n).padStart(4, '0')}`, 96, H - 110);
      const lettersIn = T.syl.filter((s) => t >= s + 0.05).length;
      c.fillText(`letters        ${lettersIn}/7`, 96, H - 88);
      c.fillStyle = rgba('signal', t > T.la.end ? 0.9 : 0.35);
      const weld = cut.id === 'weld' ? 'pass 2 · ' + Math.round(prog(t, cut.t, this.cuts[2]!.t) * 100) + ' %' : lettersIn === 7 ? 'tack ok' : '—';
      c.fillText(`weld           ${weld}`, 96, H - 66);
    }
    if (this.n === 2 && (cut.id === 'pull' || cut.id === 'waves')) {
      c.font = font(monoL, 14);
      c.fillStyle = rgba('signal', 0.85);
      const b = Math.max(0, this.ctx.audio.beatAt(t) - this.ign0 + 1);
      const lit = Math.round(Math.min(8e9, Math.pow(Math.max(1, b), 4.2) * 3.1));
      c.textAlign = 'right';
      c.fillText(`builders online  ${lit.toLocaleString('en-US')}`, W - 96, H - 88);
      c.fillStyle = rgba('bone', 0.5);
      c.fillText('night side · lights = people making things', W - 96, H - 66);
      c.textAlign = 'left';
    }
    const nHands = this.n === 1 ? cnt(this.arms) : this.n === 2 ? cnt(this.sats) : 0;
    if ((cut.id === 'arms' || cut.id === 'dish' || cut.id === 'sats' || cut.id === 'swarm') && nHands > 0) {
      const n = nHands;
      c.font = font(F.mono(300), 88);
      c.fillStyle = rgba('bone', 0.92);
      c.fillText(`× ${n.toLocaleString('en-US')}`, 96, H - 96);
      c.font = font(monoL, 14);
      c.fillStyle = rgba('bone', 0.6);
      c.fillText(this.n === 1 ? `minds 1 · hands ${n.toLocaleString('en-US')} · ratio 1:${n.toLocaleString('en-US')}` : `minds 1 · satellites ${n.toLocaleString('en-US')} · uplink ok`, 100, H - 70);
    }
    if (cut.id === 'tower' || cut.id === 'standing') this.drawFloorLabels(t);
    if (cut.id.startsWith('h')) {
      c.font = font(monoL, 13);
      c.fillStyle = rgba('bone', 0.5);
      c.fillText(this.n === 1 ? 'PART NO. 0001 · QTY: ON DEMAND · LEAD TIME: 0' : this.n === 2 ? 'ORBIT 2 · ALT 96 KM · QTY: ON DEMAND · LEAD TIME: 0' : 'SPELL NO. 3 · CAST: ON DEMAND · LEAD TIME: 0', 96, H - 70);
    }
  }
  private drawFloorLabels(t: number) {
    const c = this.hud.ctx, cam = this.cam, X = this.xfT;
    const x1 = this.towerX[1]!, z1 = this.towerZ[1]!;
    let y = 1.4;
    c.font = font(F.mono(400), 13);
    this.floors.forEach((fl, i) => {
      const h = this.floorH(fl, t);
      if (h < 0.05) return;
      const p = X.apply(x1 + 1.5, y + h * 0.5, z1);
      const s = toScreen(cam, p.x, p.y, p.z);
      y += h;
      if (!s.ok || s.x > W - 120) return;
      const lx = Math.min(W - 330, s.x + 60);
      c.strokeStyle = rgba('bone', 0.4); c.lineWidth = 1;
      c.beginPath(); c.moveTo(s.x + 6, s.y); c.lineTo(lx - 8, s.y); c.stroke();
      c.fillStyle = t < fl.w.end ? rgba('signal', 0.95) : rgba('bone', 0.65);
      c.fillText(`F.${String(i + 1).padStart(2, '0')}  +${fl.h.toFixed(1)} m  ${i === this.floors.length - 1 ? 'topped out' : 'poured'}`, lx, s.y + 4);
    });
    c.fillStyle = rgba('bone', 0.5);
    c.fillText(`height ${this.towerTop(t).toFixed(1)} m · permit: not required`, 96, H - 70);
  }
}

/** A ground grid whose lines fade with distance from the eye (no grey haze at grazing angles). */
export function groundGrid(L3: LineBatch, eye: THREE.Vector3, y: number, step: number, R: number, col: RGB, a0: number) {
  const n = Math.ceil(R / step), cx = Math.round(eye.x / step) * step, cz = Math.round(eye.z / step) * step;
  const fall = R * 0.45, chunk = step * 2;
  for (let axis = 0; axis < 2; axis++) {
    for (let i = -n; i <= n; i++) {
      for (let j = -n; j < n; j += 2) {
        const u = i * step, v0 = j * step, v1 = v0 + chunk;
        const ax = axis ? cx + v0 : cx + u, az = axis ? cz + u : cz + v0;
        const bx = axis ? cx + v1 : cx + u, bz = axis ? cz + u : cz + v1;
        const d = Math.hypot((ax + bx) / 2 - eye.x, (az + bz) / 2 - eye.z);
        const a = a0 * Math.exp(-d / fall) * clamp(1 - d / R);
        if (a < 0.01) continue;
        L3.seg(ax, y, az, bx, y, bz, 1, col[0], col[1], col[2], a);
      }
    }
  }
}

const plainUp = (s: string) => s.replace(/’/g, "'");
void TAU; void box3;
