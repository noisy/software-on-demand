// hook-planet — chorus 2 (A4): an engraved night-side planet whose city lights ignite in waves on the beat
// (each light a builder), and a thousand satellites (the thousand hands) launched from it into orbit.
import * as THREE from 'three';
import { GLSL_COMMON } from '../engine/glsl/common';
import { LineBatch } from '../engine/lines';
import { clamp, ease, hash, lerp, TAU } from '../engine/util';
import { type RGB, lin, mix3, scl3, v3 } from './hook-kit';

export const PLANET_R = 100;

const VERT = /* glsl */ `
precision highp float;
in vec3 position; in vec3 normal;
uniform mat4 projectionMatrix; uniform mat4 viewMatrix; uniform mat4 modelMatrix;
out vec3 vN; out vec3 vWP;
void main() {
  vN = normal;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWP = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

// fwidth-free helpers are in GLSL_COMMON; this shader needs the fragment ones too
const FRAG = /* glsl */ `
precision highp float;
precision highp int;
in vec3 vN; in vec3 vWP;
out vec4 fragColor;
${GLSL_COMMON}
uniform vec3 camPos; uniform vec3 sunDir; uniform vec3 homeN; uniform vec3 center; uniform float R;
uniform float beat; uniform float ign0; uniform float waveStep; uniform float lightsK; uniform float dim;
float landH(vec3 n) { return fbm(n * 1.7 + vec3(3.1, -1.7, 0.4), 5) + 0.12 * snoise(n * 7.0); }
void main() {
  vec3 n = normalize(vN);
  float lat = asin(clamp(n.y, -1.0, 1.0)), lon = atan(n.z, n.x);
  float h = landH(n);
  float land = smoothstep(0.035, 0.05, h);
  float day = dot(n, sunDir);
  float lit = smoothstep(-0.08, 0.5, day);
  vec3 v = normalize(camPos - vWP);
  float mu = max(dot(n, v), 0.0);
  vec3 c = C_INK * 0.9;
  float nearK = smoothstep(2.0, 45.0, length(camPos - center) - R);
  // night side: land a raised ink with a fine crosshatch, sea engraved along the parallels
  float seaL = hatch(lat * 95.0 + 0.35 * sin(lon * 3.0), 0.08 + 0.55 * lit);
  float landL = max(hatch((lat + lon * 0.6) * 70.0, 0.06 + 0.5 * lit), hatch((lat - lon * 0.6) * 70.0, 0.4 * lit));
  c = mix(c + C_GRAPHITE * seaL * 0.2 + C_BONE * seaL * 0.3 * lit, C_INK2 * 1.4 + C_GRAPHITE * landL * 0.28 + C_BONE * landL * 0.34 * lit, land);
  // coastlines: a bone hairline
  float coast = 1.0 - smoothstep(0.0, fwidth(h) * 1.3, abs(h - 0.042));
  c += C_BONE * coast * (0.22 + 0.5 * lit);
  c = mix(C_INK * 0.9, c, nearK);
  // graticule, very faint
  float gLat = abs(fract(lat / (PI / 12.0) + 0.5) - 0.5) * (PI / 12.0);
  float gLon = abs(fract(lon / (PI / 12.0) + 0.5) - 0.5) * (PI / 12.0) * cos(lat);
  float gw = fwidth(lat) * 0.8;
  c += C_BONE * 0.07 * (1.0 - smoothstep(0.0, gw, min(gLat, gLon)));
  // city lights: one possible light per lat/long cell (cells equal-area-ish), lit in waves from home
  float nb = 140.0;
  float bi = floor((lat / PI + 0.5) * nb);
  float latc = ((bi + 0.5) / nb - 0.5) * PI;
  float nj = max(3.0, floor(280.0 * cos(latc)));
  float bj = floor((lon / TAU + 0.5) * nj);
  vec2 hh = hash22(vec2(bi, bj) + 17.0);
  float lonc = ((bj + 0.3 + 0.4 * hh.x) / nj - 0.5) * TAU;
  float latj = latc + (hh.y - 0.5) * 0.4 * (PI / nb);
  vec3 cn = vec3(cos(latj) * cos(lonc), sin(latj), cos(latj) * sin(lonc));
  float hc = landH(cn);
  float exists = step(0.045, hc) * step(hash12(vec2(bj, bi) * 1.37), 0.34) + step(0.93, hash12(vec2(bi, bj) * 3.1)) * step(0.0, hc) ;
  exists = min(exists, 1.0);
  float ang = acos(clamp(dot(cn, homeN), -1.0, 1.0));
  float ib = ign0 + floor(ang / waveStep) + hash12(vec2(bi, bj) * 7.1) * 0.35;
  float on = step(ib, beat) * exists * lightsK;
  float flash = on * exp(-max(beat - ib, 0.0) * 2.5);
  float d = acos(clamp(dot(n, cn), -1.0, 1.0));
  float sig = PI / nb * 0.085;
  float core = exp(-pow(d / sig, 2.0));
  float halo = exp(-pow(d / (sig * 2.4), 2.0)) * 0.22;
  float night = 1.0 - lit;
  float bright = 0.6 + 0.8 * hash12(vec2(bi, bj) * 5.3);
  c += on * night * (C_SIGNAL * (2.2 * core * bright + halo) + C_EMBER * flash * 4.0 * core);
  // the home light (the first builder) glows in its own right
  float dh = acos(clamp(dot(n, homeN), -1.0, 1.0));
  float far = smoothstep(8.0, 60.0, length(camPos - center - homeN * R));
  c += far * (C_SIGNAL * 2.5 * exp(-pow(dh / (sig * 2.0), 2.0)) + C_SIGNAL * 0.4 * exp(-pow(dh / (sig * 14.0), 2.0)));
  // limb: a bone hairline and a thin gold air-glow
  float rim = pow(1.0 - mu, 6.0);
  c += C_BONE * rim * 0.5 + C_SIGNAL * pow(1.0 - mu, 14.0) * 0.4 * (0.4 + night);
  c *= dim;
  fragColor = vec4(clamp(c, 0.0, 12.0), 1.0);
}`;

export class Planet {
  mesh: THREE.Mesh;
  mat: THREE.RawShaderMaterial;
  constructor(public homeN: THREE.Vector3) {
    this.mat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: VERT, fragmentShader: FRAG,
      uniforms: {
        camPos: { value: new THREE.Vector3() }, sunDir: { value: new THREE.Vector3(-0.62, 0.34, -0.72).normalize() }, homeN: { value: homeN.clone() },
        center: { value: new THREE.Vector3() }, R: { value: PLANET_R }, beat: { value: 0 }, ign0: { value: 0 }, waveStep: { value: 0.22 }, lightsK: { value: 1 }, dim: { value: 1 },
      },
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(PLANET_R, 160, 110), this.mat);
    this.mesh.frustumCulled = false;
  }
  get u() { return this.mat.uniforms; }
  set(o: { cam: THREE.Vector3; beat: number; ign0: number; waveStep?: number; dim?: number }) {
    (this.u.camPos!.value as THREE.Vector3).copy(o.cam);
    this.u.beat!.value = o.beat; this.u.ign0!.value = o.ign0;
    if (o.waveStep) this.u.waveStep!.value = o.waveStep;
    this.u.dim!.value = o.dim ?? 1;
  }
}

/** A point on the surface at unit direction n, lifted by h. */
export const surf = (n: THREE.Vector3, h = 0) => n.clone().multiplyScalar(PLANET_R + h);

/** Orthonormal frame at a surface normal: up = n, fwd roughly toward +z. */
export function surfFrame(n: THREE.Vector3) {
  const up = n.clone().normalize();
  const ref = Math.abs(up.y) < 0.9 ? v3(0, 1, 0) : v3(1, 0, 0);
  const right = new THREE.Vector3().crossVectors(ref, up).normalize();
  const fwd = new THREE.Vector3().crossVectors(right, up).normalize();
  return { up, right, fwd };
}

// ------------------------------------------------------------------ satellites
export interface Sat { i: number; r: number; q: THREE.Quaternion; ph: number; w: number; tL: number; from: THREE.Vector3; hot: number }

export function makeSats(n: number, homeN: THREE.Vector3, launchAt: (i: number) => number): Sat[] {
  const out: Sat[] = [];
  for (let i = 0; i < n; i++) {
    // launch site: near home for the first ones, spreading over the globe
    const spread = 0.15 + 1.8 * Math.sqrt(i / n);
    const a = hash(i, 1) * TAU, rr = spread * Math.sqrt(hash(i, 2));
    const { right, fwd, up } = surfFrame(homeN);
    const from = up.clone().multiplyScalar(Math.cos(rr)).addScaledVector(right, Math.sin(rr) * Math.cos(a)).addScaledVector(fwd, Math.sin(rr) * Math.sin(a)).normalize();
    // orbit: a shell 118–175, inclined planes; phase so that it starts above its launch site
    const r = PLANET_R * (1.18 + 0.6 * Math.pow(hash(i, 3), 1.6));
    const inc = (hash(i, 4) - 0.5) * 1.9, node = hash(i, 5) * TAU;
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(inc, node, 0, 'YXZ'));
    // phase: the orbit angle whose position is closest to the launch site
    const local = from.clone().applyQuaternion(q.clone().invert());
    const ph = Math.atan2(local.z, local.x);
    const w = 0.55 * Math.pow(PLANET_R * 1.18 / r, 1.5) * (hash(i, 6) < 0.5 ? 1 : -1);
    out.push({ i, r, q, ph, w, tL: launchAt(i), from: from.multiplyScalar(PLANET_R), hot: hash(i, 7) });
  }
  return out;
}
const _o = new THREE.Vector3();
export function orbitPos(s: Sat, theta: number, out = new THREE.Vector3()) {
  return out.set(Math.cos(theta) * s.r, 0, Math.sin(theta) * s.r).applyQuaternion(s.q);
}
/** Satellite position at t (null before launch): rises from its city, then on its orbit. */
export function satPos(s: Sat, t: number, out = new THREE.Vector3()): { p: THREE.Vector3; k: number; th: number } | null {
  if (t < s.tL) return null;
  const k = clamp((t - s.tL) / 0.55);
  const th = s.ph + s.w * Math.max(0, t - s.tL - 0.3);
  orbitPos(s, th, out);
  if (k < 1) {
    const e = ease.outCubic(k);
    _o.copy(s.from).lerp(out, e);
    // arc outward while climbing
    _o.setLength(lerp(PLANET_R, s.r, e) + Math.sin(k * Math.PI) * 6);
    out.copy(_o);
  }
  return { p: out, k, th };
}
/** Draw a satellite: a body dot, solar panels across its path, and a fading trail along the orbit. */
export function drawSat(lb: LineBatch, s: Sat, t: number, col: RGB, trailCol: RGB, al = 1, trail = 10) {
  const sp = satPos(s, t);
  if (!sp) return null;
  const p = sp.p.clone();
  // trail
  if (sp.k >= 1) {
    const dth = 0.012 * Math.sign(s.w);
    let prev = p.clone();
    for (let j = 1; j <= trail; j++) {
      const q = orbitPos(s, sp.th - dth * j * 1.6);
      const a = al * (1 - j / (trail + 1)) * 0.55;
      lb.seg(prev.x, prev.y, prev.z, q.x, q.y, q.z, 1.0, trailCol[0], trailCol[1], trailCol[2], a);
      prev = q;
    }
  } else {
    const q = s.from;
    lb.seg(q.x, q.y, q.z, p.x, p.y, p.z, 1.0, trailCol[0], trailCol[1], trailCol[2], al * 0.5 * (1 - sp.k));
  }
  // panels: across the orbit (perpendicular to the radius and the path)
  const tang = orbitPos(s, sp.th + 0.01).sub(orbitPos(s, sp.th)).normalize();
  const side = new THREE.Vector3().crossVectors(tang, p.clone().normalize()).multiplyScalar(1.1);
  lb.seg(p.x - side.x, p.y - side.y, p.z - side.z, p.x + side.x, p.y + side.y, p.z + side.z, 1.4, trailCol[0] * 1.4, trailCol[1] * 1.4, trailCol[2] * 1.4, al);
  lb.seg(p.x, p.y, p.z, p.x, p.y, p.z + 0.001, 3.6, col[0], col[1], col[2], al);
  return p;
}

/** Stars: fixed dots on a far sphere (they parallax correctly with the camera). */
export function makeStars(n: number, R: number) {
  const out: { p: THREE.Vector3; b: number }[] = [];
  for (let i = 0; i < n; i++) {
    const z = hash(i, 21) * 2 - 1, a = hash(i, 22) * TAU, r = Math.sqrt(1 - z * z);
    out.push({ p: v3(r * Math.cos(a) * R, z * R, r * Math.sin(a) * R), b: Math.pow(hash(i, 23), 3) });
  }
  return out;
}
export function drawStars(lb: LineBatch, stars: { p: THREE.Vector3; b: number }[], eye: THREE.Vector3, al = 1) {
  const bone = lin('bone');
  for (const s of stars) {
    const x = s.p.x + eye.x, y = s.p.y + eye.y, z = s.p.z + eye.z;
    const c = mix3(scl3(bone, 0.35), scl3(bone, 0.9), s.b);
    lb.seg(x, y, z, x, y, z + 0.01, 1.2 + s.b * 1.6, c[0], c[1], c[2], al * (0.35 + 0.65 * s.b));
  }
}
