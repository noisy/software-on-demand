// `oldworld` — "Plans, as they used to be drawn" (verse 1, A2). Cyanotype: bone lines on cobalt paper, blueprint
// conventions (dimension lines, section hatching, level marks, title blocks), drawn in 3D with a camera that never
// stops moving.
//   1. "It used to take a hundred hands," — boot's block skyline collapses into an org-chart pyramid of 100 badge
//      cards (1 + 3 + … + 19); the camera trucks along the bottom row as the words are STAMPED into the cards, whips up
//      to card No. 100 for "hundred", then pulls wide: the tree lights from the top down and a hundred hands go up;
//      HANDS, is rubber-stamped across the drawing.
//   2. "a tower and a name," — the cards fly into the façade of THE TOWER, which extrudes floor by floor (BUILT: the
//      sign bands are revealed by the extrusion front as the words are sung); "name," lights the crown sign.
//   3. "a year of meetings for a feature," — the windows become split-flap calendar cells, twelve months rush past,
//      the line is TYPED into a meeting invite (FEATURE #4127 — 3 %).
//   4. "while the long tail waited in the rain." — the camera drops to street level: the long tail of unbuilt plots
//      (dashed: proposed) shrinking to the horizon, reflected in wet ground; the cursor PEN-WRITES the line on the
//      ground; the rain streaks slow down into the vertical grid lines of jevons' chart.
import * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '../engine/scene';
import { FSPass, W, H } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { LIN } from '../engine/palette';
import { F } from '../engine/type';
import { Lyrics, type Line, type Word } from '../engine/lyrics';
import { clamp, ease, hash, lerp, prog, pulse, springStep, keys, frameIdx, noise1, TAU, type Key } from '../engine/util';
import { strokeText, writtenLength, type StrokeText } from '../engine/stroke';
import { cursorTip, cursorCaret, cursorBlink, weldSparks } from './_motifs';
import { TOWER, floorY, frontCell, SegList, emitSegs, strokeLabel, lineCharTimes, Label3D, aim, toScreen, towerBlueprint, lin, v3lerp, type V3, type RGB } from './tower-geo';
import { PYR, buildCards, cardFace, connectors, tiers, glyphCache, buildPlots, type CardDef, type Plot } from './oldworld-geo';

interface Pose { p: V3; g: V3; fov: number; roll: number }
const P = (p: V3, g: V3, fov = 36, roll = 0): Pose => ({ p, g, fov, roll });
const lerpPose = (a: Pose, b: Pose, k: number): Pose => ({ p: v3lerp(a.p, b.p, k), g: v3lerp(a.g, b.g, k), fov: lerp(a.fov, b.fov, k), roll: lerp(a.roll, b.roll, k) });

const TZ = -4.5; // the tower's centre z (it stands where the pyramid was)
const FZ = TZ + TOWER.D / 2; // its front face
const GOLD = (k = 1): RGB => lin('signal', k);
const BONE = (k = 1): RGB => lin('bone', k);
const MONTHS = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
const DAY_MS = 86400000;
const CAL0 = Date.UTC(1998, 11, 28); // the Monday of the week holding 1 Jan 1999
const STREET_Z = 2.6; // centre line of the street (the long tail lines its left side, z < 0)
const STREET_HW = 4.4; // half width of the street
const SLOT = 5.2; // road-marking words: one per slot along the street
const SLOT_X0 = 16; // x of the first word
const ROAD_K = 0.021; // stroke-font px -> world across the street
const ROAD_STRETCH = 1.8; // road-marking lettering is stretched along the road so it reads when foreshortened
const GRID_X0 = 96, GRID_DX = 72, GRID_N = 25; // jevons' vertical lines (handoff)

const PAPER = /* glsl */ `
uniform float t, night, dark, flash;
uniform vec2 drift;
void main() {
  vec2 px = FRAG_PX;
  vec2 p = px / 1080.0 + drift;
  // cyanotype: cobalt with sensitiser mottling, brush-coat streaks, paper fibres, darker coated edges
  float m = fbm(p * 1.7 + 3.1, 4);
  float br = snoise(vec2(p.x * 0.7, p.y * 7.0 + 2.0));
  float fine = snoise(px * 0.21);
  vec3 c = C_COBALT * (0.9 + 0.2 * m + 0.05 * br + 0.025 * fine);
  float sp = step(0.9982, hash12(floor(px * 0.6)));
  c += C_BONE * sp * 0.035;
  // faint sheet grid (5 mm squares), fixed to the paper
  vec2 g = px / 54.0;
  vec2 dl = (0.5 - abs(fract(g) - 0.5)) * 54.0;
  float gl = max(pxLine(dl.x, 0.0, 1.0), pxLine(dl.y, 0.0, 1.0));
  c += C_BONE * gl * 0.011 * (1.0 - night);
  vec2 q = vUv - 0.5;
  c *= 1.0 - 0.42 * pow(length(q * vec2(1.0, 1.25)) * 1.3, 3.0);
  c = mix(c, c * vec3(0.55, 0.6, 0.72), night);
  c += C_COBALT * flash * 0.7;
  c = mix(c, C_INK, dark);
  fragColor = vec4(c, 1.0);
}`;

interface StampDef { w: Word; card: CardDef; lab: Label3D; rot: number }
interface SignDef { w: Word; lab: Label3D; y0: number; y1: number; panel: THREE.Mesh }

export default class OldWorld extends Scene {
  cam = new THREE.PerspectiveCamera(36, W / H, 0.1, 3000);
  bg = new FSPass(PAPER, { t: { value: 0 }, night: { value: 0 }, dark: { value: 0 }, flash: { value: 0 }, drift: { value: new THREE.Vector2() } });
  lines = new LineBatch(160000, { screen2D: false, blend: 'max', depthTest: true });
  glow3 = new LineBatch(30000, { screen2D: false, blend: 'add', depthTest: true });
  fx = new LineBatch(12000, { blend: 'add' });
  occ = new THREE.Scene();
  labels = new THREE.Scene();

  // data
  L1!: Line; L2!: Line; L3!: Line; L4!: Line;
  bars: number[] = [];
  tFold = 0; tFall = 0; tEnd = 0;
  cards: CardDef[] = [];
  faces: { face: Float32Array; hand: Float32Array }[] = [];
  conn!: Float32Array; tierSegs!: Float32Array;
  tower!: { body: Float32Array; notes: Float32Array };
  titleBlock!: Float32Array;
  phantom!: Float32Array; ground!: Float32Array; weekdays!: Float32Array;
  glyphs!: Map<string, { d: Float32Array; w: number }>;
  plots: Plot[] = [];
  plotStatic!: Float32Array; // plot outlines & huts (with tags = plot index)
  curve!: Float32Array;
  inviteSegs!: Float32Array;
  road: { st: StrokeText; times: [number, number][]; x: number; z0: number; w: Word }[] = [];

  // meshes
  depthMat = new THREE.MeshBasicMaterial({ colorWrite: false, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2 });
  fillMat = new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(LIN.cobalt[0] * 0.8, LIN.cobalt[1] * 0.8, LIN.cobalt[2] * 0.8, THREE.LinearSRGBColorSpace), polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2 });
  cardOcc!: THREE.InstancedMesh;
  tierOcc!: THREE.InstancedMesh;
  towerOcc!: THREE.Mesh;
  headOcc!: THREE.InstancedMesh;
  invitePanel!: THREE.Mesh;

  stamps: StampDef[] = [];
  handsLab!: Label3D;
  signs: SignDef[] = [];
  crown!: Label3D; nameLab!: Label3D;
  subjA!: Label3D; subjB!: Label3D; splitAt = 0;
  fields: Label3D[] = [];
  months: Label3D[] = [];
  monthT: number[] = [];

  override async init() {
    const ly = this.ctx.lyrics, au = this.ctx.audio;
    this.L1 = ly.get('It used to take');
    this.L2 = ly.get('a tower and a name');
    this.L3 = ly.get('a year of meetings');
    this.L4 = ly.get('while the long tail');
    const s = this.ctx.start, e = this.ctx.end;
    this.bars = au.downbeats.filter((d) => d >= s - 0.05 && d < e - 0.05);
    const hands = this.L1.words[6]!;
    this.tFold = hands.end - 0.14;
    this.tFall = this.L4.start - 0.62;
    this.tEnd = e;

    // ---- pyramid
    this.cards = buildCards();
    this.faces = this.cards.map((c) => cardFace(c.n));
    this.conn = connectors(this.cards);
    this.tierSegs = tiers();
    this.tower = towerBlueprint();
    {
      const sl = new SegList();
      const A = BONE(0.6);
      const x0 = 13.5, x1 = 23.5, y0 = 0.2, y1 = 4.2, z = 1.5;
      sl.poly([[x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z]], 1.6, A, 1, 0, true);
      sl.poly([[x0 + 0.15, y0 + 0.15, z], [x1 - 0.15, y0 + 0.15, z], [x1 - 0.15, y1 - 0.15, z], [x0 + 0.15, y1 - 0.15, z]], 0.8, A, 1, 0, true);
      for (const y of [3.0, 2.0, 1.2]) sl.seg([x0 + 0.15, y, z], [x1 - 0.15, y, z], 0.8, A, 1);
      sl.seg([x0 + 5.6, y0 + 0.15, z], [x0 + 5.6, 2.0, z], 0.8, A, 1);
      strokeLabel(sl, 'ORGANISATION CHART', [x0 + 0.4, 3.3, z], [1, 0, 0], [0, 1, 0], 0.55, 1.2, BONE(0.72));
      strokeLabel(sl, 'DWG. No. 1999-001  REV. 14', [x0 + 0.4, 2.35, z], [1, 0, 0], [0, 1, 0], 0.32, 0.9, A);
      strokeLabel(sl, 'SCALE 1:100', [x0 + 0.4, 1.45, z], [1, 0, 0], [0, 1, 0], 0.3, 0.9, A);
      strokeLabel(sl, 'HEADCOUNT 100', [x0 + 5.9, 1.45, z], [1, 0, 0], [0, 1, 0], 0.3, 0.9, A);
      strokeLabel(sl, 'DRAWN: H.R.', [x0 + 0.4, 0.55, z], [1, 0, 0], [0, 1, 0], 0.28, 0.9, A);
      strokeLabel(sl, 'APPROVED: THE BOARD', [x0 + 5.9, 0.55, z], [1, 0, 0], [0, 1, 0], 0.28, 0.9, A);
      this.titleBlock = sl.freeze();
    }
    // phantom envelope of the tower still to be built (dash-dot), the ground line with earth hatching
    {
      const sl = new SegList();
      const A = BONE(0.42), hx = TOWER.W / 2, hz = TOWER.D / 2;
      const cs: [number, number][] = [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]];
      for (const [x, z] of cs) sl.dashed([x, 0, z + TZ], [x, TOWER.ROOF, z + TZ], 1.2, 0.45, 0.8, A, 1, 0, true);
      for (let i = 0; i < 4; i++) {
        const [ax, az] = cs[i]!, [bx, bz] = cs[(i + 1) % 4]!;
        sl.dashed([ax, TOWER.ROOF, az + TZ], [bx, TOWER.ROOF, bz + TZ], 1.2, 0.45, 0.8, A, 1, 0, true);
      }
      const zc = FZ - 0.3, x0 = -TOWER.CROWN_HW, x1 = TOWER.CROWN_HW, y0 = TOWER.ROOF + 0.8, y1 = TOWER.TOP;
      sl.dashed([x0, y0, zc], [x1, y0, zc], 1.0, 0.4, 0.8, A, 1);
      sl.dashed([x0, y1, zc], [x1, y1, zc], 1.0, 0.4, 0.8, A, 1);
      sl.dashed([x0, y0, zc], [x0, y1, zc], 1.0, 0.4, 0.8, A, 1);
      sl.dashed([x1, y0, zc], [x1, y1, zc], 1.0, 0.4, 0.8, A, 1);
      this.phantom = sl.freeze();
      const g = new SegList();
      const G = BONE(0.7), Hh = BONE(0.35);
      g.seg([-40, 0, 0.9], [40, 0, 0.9], 2.0, G, 1);
      for (let x = -40; x < 40; x += 0.45) g.seg([x, 0, 0.9], [x - 0.35, -0.35, 0.9], 0.8, Hh, 1);
      this.ground = g.freeze();
    }
    // ---- calendar lettering
    const strs: string[] = [];
    for (let d = 1; d <= 31; d++) strs.push(String(d));
    for (let w = 1; w <= 53; w++) strs.push(`W${String(w).padStart(2, '0')}`);
    strs.push('MTG');
    this.glyphs = glyphCache(strs);
    {
      const sl = new SegList();
      const names = ['WK', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
      names.forEach((nm, i) => { const c = frontCell(i, 14); strokeLabel(sl, nm, [c.x - c.hw + 0.16, floorY(14) + 0.22, FZ + 0.32], [1, 0, 0], [0, 1, 0], 0.26, 1.0, BONE(0.7)); });
      this.weekdays = sl.freeze();
    }

    // ---- long tail
    this.plots = buildPlots(900, TOWER.W / 2 + 4);
    {
      const sl = new SegList();
      for (const pl of this.plots) {
        const hx = pl.w / 2, hz = pl.d / 2, x = pl.x, z = pl.z;
        const headT = pl.i <= 3;
        const E = BONE(headT ? 0.7 : 0.6);
        if (!headT) {
          // plot boundary: dashed (proposed), survey stakes
          const c: V3[] = [[x - hx, 0.01, z - hz], [x + hx, 0.01, z - hz], [x + hx, 0.01, z + hz], [x - hx, 0.01, z + hz]];
          for (let k = 0; k < 4; k++) sl.dashed(c[k]!, c[(k + 1) % 4]!, 0.22, 0.14, 0.8, E, 0.8, pl.i);
          for (const q of c) sl.seg(q, [q[0], 0.28, q[2]], 0.9, E, 0.9, pl.i);
        }
        if (pl.hut) {
          const h = Math.max(0.12, pl.h);
          const bw = headT ? hx : hx * 0.62, bd = headT ? hz : hz * 0.62;
          const b: V3[] = [[x - bw, 0, z - bd], [x + bw, 0, z - bd], [x + bw, 0, z + bd], [x - bw, 0, z + bd]];
          const tp: V3[] = b.map((q) => [q[0], h, q[2]]);
          for (let k = 0; k < 4; k++) {
            sl.seg(b[k]!, b[(k + 1) % 4]!, headT ? 1.6 : 0.9, E, 1, pl.i);
            sl.seg(tp[k]!, tp[(k + 1) % 4]!, headT ? 1.6 : 0.9, E, 1, pl.i);
            sl.seg(b[k]!, tp[k]!, headT ? 1.6 : 0.9, E, 1, pl.i);
          }
          if (headT) {
            for (let y = 1.5; y < h; y += 1.5) sl.seg([x - bw, y, z + bd], [x + bw, y, z + bd], 0.8, BONE(0.5), 0.8, pl.i);
            for (let k = 1; k < 4; k++) sl.seg([x - bw + (k * 2 * bw) / 4, 0, z + bd], [x - bw + (k * 2 * bw) / 4, h, z + bd], 0.7, BONE(0.45), 0.7, pl.i);
          } else {
            // gable roof
            const rh = h * 0.55;
            sl.seg([x - bw, h, z], [x - bw, h + rh, z], 0, E, 0, pl.i);
            sl.seg(tp[3]!, [x - bw, h + rh, z], 0.9, E, 1, pl.i);
            sl.seg(tp[0]!, [x - bw, h + rh, z], 0.9, E, 1, pl.i);
            sl.seg(tp[2]!, [x + bw, h + rh, z], 0.9, E, 1, pl.i);
            sl.seg(tp[1]!, [x + bw, h + rh, z], 0.9, E, 1, pl.i);
            sl.seg([x - bw, h + rh, z], [x + bw, h + rh, z], 0.9, E, 1, pl.i);
            // door
            sl.poly([[x - bw * 0.25, 0, z + bd], [x - bw * 0.25, h * 0.6, z + bd], [x + bw * 0.25, h * 0.6, z + bd], [x + bw * 0.25, 0, z + bd]], 0.7, E, 0.8, pl.i);
          }
        }
        if (pl.i <= 40) strokeLabel(sl, `PLOT ${String(pl.i).padStart(4, '0')}`, [x - hx, 0.02, z + hz + 0.55], [1, 0, 0], [0, 0, -1], 0.2, 0.7, BONE(0.5), 1, { tag: pl.i });
      }
      this.plotStatic = sl.freeze();
      // the demand curve over the row, as a drawing annotation
      const cv = new SegList();
      const pts: V3[] = [];
      for (const pl of this.plots) { if (pl.i > 400) break; pts.push([pl.x, pl.h + (pl.i <= 3 ? 1.2 : 0.9), pl.z]); }
      cv.poly(pts, 1.2, BONE(0.7), 1);
      strokeLabel(cv, 'h(i) ∝ 1 / (1 + i·k)^a', [this.plots[1]!.x + 3, this.plots[1]!.h + 3, this.plots[1]!.z], [1, 0, 0], [0, 1, 0], 0.9, 1.1, BONE(0.7));
      strokeLabel(cv, 'THE LONG TAIL — UNBUILT (NOT WORTH IT)', [this.plots[8]!.x, 5.2, this.plots[8]!.z], [1, 0, 0], [0, 1, 0], 0.55, 1.0, BONE(0.6));
      this.curve = cv.freeze();
    }
    // the street lettering: one road-marking word per slot, pen-written as sung
    this.L4.words.forEach((w, i) => {
      const st = strokeText(w.w, 'readable', 100);
      const n = Array.from(w.w).length;
      const times: [number, number][] = Array.from(w.w).map((_, k) => [w.start + ((w.end - w.start) * k) / n, w.start + ((w.end - w.start) * (k + 1)) / n]);
      this.road.push({ st, times, x: SLOT_X0 + i * SLOT, z0: STREET_Z - (st.width * ROAD_K) / 2, w });
    });

    // ---- occluders
    this.cardOcc = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, -0.5), this.depthMat, 100);
    this.tierOcc = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), this.depthMat, PYR.ROWS);
    this.towerOcc = new THREE.Mesh(new THREE.BoxGeometry(TOWER.W * 0.995, 1, TOWER.D * 0.995).translate(0, 0.5, 0), this.depthMat);
    this.headOcc = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), this.depthMat, 3);
    for (const m of [this.cardOcc, this.tierOcc, this.towerOcc, this.headOcc]) { m.frustumCulled = false; this.occ.add(m); }
    {
      const m4 = new THREE.Matrix4();
      for (let i = 0; i < 3; i++) {
        const pl = this.plots[i]!;
        m4.compose(new THREE.Vector3(pl.x, 0, pl.z), new THREE.Quaternion(), new THREE.Vector3(pl.w * 0.99, pl.h * 0.995, pl.d * 0.99));
        this.headOcc.setMatrixAt(i, m4);
      }
      this.headOcc.instanceMatrix.needsUpdate = true;
    }

    // ---- stamps (line 1)
    const arch = F.archivo(62, 900);
    const stampCards = [[0, 6], [0, 7], [0, 8], [0, 9], [1, 9], [PYR.ROWS - 1, 0]];
    this.L1.words.slice(0, 6).forEach((w, i) => {
      const [r, ci] = stampCards[i]!;
      const card = this.cards.find((c) => c.r === r && c.i === ci)!;
      const txt = w.w.replace(/[,.]/g, '').toUpperCase();
      const probe = new Label3D(txt, arch, { capH: 1, px: 60 });
      const cap = Math.min(0.42, (0.95 * card.s) / (probe.w / 1));
      probe.tex.dispose();
      const lab = new Label3D(txt, arch, { capH: cap, px: 200, ax: 0.5, ay: 0.5 });
      lab.set({ grain: 0.55, seed: i * 3.1 + 1 });
      this.labels.add(lab.mesh);
      this.stamps.push({ w, card, lab, rot: (hash(i, 77) - 0.5) * 0.3 });
    });
    this.handsLab = new Label3D(this.L1.words[6]!.w.toUpperCase(), F.archivo(75, 900), { capH: 2.3, px: 260, ax: 0.5, ay: 0.5 });
    this.handsLab.set({ grain: 0.45, seed: 9.3 });
    this.labels.add(this.handsLab.mesh);

    // ---- signs (line 2): bands on the façade, revealed by the extrusion front
    const bands: [number, number, number][] = [[24.9, 1.3, 0], [27.6, 2.9, 1], [40.2, 2.0, 2], [50.4, 1.4, 3]];
    const panelGeo = new THREE.PlaneGeometry(1, 1);
    this.L2.words.slice(0, 4).forEach((w, i) => {
      const [y0, capMax] = bands[i]!;
      const txt = w.w.replace(/[,.]/g, '').toUpperCase();
      const fam = F.archivo(i === 1 ? 62 : 75, 900);
      const probe = new Label3D(txt, fam, { capH: 1, px: 60 });
      const cap = Math.min(capMax, (TOWER.W - 1.2) / probe.w);
      probe.tex.dispose();
      const lab = new Label3D(txt, fam, { capH: cap, px: 280, ax: 0.5, ay: 0 });
      lab.place([0, y0 + 0.25, FZ + 0.34]);
      this.labels.add(lab.mesh);
      const panel = new THREE.Mesh(panelGeo, this.fillMat);
      panel.position.set(0, y0 + 0.25 + cap / 2, FZ + 0.3);
      panel.scale.set(TOWER.W - 0.4, cap + 0.5, 1);
      panel.frustumCulled = false;
      this.occ.add(panel);
      this.signs.push({ w, lab, y0, y1: y0 + cap + 0.5, panel });
    });
    {
      const fam = F.archivo(75, 800);
      const probe = new Label3D(TOWER.NAME, fam, { capH: 1, px: 60 });
      const cap = Math.min(1.9, (TOWER.CROWN_HW * 2 - 1.0) / probe.w);
      probe.tex.dispose();
      this.crown = new Label3D(TOWER.NAME, fam, { capH: cap, px: 260, ax: 0.5, ay: 0.5 });
      this.crown.place([0, TOWER.ROOF + 0.8 + (TOWER.CROWN_H - 0.8) / 2, FZ - 0.25]);
      this.labels.add(this.crown.mesh);
      this.nameLab = new Label3D(this.L2.words[4]!.w.toUpperCase(), F.archivo(87, 900), { capH: 1.7, px: 240, ax: 0, ay: 0.5 });
      this.nameLab.place([TOWER.CROWN_HW + 3.2, TOWER.TOP + 1.6, FZ - 0.25]);
      this.labels.add(this.nameLab.mesh);
    }

    // ---- invite (line 3)
    {
      const words = this.L3.words.map((w) => w.w);
      const k = words.findIndex((w) => /^for$/i.test(w));
      const a = words.slice(0, k).join(' '), b = words.slice(k).join(' ');
      this.splitAt = Array.from(a).length + 1;
      const fam = F.archivo(87, 700);
      this.subjA = new Label3D(a, fam, { capH: 0.62, px: 200, ax: 0, ay: 0 });
      this.subjB = new Label3D(b, fam, { capH: 0.62, px: 200, ax: 0, ay: 0 });
      const mono = F.mono(500);
      for (const s of ['MEETING REQUEST · RECURRING', 'SUBJECT', 'FROM   VP, PLATFORM', 'TO     100 ATTENDEES', 'WHEN   WEEKLY · 52×', 'FEATURE #4127 — 3 %'])
        this.fields.push(new Label3D(s, mono, { capH: 0.2, px: 90, ax: 0, ay: 0 }));
      for (const l of [this.subjA, this.subjB, ...this.fields]) { l.set({ colA: BONE(0.85) }); this.inviteGroup.add(l.mesh); }
      const pg = new THREE.PlaneGeometry(INV.w, INV.h).translate(INV.w / 2, -INV.h / 2, -0.02);
      this.invitePanel = new THREE.Mesh(pg, this.fillMat);
      this.invitePanel.frustumCulled = false;
      this.invitePanelGroup.add(this.invitePanel);
      this.occ.add(this.invitePanelGroup);
      this.labels.add(this.inviteGroup);
      // layout (group-local: origin top-left, x right, y up)
      this.fields[0]!.mesh.position.set(0.35, -0.55, 0);
      this.fields[1]!.mesh.position.set(0.35, -1.25, 0);
      this.subjA.mesh.position.set(0.35, -2.05, 0);
      this.subjB.mesh.position.set(0.35, -2.9, 0);
      this.fields[2]!.mesh.position.set(0.35, -3.55, 0);
      this.fields[3]!.mesh.position.set(0.35, -3.95, 0);
      this.fields[4]!.mesh.position.set(0.35, -4.35, 0);
      this.fields[5]!.mesh.position.set(INV.w - 3.9, -4.95, 0);
      const sl = new SegList();
      const E = BONE(0.75), M = BONE(0.45);
      sl.poly([[0, 0, 0], [INV.w, 0, 0], [INV.w, -INV.h, 0], [0, -INV.h, 0]], 1.8, E, 1, 0, true);
      sl.seg([0, -0.8, 0], [INV.w, -0.8, 0], 1.0, M, 1);
      sl.seg([0.35, -3.2, 0], [INV.w - 0.35, -3.2, 0], 0.8, M, 1);
      sl.seg([0.35, -4.6, 0], [INV.w - 0.35, -4.6, 0], 0.8, M, 1);
      // buttons
      const btn = (x: number, label: string) => {
        sl.poly([[x, -3.55, 0], [x + 1.55, -3.55, 0], [x + 1.55, -4.1, 0], [x, -4.1, 0]], 1.0, M, 1, 0, true);
        strokeLabel(sl, label, [x + 0.775, -3.93, 0], [1, 0, 0], [0, 1, 0], 0.17, 0.8, M, 1, { align: 0.5 });
      };
      btn(INV.w - 5.1, 'ACCEPT'); btn(INV.w - 3.45, 'MAYBE'); btn(INV.w - 1.8, 'DECLINE');
      // progress bar frame
      sl.poly([[0.35, -4.82, 0], [INV.w - 4.2, -4.82, 0], [INV.w - 4.2, -5.02, 0], [0.35, -5.02, 0]], 0.8, M, 1, 0, true);
      // window dots
      for (let i = 0; i < 3; i++) sl.circle([INV.w - 0.4 - i * 0.3, -0.4, 0], 0.08, [1, 0, 0], [0, 1, 0], 0.8, M, 1, 0, 10);
      this.inviteSegs = sl.freeze();
    }
    // month headers
    for (let m = 0; m <= 12; m++) {
      const lab = new Label3D(`${MONTHS[m % 12]} ${m < 12 ? 1999 : 2000}`, F.archivo(100, 800), { capH: 1.05, px: 200, ax: 0, ay: 0 });
      lab.place([-TOWER.W / 2 + 0.4, floorY(15) - 0.15, FZ + 0.36]);
      this.labels.add(lab.mesh);
      this.months.push(lab);
    }
    // month flip times: JAN on the cut, then twelve flips rushing across the sung line, JAN 2000 on the next beat
    {
      const b3 = this.bars[3] ?? this.L3.start - 1.2;
      this.monthT = [b3];
      for (let j = 1; j <= 11; j++) this.monthT.push(this.L3.start + ((j + 0.3) / 11.6) * (this.L3.end - this.L3.start));
      this.monthT.push(au.timeOfBeat(Math.ceil(au.beatAt(this.L3.end + 0.05))));
    }
  }

  inviteGroup = new THREE.Group();
  invitePanelGroup = new THREE.Group();

  // ------------------------------------------------------------------ timing helpers
  private bar(i: number) { return this.bars[i] ?? this.ctx.start + i * 1.94; }

  /** Extrusion height of the tower (world y) — the front passes each sign band while its word is sung. */
  private towerH(t: number) {
    const w = this.L2.words, s = this.signs;
    if (t < this.tFold) return 0;
    const k: Key[] = [
      [this.tFold, 0],
      [w[0]!.start, s[0]!.y0, ease.outCubic],
      [w[0]!.end + 0.02, s[0]!.y1, ease.linear],
      [w[1]!.start, s[1]!.y0, ease.inOutCubic],
      [w[1]!.end, s[1]!.y1, ease.inOutQuad],
      [w[2]!.start, s[2]!.y0, ease.inOutCubic],
      [w[2]!.end, s[2]!.y1, ease.linear],
      [w[3]!.start, s[3]!.y0, ease.inOutCubic],
      [w[3]!.end + 0.02, s[3]!.y1, ease.linear],
      [w[4]!.start + 0.02, TOWER.ROOF + 0.01, ease.inOutQuad],
      [w[4]!.start + 0.2, TOWER.TOP + TOWER.MAST + 0.1, ease.outCubic],
    ];
    return keys(t, k);
  }

  /** Month index shown at t (0 = JAN 1999 … 12 = JAN 2000) and the time of the last flip. */
  private monthAt(t: number) {
    let m = 0;
    for (let i = 0; i < this.monthT.length; i++) if (t >= this.monthT[i]!) m = i;
    return { m, t0: this.monthT[m]! };
  }

  // ------------------------------------------------------------------ camera
  private camAt(t: number): Pose {
    const b1 = this.bar(1), b3 = this.bar(3), b4 = this.bar(4), b6 = this.bar(6);
    const w1 = this.L1.words;
    const card = (r: number, i: number) => this.cards.find((c) => c.r === r && c.i === i)!;
    const close = (c: CardDef, dx = 0): Pose => P([c.x - 1.9 + dx, c.y + 1.35 * c.s, c.z + 5.6 * c.s], [c.x + 0.25 + dx, c.y + 0.72 * c.s, c.z], 31, -0.02);
    if (t < w1[5]!.start - 0.4) {
      // the skyline (boot's last frame) → dive to the bottom row, truck along it word by word, boom up for "a"
      const sky = P([-17, 14, 31], [0, 5, -4], 38, 0.03);
      const seq: [number, CardDef][] = [[w1[0]!.start, card(0, 6)], [w1[1]!.start, card(0, 7)], [w1[2]!.start, card(0, 8)], [w1[3]!.start, card(0, 9)], [w1[4]!.start, card(1, 9)]];
      let cur = close(seq[0]![1], -0.5);
      for (let i = 1; i < seq.length; i++) {
        const [ts, c] = seq[i]!;
        const k = prog(t, ts - 0.14, ts + 0.08, ease.inOutCubic);
        cur = lerpPose(cur, close(c), k);
      }
      // continuous drift across the row + a push on each kick
      cur.p[0] += (t - w1[0]!.start) * 0.35;
      const k = prog(t, this.ctx.start, w1[0]!.start + 0.12, ease.inOutQuad);
      return lerpPose(sky, cur, k);
    }
    if (t < b1) {
      // whip up to card No. 100 for "hundred"
      const a = close(card(1, 9));
      const apex = card(PYR.ROWS - 1, 0);
      const top = P([apex.x - 1.7, apex.y + 2.3, apex.z + 5.8], [apex.x + 0.15, apex.y + 1.0, apex.z], 33, 0.05);
      const k = prog(t, w1[5]!.start - 0.4, w1[5]!.start - 0.04, ease.inOutExpo);
      const pose = lerpPose(a, top, k);
      const push = prog(t, w1[5]!.start, b1, ease.outCubic);
      pose.p = v3lerp(pose.p, top.g, push * 0.22);
      pose.roll += push * -0.06;
      return pose;
    }
    if (t < this.tFold) {
      // wide: the whole chart, low and dollying across; the hands go up
      const u = prog(t, b1, this.tFold, ease.linear);
      const k0 = prog(t, b1, b1 + 0.5, ease.outExpo);
      const pose = P([lerp(-13, 6, u), lerp(2.4, 4.6, u), lerp(24.5, 27, u)], [lerp(-1, 1.2, u), 8.8, -4.5], lerp(46, 42, u), lerp(0.035, -0.02, u));
      pose.p[2] -= (1 - k0) * 6;
      return pose;
    }
    if (t < b3) {
      // the tower: swing round to a three-quarter view and crane up with the extrusion front
      const wide = this.camAt(this.tFold - 1e-4);
      const w2 = this.L2.words;
      const cy = keys(t, [
        [this.tFold, 6], [w2[0]!.start, this.signs[0]!.y1, ease.inOutCubic], [w2[1]!.end, this.signs[1]!.y1, ease.inOutQuad],
        [w2[2]!.end, this.signs[2]!.y1, ease.inOutCubic], [w2[3]!.end, this.signs[3]!.y1, ease.inOutCubic],
        [w2[4]!.start + 0.18, TOWER.ROOF + 2, ease.inOutCubic], [b3, TOWER.ROOF + 3, ease.outCubic],
      ]);
      const ang = lerp(0.62, 0.3, prog(t, this.tFold, b3, ease.inOutQuad));
      const dist = lerp(27, 30, prog(t, this.tFold, b3, ease.inOutQuad));
      const name = prog(t, w2[4]!.start - 0.1, b3, ease.outCubic);
      const tgt: V3 = [lerp(0.5, 4.6, name), cy - 1.2 + name * 1.5, TZ + 1];
      const pose = P([Math.sin(ang) * dist, cy + 4.5 - name * 7, TZ + Math.cos(ang) * dist], tgt, lerp(40, 38, name), lerp(-0.04, 0.03, name));
      const k = prog(t, this.tFold, this.tFold + 0.5, ease.inOutCubic);
      return lerpPose(wide, pose, k);
    }
    if (t < b4) {
      // calendar façade: oblique from the front-left, trucking and rising
      const u = prog(t, b3, b4, ease.linear);
      const snap = prog(t, b3, b3 + 0.35, ease.outExpo);
      const pose = P([lerp(-11, -7.5, u), lerp(20.5, 21.5, u), FZ + lerp(16.5, 15, u)], [lerp(0.3, 1.0, u), lerp(21.2, 21.8, u), FZ], 38, 0.035);
      pose.p[0] -= (1 - snap) * 3;
      return pose;
    }
    if (t < this.tFall) {
      // reverse: low from the right, the invite in the foreground, pushing in on the typed line
      const u = prog(t, b4, this.tFall, ease.linear);
      const snap = prog(t, b4, b4 + 0.35, ease.outExpo);
      const pose = P([lerp(10.5, 6.5, u), lerp(12.5, 19.5, u), lerp(14.5, 12.0, u)], [lerp(-0.4, -1.0, u), lerp(16.2, 17.8, u), FZ + 1.5], lerp(40, 34, u), -0.05);
      pose.p[1] -= (1 - snap) * 2.5;
      return pose;
    }
    const street = (tt: number) => { const x = this.roadCamX(tt); return P([x, 6.2, STREET_Z + 0.6], [x + 13, -0.5, STREET_Z - 0.2], 40, 0.0); };
    if (t < this.L4.start) {
      // the drop down the façade to street level, turning to look down the street
      const from = this.camAt(this.tFall - 1e-4);
      const k = prog(t, this.tFall, this.L4.start, ease.inOutCubic);
      const to = street(this.L4.start);
      const pose = lerpPose(from, to, k);
      pose.p[1] = lerp(from.p[1], to.p[1], ease.inOutQuad(clamp((t - this.tFall) / (this.L4.start - this.tFall))));
      pose.roll += Math.sin(k * Math.PI) * 0.18;
      return pose;
    }
    if (t < b6) {
      const pose = street(t);
      pose.p[2] += Math.sin((t - this.L4.start) * 1.7) * 0.35;
      pose.p[1] += Math.sin((t - this.L4.start) * 2.3) * 0.12;
      return pose;
    }
    // crane up high: the words down the street, the long tail to the horizon
    const x = this.roadCamX(t);
    const u = prog(t, b6, this.tEnd, ease.linear);
    const k = prog(t, b6, b6 + 1.0, ease.inOutCubic);
    const hi = P([x + lerp(-3, 0, u), lerp(15, 19, u), STREET_Z + lerp(2.5, 1.5, u)], [x + lerp(15, 18, u), 0, STREET_Z - 0.8], 42, -0.02);
    return lerpPose(street(t), hi, k);
  }

  /** Camera x along the street: advancing slower than the words, so the line stacks up ahead down the street. */
  private roadCamX(t: number) {
    const ks: Key[] = this.road.map((r, i) => [r.w.start, i, ease.inOutQuad] as Key);
    const first = this.road[0]!, last = this.road[this.road.length - 1]!;
    let wi: number;
    if (t < first.w.start) wi = -(first.w.start - t) * 2.2;
    else if (t > last.w.start) wi = this.road.length - 1 + (t - last.w.start) * 1.2;
    else wi = keys(t, ks);
    return SLOT_X0 - 8.5 + wi * 2.7;
  }

  /** Pen point of road word i at written length len, in world space. */
  private roadPen(i: number, len: number): V3 | null {
    const r = this.road[i]!, st = r.st;
    for (let si = st.strokes.length - 1; si >= 0; si--) {
      const s0 = st.startLen[si]!;
      if (s0 >= len && si > 0) continue;
      const pts = st.strokes[si]!, L = st.lens[si]!;
      const rr = len - s0;
      for (let j = 1; j < pts.length; j++) {
        if (L[j]! >= rr || j === pts.length - 1) {
          const a = pts[j - 1]!, b = pts[j]!;
          const u = clamp((rr - L[j - 1]!) / Math.max(1e-6, L[j]! - L[j - 1]!));
          return this.roadW(r, a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u);
        }
      }
    }
    return null;
  }
  private roadW(r: { x: number; z0: number }, sx: number, sy: number): V3 {
    return [r.x - sy * ROAD_K * ROAD_STRETCH, 0.02, r.z0 + sx * ROAD_K];
  }

  // ------------------------------------------------------------------ render
  override render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer } = this.ctx;
    const t = f.t;
    const b1 = this.bar(1), b3 = this.bar(3);
    const phase = t < this.tFold ? 1 : t < b3 ? 2 : t < this.tFall ? 3 : 4;
    const cam = this.cam;
    const pose = this.camAt(t);
    // stamps shake the camera; kicks nudge it
    let shake = 0;
    for (const s of this.stamps) shake = Math.max(shake, pulse(t, s.w.start, 0.06));
    shake = Math.max(shake, pulse(t, this.L1.words[6]!.start, 0.09) * 1.6, pulse(t, this.L2.words[4]!.start, 0.08));
    const sx = (hash(frameIdx(t), 1) - 0.5) * shake * 0.12, sy = (hash(frameIdx(t), 2) - 0.5) * shake * 0.12;
    const kick = f.a.kick;
    const pp: V3 = [pose.p[0] + sx, pose.p[1] + sy, pose.p[2]];
    const dir = [pose.g[0] - pp[0], pose.g[1] - pp[1], pose.g[2] - pp[2]] as V3;
    const kp = kick * 0.012;
    pp[0] += dir[0] * kp; pp[1] += dir[1] * kp; pp[2] += dir[2] * kp;
    aim(cam, pp, pose.g, pose.fov, pose.roll);

    // end: rain → jevons' vertical lines, cobalt → ink
    // (lead) the plate ends on cobalt rain: jevons' first beat decelerates the streaks into its grid and drains the paper
    const endK = 0;
    const night = phase === 4 ? prog(t, this.tFall + 0.2, this.L4.start + 0.2, ease.inOutQuad) : 0;

    // ---- paper
    this.bg.u.t!.value = t;
    this.bg.u.night!.value = night;
    this.bg.u.dark!.value = endK;
    this.bg.u.flash!.value = pulse(t, this.L1.words[6]!.start, 0.12) + pulse(t, this.L2.words[4]!.start, 0.15) * 0.7;
    (this.bg.u.drift!.value as THREE.Vector2).set(pose.g[0] * 0.004, pose.g[1] * 0.004);
    this.bg.render(renderer, out);
    renderer.setRenderTarget(out);
    renderer.clearDepth();

    const lb = this.lines, gl = this.glow3, fx = this.fx;
    lb.clear(); gl.clear(); fx.clear();
    const fade = 1 - endK;
    const lineGain = (1 + kick * 0.06) * fade;

    // visibility of meshes
    this.cardOcc.visible = phase <= 3;
    this.tierOcc.visible = phase === 1 || (phase === 2 && t < this.tFold + 0.5);
    this.towerOcc.visible = phase >= 2;
    this.headOcc.visible = phase === 4;
    for (const s of this.stamps) s.lab.mesh.visible = false;
    this.handsLab.mesh.visible = false;
    for (const s of this.signs) { s.lab.mesh.visible = false; s.panel.visible = false; }
    this.crown.mesh.visible = false; this.nameLab.mesh.visible = false;
    this.inviteGroup.visible = false;
    this.invitePanelGroup.visible = false;
    for (const m of this.months) m.mesh.visible = false;

    if (phase <= 3) this.drawCards(t, lb, gl, lineGain, phase);
    if (phase === 1 || (phase === 2 && t < this.tFold + 0.6)) this.drawPyramid(t, lb, gl, lineGain);
    if (phase >= 2) this.drawTower(t, lb, gl, lineGain, phase);
    if (phase === 3 || (phase === 4 && t < this.L4.start)) this.drawCalendar(t, lb, gl, lineGain);
    if (phase === 4) this.drawStreet(t, lb, gl, fx, lineGain * 1, night);
    this.drawRain(t, fx, phase, endK);

    // ---- draw
    renderer.render(this.occ, cam);
    lb.render(renderer, out, cam);
    gl.render(renderer, out, cam);
    renderer.render(this.labels, cam);
    fx.render(renderer, out);

    return {
      bloom: 0.6, bloomThreshold: 0.9, grain: 0.05, vignette: 0.3, halation: 0.2, ca: lerp(1.0, 0, endK),
      flash: pulse(t, this.L1.words[6]!.start, 0.07) * 0.18,
    };
  }

  // ------------------------------------------------------------------ 1. the pyramid
  private cardState(c: CardDef, t: number) {
    const start = this.ctx.start;
    // skyline → cards
    const kc = prog(t, start + 0.02 + c.seed * 0.1, start + 0.24 + c.seed * 0.1, ease.inOutCubic);
    const kt = prog(t, start + 0.02, start + 0.34, ease.inOutCubic);
    let x = c.x, y = c.y * kt, z = c.z;
    let s = lerp(1, c.s, kc);
    const h = lerp(c.hTower, PYR.CARD_H * c.s, kc);
    const d = lerp(0.95, PYR.CARD_T, kc);
    // the fold: fly into a window cell of the tower's front face
    const st = ((c.n - 1) / 99) * 0.28;
    const kf = prog(t, this.tFold + st, this.tFold + st + 0.34, ease.inOutCubic);
    let rot = 0;
    if (kf > 0) {
      const bay = (c.n - 1) % TOWER.BAYS_X, fl = 1 + Math.floor((c.n - 1) / TOWER.BAYS_X);
      const cell = frontCell(bay, fl);
      const tx = cell.x, ty = cell.y - cell.hh + 0.05, tz = FZ + 0.05;
      x = lerp(x, tx, kf); y = lerp(y, ty, kf) + Math.sin(kf * Math.PI) * 3; z = lerp(z, tz, kf);
      s = lerp(s, 1, kf);
      rot = Math.sin(kf * Math.PI) * (c.seed - 0.5) * 1.6;
    }
    return { x, y, z, s, h, d, kc, kf, rot };
  }

  private drawCards(t: number, lb: LineBatch, gl: LineBatch, G: number, phase: number) {
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    const hands = this.L1.words[6]!;
    const b3 = this.bar(3);
    let nOcc = 0;
    for (const c of this.cards) {
      const cs = this.cardState(c, t);
      // calendar takes over the windows: the cards flip away in a wave
      const flipT = b3 + ((c.n - 1) % 8) * 0.012 + Math.floor((c.n - 1) / 8) * 0.02;
      const flip = prog(t, flipT, flipT + 0.16, ease.inCubic);
      if (phase === 3 && flip >= 1) continue;
      const sq = phase === 3 ? Math.cos(flip * Math.PI / 2) : 1;
      e.set(0, 0, cs.rot); q.setFromEuler(e);
      m4.compose(new THREE.Vector3(cs.x, cs.y, cs.z + PYR.CARD_T / 2), q, new THREE.Vector3(cs.s * 0.98, cs.h * 0.99 * sq, cs.d * 0.98));
      this.cardOcc.setMatrixAt(nOcc++, m4);
      const cr = Math.cos(cs.rot), sr = Math.sin(cs.rot);
      const fz = cs.z + PYR.CARD_T / 2;
      const X = (lx: number, ly: number, lz: number, o: V3) => {
        const px = lx * cs.s, py = ly * cs.s * sq;
        o[0] = cs.x + px * cr - py * sr; o[1] = cs.y + px * sr + py * cr; o[2] = fz + lz;
      };
      const g = G * (cs.kf > 0 && cs.kf < 1 ? 0.8 : 1);
      if (cs.kc < 1) {
        // still a tower of the skyline: a box with floor lines, collapsing
        const hw = cs.s / 2, hh = cs.h, dd = cs.d, a = (1 - cs.kc) * 0.9 + 0.1;
        const pts: V3[] = [[-hw, 0, 0], [hw, 0, 0], [hw, hh, 0], [-hw, hh, 0]];
        const back = pts.map((p) => [p[0], p[1], -dd] as V3);
        const E = BONE(0.72 * g);
        for (let k = 0; k < 4; k++) {
          const a0 = pts[k]!, a1 = pts[(k + 1) % 4]!, b0 = back[k]!, b1 = back[(k + 1) % 4]!;
          lb.seg(cs.x + a0[0], cs.y + a0[1], fz + a0[2], cs.x + a1[0], cs.y + a1[1], fz + a1[2], 1.6, E[0], E[1], E[2], 1);
          lb.seg(cs.x + b0[0], cs.y + b0[1], fz + b0[2], cs.x + b1[0], cs.y + b1[1], fz + b1[2], 1.0, E[0], E[1], E[2], 0.7);
          lb.seg(cs.x + a0[0], cs.y + a0[1], fz + a0[2], cs.x + b0[0], cs.y + b0[1], fz + b0[2], 1.2, E[0], E[1], E[2], 0.85);
        }
        const M = BONE(0.5 * g);
        for (let y = 0.5; y < hh - 0.2; y += 0.5) {
          lb.seg(cs.x - hw, cs.y + y, fz, cs.x + hw, cs.y + y, fz, 0.8, M[0], M[1], M[2], a);
          lb.seg(cs.x + hw, cs.y + y, fz, cs.x + hw, cs.y + y, fz - dd, 0.8, M[0], M[1], M[2], a * 0.8);
        }
        if (cs.kc < 0.6) continue;
      }
      const faceA = prog(cs.kc, 0.6, 1);
      emitSegs(lb, this.faces[c.n - 1]!.face, { xf: X, gain: g, alpha: faceA });
      // slab thickness: back outline hint
      {
        const E = BONE(0.45 * g), hw = 0.5, hh = PYR.CARD_H;
        const pa: V3 = [0, 0, 0], pb: V3 = [0, 0, 0];
        for (const [lx, ly] of [[-hw, 0], [hw, 0], [hw, hh], [-hw, hh]] as [number, number][]) {
          X(lx, ly, 0, pa); X(lx, ly, -PYR.CARD_T * cs.s, pb);
          lb.seg(pa[0], pa[1], pa[2], pb[0], pb[1], pb[2], 1.0, E[0], E[1], E[2], faceA);
        }
      }
      // the hand: rises out of the card on "hands," (a wave from the top of the chart down)
      const delay = (PYR.ROWS - 1 - c.r) * 0.045 + c.seed * 0.03;
      const lift = cs.kf > 0 ? springStep(t - hands.start - delay, 2.6, 0.45) * (1 - cs.kf) : springStep(t - hands.start - delay, 2.6, 0.45);
      const hot = pulse(t, hands.start + delay, 0.18);
      const hk = 1 + lift * 0.45;
      const hx = (lx: number, ly: number, lz: number, o: V3) => X(lx * hk, 0.56 + (ly - 0.56) * hk + lift * 0.62, lz + lift * 0.25, o);
      emitSegs(lb, this.faces[c.n - 1]!.hand, { xf: hx, gain: g * (1 + lift * 0.15), alpha: faceA });
      if (hot > 0.02) emitSegs(gl, this.faces[c.n - 1]!.hand, { xf: hx, color: GOLD(1.6 * hot), alpha: faceA, widthK: 1.4 });
    }
    this.cardOcc.count = nOcc;
    this.cardOcc.instanceMatrix.needsUpdate = true;

    // stamps
    for (const s of this.stamps) {
      if (t < s.w.start - 0.03 || phase > 2) continue;
      const cs = this.cardState(s.card, t);
      const k = prog(t, s.w.start - 0.03, s.w.start + 0.07, ease.outExpo);
      const cool = prog(t, s.w.end + 0.05, s.w.end + 0.6, ease.inOutQuad);
      const sc = 1 + (1 - k) * 0.6;
      const lab = s.lab;
      lab.mesh.visible = true;
      const rot = s.rot + (1 - k) * 0.25 + cs.rot;
      lab.place([cs.x - Math.sin(cs.rot) * 0.78 * cs.s, cs.y + Math.cos(cs.rot) * 0.78 * cs.s, cs.z + PYR.CARD_T / 2 + 0.03], [Math.cos(rot), Math.sin(rot), 0], [-Math.sin(rot), Math.cos(rot), 0], sc * cs.s / s.card.s);
      const gold = GOLD(1.5);
      lab.set({ colA: [lerp(gold[0], LIN.bone[0] * 0.9, cool), lerp(gold[1], LIN.bone[1] * 0.9, cool), lerp(gold[2], LIN.bone[2] * 0.9, cool)], alA: k * (1 - prog(t, this.tFold, this.tFold + 0.25)), wipe: 0 });
      // ink dust around the fresh stamp
      if (t - s.w.start < 0.35) {
        const age = Math.max(0, t - s.w.start);
        for (let i = 0; i < 14; i++) {
          const a = hash(i, s.w.start * 10) * TAU, r = 0.35 + age * (1.2 + hash(i, 5) * 2.5);
          const px = cs.x + Math.cos(a) * r * 0.9, py = cs.y + 0.75 + Math.sin(a) * r * 0.6;
          const al = (1 - age / 0.35) * 0.9;
          gl.seg(px, py, cs.z + 0.12, px + Math.cos(a) * 0.05, py + Math.sin(a) * 0.05, cs.z + 0.12, 1.6, LIN.signal[0] * 1.2, LIN.signal[1] * 1.2, LIN.signal[2] * 1.2, al);
        }
      }
    }
  }

  private drawPyramid(t: number, lb: LineBatch, gl: LineBatch, G: number) {
    const start = this.ctx.start, b1 = this.bar(1);
    const kt = prog(t, start + 0.02, start + 0.34, ease.inOutCubic) * (1 - prog(t, this.tFold, this.tFold + 0.45, ease.inOutCubic));
    const collapse = (x: number, y: number, z: number, o: V3) => { o[0] = x; o[1] = y * kt; o[2] = z; };
    // tiers (occluders follow)
    const m4 = new THREE.Matrix4();
    let n = 0;
    for (let r = 1; r < PYR.ROWS; r++) {
      const hw = (((2 * (PYR.ROWS - 1 - r) + 1) * PYR.PITCH) / 2 + 0.35) * 2;
      m4.compose(new THREE.Vector3(0, 0, -r * PYR.ROW_D), new THREE.Quaternion(), new THREE.Vector3(hw * 0.995, Math.max(1e-3, r * PYR.ROW_H * kt * 0.995), PYR.ROW_D * 0.99));
      this.tierOcc.setMatrixAt(n++, m4);
    }
    this.tierOcc.count = n;
    this.tierOcc.instanceMatrix.needsUpdate = true;
    emitSegs(lb, this.tierSegs, { xf: collapse, gain: G, alpha: prog(t, start + 0.15, start + 0.5) });
    if (t < this.tFold) emitSegs(lb, this.ground, { gain: G });
    // org-chart connectors: drawn from the top down after "hundred", lit by a gold pulse travelling down the tree
    const fadeOut = 1 - prog(t, this.tFold, this.tFold + 0.2);
    const tDraw = this.L1.words[5]!.start + 0.1;
    const rowT = (r: number) => tDraw + (PYR.ROWS - 1 - r) * 0.06;
    emitSegs(lb, this.conn, { xf: collapse, alpha: fadeOut, tagGain: (r) => G * (0.35 + 0.65 * prog(t, rowT(r), rowT(r) + 0.3, ease.outCubic)) });
    emitSegs(gl, this.conn, { xf: collapse, alpha: fadeOut, color: GOLD(1.4), tagGain: (r) => { const h = pulse(t, rowT(r) + 0.05, 0.16); return h > 0.03 ? h : 0; } });
    // title block
    emitSegs(lb, this.titleBlock, { gain: G, alpha: prog(t, b1 - 0.1, b1 + 0.3) * fadeOut });
    // HANDS, — a rubber stamp across the drawing
    const hands = this.L1.words[6]!;
    if (t >= hands.start - 0.02 && t < this.tFold + 0.3) {
      const k = prog(t, hands.start - 0.02, hands.start + 0.08, ease.outExpo);
      const sc = 1 + (1 - k) * 0.8;
      const lab = this.handsLab;
      lab.mesh.visible = true;
      const rot = -0.07 + (1 - k) * 0.12;
      const c: V3 = [1.2, 9.4, 3.2];
      const r: V3 = [Math.cos(rot), Math.sin(rot), 0], u: V3 = [-Math.sin(rot), Math.cos(rot), 0];
      lab.place(c, r, u, sc);
      const out = prog(t, this.tFold, this.tFold + 0.3);
      lab.set({ colA: GOLD(1.35), alA: k * (1 - out) });
      // stamp frame: double rule
      const hw = (lab.w / 2 + 0.6) * sc, hh = (lab.h / 2 + 0.55) * sc;
      for (const [ex, lw] of [[0, 3.2], [0.22, 1.4]] as [number, number][]) {
        const pts: V3[] = [[-hw - ex, -hh - ex, 0], [hw + ex, -hh - ex, 0], [hw + ex, hh + ex, 0], [-hw - ex, hh + ex, 0]].map(([x, y]) => [c[0] + r[0] * x! + u[0] * y!, c[1] + r[1] * x! + u[1] * y!, c[2]] as V3);
        for (let i = 0; i < 4; i++) {
          const a = pts[i]!, b = pts[(i + 1) % 4]!;
          gl.seg(a[0], a[1], a[2], b[0], b[1], b[2], lw, LIN.signal[0] * 1.2, LIN.signal[1] * 1.2, LIN.signal[2] * 1.2, k * (1 - out));
        }
      }
    }
  }

  // ------------------------------------------------------------------ 2. the tower
  private drawTower(t: number, lb: LineBatch, gl: LineBatch, G: number, phase: number) {
    const h = phase === 2 ? this.towerH(t) : 1e9;
    const off: V3 = [0, 0, TZ];
    const hh = Math.min(h, TOWER.ROOF);
    this.towerOcc.position.set(0, 0, TZ);
    this.towerOcc.scale.set(1, Math.max(1e-3, hh * 0.998), 1);
    emitSegs(lb, this.tower.body, { clipY: h, off, gain: G });
    // footprint in plan while it starts
    if (phase === 2) {
      const k = prog(t, this.tFold - 0.05, this.tFold + 0.25, ease.outCubic);
      const hx = TOWER.W / 2 * k, hz = TOWER.D / 2 * k, E = BONE(0.8 * G);
      const c: V3[] = [[-hx, 0.02, TZ - hz], [hx, 0.02, TZ - hz], [hx, 0.02, TZ + hz], [-hx, 0.02, TZ + hz]];
      for (let i = 0; i < 4; i++) lb.seg(c[i]![0], c[i]![1], c[i]![2], c[(i + 1) % 4]![0], c[(i + 1) % 4]![1], c[(i + 1) % 4]![2], 2.2, E[0], E[1], E[2], 1);
      // the extrusion front: a hot gold ring at h
      if (h > 0.05 && h < TOWER.TOP) {
        const y = Math.min(h, TOWER.ROOF), hx2 = TOWER.W / 2, hz2 = TOWER.D / 2;
        const r: V3[] = [[-hx2, y, TZ - hz2], [hx2, y, TZ - hz2], [hx2, y, TZ + hz2], [-hx2, y, TZ + hz2]];
        const I = 1.6;
        for (let i = 0; i < 4; i++) gl.seg(r[i]![0], r[i]![1], r[i]![2], r[(i + 1) % 4]![0], r[(i + 1) % 4]![1], r[(i + 1) % 4]![2], 2.4, LIN.signal[0] * I, LIN.signal[1] * I, LIN.signal[2] * I, 1);
      }
    }
    if (phase === 2) emitSegs(lb, this.phantom, { gain: G, alpha: prog(t, this.tFold, this.tFold + 0.3) * (1 - prog(t, this.L2.words[4]!.start, this.L2.words[4]!.start + 0.3)) });
    if (phase <= 2) emitSegs(lb, this.ground, { gain: G });
    // annotations appear as the floors pass
    const nk = phase === 2 ? prog(t, this.tFold + 0.2, this.tFold + 0.6) : 1;
    emitSegs(lb, this.tower.notes, { clipY: h, off, gain: G * 0.95, alpha: nk * (phase === 4 ? 0.5 : 1) });
    if (phase !== 2) return;
    // signs: panels + words revealed by the extrusion front
    this.signs.forEach((s) => {
      if (h < s.y0) return;
      s.panel.visible = true;
      s.panel.scale.y = Math.max(1e-3, Math.min(s.y1, h) - s.y0);
      s.panel.position.y = s.y0 + s.panel.scale.y / 2;
      s.lab.mesh.visible = true;
      const cool = prog(t, s.w.end + 0.1, s.w.end + 0.5);
      const g = GOLD(1.45);
      s.lab.set({ clipY: h, colA: [lerp(g[0], LIN.bone[0] * 0.88, cool), lerp(g[1], LIN.bone[1] * 0.88, cool), lerp(g[2], LIN.bone[2] * 0.88, cool)] });
      // panel frame
      const y0 = s.y0, y1 = Math.min(s.y1, h), hx = TOWER.W / 2 - 0.2, z = FZ + 0.32, E = BONE(0.75 * G);
      lb.seg(-hx, y0, z, hx, y0, z, 1.4, E[0], E[1], E[2], 1);
      lb.seg(-hx, y0, z, -hx, y1, z, 1.4, E[0], E[1], E[2], 1);
      lb.seg(hx, y0, z, hx, y1, z, 1.4, E[0], E[1], E[2], 1);
      if (h >= s.y1) lb.seg(-hx, y1, z, hx, y1, z, 1.4, E[0], E[1], E[2], 1);
    });
    // crown sign + NAME, callout
    const name = this.L2.words[4]!;
    if (h > TOWER.ROOF + 0.8) {
      this.crown.mesh.visible = true;
      const wp = Lyrics.wordProgress(name, t);
      this.crown.set({ clipY: h, colA: BONE(0.55), colB: GOLD(1.7), wipe: wp, feather: 0.12 });
      if (t >= name.start) {
        this.nameLab.mesh.visible = true;
        const k = prog(t, name.start, name.start + 0.08, ease.outExpo);
        this.nameLab.set({ colA: GOLD(1.5), alA: k });
        // leader: balloon on the sign's corner → label
        const x0 = TOWER.CROWN_HW, y0 = TOWER.TOP - 0.3, z = FZ - 0.25;
        const x1 = TOWER.CROWN_HW + 2.9, y1 = TOWER.TOP + 1.6;
        const e = prog(t, name.start - 0.05, name.start + 0.12, ease.outCubic);
        const I = 1.3;
        gl.seg(x0, y0, z, lerp(x0, x1 - 0.8, e), lerp(y0, y1, e), z, 1.6, LIN.signal[0] * I, LIN.signal[1] * I, LIN.signal[2] * I, 1);
        if (e > 0.99) gl.seg(x1 - 0.8, y1, z, x1 - 0.1, y1, z, 1.6, LIN.signal[0] * I, LIN.signal[1] * I, LIN.signal[2] * I, 1);
        for (let i = 0; i < 12; i++) {
          const a0 = (i / 12) * TAU, a1 = ((i + 1) / 12) * TAU;
          gl.seg(x0 + Math.cos(a0) * 0.18, y0 + Math.sin(a0) * 0.18, z, x0 + Math.cos(a1) * 0.18, y0 + Math.sin(a1) * 0.18, z, 1.6, LIN.signal[0] * I, LIN.signal[1] * I, LIN.signal[2] * I, 1);
        }
      }
    }
  }

  // ------------------------------------------------------------------ 3. the calendar
  private drawCalendar(t: number, lb: LineBatch, gl: LineBatch, G: number) {
    const b3 = this.bar(3), b4 = this.bar(4);
    const { m, t0 } = this.monthAt(t);
    const prev = Math.max(0, m - 1);
    const firstWeek = (mi: number) => Math.floor((Date.UTC(1999, mi, 1) - CAL0) / DAY_MS / 7);
    const TOPF = 13; // floor of the month's first week
    const cellIn = prog(t, b3, b3 + 0.5, ease.outCubic);
    const zc = FZ + 0.06;
    for (let fl = 1; fl <= TOWER.FLOORS; fl++) {
      const row = TOPF - fl; // weeks down from the month's first week
      for (let bay = 0; bay < TOWER.BAYS_X; bay++) {
        const c = frontCell(bay, fl);
        // flip wave: from the top-left of the visible block
        const delay = Math.abs(fl - TOPF) * 0.018 + bay * 0.012;
        const u = prog(t, t0 + delay, t0 + delay + 0.13, ease.linear);
        const mi = u < 0.5 && m > 0 && t0 + delay > b3 + 0.01 ? prev : m;
        const sq = Math.abs(Math.cos(u * Math.PI));
        const appear = prog(t, b3 + delay * 1.2, b3 + delay * 1.2 + 0.18);
        if (appear <= 0) continue;
        const wk = firstWeek(mi) + row;
        const date = new Date(CAL0 + (wk * 7 + (bay - 1)) * DAY_MS);
        const inMonth = date.getUTCMonth() === mi % 12 && (mi < 12 ? date.getUTCFullYear() === 1999 : date.getUTCFullYear() === 2000);
        const a = appear * cellIn;
        // cell frame + split line
        const E = BONE(0.62 * G), x0 = c.x - c.hw + 0.06, x1 = c.x + c.hw - 0.06, y0 = c.y - c.hh + 0.06, y1 = c.y + c.hh - 0.06;
        lb.seg(x0, y0, zc, x1, y0, zc, 1.0, E[0], E[1], E[2], a);
        lb.seg(x0, y1, zc, x1, y1, zc, 1.0, E[0], E[1], E[2], a);
        lb.seg(x0, y0, zc, x0, y1, zc, 1.0, E[0], E[1], E[2], a);
        lb.seg(x1, y0, zc, x1, y1, zc, 1.0, E[0], E[1], E[2], a);
        lb.seg(x0, c.y, zc, x1, c.y, zc, 0.6, E[0] * 0.6, E[1] * 0.6, E[2] * 0.6, a);
        // the flap in motion
        if (u > 0 && u < 1) {
          const fy = c.y + (u < 0.5 ? 1 : -1) * c.hh * 0.94 * sq;
          const fz = zc + Math.sin(u * Math.PI) * 0.35;
          lb.seg(x0, fy, fz, x1, fy, fz, 1.2, E[0], E[1], E[2], a);
          lb.seg(x0, c.y, zc, x0, fy, fz, 0.8, E[0], E[1], E[2], a * 0.7);
          lb.seg(x1, c.y, zc, x1, fy, fz, 0.8, E[0], E[1], E[2], a * 0.7);
        }
        const label = bay === 0 ? `W${String(((wk % 52) + 52) % 52 + 1).padStart(2, '0')}` : String(date.getUTCDate());
        const gc = this.glyphs.get(label);
        if (!gc) continue;
        const cap = bay === 0 ? 0.2 : 0.36;
        const lx = c.x - c.hw + 0.14, ly = c.y + c.hh - 0.18 - cap;
        const dim = bay === 0 ? 0.55 : inMonth ? 1 : 0.32;
        const X = (x: number, y: number, _z: number, o: V3) => { o[0] = lx + x * cap; o[1] = c.y + (ly + y * cap - c.y) * sq; o[2] = zc + 0.01; };
        emitSegs(lb, gc.d, { xf: X, gain: G * dim, alpha: a });
        // meetings: hatched blocks on (almost) every working day
        if (bay >= 1 && bay <= 5 && inMonth && hash(wk, bay, 3) < 0.86) {
          const mw = 0.3 + hash(wk, bay, 5) * 0.55, my0 = c.y - c.hh + 0.18, my1 = my0 + 0.34 * sq;
          const mx0 = c.x - c.hw + 0.14, mx1 = mx0 + mw;
          const M = BONE(0.55 * G);
          lb.seg(mx0, my0, zc, mx1, my0, zc, 0.8, M[0], M[1], M[2], a);
          lb.seg(mx0, my1, zc, mx1, my1, zc, 0.8, M[0], M[1], M[2], a);
          lb.seg(mx0, my0, zc, mx0, my1, zc, 0.8, M[0], M[1], M[2], a);
          lb.seg(mx1, my0, zc, mx1, my1, zc, 0.8, M[0], M[1], M[2], a);
          for (let hx = mx0 + 0.08; hx < mx1 + 0.3; hx += 0.09) {
            const ax = Math.max(mx0, hx - 0.34 * sq), ay = my0 + (Math.max(mx0, hx - 0.34 * sq) - (hx - 0.34 * sq)), bx = Math.min(hx, mx1), by = my1 - (hx - Math.min(hx, mx1));
            if (by > ay) lb.seg(ax, ay, zc, bx, by, zc, 0.6, M[0] * 0.8, M[1] * 0.8, M[2] * 0.8, a);
          }
        }
        // the 1st of each month circled in gold as it flips past
        if (bay >= 1 && date.getUTCDate() === 1 && inMonth) {
          const I = 1.2 + pulse(t, t0 + delay, 0.2) * 1.5;
          const cx = lx + (gc.w * cap) / 2, cy = ly + cap / 2;
          for (let i = 0; i < 16; i++) {
            const a0 = (i / 16) * TAU, a1 = ((i + 1) / 16) * TAU;
            gl.seg(cx + Math.cos(a0) * 0.36, c.y + (cy + Math.sin(a0) * 0.36 - c.y) * sq, zc + 0.02, cx + Math.cos(a1) * 0.36, c.y + (cy + Math.sin(a1) * 0.36 - c.y) * sq, zc + 0.02, 1.4, LIN.signal[0] * I, LIN.signal[1] * I, LIN.signal[2] * I, a);
          }
        }
      }
    }
    // month header (split-flap board) on floor 14
    {
      const lab = this.months[m]!;
      lab.mesh.visible = true;
      const u = prog(t, t0, t0 + 0.12);
      const sq = m > 0 ? Math.max(0.05, Math.abs(Math.cos((0.5 + u * 0.5) * Math.PI))) : 1;
      lab.mesh.scale.set(1, u < 1 && m > 0 ? sq : 1, 1);
      lab.mesh.updateMatrixWorld();
      lab.set({ colA: BONE(0.9), alA: cellIn });
      const y0 = floorY(14), y1 = floorY(15) + 1.3, z = FZ + 0.3, hx = TOWER.W / 2 - 0.1, E = BONE(0.75 * G);
      lb.seg(-hx, y0, z, hx, y0, z, 1.6, E[0], E[1], E[2], cellIn);
      lb.seg(-hx, y1, z, hx, y1, z, 1.6, E[0], E[1], E[2], cellIn);
      lb.seg(-hx, y0 + 0.75, z, hx, y0 + 0.75, z, 0.8, E[0] * 0.7, E[1] * 0.7, E[2] * 0.7, cellIn);
      emitSegs(lb, this.weekdays, { gain: G * 0.9, alpha: cellIn });
      // flap edge crossing the header
      if (u > 0 && u < 1 && m > 0) {
        const fy = y0 + 0.2 + (1 - u) * 1.3;
        gl.seg(-hx, fy, z + 0.2, hx, fy, z + 0.2, 1.4, LIN.signal[0], LIN.signal[1], LIN.signal[2], 0.8);
      }
    }
    // the invite
    this.drawInvite(t, lb, gl, G, b4);
  }

  private drawInvite(t: number, lb: LineBatch, gl: LineBatch, G: number, b4: number) {
    const L = this.L3;
    const tin = L.start - 0.32;
    if (t < tin) return;
    const k = prog(t, tin, tin + 0.4, (x) => ease.outBack(x, 1.4));
    // a hard sub-cut on the downbeat: the invite turns to face the reverse angle almost instantly
    const spin = prog(t, b4 - 0.02, b4 + 0.1, ease.outCubic);
    const yaw = lerp(1.35, -0.32, k) + spin * 0.62;
    const grp = this.inviteGroup;
    grp.visible = true;
    const cx = -INV.w / 2 - 0.3, cy = 19.2, cz = FZ + 3.4;
    grp.position.set(cx + Math.cos(yaw) * 0, cy, cz);
    grp.rotation.set(-0.04, yaw, 0.015);
    grp.position.x = cx * Math.cos(yaw) + 0.2;
    grp.position.z = cz - cx * Math.sin(yaw);
    grp.updateMatrixWorld(true);
    const pg = this.invitePanelGroup;
    pg.visible = true;
    pg.position.copy(grp.position); pg.rotation.copy(grp.rotation);
    pg.updateMatrixWorld(true);
    const mw = grp.matrixWorld;
    const v = new THREE.Vector3();
    const X = (x: number, y: number, z: number, o: V3) => { v.set(x, y, z).applyMatrix4(mw); o[0] = v.x; o[1] = v.y; o[2] = v.z; };
    emitSegs(lb, this.inviteSegs, { xf: X, gain: G });
    // typed subject
    const ct = lineCharTimes(L);
    let n = 0;
    for (const [a] of ct) if (t >= a) n++;
    const nA = Math.min(n, this.splitAt - 1), nB = Math.max(0, n - this.splitAt);
    this.subjA.revealGlyphs(nA);
    this.subjB.revealGlyphs(nB);
    const typingB = n >= this.splitAt;
    // caret (the cursor) at the typing point, drawn as the shared caret motif in 2D
    const lab = typingB ? this.subjB : this.subjA;
    const ni = typingB ? nB : nA;
    const gx = ni <= 0 ? 0 : ni >= lab.glyphX.length ? lab.w : lab.glyphX[ni]!;
    const base = lab.mesh.position;
    const pa = new THREE.Vector3(base.x + gx + 0.05, base.y + 0.72, 0.02).applyMatrix4(mw);
    const pb = new THREE.Vector3(base.x + gx + 0.05, base.y - 0.08, 0.02).applyMatrix4(mw);
    const sa = toScreen(this.cam, [pa.x, pa.y, pa.z]), sb = toScreen(this.cam, [pb.x, pb.y, pb.z]);
    const done = t > L.end + 0.25;
    if (!sa.behind && Math.abs(yaw) < 1.2) cursorCaret(this.fx, sa.x, sa.y, Math.max(8, sb.y - sa.y), done ? cursorBlink(this.ctx.audio.beatAt(t) % 1) * 0.8 : 1, t);
    // colour: the word being typed is gold, the rest bone
    this.subjA.set({ colA: BONE(0.92), alA: 1 });
    this.subjB.set({ colA: BONE(0.92), alA: 1 });
    // progress bar: 3 %, crawling
    const pr = 0.028 + 0.004 * prog(t, L.start, L.end + 0.6);
    const x0 = 0.35, x1 = INV.w - 4.2, y0 = -4.84, y1 = -5.0;
    const xe = x0 + (x1 - x0) * pr;
    for (let y = y1; y <= y0 + 1e-3; y += 0.04) {
      const a = new THREE.Vector3(x0, y, 0.01).applyMatrix4(mw), b = new THREE.Vector3(xe, y, 0.01).applyMatrix4(mw);
      gl.seg(a.x, a.y, a.z, b.x, b.y, b.z, 1.3, LIN.signal[0] * 1.4, LIN.signal[1] * 1.4, LIN.signal[2] * 1.4, 1);
    }
    void G;
  }

  // ------------------------------------------------------------------ 4. the street
  private drawStreet(t: number, lb: LineBatch, gl: LineBatch, fx: LineBatch, G: number, night: number) {
    const camX = this.cam.position.x;
    const x0 = camX - 30, x1 = camX + 700;
    // the street: kerbs, lane dashes, a survey grid on the wet ground
    const E = BONE(0.4 * G);
    const zl = STREET_Z - STREET_HW, zr = STREET_Z + STREET_HW;
    lb.seg(x0, 0, zl, x1, 0, zl, 1.4, E[0], E[1], E[2], 0.9);
    lb.seg(x0, 0, zr, x1, 0, zr, 1.4, E[0], E[1], E[2], 0.9);
    for (let x = Math.floor(x0 / 3) * 3; x < camX + 160; x += 3) {
      lb.seg(x, 0, zl - 6, x, 0, zl, 0.6, E[0], E[1], E[2], 0.25);
      lb.seg(x, 0, zr, x, 0, zr + 8, 0.6, E[0], E[1], E[2], 0.25);
    }
    for (let z = zr + 2; z < zr + 30; z += 2 + (z - zr) * 0.3) lb.seg(x0, 0, z, x1, 0, z, 0.6, E[0], E[1], E[2], 0.22);
    // plots & huts (+ wet reflections)
    const d = this.plotStatic;
    const ripple = (x: number, y: number, z: number, o: V3) => { o[0] = x + Math.sin(y * 2.1 + t * 5 + z) * 0.06 * -y; o[1] = y; o[2] = z; };
    const mirror = (x: number, y: number, z: number, o: V3) => ripple(x, -y, z, o);
    // emit only plots in range: the static list is ordered by plot, so walk it once
    const iMax = this.plots.findIndex((p) => p.x > x1);
    const maxTag = iMax < 0 ? 1e9 : iMax;
    emitSegs(lb, d, { maxTag, gain: G });
    emitSegs(lb, d, { maxTag: Math.min(maxTag, 160), xf: mirror, gain: G * 0.4, alpha: 0.3 * night });
    emitSegs(lb, this.tower.body, { off: [0, 0, TZ], xf: (x, y, z, o) => mirror(x, y, z, o), gain: G * 0.35, alpha: 0.25 * night, maxTag: 16 });
    emitSegs(lb, this.curve, { gain: G, alpha: prog(t, this.bar(6), this.bar(6) + 0.6) });
    // ripples in puddles (born on a clock)
    const rate = 36, life = 0.55;
    for (let n = Math.floor((t - life) * rate); n <= Math.floor(t * rate); n++) {
      const tb = n / rate, age = t - tb;
      if (age < 0 || age > life) continue;
      const px = camX + 2 + hash(n, 1) * 30, pz = STREET_Z - STREET_HW + hash(n, 2) * STREET_HW * 2;
      const r = 0.1 + age * 1.1, a = (1 - age / life) * 0.5 * night * Math.min(1, G);
      for (let i = 0; i < 10; i++) {
        const a0 = (i / 10) * TAU, a1 = ((i + 1) / 10) * TAU;
        lb.seg(px + Math.cos(a0) * r, 0.01, pz + Math.sin(a0) * r * 0.9, px + Math.cos(a1) * r, 0.01, pz + Math.sin(a1) * r * 0.9, 0.7, LIN.bone[0] * 0.5, LIN.bone[1] * 0.5, LIN.bone[2] * 0.5, a);
      }
    }
    // the lyric: road markings, pen-written on the wet street as sung
    let head: V3 | null = null, headWord = -1;
    this.road.forEach((r, i) => {
      if (t < r.w.start - 0.02) return;
      const st = r.st;
      const len = writtenLength(st, r.times, t);
      const headLen = 30;
      for (let si = 0; si < st.strokes.length; si++) {
        const s0 = st.startLen[si]!;
        if (s0 >= len) break;
        const pts = st.strokes[si]!, L = st.lens[si]!;
        for (let j = 1; j < pts.length; j++) {
          if (s0 + L[j - 1]! >= len) break;
          const a = pts[j - 1]!, b0 = pts[j]!;
          let b = b0;
          if (s0 + L[j]! > len) { const u = (len - s0 - L[j - 1]!) / Math.max(1e-6, L[j]! - L[j - 1]!); b = { x: a.x + (b0.x - a.x) * u, y: a.y + (b0.y - a.y) * u }; }
          const A = this.roadW(r, a.x, a.y), B = this.roadW(r, b.x, b.y);
          const hot = Math.max(0, 1 - (len - (s0 + L[j]!)) / headLen) * (t < r.w.end + 0.15 ? 1 : 0);
          lb.seg(A[0], A[1], A[2], B[0], B[1], B[2], 5.0, LIN.bone[0] * 0.92 * G, LIN.bone[1] * 0.92 * G, LIN.bone[2] * 0.92 * G, 1);
          // the wet sheen smears each stroke a little
          lb.seg(A[0] + 0.25, A[1], A[2], B[0] + 0.25, B[1], B[2], 7, LIN.bone[0] * 0.07 * G, LIN.bone[1] * 0.07 * G, LIN.bone[2] * 0.08 * G, night);
          if (hot > 0) gl.seg(A[0], A[1] + 0.01, A[2], B[0], B[1] + 0.01, B[2], 4, LIN.signal[0] * 1.8 * hot * G, LIN.signal[1] * 1.8 * hot * G, LIN.signal[2] * 1.8 * hot * G, 1);
        }
      }
      if (t <= r.w.end + 0.12) { head = this.roadPen(i, len); headWord = i; }
    });
    // the pen (cursor tip) + sparks
    if (head && t <= this.L4.end + 0.12) {
      const s = toScreen(this.cam, head);
      if (!s.behind) {
        cursorTip(fx, s.x, s.y, t, 1.1, G);
        const cam = this.cam, hw = headWord;
        weldSparks(fx, t, (tb) => {
          if (tb < this.road[hw]!.w.start) return null;
          const p = this.roadPen(hw, writtenLength(this.road[hw]!.st, this.road[hw]!.times, tb));
          if (!p) return null;
          const q = toScreen(cam, p);
          return q.behind ? null : { x: q.x, y: q.y };
        }, { rate: 70, life: 0.35, speed: 260, seed: 4, intensity: G });
      }
    }
  }

  // ------------------------------------------------------------------ rain → vertical lines
  private drawRain(t: number, fx: LineBatch, phase: number, endK: number) {
    const on = phase === 4 ? prog(t, this.tFall + 0.1, this.L4.start + 0.3) : 0;
    if (on <= 0) return;
    const N = 640;
    const tD = this.tEnd + 10, D = 0.51; // (lead) no snap here: jevons does it
    const u = clamp((t - tD) / D);
    const tu = t < tD ? t : tD + D * (u - (u * u) / 2); // decelerating clock
    const e = ease.inOutCubic(u);
    for (let i = 0; i < N; i++) {
      const layer = hash(i, 1);
      const v = 1500 + 1300 * layer;
      const len = 30 + 70 * layer;
      const x0 = hash(i, 2) * (W + 200) - 100;
      const span = H + 300;
      const y = ((hash(i, 3) * span + v * tu) % span) - 150;
      const dx = 0.12 * len;
      let x = x0 + y * 0.12;
      const col = i % GRID_N;
      const gx = GRID_X0 + col * GRID_DX;
      const keep = i < GRID_N ? 1 : 1 - e;
      x = lerp(x, gx, e);
      const L2 = lerp(len, H * 1.3, e);
      const yc = lerp(y, H / 2, e);
      const al = (0.1 + 0.28 * layer) * on * keep;
      const a = lerp(al, 0.5, i < GRID_N ? e : 0);
      const c = lerp(0.75, 0.55, e);
      fx.seg2(x - dx * (1 - e) * 0.5, yc - L2 / 2, x + dx * (1 - e) * 0.5, yc + L2 / 2, lerp(0.8 + layer * 0.9, 1.1, e), [LIN.bone[0] * c, LIN.bone[1] * c, LIN.bone[2] * c], a);
    }
    void endK;
  }
}

const INV = { w: 9.2, h: 5.4 };
