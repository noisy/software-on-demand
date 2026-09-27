// Shared kit for the A3 plates (jevons, niche): an engraving material for three.js meshes (bone hatch
// lines on an ink body, line width = light, like an engraved plate printed in reverse), arc-length lathe
// geometry, a world -> screen projector and a helper that sets a Canvas2D transform onto a 3D plane.
import * as THREE from 'three';
import { GLSL_COMMON } from '../engine/glsl/common';
import { W, H } from '../engine/gl';
import { LIN } from '../engine/palette';
import { clamp, lerp } from '../engine/util';

export type RGB = [number, number, number];
export type P3 = { x: number; y: number; z: number };
export const v3 = (x = 0, y = 0, z = 0): P3 => ({ x, y, z });
export const add3 = (a: P3, b: P3): P3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const sub3 = (a: P3, b: P3): P3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const mul3 = (a: P3, k: number): P3 => ({ x: a.x * k, y: a.y * k, z: a.z * k });
export const lerp3 = (a: P3, b: P3, k: number): P3 => ({ x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), z: lerp(a.z, b.z, k) });
export const len3 = (a: P3) => Math.hypot(a.x, a.y, a.z);
export const norm3 = (a: P3): P3 => { const l = len3(a) || 1; return { x: a.x / l, y: a.y / l, z: a.z / l }; };
export const cross3 = (a: P3, b: P3): P3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
export const dot3 = (a: P3, b: P3) => a.x * b.x + a.y * b.y + a.z * b.z;
export const mulRGB = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k];
export const mixRGB = (a: RGB, b: RGB, k: number): RGB => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];

// ------------------------------------------------------------------ engraving material

const ENGRAVE_VERT = (inst: boolean) => /* glsl */ `
precision highp float;
in vec3 position; in vec3 normal; in vec2 uv;
${inst ? 'in mat4 instanceMatrix; in vec3 iTint;' : ''}
uniform mat4 modelMatrix; uniform mat4 viewMatrix; uniform mat4 projectionMatrix;
out vec3 vW; out vec3 vN; out vec2 vUv; out vec3 vTint; out vec3 vO;
void main() {
  mat4 M = modelMatrix${inst ? ' * instanceMatrix' : ''};
  vec4 w = M * vec4(position, 1.0);
  vW = w.xyz; vN = normalize(mat3(M) * normal); vUv = uv; vO = position;
  vTint = ${inst ? 'iTint' : 'vec3(1.0)'};
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const ENGRAVE_FRAG = /* glsl */ `
precision highp float;
${GLSL_COMMON}
in vec3 vW; in vec3 vN; in vec2 vUv; in vec3 vTint; in vec3 vO;
uniform vec3 uCam; uniform vec3 uL; uniform vec3 uLine; uniform vec3 uBody; uniform vec3 uGlintC;
uniform vec2 uFreq; uniform float uCross; uniform float uBorder; uniform float uSil; uniform float uHair;
uniform float uBright; uniform float uGlint; uniform float uFog; uniform float uFogStart; uniform float uEmit; uniform float uWorld;
out vec4 fragColor;
void main() {
  vec3 N = normalize(vN);
  vec3 V = normalize(uCam - vW);
  if (dot(N, V) < 0.0) N = -N;
  float ndl = dot(N, uL);
  float diff = max(ndl, 0.0);
  float nv = abs(dot(N, V));
  float rim = pow(1.0 - nv, 3.0);
  float b = sat(0.05 + 0.9 * pow(diff, 0.85) + 0.3 * rim * (0.4 + 0.6 * diff));
  // parallels (the engraver's lines follow the form), line width = light
  // uWorld > 0: world-space lines (lines per unit) for flat parts: level lines on the sides, diagonals on tops
  vec3 Nw = normalize(vN);
  float hu = uWorld > 0.0 ? (abs(Nw.y) > 0.7 ? (vW.x + vW.z) * 0.7071 : vW.y) * uWorld : vUv.y * uFreq.y;
  float hv = uWorld > 0.0 ? (abs(Nw.y) > 0.7 ? (vW.x - vW.z) * 0.7071 : (abs(Nw.x) > abs(Nw.z) ? vW.z : vW.x)) * uWorld : vUv.x * uFreq.x + vUv.y * uFreq.y * 0.6; // crossing lines run diagonally (no mesh-like grid)
  // lines closer than ~3 px fade to their mean coverage (no moire on distant or grazing surfaces)
  float w1 = mix(uHair, 0.82, b), w2 = sat(b * 2.6 - 1.95) * 0.6;
  float ink = mix(hatch(hu, w1), w1, smoothstep(0.36, 0.7, fwidth(hu) * PX_SCALE));
  // crossing lines only in the lights
  ink = max(ink, uCross * mix(hatch(hv, w2), w2, smoothstep(0.36, 0.7, fwidth(hv) * PX_SCALE)));
  // face borders (boxes) and silhouettes (curved bodies)
  vec2 e2 = min(vUv, 1.0 - vUv);
  float e = min(e2.x, e2.y);
  float bd = e / max(fwidth(e), 1e-5);
  ink = max(ink, uBorder * pxLine(bd, 0.7, 1.7));
  ink = max(ink, uSil * (1.0 - smoothstep(0.16, 0.34, nv)));
  vec3 lc = uLine * vTint * uBright;
  vec3 col = mix(uBody, lc, ink);
  float spec = pow(max(dot(reflect(-uL, N), V), 0.0), 36.0);
  col += uGlintC * spec * uGlint * ink;
  col += uLine * vTint * uEmit;
  float d = length(uCam - vW);
  float fog = exp(-max(d - uFogStart, 0.0) * uFog);
  col = mix(C_INK, col, fog);
  fragColor = vec4(col, 1.0);
}`;

export interface EngraveOpts {
  line?: RGB; body?: RGB; freq?: [number, number]; cross?: number; border?: number; sil?: number; hair?: number;
  bright?: number; glint?: number; glintC?: RGB; fog?: number; fogStart?: number; instanced?: boolean; emit?: number;
  /** world-space hatch: lines per world unit (0 = use uv * freq) */
  world?: number;
}

export function engraveMat(o: EngraveOpts = {}) {
  return new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: ENGRAVE_VERT(!!o.instanced),
    fragmentShader: ENGRAVE_FRAG,
    uniforms: {
      uCam: { value: new THREE.Vector3() },
      uL: { value: new THREE.Vector3(0.45, 0.75, 0.5).normalize() },
      uLine: { value: new THREE.Vector3(...(o.line ?? mulRGB(LIN.bone, 0.82))) },
      uBody: { value: new THREE.Vector3(...(o.body ?? mulRGB(LIN.ink2, 0.55))) },
      uGlintC: { value: new THREE.Vector3(...(o.glintC ?? LIN.ember)) },
      uFreq: { value: new THREE.Vector2(...(o.freq ?? [40, 40])) },
      uCross: { value: o.cross ?? 0.6 },
      uBorder: { value: o.border ?? 0 },
      uSil: { value: o.sil ?? 0.8 },
      uHair: { value: o.hair ?? 0.1 },
      uBright: { value: o.bright ?? 1 },
      uGlint: { value: o.glint ?? 0.4 },
      uFog: { value: o.fog ?? 0.035 },
      uFogStart: { value: o.fogStart ?? 12 },
      uEmit: { value: o.emit ?? 0 },
      uWorld: { value: o.world ?? 0 },
    },
    side: THREE.DoubleSide,
    depthTest: true, depthWrite: true,
  });
}

/** Set the per-frame uniforms of every engrave material in a list. */
export function setEngraveCam(mats: THREE.RawShaderMaterial[], cam: THREE.Camera, light?: P3) {
  for (const m of mats) {
    (m.uniforms.uCam!.value as THREE.Vector3).setFromMatrixPosition(cam.matrixWorld);
    if (light) (m.uniforms.uL!.value as THREE.Vector3).set(light.x, light.y, light.z).normalize();
  }
}

/**
 * Lathe around +Y from a (r, y) profile, resampled by arc length so uv.y is proportional to the length along
 * the profile (hatch spacing stays even). Returns the geometry and the profile length (for uFreq.y).
 */
export function latheGeo(profile: [number, number][], segs = 64, step = 0.02): { geo: THREE.LatheGeometry; len: number } {
  const L: number[] = [0];
  for (let i = 1; i < profile.length; i++) L.push(L[i - 1]! + Math.hypot(profile[i]![0] - profile[i - 1]![0], profile[i]![1] - profile[i - 1]![1]));
  const total = L[L.length - 1]!;
  const n = Math.max(2, Math.ceil(total / step));
  const pts: THREE.Vector2[] = [];
  // keep the corners: sample each profile segment separately
  for (let i = 1; i < profile.length; i++) {
    const a = profile[i - 1]!, b = profile[i]!;
    const k = Math.max(1, Math.round(((L[i]! - L[i - 1]!) / total) * n));
    for (let j = i === 1 ? 0 : 1; j <= k; j++) pts.push(new THREE.Vector2(lerp(a[0], b[0], j / k), lerp(a[1], b[1], j / k)));
  }
  return { geo: new THREE.LatheGeometry(pts, segs), len: total };
}

// ------------------------------------------------------------------ camera & projection

export interface CamKey { pos: P3; tgt: P3; roll?: number; fov?: number }

export function setCam(cam: THREE.PerspectiveCamera, k: CamKey) {
  cam.position.set(k.pos.x, k.pos.y, k.pos.z);
  const f = norm3(sub3(k.tgt, k.pos));
  const r = k.roll ?? 0;
  // world up rotated about the view axis
  let upv = v3(0, 1, 0);
  if (Math.abs(f.y) > 0.98) upv = v3(0, 0, -1);
  const right = norm3(cross3(f, upv));
  const up0 = cross3(right, f);
  const up = add3(mul3(up0, Math.cos(r)), mul3(right, Math.sin(r)));
  cam.up.set(up.x, up.y, up.z);
  cam.lookAt(k.tgt.x, k.tgt.y, k.tgt.z);
  if (k.fov !== undefined && Math.abs(cam.fov - k.fov) > 1e-6) { cam.fov = k.fov; cam.updateProjectionMatrix(); }
  cam.updateMatrixWorld(true);
}

export function mixCam(a: CamKey, b: CamKey, k: number): CamKey {
  return { pos: lerp3(a.pos, b.pos, k), tgt: lerp3(a.tgt, b.tgt, k), roll: lerp(a.roll ?? 0, b.roll ?? 0, k), fov: lerp(a.fov ?? 30, b.fov ?? 30, k) };
}

export interface SP { x: number; y: number; w: number }

export class Projector {
  m = new THREE.Matrix4();
  private v = new THREE.Vector4();
  camPos = v3();
  update(cam: THREE.Camera) {
    cam.updateMatrixWorld(true);
    this.m.multiplyMatrices((cam as THREE.PerspectiveCamera).projectionMatrix, cam.matrixWorldInverse);
    const e = cam.matrixWorld.elements;
    this.camPos = v3(e[12]!, e[13]!, e[14]!);
  }
  /** World -> logical screen px (y down) and clip w (depth); null behind the camera. */
  p(p: P3): SP | null {
    const v = this.v.set(p.x, p.y, p.z, 1).applyMatrix4(this.m);
    if (v.w <= 0.02) return null;
    return { x: (v.x / v.w * 0.5 + 0.5) * W, y: (0.5 - v.y / v.w * 0.5) * H, w: v.w };
  }
  /**
   * Set a Canvas2D transform so local (u right, v down) px map onto the 3D plane through O spanned by
   * unit vectors X (right) and Y (up), `s` world units per local px (affine approximation at O; keep
   * the drawn thing small relative to its distance, or call per glyph). Returns false if not drawable.
   */
  plane(c: CanvasRenderingContext2D, O: P3, X: P3, Y: P3, s: number, probe = 40): boolean {
    const s0 = this.p(O);
    if (!s0) return false;
    const sx = this.p(add3(O, mul3(X, s * probe))), sy = this.p(add3(O, mul3(Y, -s * probe)));
    if (!sx || !sy) return false;
    const a = (sx.x - s0.x) / probe, b = (sx.y - s0.y) / probe, cc = (sy.x - s0.x) / probe, d = (sy.y - s0.y) / probe;
    if (!isFinite(a + b + cc + d)) return false;
    c.setTransform(a, b, cc, d, s0.x, s0.y);
    return true;
  }
  /** Facing factor of a plane (normal n at P) toward the camera: 1 facing, 0 edge-on, <0 back. */
  facing(P: P3, n: P3) { return dot3(norm3(sub3(this.camPos, P)), n); }
}

/** Screen-space size (px) of one world unit at P (approximately). */
export function pxPerUnit(pr: Projector, P: P3, cam: THREE.PerspectiveCamera) {
  const s = pr.p(P);
  if (!s) return 0;
  return (H / 2) / (Math.tan((cam.fov * Math.PI) / 360) * s.w);
}

/** Integrate a damped pendulum driven by the pivot's horizontal acceleration (pure function of t: re-run from t0). */
export function pendulum(t: number, t0: number, pivotX: (t: number) => number, len: number, damp = 1.6, dt = 1 / 240): number {
  let th = 0, om = 0;
  const g = 9.8 * 0.35;
  const n = Math.max(0, Math.floor((t - t0) / dt));
  let xPrev = pivotX(t0), vPrev = 0;
  for (let i = 1; i <= n; i++) {
    const tt = t0 + i * dt;
    const x = pivotX(tt);
    const v = (x - xPrev) / dt;
    const acc = (v - vPrev) / dt;
    xPrev = x; vPrev = v;
    const alpha = -(g / len) * Math.sin(th) - (clamp(acc, -400, 400) / len) * Math.cos(th) - damp * om;
    om += alpha * dt; th += om * dt;
  }
  return th;
}
