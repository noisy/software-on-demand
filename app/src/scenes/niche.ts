// `niche` — "Every niche" (pre-chorus 2: "Every niche and every dream, / now it's worth the machine.")
// A map table in 3D: a dot-matrix world (bone dots on ink) on an engraved table.
//  1. internals' finished app (three gold blocks) drops out of the sky onto Lyon: first ripple.
//  2. "Every niche and every dream," — structural karaoke: every sung word is a pin that drops on the map,
//     its flag carrying the word; each pin sprouts a tiny line-drawn model of a niche app (a bakery rota, a
//     harbour tide table, a choir's parts, a temple walk, a star party). "dream," is held: its flag stretches.
//     Dozens, then hundreds of small lights rain in on the beats.
//  3. "now it's worth the machine." — stamped onto a value/cost label standing on the table edge; on
//     "machine" a GPU rack slams in along the table, its fans spin up and gold cables run out to every light.
//  4. The camera dives toward the first light (Lyon), which is all that is left: the first light of hook2's planet.
import * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '../engine/scene';
import { FSPass, Layer2D, W, H, clearRT } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { HEX, LIN, rgba } from '../engine/palette';
import { F, font } from '../engine/type';
import { norm, type Line, type Word } from '../engine/lyrics';
import { clamp, ease, frameIdx, hash, keys, lerp, mulberry32, prog, pulse, smoothstep, springStep, TAU } from '../engine/util';
import { cursorTip, weldSparks } from './_motifs';
import { Projector, setCam, setEngraveCam, engraveMat, mixCam, v3, add3, sub3, norm3, lerp3, mulRGB, type CamKey, type P3, type RGB } from './jevons-kit';
import { landDots, llToXZ, NICHES, SUNG, MAP, type ModelKind } from './niche-map';

type Pin = { x: number; z: number; tl: number; h: number; label?: string; big: boolean; sung?: number };
const RACK = { x: 1.9, z: 4.05, w: 1.35, h: 2.7, d: 1.1, x0: 13 };
const CARD = { x: -3.9, z: 4.35, w: 3.6, h: 1.8 };

export default class Niche extends Scene {
  cam = new THREE.PerspectiveCamera(34, W / H, 0.05, 400);
  pr = new Projector();
  world = new THREE.Scene();
  mats: THREE.RawShaderMaterial[] = [];
  rack = new THREE.Group();
  Ld = new LineBatch(9000, { screen2D: false, worldWidth: true, blend: 'add', depthTest: true });
  L3 = new LineBatch(40000, { screen2D: false, blend: 'add', depthTest: true });
  L2 = new LineBatch(6000, { screen2D: true, blend: 'add' });
  text = new Layer2D();
  bg = new FSPass(/* glsl */ `
    uniform float uFade;
    void main() {
      vec2 p = (vUv - 0.5) * vec2(16.0 / 9.0, 1.0);
      vec3 c = mix(C_INK, C_INK2, 0.5 * (1.0 - smoothstep(0.0, 1.1, length(p))) * uFade);
      fragColor = vec4(c, 1.0);
    }`, { uFade: { value: 1 } });

  T0 = 0; T1 = 0;
  l1!: Line; l2!: Line;
  sungW: Word[] = [];
  wNow!: Word; wIts!: Word; wWorth!: Word; wThe!: Word; wMachine!: Word;
  tApp = 0; tKyoto = 0; tDream = 0; tWide = 0; tCard = 0; tDolly = 0; tUp = 0; tUp2 = 0; tDive = 0;
  dots: { x: number; z: number }[] = [];
  pins: Pin[] = [];
  lyon = v3();

  override async init() {
    const ly = this.ctx.lyrics, au = this.ctx.audio;
    this.T0 = this.ctx.start; this.T1 = this.ctx.end;
    this.l1 = ly.get('Every niche');
    this.l2 = ly.get('worth the machine');
    this.sungW = this.l1.words.slice(0, 5);
    const w2 = (q: string) => this.l2.words.find((w) => norm(w.w) === norm(q))!;
    this.wNow = w2('now'); this.wIts = w2("it's"); this.wWorth = w2('worth'); this.wThe = w2('the'); this.wMachine = w2('machine');
    const beatAfter = (x: number) => au.timeOfBeat(Math.ceil(au.beatAt(x) - 1e-3));
    const beatBefore = (x: number) => au.timeOfBeat(Math.floor(au.beatAt(x) + 1e-3));
    const downAfter = (x: number) => au.downbeats.find((d) => d >= x - 0.02) ?? beatAfter(x);
    this.tApp = beatAfter(this.T0 + 0.15);
    this.tKyoto = this.sungW[3]!.start - 0.3;
    this.tDream = this.sungW[4]!.start - 0.3;
    this.tWide = beatAfter(this.sungW[4]!.start + 0.6);
    this.tCard = beatBefore(this.wNow.start);
    this.tDolly = downAfter(this.wIts.start);
    this.tUp = this.wMachine.end;
    this.tUp2 = downAfter(this.tUp + 0.1);
    this.tDive = au.timeOfBeat(Math.round(au.beatAt(this.T1)) - 2);

    this.dots = landDots();
    // the sung pins
    SUNG.forEach((s, i) => {
      const p = llToXZ(s.lon, s.lat);
      this.pins.push({ x: p.x, z: p.z, tl: this.sungW[i]!.start, h: 0.95 + (i === 4 ? 0.2 : 0), label: s.label, big: true, sung: i });
    });
    const L0 = this.pins[0]!;
    this.lyon = v3(L0.x, 0, L0.z);
    // the rain of small lights: on every beat from "and", more and more
    const rnd = mulberry32(4242);
    const pool = this.dots.map((d, i) => ({ d, k: rnd(), i })).sort((a, b) => a.k - b.k);
    let pi = 0, ni = 0;
    const b0 = Math.ceil(au.beatAt(this.sungW[2]!.start + 0.05));
    const b1 = Math.floor(au.beatAt(this.tDive + 0.1));
    for (let b = b0; b <= b1; b++) {
      const tb = au.timeOfBeat(b);
      const n = Math.round(3 + (b - b0) * 1.6 + (tb > this.wMachine.start ? 10 : 0));
      for (let k = 0; k < n && pi < pool.length; k++, pi++) {
        const d = pool[pi]!.d;
        // avoid the sung pins
        if (this.pins.some((p) => p.big && Math.hypot(p.x - d.x, p.z - d.z) < 0.45)) continue;
        const lab = rnd() < 0.45 ? NICHES[ni++ % NICHES.length] : undefined;
        this.pins.push({ x: d.x, z: d.z, tl: tb + (k % 4) * 0.06 * (rnd() < 0.5 ? 1 : 0), h: 0.22 + rnd() * 0.22, label: lab, big: false });
      }
    }
    this.buildTable();
    this.buildRack();
  }

  // ------------------------------------------------------------------ meshes
  buildTable() {
    const mWood = engraveMat({ world: 14, cross: 0.3, border: 1, sil: 0, line: mulRGB(LIN.bone, 0.5), hair: 0.05 });
    const mTop = engraveMat({ world: 0.001, cross: 0, border: 0, sil: 0, hair: 0.0, line: mulRGB(LIN.ink2, 1), body: mulRGB(LIN.ink2, 0.8) });
    this.mats.push(mWood, mTop);
    const TW = MAP.W + 1.6, TD = MAP.H + 2.4;
    const top = new THREE.Mesh(new THREE.BoxGeometry(TW, 0.4, TD), mTop);
    top.position.set(0, -0.2, 0.55);
    this.world.add(top);
    // a raised engraved frame around the map
    const fr = (w: number, d: number, x: number, z: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.12, d), mWood);
      m.position.set(x, 0.04, z);
      this.world.add(m);
    };
    fr(TW, 0.3, 0, 0.55 - TD / 2 + 0.15); fr(TW, 0.3, 0, 0.55 + TD / 2 - 0.15);
    fr(0.3, TD, -TW / 2 + 0.15, 0.55); fr(0.3, TD, TW / 2 - 0.15, 0.55);
    // apron below the top edge
    const ap = new THREE.Mesh(new THREE.BoxGeometry(TW, 0.9, TD - 0.2), mWood);
    ap.position.set(0, -0.85, 0.55);
    this.world.add(ap);
  }

  buildRack() {
    const mCab = engraveMat({ world: 22, cross: 0.4, border: 1, sil: 0, line: mulRGB(LIN.bone, 0.75), hair: 0.08 });
    const mUnit = engraveMat({ world: 40, cross: 0.2, border: 1, sil: 0, line: mulRGB(LIN.bone, 0.6), hair: 0.1 });
    this.mats.push(mCab, mUnit);
    const { w, h, d } = RACK;
    const side = (x: number) => { const m = new THREE.Mesh(new THREE.BoxGeometry(0.08, h, d), mCab); m.position.set(x, h / 2, 0); this.rack.add(m); };
    side(-w / 2 + 0.04); side(w / 2 - 0.04);
    const cap = (y: number) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.1, d), mCab); m.position.set(0, y, 0); this.rack.add(m); };
    cap(0.05); cap(h - 0.05);
    const back = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.05), mCab);
    back.position.set(0, h / 2, -d / 2 + 0.03);
    this.rack.add(back);
    for (let i = 0; i < 7; i++) {
      const u = new THREE.Mesh(new THREE.BoxGeometry(w - 0.2, 0.3, d - 0.15), mUnit);
      u.position.set(0, 0.28 + i * 0.34, 0.02);
      this.rack.add(u);
    }
    this.rack.position.set(RACK.x0, 0, RACK.z);
    this.world.add(this.rack);
  }

  // ------------------------------------------------------------------ time functions
  rackX(t: number) {
    const tm = this.wMachine.start;
    if (t < tm) return lerp(RACK.x0, RACK.x, prog(t, tm - 0.5, tm, ease.inQuad));
    return RACK.x + 0.25 * Math.sin(clamp((t - tm) / 0.25) * Math.PI) * Math.exp(-(t - tm) * 6) * 0.6;
  }
  fanSpeed(t: number) { return 2 + 38 * smoothstep(this.wMachine.start, this.wMachine.start + 0.7, t); }

  camAt(t: number): CamKey {
    const P = this.pins;
    const at = (i: number, dx: number, dy: number, dz: number) => v3(P[i]!.x + dx, dy, P[i]!.z + dz);
    if (t < this.tKyoto) {
      // Europe: straight down on Lyon as the app falls, pull back on the landing, truck north to Tromsø,
      // whip west to Cardiff on "and"
      const L = this.lyon;
      const k0: CamKey = { pos: add3(L, v3(0.25, 5.6, 1.4)), tgt: add3(L, v3(0, 0.4, 0)), roll: 0.3, fov: 36 };
      const k1: CamKey = { pos: add3(L, v3(0.9, 1.9, 2.7)), tgt: add3(L, v3(0.1, 0.35, 0)), roll: 0.05, fov: 34 };
      const k2: CamKey = { pos: at(1, 1.9, 1.5, 3.2), tgt: at(1, -0.1, 0.5, 0), roll: -0.06, fov: 34 };
      const k3: CamKey = { pos: at(2, -0.9, 1.5, 2.3), tgt: at(2, 0.45, 0.5, -0.3), roll: 0.08, fov: 34 };
      const tAnd = this.sungW[2]!.start;
      if (t < this.tApp) return mixCam(k0, k0, 0);
      if (t < this.sungW[1]!.start - 0.35) return mixCam(k0, k1, prog(t, this.tApp, this.tApp + 0.45, ease.outExpo));
      if (t < tAnd - 0.18) return mixCam(k1, k2, prog(t, this.sungW[1]!.start - 0.35, tAnd - 0.18, ease.inOutCubic));
      const k = mixCam(k2, k3, prog(t, tAnd - 0.18, tAnd + 0.1, ease.inOutExpo));
      k.pos = add3(k.pos, v3(-0.4 * prog(t, tAnd, this.tKyoto), 0, 0.3 * prog(t, tAnd, this.tKyoto)));
      return k;
    }
    if (t < this.tDream) {
      const u = prog(t, this.tKyoto, this.tDream);
      return { pos: at(3, lerp(2.0, 0.7, u), lerp(1.5, 1.2, u), lerp(3.0, 2.8, u)), tgt: at(3, 0.25, 0.6, 0), roll: lerp(-0.1, -0.02, u), fov: 34 };
    }
    if (t < this.tWide) {
      // "dream," held: slow push-in orbit on the star party
      const u = prog(t, this.tDream, this.tWide, ease.inOutCubic);
      const a = lerp(-0.7, 0.35, u);
      return { pos: at(4, Math.sin(a) * 3.3, lerp(1.0, 1.5, u), Math.cos(a) * 3.3), tgt: at(4, 0.35, lerp(0.75, 0.85, u), 0), roll: 0.04, fov: lerp(36, 32, u) };
    }
    if (t < this.tCard) {
      // crane up high: the whole map raining lights
      const u = prog(t, this.tWide, this.tCard + 0.2, ease.outCubic);
      const from: CamKey = { pos: at(4, 1.2, 1.6, 3.1), tgt: at(4, 0.35, 0.85, 0), roll: 0.04, fov: 32 };
      const to: CamKey = { pos: v3(-2.5, 8.5, 9.8), tgt: v3(0.8, 0, -0.6), roll: -0.04, fov: 38 };
      return mixCam(from, to, u);
    }
    if (t < this.tUp) {
      // the label on the table edge; dolly on the downbeat; the rack slams in on "machine"
      const c0: CamKey = { pos: v3(-5.4, 1.3, 10.6), tgt: v3(-1.6, 0.9, 4.2), roll: 0.02, fov: 34 };
      const c1: CamKey = { pos: v3(-2.4, 1.2, 11.2), tgt: v3(-0.2, 1.15, 4.2), roll: -0.03, fov: 36 };
      const k = mixCam(c0, c1, prog(t, this.tDolly - 0.05, this.tDolly + 0.5, ease.outExpo));
      const push = prog(t, this.wMachine.start, this.tUp, ease.outCubic);
      k.pos = add3(k.pos, v3(0.3 * push, 0.2 * push, -0.8 * push));
      return k;
    }
    if (t < this.tDive) {
      // crane up over the rack as the cables run out to every light
      const u = prog(t, this.tUp, this.tUp2 + 0.3, ease.inOutCubic);
      const v = prog(t, this.tUp2, this.tDive, ease.inOutCubic);
      const a: CamKey = { pos: v3(-2.0, 1.4, 10.4), tgt: v3(0.0, 1.2, 4.2), roll: -0.02, fov: 36 };
      const b: CamKey = { pos: v3(2.8, 6.0, 11.0), tgt: v3(0.6, 0, 0.2), roll: 0.02, fov: 38 };
      const c: CamKey = { pos: v3(-1.4, 7.0, 6.2), tgt: v3(0.0, 0, -1.2), roll: -0.05, fov: 38 };
      return mixCam(mixCam(a, b, u), c, v);
    }
    // the dive toward the first light
    const u = prog(t, this.tDive, this.T1, ease.inQuad);
    const L = add3(this.lyon, v3(0, this.pins[0]!.h + 0.02, 0));
    const from: CamKey = { pos: v3(-1.4, 7.0, 6.2), tgt: v3(0.0, 0, -1.2), roll: -0.05, fov: 38 };
    const to: CamKey = { pos: add3(L, v3(0.02, 0.9, 0.5)), tgt: L, roll: 0.35, fov: 26 };
    const k = mixCam(from, to, u);
    k.tgt = lerp3(from.tgt, L, prog(t, this.tDive, this.tDive + 0.35, ease.inOutCubic));
    return k;
  }

  // ------------------------------------------------------------------ render
  render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer, comp } = this.ctx;
    const t = f.t;
    setCam(this.cam, this.camAt(t));
    this.pr.update(this.cam);
    this.rack.position.x = this.rackX(t);
    const dive = prog(t, this.tDive + 0.1, this.T1 - 0.05, ease.inQuad);
    for (const m of this.mats) m.uniforms.uBright!.value = 1 - dive;
    setEngraveCam(this.mats, this.cam, v3(-0.35, 0.8, 0.5));

    clearRT(renderer, out, LIN.ink);
    this.bg.u.uFade!.value = 1 - dive;
    this.bg.render(renderer, out);
    renderer.setRenderTarget(out);
    renderer.clearDepth();
    renderer.render(this.world, this.cam);

    const Ld = this.Ld; Ld.clear();
    const L3 = this.L3; L3.clear();
    this.drawDots(t, Ld, dive);
    this.drawGraticule(t, L3, dive);
    this.drawApp(t, L3);
    this.drawPins(t, L3, dive);
    this.drawModels(t, L3, dive);
    this.drawRackLines(t, L3, dive);
    this.drawCables(t, L3, dive);
    Ld.render(renderer, out, this.cam);
    L3.render(renderer, out, this.cam);

    const Tx = this.text; Tx.clear();
    const c = Tx.ctx;
    this.drawFlags(c, t, dive);
    this.drawSmallLabels(c, t, dive);
    this.drawCard(c, t, dive);
    this.drawNotes(c, t, dive);
    c.setTransform(1, 0, 0, 1, 0, 0);
    comp.draw(renderer, Tx.upload(), out);

    const L2 = this.L2; L2.clear();
    this.drawGlows(t, L2, dive);
    L2.render(renderer, out);

    const stamp = [this.wNow, this.wIts, this.wWorth, this.wThe].reduce((m, w) => Math.max(m, pulse(t, w.start, 0.06)), 0);
    const slam = pulse(t, this.wMachine.start, 0.1);
    const land = pulse(t, this.tApp, 0.08);
    const pinHit = this.sungW.reduce((m, w) => Math.max(m, pulse(t, w.start, 0.07)), 0);
    const shk = 5 * stamp + 26 * slam + 10 * land + 5 * pinHit;
    const fi = frameIdx(t);
    return {
      bloom: 0.7 + 0.4 * dive, shake: [shk * (hash(fi, 3) - 0.5) * 2, shk * (hash(fi, 4) - 0.5) * 2],
      flash: 0.1 * slam + 0.06 * land, ca: 1.2 + 4 * slam + 2 * dive, zoom: 1 + 0.03 * slam + 0.015 * pinHit, vignette: 0.42 + 0.3 * dive,
    };
  }

  // ------------------------------------------------------------------ the map
  /** Ripple brightness at a map point from the pins that landed in the last second. */
  ripple(x: number, z: number, t: number, near: Pin[]) {
    let g = 0;
    for (const p of near) {
      const e = t - p.tl;
      const r = Math.hypot(x - p.x, z - p.z);
      const R = e * (p.big ? 4.5 : 2.2);
      const w = p.big ? 0.22 : 0.12;
      g = Math.max(g, Math.exp(-((r - R) * (r - R)) / (w * w)) * Math.exp(-e / (p.big ? 0.6 : 0.3)) * (p.big ? 1 : 0.5));
    }
    return g;
  }

  drawDots(t: number, L: LineBatch, dive: number) {
    const near = this.pins.filter((p) => t >= p.tl && t < p.tl + (p.big ? 1.6 : 0.8));
    const app = t >= this.tApp && t < this.tApp + 1.6 ? [{ x: this.lyon.x, z: this.lyon.z, tl: this.tApp, h: 0, big: true } as Pin] : [];
    const all = [...near, ...app];
    const b = LIN.bone, s = LIN.signal;
    const base = 0.3 * (1 - dive);
    const cablesK = prog(t, this.tUp, this.tUp + 1.2);
    for (const d of this.dots) {
      let g = all.length ? this.ripple(d.x, d.z, t, all) : 0;
      // after the machine arrives the whole map warms (a slow gold wash from the rack side)
      const wash = cablesK * 0.25 * smoothstep(0, 1, 1 - Math.hypot(d.x - 1.9, d.z - 4) / (2 + 16 * cablesK));
      g = Math.max(g, wash);
      const k = (base + g * 1.4) * (1 - dive);
      const col: RGB = [lerp(b[0], s[0], clamp(g * 1.5)) * k, lerp(b[1], s[1], clamp(g * 1.5)) * k, lerp(b[2], s[2], clamp(g * 1.5)) * k];
      L.seg(d.x - 0.001, 0.03, d.z, d.x + 0.001, 0.03, d.z, 0.036, col[0], col[1], col[2], 1);
    }
  }

  drawGraticule(t: number, L: LineBatch, dive: number) {
    const a = 0.07 * (1 - dive), b = LIN.bone;
    for (let lat = -60; lat <= 80; lat += 20) {
      const z = llToXZ(0, lat).z;
      L.seg(-MAP.W / 2, 0.002, z, MAP.W / 2, 0.002, z, 1, b[0] * a, b[1] * a, b[2] * a, 1);
    }
    for (let lon = -180; lon <= 180; lon += 30) {
      const x = llToXZ(lon, 0).x;
      L.seg(x, 0.002, llToXZ(0, 84).z, x, 0.002, llToXZ(0, -60).z, 1, b[0] * a, b[1] * a, b[2] * a, 1);
    }
    // equator slightly brighter, with ticks
    const ez = llToXZ(0, 0).z;
    L.seg(-MAP.W / 2, 0.003, ez, MAP.W / 2, 0.003, ez, 1.2, b[0] * a * 2, b[1] * a * 2, b[2] * a * 2, 1);
    void t;
  }

  /** The block-built app from internals, falling onto Lyon. */
  drawApp(t: number, L: LineBatch) {
    if (t > this.sungW[0]!.start + 0.4) return;
    const L0 = this.lyon;
    const fall = 1 - prog(t, this.T0, this.tApp, ease.inQuad);
    const y0 = 3.4 * fall;
    const sq = t > this.tApp ? 1 - 0.3 * Math.exp(-(t - this.tApp) / 0.06) : 1;
    const shrink = 1 - prog(t, this.sungW[0]!.start - 0.05, this.sungW[0]!.start + 0.3, ease.inCubic) * 0.8;
    const s = 0.14 * shrink;
    const col = mulRGB(LIN.signal, 1.8), core = mulRGB(LIN.ember, 1.2);
    const cube = (cx: number, cy: number, cz: number, sz: number, rot: number) => {
      const pts: P3[] = [];
      for (const [x, y, z] of [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]]) {
        const rx = x! * Math.cos(rot) - z! * Math.sin(rot), rz = x! * Math.sin(rot) + z! * Math.cos(rot);
        pts.push(v3(cx + rx * sz, cy + (y! + 1) * sz * sq, cz + rz * sz));
      }
      for (const [i, j] of [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]]) {
        const p = pts[i!]!, q = pts[j!]!;
        L.seg(p.x, p.y, p.z, q.x, q.y, q.z, 2.2, col[0], col[1], col[2], 1);
      }
      L.seg(cx, cy + sz * sq, cz, cx + 0.001, cy + sz * sq, cz, sz * 400 * 0.3, core[0] * 0.2, core[1] * 0.2, core[2] * 0.2, 1);
    };
    const spin = (1 - prog(t, this.T0, this.tApp)) * 2.5;
    cube(L0.x, y0, L0.z, s, spin);
    cube(L0.x + s * 2.05, y0, L0.z, s, spin);
    cube(L0.x + s, y0 + s * 2.05 * sq, L0.z, s, spin);
  }

  pinY(p: Pin, t: number) { return 4.0 * (1 - prog(t, p.tl - 0.22, p.tl, ease.inQuad)); }

  drawPins(t: number, L: LineBatch, dive: number) {
    const s = LIN.signal, e = LIN.ember;
    for (let i = 0; i < this.pins.length; i++) {
      const p = this.pins[i]!;
      if (t < p.tl - 0.22) continue;
      if (dive > 0 && i !== 0) {
        if (dive > 0.98) continue;
      }
      const fade = i === 0 ? 1 : 1 - dive;
      const y = this.pinY(p, t);
      const grow = p.big ? clamp(springStep(t - p.tl, 3, 0.4), 0, 1.2) : 1;
      const h = p.big ? p.h * grow : p.h;
      const lit = t >= p.tl ? 1 : 0.6;
      const kk = (p.big ? 1.6 : 1.1) * lit * fade;
      L.seg(p.x, y, p.z, p.x, y + h, p.z, p.big ? 2.2 : 1.3, s[0] * kk, s[1] * kk, s[2] * kk, 1);
      // head
      const hk = (p.big ? 2.2 : 1.8) * fade * (1 + 0.6 * pulse(t, p.tl, 0.1));
      L.seg(p.x, y + h, p.z, p.x + 0.001, y + h, p.z, p.big ? 9 : 5, e[0] * hk, e[1] * hk, e[2] * hk, 1);
      L.seg(p.x, y + h, p.z, p.x + 0.001, y + h, p.z, p.big ? 26 : 13, s[0] * 0.18 * fade, s[1] * 0.18 * fade, s[2] * 0.18 * fade, 1);
      // a little shadow cross on the map where it will land
      if (t < p.tl && p.big) {
        const a = 0.6 * prog(t, p.tl - 0.22, p.tl);
        L.seg(p.x - 0.12, 0.01, p.z, p.x + 0.12, 0.01, p.z, 1.2, s[0] * a, s[1] * a, s[2] * a, 1);
        L.seg(p.x, 0.01, p.z - 0.12, p.x, 0.01, p.z + 0.12, 1.2, s[0] * a, s[1] * a, s[2] * a, 1);
      }
    }
  }

  // ------------------------------------------------------------------ the tiny niche models (line-drawn)
  drawModels(t: number, L: LineBatch, dive: number) {
    for (let i = 0; i < SUNG.length; i++) {
      const p = this.pins[i]!;
      const e = t - p.tl - 0.08;
      if (e < 0) continue;
      const k = clamp(springStep(e, 2.6, 0.45), 0, 1.15) * (1 - dive);
      if (k <= 0.01) continue;
      this.model(L, SUNG[i]!.kind, v3(p.x + 0.12, 0, p.z + 0.06), k, t, e);
    }
  }

  model(L: LineBatch, kind: ModelKind, o: P3, k: number, t: number, e: number) {
    const b = mulRGB(LIN.bone, 0.85), g = mulRGB(LIN.signal, 1.5), dim = mulRGB(LIN.bone, 0.35);
    const seg = (ax: number, ay: number, bx: number, by: number, col: RGB, w = 1.3, az = 0, bz = 0) =>
      L.seg(o.x + ax, o.y + ay * k, o.z + az, o.x + bx, o.y + by * k, o.z + bz, w, col[0], col[1], col[2], 1);
    const board = (x0: number, y0: number, w: number, h: number) => {
      seg(x0, y0, x0 + w, y0, b); seg(x0 + w, y0, x0 + w, y0 + h, b); seg(x0 + w, y0 + h, x0, y0 + h, b); seg(x0, y0 + h, x0, y0, b);
      // easel legs
      seg(x0 + 0.08, 0, x0 + 0.12, y0, dim, 1.1, 0.12, 0); seg(x0 + w - 0.08, 0, x0 + w - 0.12, y0, dim, 1.1, 0.12, 0);
    };
    if (kind === 'rota') {
      const x0 = 0.05, y0 = 0.12, w = 0.62, h = 0.48;
      board(x0, y0, w, h);
      seg(x0, y0 + h - 0.09, x0 + w, y0 + h - 0.09, b);
      for (let c = 1; c < 7; c++) seg(x0 + (c * w) / 7, y0, x0 + (c * w) / 7, y0 + h - 0.09, dim, 1);
      for (let r = 1; r < 4; r++) seg(x0, y0 + (r * (h - 0.09)) / 4, x0 + w, y0 + (r * (h - 0.09)) / 4, dim, 1);
      // shifts ticked off one by one (gold crosses)
      const n = Math.floor(e * 14);
      for (let q = 0; q < Math.min(n, 18); q++) {
        const cx = q % 7, cy = 3 - Math.floor(q / 7);
        if (hash(q, 77) < 0.35) continue;
        const ax = x0 + (cx + 0.25) * (w / 7), ay = y0 + (cy + 0.25) * ((h - 0.09) / 4);
        seg(ax, ay, ax + w / 14, ay + (h - 0.09) / 8, g, 1.4);
        seg(ax + w / 14, ay, ax, ay + (h - 0.09) / 8, g, 1.4);
      }
    } else if (kind === 'tide') {
      const x0 = 0.05, y0 = 0.12, w = 0.7, h = 0.45;
      board(x0, y0, w, h);
      seg(x0 + 0.05, y0 + h / 2, x0 + w - 0.03, y0 + h / 2, dim, 1);
      let px = 0, py = 0;
      const N = 36;
      for (let i = 0; i <= N; i++) {
        const u = i / N;
        const x = x0 + 0.05 + u * (w - 0.08), y = y0 + h / 2 + Math.sin(u * TAU * 1.8 + 0.4) * h * 0.33;
        if (i) seg(px, py, x, y, b, 1.3);
        px = x; py = y;
      }
      const u = (e * 0.35) % 1;
      const hx = x0 + 0.05 + u * (w - 0.08), hy = y0 + h / 2 + Math.sin(u * TAU * 1.8 + 0.4) * h * 0.33;
      seg(hx, hy, hx + 0.001, hy, mulRGB(LIN.ember, 2), 6);
      seg(hx, y0, hx, y0 + h, mulRGB(LIN.signal, 0.5), 1);
    } else if (kind === 'choir') {
      const x0 = 0.05, y0 = 0.12, w = 0.66, h = 0.44;
      board(x0, y0, w, h);
      for (let l = 0; l < 5; l++) seg(x0 + 0.04, y0 + 0.12 + l * 0.05, x0 + w - 0.04, y0 + 0.12 + l * 0.05, dim, 1);
      seg(x0 + w * 0.5, y0 + 0.12, x0 + w * 0.5, y0 + 0.32, dim, 1);
      const notes = [2, 4, 3, 5, 6, 4, 2, 3];
      const lit = Math.floor(e * 7);
      notes.forEach((n, i) => {
        const nx = x0 + 0.1 + i * 0.068, ny = y0 + 0.095 + n * 0.025;
        const col = i === lit % notes.length ? g : b;
        for (let q = 0; q < 8; q++) {
          const a0 = (q / 8) * TAU, a1 = ((q + 1) / 8) * TAU;
          seg(nx + Math.cos(a0) * 0.02, ny + Math.sin(a0) * 0.014, nx + Math.cos(a1) * 0.02, ny + Math.sin(a1) * 0.014, col, 1.3);
        }
        seg(nx + 0.02, ny, nx + 0.02, ny + 0.12, col, 1.1);
      });
    } else if (kind === 'walk') {
      // a looping path laid flat on the table, torii gates standing on it, a walker going round
      const R = 0.34, N = 40;
      const pt = (u: number) => { const a = u * TAU; const r = R * (1 + 0.18 * Math.sin(a * 3)); return { x: 0.35 + Math.cos(a) * r, z: Math.sin(a) * r * 0.8 }; };
      for (let i = 0; i < N; i += 2) {
        const p = pt(i / N), q = pt((i + 1) / N);
        L.seg(o.x + p.x, 0.012, o.z + p.z, o.x + q.x, 0.012, o.z + q.z, 1.6, b[0], b[1], b[2], 1);
      }
      for (let gI = 0; gI < 5; gI++) {
        const p = pt(gI / 5 + 0.05);
        const hh = 0.14 * k;
        L.seg(o.x + p.x - 0.04, 0, o.z + p.z, o.x + p.x - 0.04, hh, o.z + p.z, 1.2, g[0], g[1], g[2], 1);
        L.seg(o.x + p.x + 0.04, 0, o.z + p.z, o.x + p.x + 0.04, hh, o.z + p.z, 1.2, g[0], g[1], g[2], 1);
        L.seg(o.x + p.x - 0.06, hh, o.z + p.z, o.x + p.x + 0.06, hh, o.z + p.z, 1.4, g[0], g[1], g[2], 1);
        L.seg(o.x + p.x - 0.05, hh * 0.8, o.z + p.z, o.x + p.x + 0.05, hh * 0.8, o.z + p.z, 1, g[0], g[1], g[2], 1);
      }
      const w = pt((e * 0.4) % 1);
      L.seg(o.x + w.x, 0.03, o.z + w.z, o.x + w.x + 0.001, 0.03, o.z + w.z, 6, 3, 2.6, 1.8, 1);
    } else {
      // star party: a telescope on a tripod, stars above it twinkling (one is gold)
      const top = v3(0.3, 0.42, 0);
      for (const [dx, dz] of [[-0.14, 0.1], [0.14, 0.1], [0, -0.16]]) seg(0.3 + dx!, 0, top.x, top.y, b, 1.3, dz!, 0);
      seg(0.18, 0.36, 0.52, 0.62, b, 3.2);
      seg(0.5, 0.6, 0.56, 0.66, g, 4);
      const rnd = mulberry32(99);
      for (let i = 0; i < 16; i++) {
        const sx = 0.1 + rnd() * 0.9, sy = 0.75 + rnd() * 0.55, sz = (rnd() - 0.5) * 0.4;
        const tw = 0.4 + 0.6 * Math.abs(Math.sin(t * (3 + rnd() * 5) + i));
        const col = i === 3 ? mulRGB(LIN.ember, 2.2) : mulRGB(LIN.bone, 0.9 * tw);
        L.seg(o.x + sx, o.y + sy * k, o.z + sz, o.x + sx + 0.001, o.y + sy * k, o.z + sz, i === 3 ? 6 : 3, col[0], col[1], col[2], 1);
      }
    }
  }

  // ------------------------------------------------------------------ flags & labels
  /** Billboard (yaw only) plane transform at P, size em (world units per 100 px). */
  bill(c: CanvasRenderingContext2D, P: P3, em: number) {
    const to = norm3(sub3(this.pr.camPos, P));
    const X = norm3(v3(to.z, 0, -to.x));
    return this.pr.plane(c, P, X, v3(0, 1, 0), em / 100);
  }

  drawFlags(c: CanvasRenderingContext2D, t: number, dive: number) {
    const fade = 1 - dive;
    if (fade <= 0) return;
    c.textBaseline = 'alphabetic';
    for (let i = 0; i < SUNG.length; i++) {
      const p = this.pins[i]!, w = this.sungW[i]!;
      if (t < p.tl) continue;
      const pop = clamp(springStep(t - p.tl, 3.2, 0.42), 0, 1.25);
      const P = v3(p.x, p.h * clamp(springStep(t - p.tl, 3, 0.4), 0, 1.2), p.z);
      // flags of earlier words recede once the next word lands (word only, dimmer)
      const next = this.pins[i + 1];
      const old = next ? prog(t, next.tl - 0.15, next.tl + 0.15) : 0;
      if (!this.bill(c, P, 0.24 * pop * lerp(1, 0.6, old))) continue;
      // the flag: a pennant plate to the right of the needle carrying the sung word
      const held = i === 4;
      const hp = clamp((t - w.start) / Math.max(0.1, w.end - w.start));
      const widths = [62, 75, 87.5, 100, 112.5, 125];
      const fam = held ? F.archivo(widths[Math.min(5, Math.floor(hp * 6))]!, 800) : F.archivo(100, 800);
      c.font = font(fam, 100);
      const tw = c.measureText(w.w).width * (held ? lerp(1, 1.1, hp) : 1);
      const sung = t < w.end + 0.05;
      c.fillStyle = rgba('ink', 0.82 * fade);
      c.fillRect(6, -118, tw + 44, 128);
      c.fillStyle = rgba('signal', fade);
      c.fillRect(0, -118, 6, 128);
      c.save();
      c.translate(24, -22);
      if (held) c.scale(lerp(1, 1.1, hp), 1);
      c.fillStyle = sung ? rgba('signal', fade) : rgba('bone', 0.95 * fade * lerp(1, 0.55, old));
      c.fillText(w.w, 0, 0);
      c.restore();
      if (old >= 1) continue;
      // mono label under the flag
      const lab = SUNG[i]!.label, sub = SUNG[i]!.sub;
      const n = Math.floor(lab.length * prog(t, p.tl + 0.05, p.tl + 0.45));
      c.font = font(F.mono(600), 30);
      c.fillStyle = rgba('bone', 0.95 * fade * (1 - old));
      c.fillText(lab.slice(0, n), 10, 46);
      c.font = font(F.mono(400, true), 26);
      c.fillStyle = rgba('ash', 0.9 * fade * prog(t, p.tl + 0.35, p.tl + 0.5) * (1 - old));
      c.fillText(sub, 10, 80);
    }
  }

  drawSmallLabels(c: CanvasRenderingContext2D, t: number, dive: number) {
    const fade = 1 - dive;
    if (fade <= 0) return;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.font = font(F.mono(500), 15);
    c.textBaseline = 'middle';
    c.textAlign = 'left';
    let shown = 0;
    const used: { x: number; y: number }[] = [];
    for (let i = SUNG.length; i < this.pins.length && shown < 26; i++) {
      const p = this.pins[i]!;
      if (!p.label || t < p.tl) continue;
      const sp = this.pr.p(v3(p.x, p.h, p.z));
      if (!sp || sp.x < 80 || sp.x > W - 260 || sp.y < 80 || sp.y > H - 80) continue;
      const a = prog(t, p.tl, p.tl + 0.15) * fade * (1 - prog(t, p.tl + 1.2, p.tl + 1.8) * 0.5);
      // only where there is room: skip labels that would collide with one already drawn
      if (hash(i, 55) > 0.7) continue;
      if (used.some((u) => Math.abs(u.x - sp.x) < 170 && Math.abs(u.y - sp.y) < 24)) continue;
      used.push({ x: sp.x, y: sp.y });
      shown++;
      c.strokeStyle = rgba('bone', 0.4 * a); c.lineWidth = 1;
      c.beginPath(); c.moveTo(sp.x + 3, sp.y); c.lineTo(sp.x + 16, sp.y - 10); c.stroke();
      c.fillStyle = rgba('ash', 0.95 * a);
      const n = Math.floor(p.label.length * prog(t, p.tl, p.tl + 0.3));
      c.fillText(p.label.slice(0, n), sp.x + 19, sp.y - 11);
    }
  }

  drawCard(c: CanvasRenderingContext2D, t: number, dive: number) {
    if (t < this.tCard - 0.1) return;
    const fade = 1 - dive;
    // the card stands on the table edge, 720 x 360 local px = CARD.w x CARD.h units
    const s = CARD.w / 720;
    const up = clamp(springStep(t - this.tCard, 2.6, 0.5), 0, 1.1);
    if (!this.pr.plane(c, v3(CARD.x, CARD.h * up, CARD.z), v3(1, 0, 0), v3(0, 1, 0), s)) return;
    c.fillStyle = rgba('ink2', 0.94 * fade);
    c.fillRect(0, 0, 720, 360 * up);
    c.strokeStyle = rgba('bone', 0.7 * fade); c.lineWidth = 2;
    c.strokeRect(8, 8, 704, 360 * up - 16);
    c.fillStyle = rgba('bone', 0.6 * fade);
    c.fillRect(8, 52, 704, 2);
    c.textBaseline = 'alphabetic';
    c.textAlign = 'left';
    c.font = font(F.mono(600), 22);
    c.fillStyle = rgba('ash', fade);
    c.fillText('VALUE / COST   —   REVISED 2026', 26, 40);
    c.textAlign = 'right';
    c.fillText('No. 0417', 694, 40);
    // the sung words stamped in, one per hit
    const stamp = (w: Word, text: string, x: number, y: number, size: number, gold: boolean, width = 100) => {
      if (t < w.start - 0.02) return 0;
      const e = t - w.start;
      const k = 1 + 0.9 * Math.exp(-e / 0.05);
      const fam = F.archivo(width, 900);
      c.font = font(fam, size);
      const tw = c.measureText(text).width;
      c.save();
      c.translate(x + tw / 2, y - size * 0.35);
      c.scale(k, k);
      c.rotate(0.05 * Math.exp(-e / 0.08) * (hash(w.gi, 3) - 0.5));
      const hot = gold ? 1 : Math.exp(-Math.max(0, t - w.end) / 0.35);
      c.fillStyle = mixCss(hot, fade);
      c.textAlign = 'center';
      c.fillText(text, 0, size * 0.35);
      c.restore();
      return tw;
    };
    let x = 26;
    const y1 = 146, sz = 86;
    c.font = font(F.archivo(100, 900), sz);
    const sp = c.measureText(' ').width * 0.8;
    x += stamp(this.wNow, 'NOW', x, y1, sz, false) + sp;
    x += stamp(this.wIts, 'IT’S', x, y1, sz, false) + sp;
    stamp(this.wWorth, 'WORTH', x, y1, sz, false);
    x = 26;
    const y2 = 240;
    x += stamp(this.wThe, 'THE', x, y2, sz, false) + sp;
    stamp(this.wMachine, 'MACHINE.', x, y2, sz, true, 87.5);
    // the comparison rows, typed after the words
    c.font = font(F.mono(500), 21);
    c.textAlign = 'left';
    const rows: [string, string, number][] = [
      ['one niche app  ..............  40 people', 'WORTH IT', this.wWorth.end],
      ['the machine  ..........  $0.02 a request', 'COST', this.wMachine.end],
    ];
    rows.forEach(([a, b2, t0], i) => {
      const n = Math.floor(a.length * prog(t, t0, t0 + 0.45));
      if (n <= 0) return;
      c.fillStyle = rgba('bone', 0.9 * fade);
      c.fillText(a.slice(0, n), 26, 290 + i * 30);
      c.textAlign = 'right';
      c.fillStyle = rgba(i === 0 ? 'signal' : 'ash', fade * prog(t, t0 + 0.4, t0 + 0.5));
      c.fillText(b2, 694, 290 + i * 30);
      c.textAlign = 'left';
    });
  }

  drawNotes(c: CanvasRenderingContext2D, t: number, dive: number) {
    const fade = 1 - dive;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.textAlign = 'left';
    c.textBaseline = 'alphabetic';
    // a live counter of lit niches (bottom left), from the first pin to the dive
    const lit = this.pins.filter((p) => t >= p.tl).length;
    const k = prog(t, this.sungW[0]!.start, this.sungW[0]!.start + 0.3) * fade;
    if (k > 0) {
      c.font = font(F.mono(600), 26);
      c.fillStyle = rgba('bone', 0.95 * k);
      c.fillText(`NICHES SERVED  ${String(lit).padStart(4, ' ')}`, 150, H - 150);
      c.font = font(F.mono(400, true), 20);
      c.fillStyle = rgba('ash', 0.9 * k);
      c.fillText(t < this.wMachine.start ? 'market size: too small (1999) — worth it (2026)' : 'served by one machine, rented by the hour', 150, H - 120);
      if (t < this.wMachine.start) {
        // strike through "too small (1999)"
        const x0 = 150 + c.measureText('market size: ').width, x1 = x0 + c.measureText('too small (1999)').width;
        const u = prog(t, this.sungW[1]!.end, this.sungW[1]!.end + 0.3, ease.outCubic);
        c.strokeStyle = rgba('signal', k); c.lineWidth = 2.2;
        c.beginPath(); c.moveTo(x0, H - 127); c.lineTo(lerp(x0, x1, u), H - 127); c.stroke();
      }
    }
    // rack annotation
    if (t > this.wMachine.start + 0.1 && t < this.tDive + 0.3) {
      const a = prog(t, this.wMachine.start + 0.1, this.wMachine.start + 0.3) * (1 - prog(t, this.tDive, this.tDive + 0.3));
      const P = this.pr.p(v3(this.rackX(t) + RACK.w / 2, RACK.h, RACK.z + RACK.d / 2));
      if (P) {
        c.strokeStyle = rgba('bone', 0.7 * a); c.lineWidth = 1.2;
        c.beginPath(); c.moveTo(P.x, P.y); c.lineTo(P.x + 60, P.y - 50); c.lineTo(P.x + 90, P.y - 50); c.stroke();
        c.font = font(F.mono(600), 22);
        c.fillStyle = rgba('bone', a);
        c.fillText('GPU RACK, 8 × H-CLASS', P.x + 98, P.y - 44);
        c.font = font(F.mono(400), 19);
        c.fillStyle = rgba('ash', a);
        c.fillText(`fans ${Math.round(this.fanSpeed(t) * 60 / TAU * 10)} rpm · shared by ${lit} niches`, P.x + 98, P.y - 18);
      }
    }
  }

  // ------------------------------------------------------------------ the machine's lines
  drawRackLines(t: number, L: LineBatch, dive: number) {
    if (t < this.wMachine.start - 0.6) return;
    const rx = this.rackX(t), fz = RACK.z + RACK.d / 2 - 0.05;
    const fs = this.fanSpeed(t);
    const b = mulRGB(LIN.bone, 0.8 * (1 - dive)), s = LIN.signal;
    for (let i = 0; i < 7; i++) {
      const y = 0.28 + i * 0.34;
      for (const fx of [-0.33, 0.1]) {
        const cx = rx + fx, R = 0.11;
        for (let q = 0; q < 16; q++) {
          const a0 = (q / 16) * TAU, a1 = ((q + 1) / 16) * TAU;
          L.seg(cx + Math.cos(a0) * R, y + Math.sin(a0) * R, fz, cx + Math.cos(a1) * R, y + Math.sin(a1) * R, fz, 1.1, b[0], b[1], b[2], 1);
        }
        const rot = t * fs + i * 0.7 + fx * 3;
        for (let bl = 0; bl < 5; bl++) {
          const a = rot + (bl / 5) * TAU;
          L.seg(cx, y, fz, cx + Math.cos(a) * R * 0.9, y + Math.sin(a) * R * 0.9, fz, 1.4, b[0], b[1], b[2], 1);
        }
      }
      // status LEDs blinking in 16ths once it runs
      for (let q = 0; q < 6; q++) {
        const bi = Math.floor(this.ctx.audio.beatAt(t) * 4);
        const on = t > this.wMachine.start && hash(i, q, bi) > 0.45;
        const k = on ? 2.4 : 0.25;
        const lx = rx + 0.33 + q * 0.035;
        L.seg(lx, y + 0.06, fz, lx + 0.001, y + 0.06, fz, 3, s[0] * k, s[1] * k, s[2] * k, 1);
      }
    }
  }

  /** Gold cables from the rack out to every lit pin, drawn by cursor heads after "machine". */
  drawCables(t: number, L: LineBatch, dive: number) {
    if (t < this.tUp - 0.1) return;
    const src = v3(RACK.x, RACK.h, RACK.z);
    const s = LIN.signal;
    const fade = 1 - dive;
    for (let i = 0; i < this.pins.length; i++) {
      const p = this.pins[i]!;
      if (t < p.tl) continue;
      const t0 = Math.max(this.tUp, p.tl) + (i % 23) * 0.022;
      const u = prog(t, t0, t0 + 0.5, ease.inOutCubic);
      if (u <= 0) continue;
      const dst = v3(p.x, p.h, p.z);
      const mid = add3(lerp3(src, dst, 0.5), v3(0, 1.2 + 0.25 * Math.hypot(dst.x - src.x, dst.z - src.z), 0));
      const N = 14;
      const bez = (q: number) => {
        const a = lerp3(src, mid, q), bb = lerp3(mid, dst, q);
        return lerp3(a, bb, q);
      };
      let prev = bez(0);
      const a = (i === 0 ? 1 : 0.35) * fade;
      for (let k = 1; k <= Math.ceil(N * u); k++) {
        const q = Math.min(u, k / N);
        const cur = bez(q);
        L.seg(prev.x, prev.y, prev.z, cur.x, cur.y, cur.z, i === 0 ? 1.8 : 1.0, s[0] * a, s[1] * a, s[2] * a, 1);
        prev = cur;
      }
      if (u < 1) L.seg(prev.x, prev.y, prev.z, prev.x + 0.001, prev.y, prev.z, 5, 2.5 * fade, 2.2 * fade, 1.5 * fade, 1);
    }
  }

  drawGlows(t: number, L: LineBatch, dive: number) {
    // the sung pins' heads: the cursor's white-hot tip
    for (let i = 0; i < SUNG.length; i++) {
      const p = this.pins[i]!;
      if (t < p.tl - 0.22) continue;
      if (i !== 0 && dive > 0.95) continue;
      const y = this.pinY(p, t) + p.h * clamp(springStep(t - p.tl, 3, 0.4), 0, 1.2);
      const sp = this.pr.p(v3(p.x, y, p.z));
      if (!sp) continue;
      const scale = i === 0 ? lerp(0.8, 4.5, dive * dive) : 0.8;
      cursorTip(L, sp.x, sp.y, t, scale, (i === 0 ? 1 : 1 - dive) * (1 + 0.8 * pulse(t, p.tl, 0.1)));
    }
    // weld sparks as the app lands
    if (t > this.tApp - 0.02 && t < this.tApp + 0.6) {
      const P = this.pr.p(v3(this.lyon.x + 0.14, 0.05, this.lyon.z));
      if (P) weldSparks(L, t, (tb) => (tb < this.tApp || tb > this.tApp + 0.12 ? null : P), { rate: 260, life: 0.45, speed: 420, gravity: 900, seed: 12 });
    }
  }
}

function mixCss(hot: number, alpha: number) {
  const A = parseInt(HEX.bone.slice(1), 16), B = parseInt(HEX.signal.slice(1), 16);
  const ch = (n: number, sh: number) => (n >> sh) & 255;
  const k = clamp(hot);
  return `rgba(${Math.round(lerp(ch(A, 16), ch(B, 16), k))},${Math.round(lerp(ch(A, 8), ch(B, 8), k))},${Math.round(lerp(ch(A, 0), ch(B, 0), k))},${clamp(alpha)})`;
}
