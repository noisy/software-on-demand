// Thumbnails, author A4 (the three choruses). ctx.params.k = 1..5:
//   1 ONE MIND. 1,000 HANDS.  — the faceless builder, a thousand arms unfolded around them, each holding a gold block
//   2 SOFTWARE ON DEMAND      — the engraved night-side planet, its city lights = builders, the first light a white-hot tip
//   3 YOU’RE THE WIZARD NOW   — a magic circle of code glyphs on the ground, the wand drawing the plan of a tower in light
//   4 JUST SAY IT.            — cobalt blueprint night: the tower of sung words, the top floor still molten, the cursor welding
//   5 NOW EVERYONE’S A …      — macro: BUILDER in blocks, the last letter still dropping in, the weld point spraying sparks
import * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '../engine/scene';
import { FSPass, Layer2D, W, H } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { LIN } from '../engine/palette';
import { F } from '../engine/type';
import { hash, lerp, TAU } from '../engine/util';
import { strokeText } from '../engine/stroke';
import { cursorTip, weldSparks } from './_motifs';
import { headline, kicker, wordmark } from './_thumb';
import { Blocks, WordPlane, applyCam, lin, mix3, quat, scl3, toScreen, v3, voxelText, type CamState, type RGB, type Voxel } from './hook-kit';
import { Figure, armPose, circle3, drawArm, makeArms, type Arm } from './hook-parts';
import { PLANET_R, Planet, drawSat, drawStars, makeSats, makeStars, surf, type Sat } from './hook-planet';
import { Glyphs } from './thumb-a4-glyphs';

const BG = /* glsl */ `
uniform vec3 base; uniform vec3 glowCol; uniform vec2 glowC; uniform float glowR; uniform float gridK;
void main() {
  vec2 p = (vUv - 0.5) * vec2(16.0 / 9.0, 1.0);
  vec3 c = base * (1.0 - 0.35 * smoothstep(0.35, 1.1, length(p)));
  c += glowCol * smoothstep(glowR, 0.0, length((vUv - glowC) * vec2(16.0 / 9.0, 1.0)));
  // faint drafting grid (the blueprint plate)
  if (gridK > 0.0) {
    vec2 g = FRAG_PX / 48.0;
    float gl = max(hatch(g.x, 0.03), hatch(g.y, 0.03));
    c += C_BONE * gl * 0.05 * gridK;
  }
  fragColor = vec4(c, 1.0);
}`;

export default class ThumbA4 extends Scene {
  k = 1;
  cam = new THREE.PerspectiveCamera(35, W / H, 0.5, 8000);
  world = new THREE.Scene();
  vox = new Blocks(12000, { edgeW: 0.07 });
  slabs = new Blocks(400, { edgeW: 0.09, grid: 2 });
  L3 = new LineBatch(120000, { screen2D: false, depthTest: true, blend: 'add' });
  fx = new LineBatch(20000, { blend: 'add' });
  glyphs = new Glyphs(6000);
  type = new Layer2D();
  bg = new FSPass(BG, {
    base: { value: new THREE.Vector3(...LIN.ink) }, glowCol: { value: new THREE.Vector3() }, glowC: { value: new THREE.Vector2(0.5, 0.5) },
    glowR: { value: 0.6 }, gridK: { value: 0 },
  });
  figure: Figure | null = null;
  arms: Arm[] = [];
  planet: Planet | null = null;
  sats: Sat[] = [];
  stars = makeStars(1600, 3000);
  cells: Voxel[] = [];
  vw = 0;
  floors: { txt: string; h: number; plane: WordPlane }[] = [];

  override async init() {
    this.k = Number(this.ctx.params.k ?? 1);
    this.world.add(this.vox.mesh, this.slabs.mesh, this.glyphs.mesh);
    const k = this.k;
    if (k === 1) {
      this.figure = new Figure(); this.world.add(this.figure.group);
      this.arms = makeArms(1000, v3(0, 8, -2), 8.5, 3.3, () => -100, { dish: 1.5, tilt: 0.5, scaleK: 0.06 });
    }
    if (k === 2) {
      this.planet = new Planet(HOME2);
      this.world.add(this.planet.mesh);
      this.sats = makeSats(1000, HOME2, () => -100);
    }
    if (k === 4) this.buildTower();
    if (k === 5) {
      const vt = voxelText('BUILDER', F.archivo(100, 900), 9, 0.02);
      this.cells = vt.cells; this.vw = vt.width;
      this.figure = new Figure(); this.world.add(this.figure.group);
    }
  }

  private buildTower() {
    const fam = F.archivo(62, 900);
    const words = ['JUST', 'SAY', 'IT,', 'AND', 'IT’S', 'STANDING:'];
    words.forEach((txt, i) => {
      const h = i === 5 ? 8.5 : i < 2 ? 5.6 : 4.4;
      let cap = h * 0.6;
      const probe = new WordPlane(txt, fam, cap, { px: 200, ax: 0.5, ay: 0 });
      if (probe.w > 42 * 0.86) cap *= (42 * 0.86) / probe.w;
      const plane = cap === h * 0.6 ? probe : new WordPlane(txt, fam, cap, { px: 200, ax: 0.5, ay: 0 });
      this.world.add(plane.mesh);
      this.floors.push({ txt, h, plane });
    });
  }

  override render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer } = this.ctx;
    this.vox.clear(); this.slabs.clear(); this.L3.clear(); this.fx.clear(); this.glyphs.clear();
    const c = this.type.ctx; this.type.clear();
    const u = this.bg.u;
    (u.base!.value as THREE.Vector3).set(...LIN.ink); (u.glowCol!.value as THREE.Vector3).set(0, 0, 0); u.gridK!.value = 0;
    const o: PostOverrides = { bloom: 0.75, bloomThreshold: 0.95, bloomKnee: 0.3, vignette: 0.45, ca: 0.7, grain: 0.045, hud: 0 };
    const t = f.t;
    if (this.k === 1) this.k1(t, f, c, o);
    else if (this.k === 2) this.k2(t, f, c, o);
    else if (this.k === 3) this.k3(t, f, c, o);
    else if (this.k === 4) this.k4(t, f, c, o);
    else this.k5(t, f, c, o);
    this.bg.render(renderer, out);
    renderer.setRenderTarget(out); renderer.clearDepth();
    this.vox.commit(); this.slabs.commit(); this.glyphs.commit();
    renderer.render(this.world, this.cam);
    this.L3.render(renderer, out, this.cam);
    this.fx.render(renderer, out);
    this.ctx.comp.draw(renderer, this.type.upload(), out);
    return o;
  }

  // ------------------------------------------------------------------ 1: one mind, a thousand hands
  private k1(t: number, f: Frame, c: CanvasRenderingContext2D, o: PostOverrides) {
    const fig = this.figure!, cam = this.cam;
    applyCam(cam, { pos: v3(-46, 12, 182), target: v3(-46, 9.5, 0), fov: 35, roll: 0 });
    const P = fig.pose(v3(0, -1, 2), 1, v3(-13, 21, 7), v3(13, 21, 7), v3(0, 16, 100), 0.3);
    fig.set({ cam: cam.position, key: v3(0, 22, 20), keyI: 0.25, fog: [300, 900], glow: 0.08 });
    const bone = lin('bone'), gold = lin('signal'), ember = lin('ember');
    // the mind: a gold ring around the head, and a white-hot point where the hands' work begins
    circle3(this.L3, P.head, v3(1, 0, 0), v3(0, 1, 0), 4.6, 3.2, scl3(gold, 2.2), 1, 80);
    circle3(this.L3, P.head, v3(1, 0, 0), v3(0, 1, 0), 6.2, 1.4, scl3(gold, 1.0), 1, 80);
    for (const a of this.arms) {
      const ps = armPose(a, 0, a.ring * 0.13 + a.ph * 0.4, 0.6, 1);
      if (!ps) continue;
      const far = 1 - a.ring * 0.03;
      drawArm(this.L3, a, ps, scl3(bone, 0.55 * far), mix3(scl3(bone, 0.7), scl3(gold, 1.3), 0.6), 0.65 + 0.35 * far, 1.5);
      const p = ps.p[3]!.clone().addScaledVector(ps.dir, a.l[2] * 0.75);
      const s = 0.66 * (a.l[0] / 2.3);
      const hot = hash(a.i, 5) < 0.12 ? 1 : 0;
      this.vox.add(p.x, p.y, p.z, s, s, s, quat(a.ph * 3, a.wob * 2, 0), mix3(scl3(gold, 1.05), scl3(ember, 1.8), hot), 0.55 + 0.35 * hot);
    }
    const inscr = v3(0, 8, 1);
    circle3(this.L3, inscr, v3(1, 0, 0), v3(0, 1, 0), 53.5, 1.4, scl3(bone, 0.35), 1, 200);
    circle3(this.L3, inscr, v3(1, 0, 0), v3(0, 1, 0), 57, 1.0, scl3(bone, 0.22), 1, 200);
    this.vox.fog(400, 1400);
    (this.bg.u.glowCol!.value as THREE.Vector3).set(...scl3(lin('blood'), 0.07));
    (this.bg.u.glowC!.value as THREE.Vector2).set(0.68, 0.52); this.bg.u.glowR!.value = 0.55;
    kicker(c, 'A SONG FOR BUILDERS', 104, 330, { size: 32 });
    headline(c, ['ONE MIND.', '1,000 HANDS.'], { x: 100, y: 520, size: 176, width: 62, maxWidth: 760, gold: ['1,000', 'hands.'], lineGap: 0.98 });
    wordmark(c, 104, 1000 - 20, 46);
    void t; void f; void o;
  }

  // ------------------------------------------------------------------ 2: software on demand (the planet)
  private k2(t: number, f: Frame, c: CanvasRenderingContext2D, o: PostOverrides) {
    const P = this.planet!, cam = this.cam;
    const target = v3(-70, 92, 0);
    applyCam(cam, { pos: target.clone().add(v3(0, 30, 212)), target, fov: 35, roll: 0.06 });
    P.set({ cam: cam.position, beat: 1000, ign0: 0, waveStep: 0.14, dim: 1 });
    drawStars(this.L3, this.stars, cam.position, 0.9);
    const gold = lin('signal'), bone = lin('bone');
    // satellites: fewer near the headline (a clear field behind the type)
    for (const s of this.sats) {
      const sp = s.from; void sp;
      const pos = drawSatAt(s, 0);
      const sc = toScreen(cam, pos.x, pos.y, pos.z);
      const inType = sc.x < 1080 && sc.y < 640;
      const a = inType ? 0.12 : 0.85;
      drawSat(this.L3, s, 0, scl3(mix3(gold, lin('ember'), 0.3), 1.4), scl3(bone, 0.5), a, 14);
    }
    // the first builder: the home light as the cursor's white-hot tip, with the demand line rising from it
    const hp = surf(HOME2, 0.3);
    const hs = toScreen(cam, hp.x, hp.y, hp.z);
    if (hs.ok) {
      cursorTip(this.fx, hs.x, hs.y, t, 2.4, 1.2);
    }
    (this.bg.u.glowCol!.value as THREE.Vector3).set(...scl3(lin('blood'), 0.06));
    (this.bg.u.glowC!.value as THREE.Vector2).set(0.7, 0.2); this.bg.u.glowR!.value = 0.8;
    kicker(c, 'A SONG FOR BUILDERS', 104, 180, { size: 32 });
    headline(c, ['SOFTWARE', 'ON DEMAND'], { x: 98, y: 380, size: 214, width: 75, maxWidth: 980, gold: ['demand'], lineGap: 0.9 });
    void f; void o; void PLANET_R;
  }

  // ------------------------------------------------------------------ 3: you're the wizard now
  private k3(t: number, f: Frame, c: CanvasRenderingContext2D, o: PostOverrides) {
    const cam = this.cam, L3 = this.L3, G = this.glyphs;
    applyCam(cam, { pos: v3(-58, 62, 96), target: v3(-24, 16, 0), fov: 38, roll: 0.03 });
    const gold = lin('signal'), ember = lin('ember');
    const X = v3(1, 0, 0), Z = v3(0, 0, 1), C = v3(0, 0.05, 0);
    // the circle on the ground
    for (const [r, w] of [[20, 1.8], [22, 1.3], [30, 1.3], [34, 1.8], [42, 2.4], [44.5, 1.2]] as const) circle3(L3, C, X, Z, r, w, scl3(gold, 1.4), 1, 160);
    for (let i = 0; i < 120; i++) { const a = (i / 120) * TAU, Lk = i % 10 === 0 ? 2.5 : 1.2; L3.seg(Math.cos(a) * 42, 0.05, Math.sin(a) * 42, Math.cos(a) * (42 + Lk), 0.05, Math.sin(a) * (42 + Lk), 1.1, gold[0] * 1.1, gold[1] * 1.1, gold[2] * 1.1, 1); }
    for (let s = 0; s < 2; s++) for (let i = 0; i < 4; i++) {
      const a = 0.3 + s * (Math.PI / 4) + (i / 4) * TAU, b = a + TAU / 4;
      L3.seg(Math.cos(a) * 20, 0.05, Math.sin(a) * 20, Math.cos(b) * 20, 0.05, Math.sin(b) * 20, 1.6, gold[0] * 1.3, gold[1] * 1.3, gold[2] * 1.3, 1);
    }
    for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; L3.seg(Math.cos(a) * 22, 0.05, Math.sin(a) * 22, Math.cos(a) * 30, 0.05, Math.sin(a) * 30, 1.0, gold[0] * 0.7, gold[1] * 0.7, gold[2] * 0.7, 1); }
    G.ring(v3(0, 0.08, 0), X, Z, 26, 4.8, 44, 0.2, 0, scl3(mix3(gold, ember, 0.3), 1.6));
    G.ring(v3(0, 0.08, 0), X, Z, 38.2, 3.2, 70, -0.1, 1, scl3(gold, 1.3));
    // one vertical ring of the armillary, tilted
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.5, 0.7, 0.15));
    const u = v3(1, 0, 0).applyQuaternion(q), v = v3(0, 1, 0).applyQuaternion(q);
    const ac = v3(0, 20, 0);
    circle3(L3, ac, u, v, 36, 1.6, scl3(gold, 1.1), 1, 160); circle3(L3, ac, u, v, 31.8, 1.0, scl3(gold, 0.6), 1, 160);
    G.ring(ac, u, v, 33.9, 3.0, 56, 0.4, 3, scl3(gold, 1.1), 0.8);
    // the plan in light: the tower's wireframe rising from the circle, drawn up to the wand's tip
    const x0 = -9, x1 = 9, z0 = -5, z1 = 5, lv = [1, 6, 11, 15, 19, 23, 31];
    const seg = (a: THREE.Vector3, b: THREE.Vector3, w = 1.6, k = 1.5) => { L3.seg(a.x, a.y, a.z, b.x, b.y, b.z, w, gold[0] * k, gold[1] * k, gold[2] * k, 1); L3.seg(a.x, a.y, a.z, b.x, b.y, b.z, w * 3.5, gold[0] * 0.2, gold[1] * 0.2, gold[2] * 0.2, 1); };
    for (const [x, z] of [[x0, z0], [x1, z0], [x1, z1], [x0, z1]] as const) seg(v3(x, 1, z), v3(x, x === x1 && z === z1 ? 27 : 31, z));
    for (const y of lv) { seg(v3(x0, y, z1), v3(x1, y, z1)); seg(v3(x0, y, z0), v3(x1, y, z0), 1.2, 0.8); seg(v3(x0, y, z0), v3(x0, y, z1), 1.2, 0.9); if (y < 27) seg(v3(x1, y, z0), v3(x1, y, z1), 1.2, 0.9); }
    const tip = v3(x1, 27, z1);
    seg(v3(x1, 23, z1), tip, 2.4, 2.4);
    // the wand: from the upper right into the tip
    const a = toScreen(cam, tip.x, tip.y, tip.z), hand = toScreen(cam, tip.x + 22, tip.y + 20, tip.z + 26);
    this.fx.seg2(a.x, a.y, hand.x, hand.y, 9, scl3(gold, 2.0), 1);
    this.fx.seg2(a.x, a.y, hand.x, hand.y, 30, scl3(gold, 0.3), 0.4);
    this.fx.seg2(hand.x, hand.y, hand.x + (hand.x - a.x) * 0.4, hand.y + (hand.y - a.y) * 0.4, 14, scl3(lin('blood'), 1.1), 1);
    cursorTip(this.fx, a.x, a.y, t, 3.2, 1.3);
    weldSparks(this.fx, t, () => ({ x: a.x, y: a.y }), { rate: 260, life: 0.6, speed: 380, gravity: 500, intensity: 1.2, width: 2.2, seed: 11 });
    (this.bg.u.glowCol!.value as THREE.Vector3).set(...scl3(lin('blood'), 0.12));
    (this.bg.u.glowC!.value as THREE.Vector2).set(0.62, 0.45); this.bg.u.glowR!.value = 0.7;
    kicker(c, 'A SONG FOR BUILDERS', 104, 160, { size: 32 });
    headline(c, ['YOU’RE THE', 'WIZARD NOW'], { x: 98, y: 350, size: 200, width: 75, maxWidth: 900, gold: ['wizard'], lineGap: 0.9 });
    void f; void o;
  }

  // ------------------------------------------------------------------ 4: just say it (cobalt)
  private k4(t: number, f: Frame, c: CanvasRenderingContext2D, o: PostOverrides) {
    const cam = this.cam, S = this.slabs, L3 = this.L3;
    (this.bg.u.base!.value as THREE.Vector3).set(...scl3(lin('cobalt'), 0.9)); this.bg.u.gridK!.value = 1;
    (this.bg.u.glowCol!.value as THREE.Vector3).set(...scl3(lin('cobalt'), 0.5));
    (this.bg.u.glowC!.value as THREE.Vector2).set(0.7, 0.35); this.bg.u.glowR!.value = 0.7;
    applyCam(cam, { pos: v3(-58, -2, 70), target: v3(-17, 20, 0), fov: 44, roll: -0.05 });
    const bone = lin('bone'), gold = lin('signal'), ember = lin('ember');
    const x0 = -21, x1 = 21, z0 = -7, z1 = 7;
    // ground plan lines on the paper
    for (let i = -12; i <= 12; i++) { L3.seg(i * 10, 0, -150, i * 10, 0, 90, 1, bone[0] * 0.4, bone[1] * 0.4, bone[2] * 0.4, 0.5); L3.seg(-150, 0, i * 10, 150, 0, i * 10, 1, bone[0] * 0.4, bone[1] * 0.4, bone[2] * 0.4, 0.5); }
    S.add(0, -1, 0, 50, 2, 22, null, scl3(lin('ink2'), 1.5), 0, 0);
    let y = 0;
    this.floors.forEach((fl, i) => {
      const last = i === this.floors.length - 1;
      const base = last ? scl3(gold, 1.15) : scl3(lin('ink2'), 1.3);
      S.add(0, y + fl.h / 2, 0, x1 - x0, fl.h - 0.12, z1 - z0, null, base, last ? 0.35 : 0, last ? -1 : 1.75);
      S.add(0, y + fl.h - 0.2, 0, x1 - x0 + 0.8, 0.4, z1 - z0 + 0.8, null, scl3(lin('ash'), 0.6));
      fl.plane.mesh.position.set(0, y + fl.h * 0.18, z1 + 0.45);
      fl.plane.set({ prog: 1, done: 1, opacity: 1, aDim: 0, doneC: last ? scl3(lin('ink'), 1) : scl3(bone, 0.85) });
      if (last) { fl.plane.mat.blending = THREE.CustomBlending; fl.plane.mat.blendSrc = THREE.ZeroFactor; fl.plane.mat.blendDst = THREE.OneMinusSrcAlphaFactor; }
      y += fl.h;
    });
    const top = y;
    // scaffold around the live floor, and dimension lines on the paper
    const sc = scl3(bone, 0.55);
    for (const [ax, az, bx, bz] of [[x0 - 1.2, z0 - 1.2, x1 + 1.2, z0 - 1.2], [x1 + 1.2, z0 - 1.2, x1 + 1.2, z1 + 1.2], [x1 + 1.2, z1 + 1.2, x0 - 1.2, z1 + 1.2], [x0 - 1.2, z1 + 1.2, x0 - 1.2, z0 - 1.2]] as const) {
      L3.seg(ax, top + 3, az, bx, top + 3, bz, 1.2, sc[0], sc[1], sc[2], 1);
      L3.seg(ax, top - 8.5, az, ax, top + 3, az, 1.2, sc[0], sc[1], sc[2], 1);
    }
    L3.seg(x0 - 6, 0, z1, x0 - 6, top, z1, 1.3, bone[0] * 0.8, bone[1] * 0.8, bone[2] * 0.8, 1);
    for (const yy of [0, top]) L3.seg(x0 - 7.5, yy, z1, x0 - 4.5, yy, z1, 1.3, bone[0] * 0.8, bone[1] * 0.8, bone[2] * 0.8, 1);
    // the cursor welding the top floor's corner
    const w0 = v3(x1 + 0.2, top, z1 + 0.6), w1 = v3(x1 + 0.2, top + 8, z1 + 0.6);
    const a = toScreen(cam, w0.x, w0.y, w0.z), b = toScreen(cam, w1.x, w1.y, w1.z);
    this.fx.seg2(a.x, a.y, b.x, b.y, 8, scl3(gold, 2.0), 1); this.fx.seg2(a.x, a.y, b.x, b.y, 24, scl3(gold, 0.35), 0.35);
    cursorTip(this.fx, a.x, a.y, t, 2.6, 1.2);
    weldSparks(this.fx, t, () => ({ x: a.x, y: a.y }), { rate: 320, life: 0.6, speed: 420, gravity: 1100, intensity: 1.2, width: 2.2, seed: 5 });
    this.slabs.fog(500, 1600);
    void ember;
    kicker(c, 'A SONG FOR BUILDERS', 104, 180, { size: 32, color: 'signal' });
    headline(c, ['JUST', 'SAY IT.'], { x: 96, y: 440, size: 250, width: 75, maxWidth: 820, gold: ['it.'], lineGap: 0.9, shadow: 0.4 });
    void f; void o;
  }

  // ------------------------------------------------------------------ 5: now everyone's a builder (macro weld)
  private k5(t: number, f: Frame, c: CanvasRenderingContext2D, o: PostOverrides) {
    const cam = this.cam, V = this.vox, L3 = this.L3;
    const x0 = -this.vw / 2;
    applyCam(cam, { pos: v3(-21, 3.5, 64), target: v3(3.5, 6.0, 0), fov: 40, roll: -0.03 });
    const bone = lin('bone'), gold = lin('signal'), ember = lin('ember');
    // the bench top
    this.slabs.add(0, -1.25, -3, 140, 2.5, 26, null, scl3(lin('ink2'), 1.35), 0, 0);
    for (let i = -60; i <= 60; i++) { const L = i % 10 === 0 ? 1.6 : i % 5 === 0 ? 1.0 : 0.55; L3.seg(i, 0.02, 9.6, i, 0.02, 9.6 - L, 1, bone[0] * 0.5, bone[1] * 0.5, bone[2] * 0.5, 0.7); }
    // BUILDER: R is the letter being built right now — its upper blocks still falling, hot
    const lastL = 6;
    let rx1 = -1e9;
    for (let i = 0; i < this.cells.length; i++) {
      const cl = this.cells[i]!;
      let y = cl.y + 0.5, rx = 0, rz = 0, col = scl3(bone, 0.66), glow = 0;
      if (cl.letter === lastL) {
        rx1 = Math.max(rx1, cl.x);
        const u = cl.y / 9;
        const fall = Math.max(0, u - 0.62) * (1.4 + hash(i, 3));
        y += fall * fall * 14 + fall * 3;
        rx = fall * (hash(i, 4) - 0.5) * 2; rz = fall * (hash(i, 5) - 0.5) * 2;
        const heat = Math.max(0, 1 - u * 0.4) * (fall > 0 ? 1 : 0.8);
        col = mix3(scl3(bone, 0.7), scl3(gold, 1.7), Math.min(1, heat + 0.2));
        glow = 0.45 * heat;
      } else if (cl.letter === lastL - 1) { col = mix3(scl3(bone, 0.66), scl3(gold, 1.4), 0.25); glow = 0.1; }
      for (const z of [-0.5, 0.5]) V.add(x0 + cl.x + 0.5, y, z, 0.94, 0.94, 0.94, rx || rz ? quat(rx, 0, rz) : null, col, glow);
    }
    // the builder, dark behind the word
    const fig = this.figure!;
    fig.pose(v3(24, -1, -18), 1, v3(18, 2, -4), v3(32, 1.5, -2), v3(30, 3, 0), 0);
    fig.group.visible = false;
    fig.set({ cam: cam.position, key: v3(x0 + rx1 + 1.5, 0.3, 1.3), keyI: 1.2, fog: [200, 900], glow: 0 });
    // the weld point at R's foot, and the caret
    const wp = v3(x0 + rx1 + 1.6, 0.15, 1.3);
    const a = toScreen(cam, wp.x, wp.y, wp.z), b = toScreen(cam, wp.x, wp.y + 10.6, wp.z);
    this.fx.seg2(a.x, a.y, b.x, b.y, 10, scl3(gold, 2.0), 1); this.fx.seg2(a.x, a.y, b.x, b.y, 30, scl3(gold, 0.35), 0.35);
    cursorTip(this.fx, a.x, a.y, t, 3.2, 1.3);
    weldSparks(this.fx, t, () => ({ x: a.x, y: a.y }), { rate: 520, life: 0.7, speed: 620, gravity: 1400, intensity: 1.3, width: 2.4, seed: 3 });
    V.fog(200, 700); this.slabs.fog(200, 700);
    void ember;
    (this.bg.u.glowCol!.value as THREE.Vector3).set(...scl3(lin('blood'), 0.08));
    (this.bg.u.glowC!.value as THREE.Vector2).set(0.75, 0.55); this.bg.u.glowR!.value = 0.6;
    kicker(c, 'A SONG FOR BUILDERS', 104, 118, { size: 30 });
    headline(c, ['NOW EVERYONE’S A'], { x: 98, y: 270, size: 160, width: 75, maxWidth: 1500, gold: ['everyone’s'], lineGap: 0.9 });
    void f; void o;
  }
}

/** Chorus 2's thumbnail home light: on the visible cap of the globe. */
const HOME2 = v3(-0.42, 0.7, 0.58).normalize();
/** Satellite position with no launch animation (fully in orbit). */
function drawSatAt(s: Sat, t: number) {
  const th = s.ph + s.w * (t - s.tL - 0.3);
  return v3(Math.cos(th) * s.r, 0, Math.sin(th) * s.r).applyQuaternion(s.q);
}
void lerp; void strokeText;
type _ = RGB | CamState;
