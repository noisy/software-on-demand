// hook-parts — set pieces for the choruses (A4): the faceless builder, the thousand arms, the tower of
// sung words, the cursor in 3D, and small line-drawing primitives for a 3D LineBatch.
import * as THREE from 'three';
import { LineBatch } from '../engine/lines';
import { LIN } from '../engine/palette';
import { clamp, ease, hash, lerp, TAU } from '../engine/util';
import { cursorTip } from './_motifs';
import { type RGB, lin, scl3, toScreen, v3 } from './hook-kit';

// ------------------------------------------------------------------ line primitives (3D batch)
export function seg3(lb: LineBatch, a: THREE.Vector3, b: THREE.Vector3, w: number, c: RGB, al = 1) {
  lb.seg(a.x, a.y, a.z, b.x, b.y, b.z, w, c[0], c[1], c[2], al);
}
/** Circle of radius r about c in the plane spanned by unit vectors u, v. */
export function circle3(lb: LineBatch, c: THREE.Vector3, u: THREE.Vector3, v: THREE.Vector3, r: number, w: number, col: RGB, al = 1, n = 48, a0 = 0, a1 = TAU) {
  let px = 0, py = 0, pz = 0;
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    const cs = Math.cos(a) * r, sn = Math.sin(a) * r;
    const x = c.x + u.x * cs + v.x * sn, y = c.y + u.y * cs + v.y * sn, z = c.z + u.z * cs + v.z * sn;
    if (i) lb.seg(px, py, pz, x, y, z, w, col[0], col[1], col[2], al);
    px = x; py = y; pz = z;
  }
}
/** Wireframe box (12 edges), axis-aligned, from min to max. */
export function box3(lb: LineBatch, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, w: number, c: RGB, al = 1) {
  const e: [number, number, number, number, number, number][] = [
    [x0, y0, z0, x1, y0, z0], [x1, y0, z0, x1, y0, z1], [x1, y0, z1, x0, y0, z1], [x0, y0, z1, x0, y0, z0],
    [x0, y1, z0, x1, y1, z0], [x1, y1, z0, x1, y1, z1], [x1, y1, z1, x0, y1, z1], [x0, y1, z1, x0, y1, z0],
    [x0, y0, z0, x0, y1, z0], [x1, y0, z0, x1, y1, z0], [x1, y0, z1, x1, y1, z1], [x0, y0, z1, x0, y1, z1],
  ];
  for (const s of e) lb.seg(s[0], s[1], s[2], s[3], s[4], s[5], w, c[0], c[1], c[2], al);
}

// ------------------------------------------------------------------ the cursor in 3D
/**
 * The caret standing in the world: a gold bar from `bot` up to `top`, glow, and the white-hot tip at the
 * bottom (the working point), drawn as the shared motif in screen space. `lb3` is a 3D px-width batch,
 * `fx` the 2D additive batch.
 */
export function caret3D(lb3: LineBatch, fx: LineBatch, cam: THREE.PerspectiveCamera, bot: THREE.Vector3, top: THREE.Vector3, on: number, t: number, tipScale = 1, wMul = 1) {
  if (on <= 0.001) return;
  const a = toScreen(cam, bot.x, bot.y, bot.z), b = toScreen(cam, top.x, top.y, top.z);
  if (!a.ok && !b.ok) return;
  // size reference: a 10-unit caret at the tip's depth (the bar itself may run far off-frame)
  const r = toScreen(cam, bot.x, bot.y + 10, bot.z);
  const hPx = a.ok && r.ok ? Math.min(900, Math.hypot(a.x - r.x, a.y - r.y)) : 60;
  // clip the far end to a sane length on screen
  let bx = b.x, by = b.y;
  const L = Math.hypot(bx - a.x, by - a.y);
  if (!b.ok || L > 4000) { const dx = b.ok ? (bx - a.x) / L : 0, dy = b.ok ? (by - a.y) / L : -1; bx = a.x + dx * 4000; by = a.y + dy * 4000; }
  const flick = 0.9 + 0.1 * Math.sin(t * 83.1) * Math.sin(t * 51.7);
  const I = on * flick;
  const w = Math.max(3 * Math.min(1, wMul * 1.5), hPx * 0.06 * wMul);
  fx.seg2(a.x, a.y, bx, by, w, scl3(lin('signal'), 2.0 * I), 1);
  fx.seg2(a.x, a.y, bx, by, w * 3, scl3(lin('signal'), 0.4 * I), 0.35);
  if (a.ok) cursorTip(fx, a.x, a.y, t, Math.max(0.6, hPx / 70 * wMul) * tipScale, I);
  void lb3;
}

// ------------------------------------------------------------------ the faceless builder
const RIM_VERT = /* glsl */ `
precision highp float;
in vec3 position; in vec3 normal;
uniform mat4 projectionMatrix; uniform mat4 viewMatrix; uniform mat4 modelMatrix;
out vec3 vWN; out vec3 vWP; out float vDepth;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWP = wp.xyz;
  vWN = normalize(mat3(modelMatrix) * normal);
  vec4 mv = viewMatrix * wp;
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;
const RIM_FRAG = /* glsl */ `
precision highp float;
in vec3 vWN; in vec3 vWP; in float vDepth;
out vec4 fragColor;
uniform vec3 camPos; uniform vec3 body; uniform vec3 rim; uniform vec3 keyCol; uniform vec3 keyPos; uniform float keyI;
uniform vec3 fogCol; uniform float fogNear; uniform float fogFar; uniform float glow; uniform vec3 glowCol;
void main() {
  vec3 n = normalize(vWN);
  vec3 v = normalize(camPos - vWP);
  float fres = pow(1.0 - max(dot(n, v), 0.0), 2.6);
  vec3 L = keyPos - vWP; float dl = length(L); L /= dl;
  float lam = max(dot(n, L), 0.0) * keyI / (1.0 + dl * dl * 0.0025);
  // engraved hatch across the body, following height (shadow side only)
  float sh = 1.0 - max(dot(n, normalize(vec3(-0.4, 0.8, 0.5))), 0.0);
  float u = vWP.y * 2.2 + vWP.x * 0.6;
  float f = abs(fract(u) - 0.5); float aa = fwidth(u);
  float hat = (1.0 - smoothstep(0.5 * sh * 0.8 - aa, 0.5 * sh * 0.8 + aa, 0.5 - f)) * 0.5;
  vec3 c = body * (0.7 + 0.3 * n.y) + rim * fres + keyCol * lam + rim * 0.12 * hat;
  c += glowCol * glow * (0.3 + fres);
  c = mix(c, fogCol, smoothstep(fogNear, fogFar, vDepth));
  fragColor = vec4(c, 1.0);
}`;

export class Figure {
  group = new THREE.Group();
  mat: THREE.RawShaderMaterial;
  parts: Record<string, THREE.Mesh> = {};
  constructor() {
    this.mat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: RIM_VERT, fragmentShader: RIM_FRAG,
      uniforms: {
        camPos: { value: new THREE.Vector3() }, body: { value: new THREE.Vector3(...scl3(lin('ink2'), 0.9)) }, rim: { value: new THREE.Vector3(...scl3(lin('bone'), 0.6)) },
        keyCol: { value: new THREE.Vector3(...lin('signal', 0.3)) }, keyPos: { value: new THREE.Vector3() }, keyI: { value: 1 },
        fogCol: { value: new THREE.Vector3(...LIN.ink) }, fogNear: { value: 200 }, fogFar: { value: 900 }, glow: { value: 0 }, glowCol: { value: new THREE.Vector3(...lin('signal', 1.2)) },
      },
    });
    const cap = new THREE.CapsuleGeometry(1, 1, 6, 16);
    const sph = new THREE.SphereGeometry(1, 28, 20);
    for (const n of ['torso', 'pelvis', 'neck', 'uaL', 'uaR', 'faL', 'faR']) { this.parts[n] = new THREE.Mesh(cap, this.mat); this.group.add(this.parts[n]!); }
    for (const n of ['head', 'shL', 'shR', 'elL', 'elR', 'hdL', 'hdR']) { this.parts[n] = new THREE.Mesh(sph, this.mat); this.group.add(this.parts[n]!); }
    for (const m of Object.values(this.parts)) m.frustumCulled = false;
  }
  private limb(n: string, a: THREE.Vector3, b: THREE.Vector3, r: number, rz = r) {
    const m = this.parts[n]!;
    const d = new THREE.Vector3().subVectors(b, a);
    const len = d.length();
    m.position.copy(a).addScaledVector(d, 0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    // CapsuleGeometry(1, 1): total height 3 (1 + 2 caps) -> scale.y so the capsule spans a..b
    m.scale.set(r, Math.max(0.01, len / 3), rz);
  }
  private ball(n: string, p: THREE.Vector3, r: number, sy = r) { const m = this.parts[n]!; m.position.copy(p); m.scale.set(r, sy, r); m.quaternion.identity(); }
  /** Two-bone IK: elbow for shoulder S reaching T with bone lengths l1, l2 and a pole direction. */
  static ik(S: THREE.Vector3, T: THREE.Vector3, l1: number, l2: number, pole: THREE.Vector3) {
    const d = new THREE.Vector3().subVectors(T, S);
    let L = d.length();
    L = clamp(L, Math.abs(l1 - l2) + 0.01, l1 + l2 - 0.01);
    const dir = d.normalize();
    const hand = S.clone().addScaledVector(dir, L);
    const a = (l1 * l1 - l2 * l2 + L * L) / (2 * L);
    const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
    const pp = pole.clone().addScaledVector(dir, -pole.dot(dir)).normalize();
    const elbow = S.clone().addScaledVector(dir, a).addScaledVector(pp, h);
    return { elbow, hand };
  }
  /**
   * Pose the builder: `o` = origin at the hips (y up, facing +z), scale s (height ≈ 44 s),
   * hands reaching for world targets tL/tR (clamped to reach), head looking toward `look`.
   */
  pose(o: THREE.Vector3, s: number, tL: THREE.Vector3, tR: THREE.Vector3, look: THREE.Vector3, breathe = 0) {
    const P = (x: number, y: number, z: number) => new THREE.Vector3(o.x + x * s, o.y + y * s, o.z + z * s);
    const chestY = 9 + breathe * 0.15;
    const shL = P(-6.2, 12.2 + breathe * 0.1, 0), shR = P(6.2, 12.2 + breathe * 0.1, 0);
    this.limb('pelvis', P(-2.6, -1.5, 0), P(2.6, -1.5, 0), 3.4 * s, 2.6 * s);
    this.limb('torso', P(0, 0.5, 0), P(0, chestY + 2.4, 0), 4.9 * s, 3.2 * s);
    this.parts.torso!.scale.x = 5.6 * s; // broad shoulders
    this.limb('neck', P(0, 12.5, 0), P(0, 15.3, 0.2), 1.35 * s);
    // head: turned a little toward `look`
    const hc = P(0, 18.2, 0.4);
    const toL = new THREE.Vector3().subVectors(look, hc);
    const yaw = clamp(Math.atan2(toL.x, toL.z), -0.5, 0.5), pitch = clamp(Math.atan2(toL.y, Math.hypot(toL.x, toL.z)), -0.45, 0.3);
    this.ball('head', hc, 2.7 * s, 3.25 * s);
    this.parts.head!.rotation.set(-pitch, yaw, 0);
    this.ball('shL', shL, 2.0 * s); this.ball('shR', shR, 2.0 * s);
    const l1 = 8.2 * s, l2 = 7.6 * s;
    const pole = new THREE.Vector3(0, -0.6, -1);
    const L = Figure.ik(shL, tL, l1, l2, new THREE.Vector3(-0.8, -0.4, -0.6).add(pole).normalize());
    const R = Figure.ik(shR, tR, l1, l2, new THREE.Vector3(0.8, -0.4, -0.6).add(pole).normalize());
    this.limb('uaL', shL, L.elbow, 1.55 * s); this.limb('faL', L.elbow, L.hand, 1.3 * s);
    this.limb('uaR', shR, R.elbow, 1.55 * s); this.limb('faR', R.elbow, R.hand, 1.3 * s);
    this.ball('elL', L.elbow, 1.45 * s); this.ball('elR', R.elbow, 1.45 * s);
    this.ball('hdL', L.hand, 1.5 * s, 1.2 * s); this.ball('hdR', R.hand, 1.5 * s, 1.2 * s);
    return { head: hc, handL: L.hand, handR: R.hand, chest: P(0, chestY, 0), shL, shR };
  }
  set(o: { cam: THREE.Vector3; key: THREE.Vector3; keyI?: number; fog?: [number, number]; glow?: number }) {
    const u = this.mat.uniforms;
    (u.camPos!.value as THREE.Vector3).copy(o.cam);
    (u.keyPos!.value as THREE.Vector3).copy(o.key);
    u.keyI!.value = o.keyI ?? 1;
    if (o.fog) { u.fogNear!.value = o.fog[0]; u.fogFar!.value = o.fog[1]; }
    u.glow!.value = o.glow ?? 0;
  }
}

// ------------------------------------------------------------------ the thousand arms
export interface Arm {
  i: number; ring: number;
  base: THREE.Vector3; u: THREE.Vector3; f: THREE.Vector3; side: THREE.Vector3;
  l: [number, number, number];
  tU: number; ph: number; wob: number;
}

/**
 * A radial dish of articulated arms around a centre (facing +z), inner rings first. `order` times:
 * arm i unfolds at unfoldAt(i). Returns arms sorted by unfold order.
 */
export function makeArms(n: number, c: THREE.Vector3, r0: number, dr: number, unfoldAt: (i: number) => number, o: { dish?: number; tilt?: number; scale0?: number; scaleK?: number } = {}): Arm[] {
  const arms: Arm[] = [];
  const dish = o.dish ?? 1.6, tilt = o.tilt ?? 0.45;
  // ring populations proportional to circumference, filling n
  const rings: number[] = [];
  let total = 0;
  for (let k = 0; total < n; k++) {
    const R = r0 + k * dr;
    const cnt = Math.max(6, Math.round((TAU * R) / (dr * 0.62)));
    rings.push(Math.min(cnt, n - total));
    total += rings[k]!;
  }
  let i = 0;
  rings.forEach((cnt, k) => {
    const R = r0 + k * dr;
    for (let j = 0; j < cnt; j++) {
      const a = ((j + (k % 2) * 0.5) / cnt) * TAU + 0.3 * k;
      const radial = v3(Math.cos(a), Math.sin(a), 0);
      const base = c.clone().addScaledVector(radial, R);
      base.z -= 1.2 + k * dish;
      // arms point outward and forward (toward the viewer), each in its own plane
      const u = radial.clone().multiplyScalar(Math.cos(tilt)).add(v3(0, 0, Math.sin(tilt))).normalize();
      const side = v3(-Math.sin(a), Math.cos(a), 0);
      const f = new THREE.Vector3().crossVectors(side, u).normalize();
      const s = (o.scale0 ?? 1) * (1 + k * (o.scaleK ?? 0.07));
      arms.push({ i, ring: k, base, u, f, side, l: [2.3 * s, 2.0 * s, 1.1 * s], tU: unfoldAt(i), ph: hash(i, 7), wob: hash(i, 9) * 2 - 1 });
      i++;
    }
  });
  return arms;
}

export interface ArmPose { p: THREE.Vector3[]; dir: THREE.Vector3; grip: number; k: number }
const _d = new THREE.Vector3();
/** Pose of one arm at t: unfold k (0 folded .. 1 out), `work` 0..1 hammer motion, grip 0 open .. 1 closed. */
export function armPose(a: Arm, t: number, beat: number, work: number, grip: number, reach = 1): ArmPose | null {
  const k0 = clamp((t - a.tU) / 0.26);
  if (k0 <= 0) return null;
  const k = ease.outBack(k0, 2.2);
  // hammer: each ring strikes a little after the one inside it (ripples outward on the beat)
  const bp = beat - a.ring * 0.07 - a.ph * 0.12;
  const fr = bp - Math.floor(bp);
  const ham = work * (Math.exp(-fr * 7) - 0.15) * 0.7;
  const th1 = lerp(-0.3, 0.42 + a.wob * 0.18, k) + ham * 0.35;
  const th2 = lerp(2.9, -0.7 - 0.25 * reach, k) - ham * 0.8;
  const th3 = lerp(-2.7, -0.55, k) - ham * 0.5;
  const sL = lerp(0.3, 1, Math.min(1, k)) * reach;
  const dirAt = (th: number) => new THREE.Vector3().copy(a.u).multiplyScalar(Math.cos(th)).addScaledVector(a.f, Math.sin(th));
  const p0 = a.base.clone();
  const d1 = dirAt(th1), d2 = dirAt(th1 + th2), d3 = dirAt(th1 + th2 + th3);
  const p1 = p0.clone().addScaledVector(d1, a.l[0] * sL);
  const p2 = p1.clone().addScaledVector(d2, a.l[1] * sL);
  const p3 = p2.clone().addScaledVector(d3, a.l[2] * sL);
  return { p: [p0, p1, p2, p3], dir: d3, grip, k: k0 };
}
/** Draw an arm (mount, three links, joints, two-finger gripper). */
export function drawArm(lb: LineBatch, a: Arm, ps: ArmPose, col: RGB, jointCol: RGB, al: number, wScale = 1) {
  const [p0, p1, p2, p3] = ps.p as [THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Vector3];
  const s = a.l[0] / 2.3;
  // mount plate across the ring tangent
  _d.copy(a.side).multiplyScalar(0.7 * s);
  lb.seg(p0.x - _d.x, p0.y - _d.y, p0.z - _d.z, p0.x + _d.x, p0.y + _d.y, p0.z + _d.z, 2.2 * wScale, col[0], col[1], col[2], al * 0.8);
  seg3(lb, p0, p1, 1.9 * wScale, col, al);
  seg3(lb, p1, p2, 1.5 * wScale, col, al);
  seg3(lb, p2, p3, 1.2 * wScale, col, al);
  for (const q of [p1, p2]) lb.seg(q.x, q.y, q.z, q.x, q.y, q.z + 0.001, 4.2 * wScale, jointCol[0], jointCol[1], jointCol[2], al);
  // gripper: two fingers splayed by (1 - grip)
  const open = lerp(0.7, 0.12, ps.grip);
  const fl = 0.75 * s;
  for (const sg of [-1, 1]) {
    const dir = ps.dir.clone().multiplyScalar(Math.cos(open)).addScaledVector(a.side, sg * Math.sin(open));
    const q = p3.clone().addScaledVector(dir, fl);
    const r = q.clone().addScaledVector(ps.dir, fl * 0.6).addScaledVector(a.side, -sg * fl * 0.25 * (1 - ps.grip * 0.5));
    seg3(lb, p3, q, 1.1 * wScale, jointCol, al);
    seg3(lb, q, r, 1.0 * wScale, jointCol, al);
  }
}
