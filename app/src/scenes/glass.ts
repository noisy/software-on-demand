// `glass` — "The builder breaks the glass" (bridge, A2). THE TOWER from oldworld, the same geometry, now real glass
// at night under a cobalt sky: reflections of the sky and a far skyline, a lit lobby, BIG SOFTWARE CO. on the crown.
//   1. "No studio, no label," — NO is typed in gold before each lobby sign; the gold cursor line strikes STUDIO, then
//      LABEL (PUBLISHER and GATEKEEPER, small, go too) as the words are sung.
//   2. "no gate you have to pass." — the gate's lintel sign is WIPED gold as sung; on "pass" the gate swings open and
//      the camera pushes through.
//   3. "The artist left the tower," — a faceless figure walks out, the camera tracking; each word is STAMPED upright
//      on the plaza as it is sung; "tower," is HELD (Archivo width 62 → 125) while the camera cranes up.
//   4. "the builder breaks the gl—" — the line is TYPED on the lobby glass by the cursor; every word strikes the glass
//      and cracks grow from the caret (and on every kick of the roll), racing up the façade on "breaks"; the pane
//      shatters exactly on "glass" (the cut): the last frames are shards flying at the camera.
import * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '../engine/scene';
import { FSPass, W, H } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { LIN } from '../engine/palette';
import { F, ARCHIVO_WIDTHS } from '../engine/type';
import { Lyrics, type Line, type Word } from '../engine/lyrics';
import { GLSL_COMMON } from '../engine/glsl/common';
import { clamp, ease, hash, lerp, prog, pulse, keys, frameIdx, TAU, springStep, type Key } from '../engine/util';
import { cursorTip, cursorCaret, weldSparks } from './_motifs';
import { TOWER, towerBlueprint, emitSegs, Label3D, aim, toScreen, lin, v3lerp, type V3, type RGB } from './tower-geo';
import { GLSL_ENV, walker, crackBurst, shatter, type Crack, type Shard } from './glass-kit';

interface Pose { p: V3; g: V3; fov: number; roll: number }
const P = (p: V3, g: V3, fov = 38, roll = 0): Pose => ({ p, g, fov, roll });
const lerpPose = (a: Pose, b: Pose, k: number): Pose => ({ p: v3lerp(a.p, b.p, k), g: v3lerp(a.g, b.g, k), fov: lerp(a.fov, b.fov, k), roll: lerp(a.roll, b.roll, k) });

const FZ = TOWER.D / 2; // front face (the tower is centred on the origin here)
const GATE_Z = FZ + 2.0;
const GATE_HW = 2.3, GATE_H = 1.35;
const FIG_H = 0.72;
const GOLD = (k = 1): RGB => lin('signal', k);
const BONE = (k = 1): RGB => lin('bone', k);
const PANE = { x0: -TOWER.W / 2, x1: TOWER.W / 2, y0: 0, y1: TOWER.LOBBY };

const SKY = /* glsl */ `
uniform vec3 cR, cU, cF; uniform float tanH, aspect, t, white;
${GLSL_ENV}
void main() {
  vec2 q = vUv * 2.0 - 1.0;
  vec3 d = normalize(cF + cR * q.x * tanH * aspect + cU * q.y * tanH);
  vec3 c = env(d, t);
  c = mix(c, C_BONE * 1.4, white);
  fragColor = vec4(c, 1.0);
}`;

const GLASS_VERT = /* glsl */ `
precision highp float;
in vec3 position; in vec3 normal;
uniform mat4 modelMatrix, viewMatrix, projectionMatrix;
out vec3 vW; out vec3 vN;
void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`;

const GLASS_FRAG = /* glsl */ `
precision highp float;
in vec3 vW; in vec3 vN;
out vec4 fragColor;
${GLSL_COMMON}
${GLSL_ENV}
uniform vec3 camPos; uniform float t, lightsOff, door, broken, white, crackGlow;
const float LOBBY = ${TOWER.LOBBY.toFixed(2)}, FH = ${TOWER.FH.toFixed(2)}, TW = ${TOWER.W.toFixed(2)}, TD = ${TOWER.D.toFixed(2)};
void main() {
  vec3 n = normalize(vN);
  if (n.y > 0.5) { fragColor = vec4(mix(C_INK * 0.7, C_BONE * 1.2, white), 1.0); return; }
  vec3 v = normalize(vW - camPos);
  bool front = n.z > 0.5;
  bool lobby = vW.y < LOBBY;
  float u = abs(n.z) > 0.5 ? vW.x : vW.z;
  float bw = abs(n.z) > 0.5 ? TW / 8.0 : TD / 5.0;
  float fl = floor((vW.y - LOBBY) / FH), fv = fract((vW.y - LOBBY) / FH);
  float bay = floor(u / bw + 20.0);
  float cosv = max(dot(-v, n), 0.0);
  float fr = 0.22 + 0.78 * pow(1.0 - cosv, 3.0);
  vec3 r = reflect(v, n);
  // slight waviness of big panes (each pane its own tilt)
  r.xy += (vec2(hash12(vec2(bay, fl)), hash12(vec2(fl, bay + 7.0))) - 0.5) * 0.007;
  vec3 refl = env(normalize(r), t);
  vec3 col;
  if (lobby) {
    // the lobby behind the glass, by interior mapping: floor, ceiling with light strips, back wall with a lit desk
    vec3 d = v;
    float tb = (front ? (TD * 0.72) : (TW * 0.7)) / max(abs(dot(d, n)), 0.05);
    float tf = d.y < 0.0 ? -vW.y / d.y : 1e9;
    float tc = d.y > 0.0 ? (LOBBY - 0.02 - vW.y) / d.y : 1e9;
    float tt = min(tb, min(tf, tc));
    vec3 q = vW + d * tt;
    vec3 ic;
    if (tt == tf) {
      // polished floor: dark, mirrored light strips
      float strip = pow(max(0.0, cos(q.z * 2.4)), 40.0) * step(abs(q.x), 4.6);
      ic = C_INK * 0.9 + C_BONE * 0.16 * strip;
    } else if (tt == tc) {
      float strip = pow(max(0.0, cos(q.z * 2.4)), 60.0) * step(abs(q.x), 4.6);
      ic = C_INK * 0.9 + C_BONE * 0.45 * strip;
    } else {
      // back wall: stone, a long lit reception desk, columns
      float desk = step(q.y, 0.55) * step(0.35, q.y);
      float col = step(0.82, fract(q.x * 0.3 + 0.1));
      ic = C_INK * 1.1 + C_ASH * 0.025 * (1.0 - col);
      ic += C_BONE * 0.4 * desk * step(abs(q.x), 3.2);
      ic += C_BONE * 0.05 * smoothstep(1.2, 0.0, abs(q.y - 0.7)) * step(abs(q.x), 3.4);
    }
    // light falloff from the ceiling lamps
    ic *= 0.8 + 0.4 * smoothstep(0.0, LOBBY, q.y);
    // the doorway: when the doors slide open the glass there is gone
    float dr = step(abs(vW.x), 1.9) * step(vW.y, 3.2) * (front ? 1.0 : 0.0);
    float glassK = broken > 0.5 && front ? 0.0 : (1.0 - dr * door);
    col = mix(ic, refl, fr * 0.5 * glassK);
    if (broken > 0.5 && front) col = ic;
  } else {
    // offices: dark, a few lit rooms; each room shows a back wall at depth (cheap interior mapping)
    float h = hash12(vec2(bay + n.x * 37.0 + n.z * 91.0, fl));
    float wave = smoothstep(fl * 0.02, fl * 0.02 + 0.05, lightsOff);
    float lit = step(0.84, h) * (1.0 - wave);
    // a room behind the pane: ceiling light strips (parallax with the view), desks and screens in silhouette
    float par = fv + (v.y / max(cosv, 0.25)) * 0.18;
    float ux = fract(u / bw) + (dot(v, abs(n.z) > 0.5 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 0.0, 1.0)) / max(cosv, 0.25)) * 0.15;
    float strip = smoothstep(0.035, 0.0, abs(par - 0.86)) * step(0.1, fract(ux * 2.0)) ;
    float desk = step(0.2, par) * step(par, 0.36) * step(0.25, fract(ux * 3.0 + h * 5.0));
    vec3 inter = C_INK * 0.5 + C_COBALT * 0.05;
    vec3 room = C_ASH * 0.05 * smoothstep(0.1, 0.9, par) + C_BONE * 0.5 * strip;
    room = mix(room, C_INK * 0.4, desk);
    inter += room * lit;
    float spand = 1.0 - step(0.16, fv);
    col = mix(inter, C_INK2 * 0.55, spand);
    col = mix(col, refl, fr * (0.85 - 0.3 * spand) * (1.0 - 0.4 * lit));
  }
  col += C_BONE * crackGlow * 0.04;
  col = mix(col, C_BONE * 1.2, white);
  fragColor = vec4(col, 1.0);
}`;

const GROUND_FRAG = /* glsl */ `
precision highp float;
in vec3 vW; in vec3 vN;
out vec4 fragColor;
${GLSL_COMMON}
${GLSL_ENV}
uniform vec3 camPos; uniform float t, door, gate, white;
void main() {
  vec3 v = normalize(vW - camPos);
  vec3 r = reflect(v, vec3(0.0, 1.0, 0.0));
  float cosv = max(-v.y, 0.0);
  float fr = 0.04 + 0.4 * pow(1.0 - cosv, 5.0);
  float wet = 0.6 + 0.4 * smoothstep(-0.3, 0.5, snoise(vW.xz * 0.35));
  vec3 c = C_INK * 0.9 + C_COBALT * 0.03;
  // paving joints
  vec2 g = vW.xz / 0.9;
  vec2 f = abs(fract(g) - 0.5);
  float joint = max(1.0 - smoothstep(0.47, 0.5, 0.5 - f.x) , 1.0 - smoothstep(0.47, 0.5, 0.5 - f.y));
  c += C_GRAPHITE * 0.05 * (1.0 - smoothstep(0.02, 0.0, 0.5 - max(f.x, f.y)));
  c = mix(c, C_INK * 0.6, joint * 0.4);
  c = mix(c, env(r, t) * 0.7, fr * wet);
  // the lobby light spilling out, stretched by the wet stone toward the viewer
  float dz = max(vW.z - ${FZ.toFixed(2)}, 0.0);
  float spill = exp(-dz * 0.28) * exp(-pow(max(abs(vW.x) - 1.5, 0.0) * 0.5, 2.0)) * (0.7 + 0.3 * wet);
  c += C_BONE * 0.05 * spill * (0.7 + 0.5 * door);
  float lobbyRefl = exp(-dz * 0.12) * smoothstep(5.2, 3.5, abs(vW.x)) * fr * wet;
  c += C_BONE * 0.06 * lobbyRefl;
  // gold light through the opened gate
  float gz = vW.z - ${GATE_Z.toFixed(2)};
  c += C_SIGNAL * 0.18 * gate * exp(-max(gz, 0.0) * 0.5) * smoothstep(-0.9, 0.4, gz) * exp(-vW.x * vW.x * 0.35);
  c = mix(c, env(v, t), smoothstep(25.0, 120.0, length(vW.xz)));
  c = mix(c, C_BONE * 1.2, white);
  fragColor = vec4(c, 1.0);
}`;

interface SignDef { lab: Label3D; no?: Label3D; noW?: Word; w0: number; w1: number; x0: number; x1: number; y: number }
interface Planted { w: Word; lab: Label3D; z: number }
interface Impact { t: number; x: number; y: number; cracks: Crack[]; reach: number; big: boolean }

export default class Glass extends Scene {
  cam = new THREE.PerspectiveCamera(38, W / H, 0.05, 3000);
  sky = new FSPass(SKY, { cR: { value: new THREE.Vector3() }, cU: { value: new THREE.Vector3() }, cF: { value: new THREE.Vector3() }, tanH: { value: 0.3 }, aspect: { value: W / H }, t: { value: 0 }, white: { value: 0 } });
  world = new THREE.Scene();
  labels = new THREE.Scene();
  lines = new LineBatch(90000, { screen2D: false, blend: 'max', depthTest: true });
  glow = new LineBatch(40000, { screen2D: false, blend: 'add', depthTest: true });
  glowTop = new LineBatch(30000, { screen2D: false, blend: 'add', depthTest: false });
  figLB = new LineBatch(400, { screen2D: false, blend: 'normal', depthTest: true, worldWidth: true });
  fx = new LineBatch(8000, { blend: 'add' });

  L1!: Line; L2!: Line; L3!: Line; L4!: Line;
  bars: number[] = [];
  tBreak = 0; tEnd = 0; tWalk = 0;
  glassMat!: THREE.RawShaderMaterial; groundMat!: THREE.RawShaderMaterial;
  blue!: { body: Float32Array; notes: Float32Array };
  crown!: Label3D;
  signs: SignDef[] = [];
  gateSign!: Label3D;
  planted: Planted[] = [];
  towerHeld: Label3D[] = [];
  typed: Label3D[] = []; typedSplit = 0;
  impacts: Impact[] = [];
  shards: Shard[] = [];
  shardMesh!: THREE.Mesh; shardPos!: Float32Array; shardAttr!: THREE.BufferAttribute;
  kicks: number[] = [];

  override async init() {
    const ly = this.ctx.lyrics, au = this.ctx.audio;
    this.L1 = ly.get('No studio');
    this.L2 = ly.get('no gate you have');
    this.L3 = ly.get('The artist left');
    this.L4 = ly.get('the builder breaks');
    const s = this.ctx.start, e = this.ctx.end;
    this.tEnd = e;
    this.bars = au.downbeats.filter((d) => d >= s - 0.05 && d < e - 0.05);
    const glassW = this.L4.words[4];
    this.tBreak = (glassW ? glassW.start : e) - 0.12;
    this.tWalk = this.L2.end + 0.45;
    this.kicks = au.events('kick', this.L4.start, e).map((k) => k[0]);

    // ---- tower glass, ground
    const mk = (frag: string, extra: Record<string, THREE.IUniform>) => new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: GLASS_VERT, fragmentShader: frag,
      uniforms: { camPos: { value: new THREE.Vector3() }, t: { value: 0 }, white: { value: 0 }, ...extra },
    });
    this.glassMat = mk(GLASS_FRAG, { lightsOff: { value: 0 }, door: { value: 0 }, broken: { value: 0 }, crackGlow: { value: 0 } });
    const towerGeo = new THREE.BoxGeometry(TOWER.W, TOWER.ROOF, TOWER.D).translate(0, TOWER.ROOF / 2, 0);
    const tower = new THREE.Mesh(towerGeo, this.glassMat);
    tower.frustumCulled = false;
    this.world.add(tower);
    this.groundMat = mk(GROUND_FRAG, { door: { value: 0 }, gate: { value: 0 } });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000).rotateX(-Math.PI / 2), this.groundMat);
    ground.frustumCulled = false;
    this.world.add(ground);
    // fascia band over the entrance (dark stone) and the plaques
    const ink2 = new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(LIN.ink2[0] * 0.8, LIN.ink2[1] * 0.8, LIN.ink2[2] * 0.8, THREE.LinearSRGBColorSpace) });
    const fascia = new THREE.Mesh(new THREE.BoxGeometry(TOWER.W + 0.2, 1.0, 0.25), ink2);
    fascia.position.set(0, TOWER.LOBBY - 0.55, FZ + 0.12);
    this.world.add(fascia);
    for (const x of [-3.5, 3.5]) {
      const pl = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.5, 0.06), ink2);
      pl.position.set(x, 1.12, FZ + 0.04);
      this.world.add(pl);
    }
    // gate posts & lintel (solid)
    for (const x of [-GATE_HW, GATE_HW]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, GATE_H + 0.3, 0.14), ink2);
      post.position.set(x, (GATE_H + 0.3) / 2, GATE_Z);
      this.world.add(post);
    }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(GATE_HW * 2 + 0.3, 0.34, 0.12), ink2);
    lintel.position.set(0, GATE_H + 0.17, GATE_Z);
    this.world.add(lintel);

    this.blue = towerBlueprint();
    // crown sign
    {
      const fam = F.archivo(75, 800);
      const probe = new Label3D(TOWER.NAME, fam, { capH: 1, px: 60 });
      const cap = Math.min(1.9, (TOWER.CROWN_HW * 2 - 1.0) / probe.w);
      probe.tex.dispose();
      this.crown = new Label3D(TOWER.NAME, fam, { capH: cap, px: 260, ax: 0.5, ay: 0.5 });
      this.crown.place([0, TOWER.ROOF + 0.8 + (TOWER.CROWN_H - 0.8) / 2, FZ - 0.25]);
      this.crown.set({ colA: BONE(0.84) });
      this.labels.add(this.crown.mesh);
    }
    // lobby signs: NO + STUDIO (left), NO + LABEL (right); PUBLISHER, GATEKEEPER on the plaques
    {
      const fam = F.archivo(75, 800), cap = 0.5, y = TOWER.LOBBY - 0.8;
      const mkSign = (text: string, xc: number, noW?: Word) => {
        const lab = new Label3D(text, fam, { capH: cap, px: 220, ax: 0.5, ay: 0 });
        lab.place([xc, y, FZ + 0.26]);
        lab.set({ colA: BONE(0.85) });
        this.labels.add(lab.mesh);
        let no: Label3D | undefined;
        if (noW) {
          no = new Label3D(noW.w.replace(/[,.]/g, '').toUpperCase(), F.archivo(75, 900), { capH: cap, px: 220, ax: 1, ay: 0 });
          no.place([xc - lab.w / 2 - 0.3, y, FZ + 0.26]);
          this.labels.add(no.mesh);
        }
        return { lab, no, noW, x0: xc - lab.w / 2 - 0.08, x1: xc + lab.w / 2 + 0.08, y: y + cap * 0.45 };
      };
      const w = this.L1.words;
      const a = mkSign(w[1]!.w.replace(/[,.]/g, '').toUpperCase(), -2.3, w[0]);
      const b = mkSign(w[3]!.w.replace(/[,.]/g, '').toUpperCase(), 2.7, w[2]);
      this.signs.push({ ...a, w0: w[1]!.start, w1: w[1]!.end });
      this.signs.push({ ...b, w0: w[3]!.start, w1: w[3]!.end - 0.35 });
      const small = (text: string, x: number, t0: number, t1: number) => {
        const lab = new Label3D(text, F.mono(500), { capH: 0.15, px: 90, ax: 0.5, ay: 0 });
        lab.place([x, 1.05, FZ + 0.08]);
        lab.set({ colA: BONE(0.8) });
        this.labels.add(lab.mesh);
        this.signs.push({ lab, w0: t0, w1: t1, x0: x - lab.w / 2 - 0.05, x1: x + lab.w / 2 + 0.05, y: 1.05 + 0.07 });
      };
      small('PUBLISHER', -3.5, w[3]!.end - 0.4, w[3]!.end - 0.12);
      small('GATEKEEPER', 3.5, w[3]!.end - 0.25, w[3]!.end + 0.05);
    }
    // gate lintel sign (wiped)
    {
      const text = this.L2.words.map((w) => w.w).join(' ').toUpperCase();
      this.gateSign = new Label3D(text, F.archivo(75, 800), { capH: 0.15, px: 200, ax: 0.5, ay: 0.5 });
      const k = Math.min(1, (GATE_HW * 2 - 0.2) / this.gateSign.w);
      this.gateSign.place([0, GATE_H + 0.17, GATE_Z + 0.07], [1, 0, 0], [0, 1, 0], k);
      this.labels.add(this.gateSign.mesh);
    }
    // line 3: words stamped upright on the plaza; "tower," held (one plane per Archivo width)
    this.L3.words.forEach((w, i) => {
      const last = i === this.L3.words.length - 1;
      if (last) {
        for (const wd of ARCHIVO_WIDTHS) {
          const lab = new Label3D(w.w.toUpperCase(), F.archivo(wd / 10, 900), { capH: 0.5, px: 260, ax: 0, ay: 0 });
          this.labels.add(lab.mesh);
          this.towerHeld.push(lab);
        }
        this.planted.push({ w, lab: this.towerHeld[0]!, z: 0 });
      } else {
        const lab = new Label3D(w.w.toUpperCase(), F.archivo(75, 900), { capH: i === 1 ? 0.34 : 0.28, px: 220, ax: 0, ay: 0 });
        this.labels.add(lab.mesh);
        this.planted.push({ w, lab, z: 0 });
      }
    });
    // planted positions follow the walker: each word lands just ahead of the figure when sung
    {
      let z = this.figZ(this.L3.words[0]!.start) + 0.55;
      for (const p of this.planted) {
        z = Math.max(z, this.figZ(p.w.start) + 0.55);
        p.z = z;
        z += (p.lab === this.towerHeld[0] ? 0 : p.lab.w) + 0.28;
      }
    }
    // line 4: typed on the lobby glass (two lines, left of the door)
    {
      const words = this.L4.words.slice(0, 4).map((w) => w.w);
      const a = words.slice(0, 2).join(' '), b = words.slice(2).join(' ');
      this.typedSplit = Array.from(a).length + 1;
      const fam = F.archivo(87, 800);
      const la = new Label3D(a, fam, { capH: 0.36, px: 220, ax: 0, ay: 0 });
      const lb = new Label3D(b, fam, { capH: 0.36, px: 220, ax: 0, ay: 0 });
      la.place([-4.75, 2.95, FZ + 0.015]);
      lb.place([-4.75, 2.38, FZ + 0.015]);
      for (const l of [la, lb]) { l.set({ colA: BONE(0.9), colB: GOLD(1.5) }); this.labels.add(l.mesh); }
      this.typed = [la, lb];
      // impacts: the caret position at the onset of each word; "breaks" sends cracks up the façade
      const ws = this.L4.words.slice(0, 4);
      ws.forEach((w, i) => {
        const c = this.caretAt(w.start + 0.001);
        const big = /^breaks$/i.test(w.w);
        const reach = big ? 30 : 1.4 + i * 0.7;
        const cracks = crackBurst(c.x, c.y, 101 + i * 17, big ? 9 : 7, reach, { x0: -TOWER.W / 2, x1: TOWER.W / 2, y0: 0.02, y1: big ? TOWER.ROOF : TOWER.LOBBY - 0.02 }, big ? Math.PI / 2 : null);
        this.impacts.push({ t: w.start, x: c.x, y: c.y, cracks, reach, big });
      });
      const last = this.impacts[this.impacts.length - 1]!;
      this.shards = shatter(last.x, last.y, PANE, 9);
    }
    // shard mesh (triangle fans, rebuilt every frame after the break)
    {
      let nTri = 0;
      for (const s of this.shards) nTri += s.pts.length - 2;
      this.shardPos = new Float32Array(nTri * 9);
      const g = new THREE.BufferGeometry();
      this.shardAttr = new THREE.BufferAttribute(this.shardPos, 3);
      this.shardAttr.setUsage(THREE.DynamicDrawUsage);
      g.setAttribute('position', this.shardAttr);
      // each shard catches the sky or the lobby light differently
      const colr = new Float32Array(nTri * 9);
      let o = 0;
      for (const sh of this.shards) {
        const k = hash(sh.seed, 21), b = 0.25 + 0.75 * hash(sh.seed, 22);
        const c: RGB = [lerp(LIN.cobalt[0] * 1.6, LIN.bone[0] * 0.3, k) * b, lerp(LIN.cobalt[1] * 1.6, LIN.bone[1] * 0.3, k) * b, lerp(LIN.cobalt[2] * 1.6, LIN.bone[2] * 0.32, k) * b];
        for (let i = 0; i < (sh.pts.length - 2) * 3; i++) { colr[o++] = c[0]; colr[o++] = c[1]; colr[o++] = c[2]; }
      }
      g.setAttribute('color', new THREE.BufferAttribute(colr, 3));
      const m = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
      this.shardMesh = new THREE.Mesh(g, m);
      this.shardMesh.frustumCulled = false;
      this.shardMesh.visible = false;
      this.labels.add(this.shardMesh);
    }
  }

  // ------------------------------------------------------------------ timing
  private bar(i: number) { return this.bars[i] ?? this.ctx.start + i * 1.95; }
  /** The walker's z (from the doorway out onto the plaza). */
  private figZ(t: number) {
    const t0 = this.tWalk;
    if (t < t0) return FZ + 0.1;
    const d = (t - t0) * 1.15 - (1 - Math.exp(-(t - t0) * 3)) * 0.35;
    return FZ + 0.1 + Math.max(0, d);
  }
  /** Caret (typing point) on the lobby glass at t: x at the end of the typed glyphs, y at the line's mid-height. */
  private caretAt(t: number) {
    const ct = this.charTimes();
    let n = 0;
    for (const [a] of ct) if (t >= a) n++;
    const onB = n >= this.typedSplit;
    const lab = onB ? this.typed[1]! : this.typed[0]!;
    const ni = onB ? n - this.typedSplit : Math.min(n, this.typedSplit - 1);
    const gx = ni <= 0 ? 0 : ni >= lab.glyphX.length ? lab.w : lab.glyphX[ni]!;
    return { x: -4.75 + gx + 0.04, y: (onB ? 2.38 : 2.95) + 0.18, n, onB, ni };
  }
  private _ct: [number, number][] | null = null;
  private charTimes() {
    if (this._ct) return this._ct;
    const ws = this.L4.words.slice(0, 4);
    const out: [number, number][] = [];
    ws.forEach((w, i) => {
      const n = Array.from(w.w).length;
      for (let k = 0; k < n; k++) out.push([w.start + ((w.end - w.start) * k) / n, w.start + ((w.end - w.start) * (k + 1)) / n]);
      if (i < ws.length - 1) out.push([w.end, ws[i + 1]!.start]);
    });
    this._ct = out;
    return out;
  }
  /** Crack growth 0..1 for an impact: a burst at the word, then a step on every kick of the roll. */
  private growth(imp: Impact, t: number) {
    if (t < imp.t) return 0;
    let g = 0.35 * (1 - Math.exp(-(t - imp.t) / 0.05));
    const ks = this.kicks.filter((k) => k > imp.t + 0.05);
    const inc = ks.length ? 0.6 / ks.length : 0;
    for (const k of ks) if (t > k) g += inc * (1 - Math.exp(-(t - k) / 0.04));
    if (imp.big) g = Math.max(g, prog(t, imp.t, imp.t + 0.55, ease.outCubic) * 0.9);
    return Math.min(1, g + prog(t, this.tBreak - 0.1, this.tBreak, ease.inQuad) * 0.1);
  }

  // ------------------------------------------------------------------ camera
  private camAt(t: number): Pose {
    const b1 = this.bar(1), b3 = this.bar(2), b5 = this.bar(4), b6 = this.bar(5), b7 = this.bar(6);
    const w1 = this.L1.words, w2 = this.L2.words;
    const TOP = TOWER.TOP;
    if (t < w1[0]!.start - 0.05) {
      // the white-out settles: at the crown, then the long fall down the façade to the lobby
      const a = P([7.5, TOP + 1.5, FZ + 13], [0, TOP - 1.8, FZ], 40, 0.04);
      const b = P([-3.9, 3.0, FZ + 5.4], [-2.6, 3.7, FZ], 38, 0.02);
      const push = prog(t, this.ctx.start, this.ctx.start + 0.8, ease.outCubic);
      a.p = v3lerp(a.p, a.g, push * 0.2);
      const k = prog(t, this.ctx.start + 0.55, w1[0]!.start - 0.05, ease.inOutCubic);
      const pose = lerpPose(a, b, k);
      pose.roll += Math.sin(k * Math.PI) * 0.12;
      return pose;
    }
    const s0 = this.signs[0]!, s1 = this.signs[1]!;
    if (t < w1[2]!.start - 0.12) {
      // STUDIO: close, trucking with the strike; a punch-in on the downbeat
      const hx = lerp(s0.x0 - 1.2, s0.x1, prog(t, w1[0]!.start, s0.w1, ease.inOutQuad));
      const pose = P([hx - 1.3, 3.0, FZ + 5.2], [hx + 0.3, 3.75, FZ], 38, 0.02);
      const pk = prog(t, b1 - 0.05, b1 + 0.25, ease.outExpo);
      pose.fov -= pk * 7;
      pose.roll -= pk * 0.03;
      return pose;
    }
    if (t < w2[0]!.start - 0.3) {
      // LABEL: low, looking up; PUBLISHER, GATEKEEPER below
      const u = prog(t, w1[2]!.start - 0.12, w2[0]!.start - 0.3, ease.linear);
      const snap = prog(t, w1[2]!.start - 0.12, w1[2]!.start + 0.2, ease.outExpo);
      const pose = P([lerp(6.2, 4.4, u), lerp(0.9, 1.3, u), FZ + lerp(6.6, 5.6, u)], [lerp(2.4, 2.9, u), lerp(3.0, 2.8, u), FZ], 42, -0.04);
      pose.p[0] += (1 - snap) * 2;
      if (t > b3 - 0.05) pose.fov -= prog(t, b3 - 0.05, b3 + 0.3, ease.outExpo) * 5;
      return pose;
    }
    const pass = w2[w2.length - 1]!;
    if (t < pass.start - 0.05) {
      // the gate: whip down to it, sign wiped as sung; sub-cut low through the bars on the downbeat
      const gate = this.bar(3);
      if (t < gate) {
        const k = prog(t, w2[0]!.start - 0.3, w2[0]!.start + 0.05, ease.outExpo);
        const u = prog(t, w2[0]!.start, gate, ease.linear);
        const from = P([4.4, 1.3, FZ + 5.6], [2.9, 2.8, FZ], 42, -0.04);
        const to = P([lerp(2.3, 1.6, u), 0.95, GATE_Z + lerp(4.4, 3.9, u)], [lerp(0.3, 0.1, u), 0.95, GATE_Z], 40, 0.02);
        return lerpPose(from, to, k);
      }
      const u = prog(t, gate, pass.start, ease.linear);
      return P([lerp(-1.3, -0.8, u), 0.22, GATE_Z + lerp(2.9, 2.5, u)], [lerp(0.4, 0.3, u), 1.25, GATE_Z], 46, lerp(-0.05, -0.02, u));
    }
    if (t < b5) {
      // "pass": the gate swings open, push through toward the doorway
      const k = prog(t, pass.start, b5, ease.inOutCubic);
      return P([lerp(-0.7, -0.1, k), lerp(0.25, 0.5, k), GATE_Z + lerp(2.5, 0.4, k)], [0, lerp(1.2, 1.3, k), FZ], lerp(46, 50, k), lerp(-0.02, 0.01, k));
    }
    const fz = this.figZ(t);
    if (t < b6) {
      // side-tracking with the walker; the words stamp up on the far side of the path
      const pose = P([-2.9, 0.55, fz + 0.5], [0.4, 0.62, fz + 0.9], 40, 0.0);
      const snap = prog(t, b5, b5 + 0.35, ease.outExpo);
      pose.p[0] -= (1 - snap) * 1.5;
      return pose;
    }
    if (t < b7) {
      // ahead of the walker, low, looking back at the doorway
      const u = prog(t, b6, b7, ease.linear);
      const snap = prog(t, b6, b6 + 0.3, ease.outExpo);
      const pose = P([lerp(-2.5, -2.1, u), lerp(0.28, 0.4, u), fz + lerp(3.4, 3.0, u)], [0.5, 0.7, fz - 0.6], 42, 0.03);
      pose.fov += (1 - snap) * 8;
      // the crane at "tower," (held): rise and pull back to reveal the whole slab
      const w = this.L3.words[this.L3.words.length - 1]!;
      const c = prog(t, w.start + 0.2, b7, ease.inOutCubic);
      const tw = this.planted[this.planted.length - 1]!;
      const hi = P([-5.2, 0.45, tw.z + 3.4], [0.9, 3.4, tw.z - 1.6], 56, 0.04);
      return lerpPose(pose, hi, c);
    }
    const L4b = this.L4.words;
    if (t < L4b[0]!.start - 0.08) {
      const tw = this.planted[this.planted.length - 1]!;
      const hi = P([-5.2, 0.45, tw.z + 3.4], [0.9, 3.4, tw.z - 1.6], 56, 0.04);
      const u = prog(t, b7, L4b[0]!.start, ease.linear);
      hi.p[1] += u * 0.5;
      hi.g[1] += u * 1.2;
      hi.p[0] -= u * 1.6;
      hi.p[2] += u * 1.2;
      return hi;
    }
    // the glass: close on the caret (typed words), shake growing with the cracks
    const c = this.caretAt(t);
    const cx = Math.max(-3.9, c.x - 0.55);
    const close = P([cx + 0.45, 2.55, FZ + 3.1], [cx - 0.05, 2.78, FZ], 42, 0.03);
    const b8 = this.bar(8);
    const brk = L4b[2]!;
    if (t < brk.start - 0.1) {
      const u = prog(t, L4b[0]!.start, brk.start, ease.linear);
      close.p[2] -= u * 0.6;
      return close;
    }
    // "breaks": pull back and up — cracks race up the façade; then slam back in for "the gl—"
    const back = P([-3.7, 1.5, FZ + 4.0], [-2.9, 4.4, FZ], 70, -0.06);
    const out = prog(t, brk.start - 0.1, brk.start + 0.18, ease.outExpo);
    const inn = prog(t, L4b[3]!.start - 0.2, L4b[3]!.start + 0.02, ease.inOutCubic);
    const last = this.impacts[this.impacts.length - 1]!;
    const slam = P([last.x + 0.35, last.y + 0.05, FZ + 2.4], [last.x + 0.05, last.y, FZ], 48, 0.02);
    void b8;
    return lerpPose(lerpPose(close, back, out), slam, inn);
  }

  // ------------------------------------------------------------------ render
  override render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer } = this.ctx;
    const t = f.t;
    const cam = this.cam;
    const pose = this.camAt(t);
    // shake: strikes, the gate, the cracks
    let sh = 0;
    for (const im of this.impacts) sh = Math.max(sh, pulse(t, im.t, 0.08) * (im.big ? 1.6 : 0.8));
    sh = Math.max(sh, pulse(t, this.L2.words[this.L2.words.length - 1]!.start, 0.1) * 0.8);
    if (t > this.L4.start) sh += f.a.kick * 0.35;
    const sx = (hash(frameIdx(t), 1) - 0.5) * sh * 0.08, sy = (hash(frameIdx(t), 2) - 0.5) * sh * 0.08;
    aim(cam, [pose.p[0] + sx, pose.p[1] + sy, pose.p[2]], pose.g, pose.fov, pose.roll);

    const white = Math.pow(1 - prog(t, this.ctx.start, this.ctx.start + 0.75, ease.outCubic), 1.6);
    const broken = t >= this.tBreak;

    // ---- sky
    const e = cam.matrixWorld.elements;
    (this.sky.u.cR!.value as THREE.Vector3).set(e[0]!, e[1]!, e[2]!);
    (this.sky.u.cU!.value as THREE.Vector3).set(e[4]!, e[5]!, e[6]!);
    (this.sky.u.cF!.value as THREE.Vector3).set(-e[8]!, -e[9]!, -e[10]!);
    this.sky.u.tanH!.value = Math.tan((cam.fov * Math.PI) / 360);
    this.sky.u.t!.value = t;
    this.sky.u.white!.value = white;
    this.sky.render(renderer, out);
    renderer.setRenderTarget(out);
    renderer.clearDepth();

    // ---- world
    const pass = this.L2.words[this.L2.words.length - 1]!;
    const gateK = springStep(t - pass.start, 1.6, 0.55);
    const doorK = prog(t, this.tWalk - 0.5, this.tWalk, ease.inOutCubic);
    const leftW = this.L3.words.find((w) => /^left$/i.test(w.w)) ?? this.L3.words[2]!;
    for (const m of [this.glassMat, this.groundMat]) {
      m.uniforms.camPos!.value.copy(cam.position);
      m.uniforms.t!.value = t;
      m.uniforms.white!.value = white;
    }
    this.glassMat.uniforms.lightsOff!.value = prog(t, leftW.start, leftW.start + 1.2, ease.inOutQuad);
    this.glassMat.uniforms.door!.value = doorK;
    this.glassMat.uniforms.broken!.value = broken ? 1 : 0;
    this.glassMat.uniforms.crackGlow!.value = t > this.L4.start ? f.a.kick : 0;
    this.groundMat.uniforms.door!.value = doorK;
    this.groundMat.uniforms.gate!.value = clamp(gateK);
    renderer.render(this.world, cam);

    const lb = this.lines, gl = this.glow, gt = this.glowTop, fx = this.fx;
    lb.clear(); gl.clear(); gt.clear(); fx.clear(); this.figLB.clear();
    // frames: mullions, floor edges, crown truss, mast (ash on glass)
    emitSegs(lb, this.blue.body, { color: lin('ash', 0.32), widthK: 0.75, alpha: 1 - white });
    this.drawLobby(t, lb, gl, doorK, gateK);
    this.drawSigns(t, gl, fx);
    this.drawGate(t, lb, gl, gateK);
    this.drawWalker(t);
    this.drawPlanted(t);
    this.drawGlassText(t, gt, fx, broken);

    lb.render(renderer, out, cam);
    this.figLB.render(renderer, out, cam);
    renderer.render(this.labels, cam);
    gl.render(renderer, out, cam);
    gt.render(renderer, out, cam);
    fx.render(renderer, out);

    const brk = broken ? pulse(t, this.tBreak, 0.06) : 0;
    return {
      bloom: 0.75 + brk * 0.8, bloomThreshold: 0.85, grain: 0.05, vignette: 0.38, halation: 0.3,
      flash: white * 0.6 + pulse(t, pass.start, 0.08) * 0.03,
      exposure: 1 + white * 0.5,
    };
  }

  // ------------------------------------------------------------------ the lobby: doors, crown glow
  private drawLobby(t: number, lb: LineBatch, gl: LineBatch, doorK: number, gateK: number) {
    const z = FZ + 0.02, E = BONE(0.55);
    // sliding door leaves
    const slide = doorK * 1.7;
    for (const s of [-1, 1]) {
      const x0 = s * (0.02 + slide), x1 = s * (1.88 + slide);
      lb.seg(x0, 0, z + 0.05, x0, 3.2, z + 0.05, 1.6, E[0], E[1], E[2], 1);
      lb.seg(x1, 0, z + 0.05, x1, 3.2, z + 0.05, 1.2, E[0], E[1], E[2], 0.8);
      lb.seg(x0 + s * 0.15, 1.3, z + 0.06, x0 + s * 0.15, 1.9, z + 0.06, 2.2, E[0], E[1], E[2], 1);
    }
    lb.seg(-1.9, 3.2, z, 1.9, 3.2, z, 1.6, E[0], E[1], E[2], 1);
    // crown sign halo & a mast light blinking on the beat
    const beat = this.ctx.audio.beatAt(t);
    const blink = (beat % 1) < 0.18 ? 1 : 0.15;
    const my = TOWER.ROOF + TOWER.MAST, mz = -FZ + 1.5;
    gl.seg(0, my, mz, 0.001, my, mz, 10, LIN.signal[0] * 1.6 * blink, LIN.signal[1] * 1.6 * blink, LIN.signal[2] * 1.6 * blink, 1);
    void gateK;
  }

  // ------------------------------------------------------------------ 1. NO + strike-through
  private drawSigns(t: number, gl: LineBatch, fx: LineBatch) {
    for (const s of this.signs) {
      const k = prog(t, s.w0, s.w1, ease.inOutQuad);
      // NO, typed in gold before the sign
      if (s.no && s.noW) {
        const nk = Lyrics.wordProgress(s.noW, t);
        s.no.revealGlyphs(t < s.noW.start ? 0 : 1 + Math.floor(nk * 1.999));
        const cool = prog(t, s.w1 + 0.1, s.w1 + 0.6);
        s.no.set({ colA: [lerp(LIN.signal[0] * 1.6, LIN.signal[0] * 1.1, cool), lerp(LIN.signal[1] * 1.6, LIN.signal[1] * 1.1, cool), lerp(LIN.signal[2] * 1.6, LIN.signal[2] * 1.1, cool)] });
      }
      const dim = prog(t, s.w1, s.w1 + 0.3);
      s.lab.set({ colA: BONE(lerp(0.85, 0.3, dim)) });
      if (t < s.w0) continue;
      const z = FZ + 0.3;
      const hx = lerp(s.x0, s.x1, k);
      const I = 1.8;
      const pw = s.no ? 1 : 0.5;
      gl.seg(s.x0, s.y, z, hx, s.y, z, 16 * pw, LIN.signal[0] * 0.35, LIN.signal[1] * 0.35, LIN.signal[2] * 0.35, 0.6);
      gl.seg(s.x0, s.y, z, hx, s.y, z, 8 * pw, LIN.signal[0] * I, LIN.signal[1] * I, LIN.signal[2] * I, 1);
      gl.seg(s.x0, s.y, z, hx, s.y, z, 2.6 * pw, LIN.ember[0] * 2, LIN.ember[1] * 2, LIN.ember[2] * 2, 1);
      if (k < 1) {
        const sp = toScreen(this.cam, [hx, s.y, z]);
        if (!sp.behind) {
          cursorTip(fx, sp.x, sp.y, t, 1.2, 1);
          const cam = this.cam;
          weldSparks(fx, t, (tb) => {
            if (tb < s.w0 || tb > s.w1) return null;
            const q = toScreen(cam, [lerp(s.x0, s.x1, prog(tb, s.w0, s.w1, ease.inOutQuad)), s.y, z]);
            return q.behind ? null : { x: q.x, y: q.y };
          }, { rate: 110, life: 0.45, speed: 320, seed: Math.floor(s.w0 * 10) });
        }
      }
    }
  }

  // ------------------------------------------------------------------ 2. the gate
  private drawGate(t: number, lb: LineBatch, gl: LineBatch, gateK: number) {
    const L = this.L2;
    // wiped sign
    const cp = Lyrics.lineCharProgress(L, t);
    const lab = this.gateSign;
    const n = Math.floor(cp);
    const frac = cp - n;
    const g0 = n <= 0 ? 0 : lab.glyphEnd[Math.min(n, lab.glyphEnd.length) - 1]!;
    const g1 = lab.glyphEnd[Math.min(n, lab.glyphEnd.length - 1)]!;
    lab.set({ colA: BONE(0.85), alA: t < L.start - 0.5 ? 0.25 : 0.38, colB: GOLD(1.6), alB: 1, wipe: t >= L.end ? 1.01 : lerp(g0, g1, frac), feather: 0.01 });
    const done = prog(t, L.end + 0.1, L.end + 0.6);
    if (done > 0) lab.set({ colB: [lerp(LIN.signal[0] * 1.6, LIN.bone[0] * 0.9, done), lerp(LIN.signal[1] * 1.6, LIN.bone[1] * 0.9, done), lerp(LIN.signal[2] * 1.6, LIN.bone[2] * 0.9, done)] });
    // the leaves: bars, rails; they swing out (toward us) on "pass"
    const E = BONE(0.62);
    const ang = clamp(gateK, 0, 1.08) * 1.75;
    for (const s of [-1, 1]) {
      const hx = s * GATE_HW, len = GATE_HW - 0.04;
      const dir: [number, number] = [-s * Math.cos(ang), Math.sin(ang)];
      const at = (d: number, y: number): V3 => [hx + dir[0] * d, y, GATE_Z + dir[1] * d];
      const rails = [0.08, 0.5, 0.95];
      for (const y of rails) { const a = at(0.06, y), b = at(len, y); lb.seg(a[0], a[1], a[2], b[0], b[1], b[2], 1.6, E[0], E[1], E[2], 1); }
      const nb = 11;
      for (let i = 0; i <= nb; i++) {
        const d = 0.06 + (i / nb) * (len - 0.06);
        const a = at(d, 0.04), b = at(d, 1.02 + (i === nb ? 0.04 : 0));
        lb.seg(a[0], a[1], a[2], b[0], b[1], b[2], i === nb || i === 0 ? 1.8 : 1.1, E[0], E[1], E[2], 1);
        // finials
        const c = at(d, 1.1);
        lb.seg(b[0], b[1], b[2], c[0], c[1], c[2], 1.0, E[0], E[1], E[2], 0.8);
      }
      // diagonal brace
      const a = at(0.06, 0.08), b = at(len, 0.95);
      lb.seg(a[0], a[1], a[2], b[0], b[1], b[2], 1.2, E[0], E[1], E[2], 0.9);
    }
    // the lock bursts on "pass"
    const pass = this.L2.words[this.L2.words.length - 1]!;
    const hot = pulse(t, pass.start, 0.14);
    if (hot > 0.02) {
      for (let i = 0; i < 18; i++) {
        const a = hash(i, 3) * TAU, r = (t - pass.start) * (2 + hash(i, 4) * 4);
        const x = Math.cos(a) * r, y = 0.52 + Math.sin(a) * r;
        gl.seg(x, y, GATE_Z + 0.05, x + Math.cos(a) * 0.06, y + Math.sin(a) * 0.06, GATE_Z + 0.05, 2, LIN.signal[0] * 2 * hot, LIN.signal[1] * 2 * hot, LIN.signal[2] * 2 * hot, 1);
      }
    }
  }

  // ------------------------------------------------------------------ 3. the walker
  private drawWalker(t: number) {
    if (t < this.tWalk - 0.5) return;
    const fz = this.figZ(t);
    const dist = fz - (FZ + 0.1);
    const ph = (dist / 0.55) * Math.PI;
    const moving = prog(t, this.tWalk - 0.1, this.tWalk + 0.3);
    const j = walker(0.05, fz, FIG_H, ph, moving);
    const a = 1;
    const lbf = this.figLB;
    const ink = LIN.ink, bone = LIN.bone;
    const k = FIG_H;
    const bones: [readonly [number, number, number], readonly [number, number, number], number][] = [];
    for (const L of [j.legL, j.legR, j.armL, j.armR]) { bones.push([L[0], L[1], 0.075 * k], [L[1], L[2], 0.065 * k]); }
    bones.push([j.pelvis, j.chest, 0.17 * k], [j.neck, j.head, 0.13 * k], [j.chest, j.neck, 0.08 * k]);
    // one silhouette: a faint rim of lobby light around the union of the limbs, then the ink body
    for (const [p, q, w] of bones) lbf.seg(p[0], p[1], p[2] - 0.01, q[0], q[1], q[2] - 0.01, w + 0.008, bone[0] * 0.22, bone[1] * 0.22, bone[2] * 0.25, a * 0.7);
    for (const [p, q, w] of bones) lbf.seg(p[0], p[1], p[2], q[0], q[1], q[2], w, ink[0], ink[1], ink[2], a);
    // reflection on the wet plaza
    const m = (p: readonly [number, number, number]): [number, number, number] => [p[0], -p[1], p[2]];
    for (const L of [j.legL, j.legR]) { const p = m(L[0]), q = m(L[1]), r = m(L[2]); lbf.seg(p[0], p[1], p[2], q[0], q[1], q[2], 0.07 * k, ink[0], ink[1], ink[2], a * 0.35); lbf.seg(q[0], q[1], q[2], r[0], r[1], r[2], 0.06 * k, ink[0], ink[1], ink[2], a * 0.35); }
  }

  private drawPlanted(t: number) {
    const L3 = this.L3;
    for (const lab of this.towerHeld) lab.mesh.visible = false;
    const fade = 1 - prog(t, this.L4.start - 0.2, this.L4.start + 0.1);
    for (const p of this.planted) {
      let lab = p.lab;
      const heldWord = lab === this.towerHeld[0];
      if (heldWord) {
        // held note: step through Archivo's widths 62 → 125 across the word
        const wp = Lyrics.wordProgress(p.w, t);
        lab = this.towerHeld[Math.min(this.towerHeld.length - 1, Math.floor(wp * this.towerHeld.length))]!;
      }
      lab.mesh.visible = t >= p.w.start - 0.02 && fade > 0;
      if (!lab.mesh.visible) continue;
      const k = prog(t, p.w.start - 0.02, p.w.start + 0.14, (x) => ease.outBack(x, 2.2));
      const rise = (1 - clamp(k)) * 1.4; // tilt from flat on the ground to upright
      const x = 0.7, z = p.z;
      // plane faces -x (toward the tracking camera); reading direction +z; stands on the ground
      const up: V3 = [-Math.sin(rise), Math.cos(rise), 0];
      lab.place([x + 0.02, 0.01, z], [0, 0, 1], up);
      const sung = t < p.w.end + 0.1;
      const cool = prog(t, p.w.end + 0.05, p.w.end + 0.5);
      const g = GOLD(1.5);
      lab.set({ colA: sung ? g : [lerp(g[0], LIN.bone[0] * 0.9, cool), lerp(g[1], LIN.bone[1] * 0.9, cool), lerp(g[2], LIN.bone[2] * 0.9, cool)], alA: clamp(k * 3) * fade, grain: 0 });
      void L3;
    }
  }

  // ------------------------------------------------------------------ 4. typed on the glass, cracks, shatter
  private drawGlassText(t: number, gt: LineBatch, fx: LineBatch, broken: boolean) {
    const L4 = this.L4;
    const on = t >= L4.start - 0.3 && !broken;
    for (const l of this.typed) l.mesh.visible = on;
    if (t < L4.start - 0.3) { this.shardMesh.visible = false; return; }
    const c = this.caretAt(t);
    const [la, lbl] = this.typed as [Label3D, Label3D];
    la.revealGlyphs(c.onB ? 99 : c.n);
    lbl.revealGlyphs(c.onB ? c.n - this.typedSplit : 0);
    // the word being typed is gold
    const cur = L4.words.slice(0, 4).find((w) => t >= w.start && t < w.end + 0.15);
    la.set({ wipe: 0 }); lbl.set({ wipe: 0 });
    void cur;
    if (!broken) {
      // caret
      const top = toScreen(this.cam, [c.x, c.y + 0.24, FZ + 0.02]), bot = toScreen(this.cam, [c.x, c.y - 0.24, FZ + 0.02]);
      if (!top.behind) cursorCaret(fx, top.x, top.y, Math.max(6, bot.y - top.y), 1, t);
      // cracks
      for (const im of this.impacts) {
        const g = this.growth(im, t);
        if (g <= 0) continue;
        const G = g * im.reach * 1.3;
        for (const cr of im.cracks) {
          const lim = Math.min(cr.total, G - cr.off * 0.6);
          if (lim <= 0) continue;
          const w = cr.depth === 0 ? 1.5 : 1.0;
          for (let i = 1; i < cr.pts.length; i++) {
            if (cr.len[i - 1]! >= lim) break;
            const a = cr.pts[i - 1]!;
            let b = cr.pts[i]!;
            if (cr.len[i]! > lim) { const u = (lim - cr.len[i - 1]!) / Math.max(1e-6, cr.len[i]! - cr.len[i - 1]!); b = [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]; }
            const tip = Math.max(0, 1 - (lim - cr.len[i]!) / 0.5);
            const I = 0.75 + tip * 2.2;
            const col = tip > 0.05 ? [LIN.signal[0] * I, LIN.signal[1] * I, LIN.signal[2] * I] : [LIN.bone[0] * 0.8, LIN.bone[1] * 0.8, LIN.bone[2] * 0.85];
            this.glow.seg(a[0], a[1], FZ + 0.03, b[0], b[1], FZ + 0.03, w, col[0]!, col[1]!, col[2]!, 1);
          }
        }
        // the strike point
        const hot = pulse(t, im.t, 0.12);
        if (hot > 0.02) {
          const sp = toScreen(this.cam, [im.x, im.y, FZ + 0.03]);
          if (!sp.behind) cursorTip(fx, sp.x, sp.y, t, 1 + hot * 2, hot * 1.5);
        }
      }
      this.shardMesh.visible = false;
      return;
    }
    // ---- shatter: shards fly at the camera, radiating from the last strike
    const dt = t - this.tBreak;
    const pos = this.shardPos;
    let o = 0;
    const last = this.impacts[this.impacts.length - 1]!;
    for (const s of this.shards) {
      const d0 = Math.max(0, dt - s.d * 0.035);
      const dx = s.cx - last.x, dy = s.cy - last.y, dl = Math.hypot(dx, dy) || 1;
      const out = 1.2 + 2.5 * s.seed;
      const vz = (7 + 14 * hash(s.seed, 2)) / (0.6 + s.d * 0.25);
      const vx = (dx / dl) * out, vy = (dy / dl) * out + 0.6;
      const ox = vx * d0, oy = vy * d0 - 4.9 * d0 * d0, oz = vz * d0;
      const ax = hash(s.seed, 5) - 0.5, ay = hash(s.seed, 6) - 0.5, az = hash(s.seed, 7) - 0.5;
      const al = Math.hypot(ax, ay, az) || 1;
      const ang = d0 * (4 + 10 * hash(s.seed, 8));
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(ax / al, ay / al, az / al), ang);
      const v = new THREE.Vector3();
      const pts: V3[] = s.pts.map(([x, y]) => {
        v.set(x - s.cx, y - s.cy, 0).applyQuaternion(q);
        return [s.cx + v.x + ox, s.cy + v.y + oy, FZ + 0.03 + v.z + oz];
      });
      for (let i = 1; i + 1 < pts.length; i++) {
        for (const p of [pts[0]!, pts[i]!, pts[i + 1]!]) { pos[o++] = p[0]; pos[o++] = p[1]; pos[o++] = p[2]; }
      }
      // edges: white-hot near the strike, bone further out
      const heat = Math.exp(-s.d * 0.9) * pulse(t, this.tBreak, 0.25);
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i]!, b = pts[(i + 1) % pts.length]!;
        const I = 0.9 + heat * 3;
        gt.seg(a[0], a[1], a[2], b[0], b[1], b[2], 1.4, lerp(LIN.bone[0], LIN.signal[0], heat) * I, lerp(LIN.bone[1], LIN.signal[1], heat) * I, lerp(LIN.bone[2], LIN.signal[2], heat) * I, 1);
      }
    }
    const sp = toScreen(this.cam, [last.x, last.y, FZ + 0.03]);
    const fl = pulse(t, this.tBreak, 0.08);
    if (!sp.behind && fl > 0.02) cursorTip(fx, sp.x, sp.y, t, 1 + fl * 5, fl * 2.5);
    this.shardAttr.needsUpdate = true;
    this.shardAttr.addUpdateRange(0, o);
    (this.shardMesh.geometry as THREE.BufferGeometry).setDrawRange(0, o / 3);
    this.shardMesh.visible = true;
  }
}
