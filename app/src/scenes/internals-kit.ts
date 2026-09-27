// Shared kit for the AI-enthusiast plates (internals, machine): a camera with projection helpers,
// text set on planes in 3D (Canvas2D under a projected affine), an instanced engraved-block material,
// an engraved weight-matrix panel, and small timing helpers.
import * as THREE from 'three';
import { W, H } from '../engine/gl';
import { GLSL_COMMON } from '../engine/glsl/common';
import type { AudioData } from '../engine/audio';
import { norm, type Line, type Word } from '../engine/lyrics';
import { lerp } from '../engine/util';

export type P3 = { x: number; y: number; z: number };
export type RGB = [number, number, number];
export type Proj = { x: number; y: number; s: number; w: number };
export interface CamPose { pos: P3; tgt: P3; roll: number; fov: number }

export const v3 = (x: number, y: number, z: number): P3 => ({ x, y, z });
export const add3 = (a: P3, b: P3): P3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const mul3 = (a: P3, k: number): P3 => ({ x: a.x * k, y: a.y * k, z: a.z * k });
export const lerp3 = (a: P3, b: P3, k: number): P3 => ({ x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), z: lerp(a.z, b.z, k) });
export const orbit = (tgt: P3, yaw: number, pitch: number, dist: number): P3 => ({
  x: tgt.x + Math.sin(yaw) * Math.cos(pitch) * dist,
  y: tgt.y + Math.sin(pitch) * dist,
  z: tgt.z + Math.cos(yaw) * Math.cos(pitch) * dist,
});
export const lerpPose = (a: CamPose, b: CamPose, k: number): CamPose => ({
  pos: lerp3(a.pos, b.pos, k), tgt: lerp3(a.tgt, b.tgt, k), roll: lerp(a.roll, b.roll, k), fov: lerp(a.fov, b.fov, k),
});

/** A perspective camera with CPU projection (for placing 2D type and sparks on 3D points). */
export class Cam3 {
  cam: THREE.PerspectiveCamera;
  vp = new THREE.Matrix4();
  private v4 = new THREE.Vector4();
  constructor(fov = 35, near = 0.05, far = 600) { this.cam = new THREE.PerspectiveCamera(fov, W / H, near, far); }
  set(p: CamPose) {
    const c = this.cam;
    c.fov = p.fov; c.updateProjectionMatrix();
    c.position.set(p.pos.x, p.pos.y, p.pos.z);
    c.up.set(0, 1, 0);
    c.lookAt(p.tgt.x, p.tgt.y, p.tgt.z);
    c.rotateZ(p.roll);
    c.updateMatrixWorld(true);
    this.vp.multiplyMatrices(c.projectionMatrix, c.matrixWorldInverse);
  }
  /** Screen px (logical), `s` = px per world unit at that depth, `w` = view depth. */
  proj(x: number, y: number, z: number): Proj | null {
    const v = this.v4.set(x, y, z, 1).applyMatrix4(this.vp);
    if (v.w <= 0.05) return null;
    const P11 = this.cam.projectionMatrix.elements[5]!;
    return { x: (v.x / v.w * 0.5 + 0.5) * W, y: (0.5 - v.y / v.w * 0.5) * H, s: 0.5 * H * P11 / v.w, w: v.w };
  }
  p(q: P3) { return this.proj(q.x, q.y, q.z); }
  get position(): P3 { const p = this.cam.position; return { x: p.x, y: p.y, z: p.z }; }
}

/**
 * Set a Canvas2D transform so that local px (X right along `u`, Y down along `v`) at `ppu` px per world
 * unit land on the plane through `o` as seen by `cam` (an affine fit through three projected points
 * spanning `span` local px). Returns false if the plane is behind the camera or seen edge-on.
 */
export function planeTransform(c: CanvasRenderingContext2D, cam: Cam3, o: P3, u: P3, v: P3, ppu: number, span = 200): boolean {
  const k = span / ppu;
  const p0 = cam.p(o), pu = cam.p(add3(o, mul3(u, k))), pv = cam.p(add3(o, mul3(v, k)));
  if (!p0 || !pu || !pv) return false;
  const a = (pu.x - p0.x) / span, b = (pu.y - p0.y) / span, cc = (pv.x - p0.x) / span, d = (pv.y - p0.y) / span;
  if (Math.abs(a * d - b * cc) < 1e-4) return false;
  c.setTransform(a, b, cc, d, p0.x, p0.y);
  return true;
}

// ------------------------------------------------------------------ engraved instanced blocks

const BLOCK_VERT = /* glsl */ `
precision highp float;
in vec3 position; in vec3 normal;
in vec3 iPos; in vec3 iSize; in vec4 iRot; in vec4 iData; // heat, fade, style, seed
uniform mat4 viewMatrix; uniform mat4 projectionMatrix;
out vec3 vLocal; out vec3 vSize; out vec3 vN; out vec4 vData; out vec3 vW;
vec3 qrot(vec4 q, vec3 v) { return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v); }
void main() {
  vLocal = position; vSize = iSize; vData = iData;
  vec3 p = qrot(iRot, position * iSize) + iPos;
  vN = qrot(iRot, normal);
  vW = p;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;

const BLOCK_FRAG = /* glsl */ `
precision highp float;
precision highp int;
in vec3 vLocal; in vec3 vSize; in vec3 vN; in vec4 vData; in vec3 vW;
out vec4 fragColor;
${GLSL_COMMON}
uniform vec3 uLight; uniform vec3 uCam; uniform vec3 uBg; uniform float uFogStart, uFogLen, uFreq, uEdge, uFill, uHatch, uHeatTop;
void main() {
  vec3 n = normalize(vN);
  float lam = 0.18 + 0.82 * sat(dot(n, uLight));
  float heatK = vData.x, fade = vData.y, style = vData.z, seed = vData.w;
  // style + 3: heat on every face even when uHeatTop is set
  float heatTop = uHeatTop;
  if (style > 2.5) { style -= 3.0; heatTop = 0.0; }
  // face-local coords (world units) for the engraving
  vec3 an = abs(vLocal) * 2.0;
  vec2 fuv; float faceAxis;
  if (an.x > an.y && an.x > an.z) { fuv = vec2(vLocal.z * vSize.z, vLocal.y * vSize.y); faceAxis = 0.0; }
  else if (an.y > an.z) { fuv = vec2(vLocal.x * vSize.x, vLocal.z * vSize.z); faceAxis = 1.0; }
  else { fuv = vec2(vLocal.x * vSize.x, vLocal.y * vSize.y); faceAxis = 2.0; }
  // edges: distance to the nearest edge = the median of the distances to the three face pairs
  vec3 d = (0.5 - abs(vLocal)) * vSize;
  float med = max(min(d.x, d.y), min(max(d.x, d.y), d.z));
  float fw = max(fwidth(med), 1e-6);
  float edge = pxLine(med / fw, 0.35, 1.35);
  float ang = faceAxis == 1.0 ? 0.785 : (faceAxis == 0.0 ? 1.35 : -0.25);
  vec2 r = rot2(ang) * fuv * uFreq;
  float hd = lam * 0.62 * uHatch;
  // sub-pixel hatching would average to ~50 % grey: fade to its true mean coverage instead
  float hk = mix(hatch(r.y + seed * 7.0, hd), hd, smoothstep(0.2, 0.6, fwidth(r.y) * PX_SCALE));
  vec3 col;
  if (style < 0.5) {
    // bone engraving on ink
    col = C_INK2 * (0.35 + 0.5 * lam) * uFill + C_BONE * hk * 0.30 * lam + C_BONE * edge * uEdge;
  } else if (style < 1.5) {
    // cyanotype slab: cobalt paper on the top and the front, engraved ink on the other faces
    bool paper = (faceAxis == 1.0 && n.y > 0.0) || (faceAxis == 2.0 && n.z > 0.0);
    if (paper) {
      vec2 g = fuv * 2.0;
      float gl = max(pxLine(abs(fract(g.x + 0.5) - 0.5) / max(fwidth(g.x), 1e-5), 0.0, 1.0), pxLine(abs(fract(g.y + 0.5) - 0.5) / max(fwidth(g.y), 1e-5), 0.0, 1.0));
      float front = faceAxis == 2.0 ? 1.0 : 0.0;
      col = C_COBALT * mix(0.9 + 0.2 * lam, 0.62 + 0.12 * lam, front) + C_BONE * gl * mix(0.05, 0.028, front) + C_BONE * edge * uEdge * 1.1;
    } else {
      col = C_INK2 * (0.4 + 0.5 * lam) + C_BONE * hk * 0.12 * lam + C_BONE * edge * uEdge;
    }
  } else {
    // solid bone (blocks being assembled)
    col = mix(C_ASH * 0.35, C_BONE * 0.8, lam) * (0.55 + 0.45 * hk) + C_BONE * edge * 0.4;
  }
  // heat: rust -> gold -> white-hot (the part being built right now)
  if (heatK > 0.001) {
    float k = sat(heatK) * mix(1.0, (faceAxis == 1.0 && n.y > 0.0) ? 1.0 : 0.22, heatTop);
    vec3 hc = mix(C_SIGNAL, C_EMBER, smoothstep(0.55, 1.0, k)) * (0.55 + 0.7 * lam);
    col = mix(col, hc * (0.75 + 0.25 * hk), smoothstep(0.0, 0.65, k)) + C_EMBER * edge * k * 0.8;
    col += C_EMBER * smoothstep(0.8, 1.6, heatK) * 1.5;
  }
  float dist = length(vW - uCam);
  float fog = exp(-max(dist - uFogStart, 0.0) / uFogLen);
  col = mix(uBg, col, fog * fade);
  fragColor = vec4(col, 1.0);
}`;

export interface BlockOpts { freq?: number; edge?: number; fill?: number; hatch?: number; heatTop?: boolean }

/** Instanced engraved boxes: set per-instance pos/size/rotation/data each frame with `set()`, then `render()`. */
export class Blocks {
  scene = new THREE.Scene();
  geo: THREE.InstancedBufferGeometry;
  mat: THREE.RawShaderMaterial;
  mesh: THREE.Mesh;
  count = 0;
  private pos: Float32Array; private size: Float32Array; private rot: Float32Array; private data: Float32Array;
  private attrs: THREE.InstancedBufferAttribute[];
  constructor(public capacity: number, o: BlockOpts = {}) {
    const box = new THREE.BoxGeometry(1, 1, 1);
    this.geo = new THREE.InstancedBufferGeometry();
    this.geo.setAttribute('position', box.getAttribute('position'));
    this.geo.setAttribute('normal', box.getAttribute('normal'));
    this.geo.setIndex(box.getIndex());
    this.pos = new Float32Array(capacity * 3); this.size = new Float32Array(capacity * 3);
    this.rot = new Float32Array(capacity * 4); this.data = new Float32Array(capacity * 4);
    this.attrs = [
      new THREE.InstancedBufferAttribute(this.pos, 3), new THREE.InstancedBufferAttribute(this.size, 3),
      new THREE.InstancedBufferAttribute(this.rot, 4), new THREE.InstancedBufferAttribute(this.data, 4),
    ];
    this.attrs.forEach((a) => a.setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('iPos', this.attrs[0]!); this.geo.setAttribute('iSize', this.attrs[1]!);
    this.geo.setAttribute('iRot', this.attrs[2]!); this.geo.setAttribute('iData', this.attrs[3]!);
    this.mat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: BLOCK_VERT, fragmentShader: BLOCK_FRAG,
      uniforms: {
        uLight: { value: new THREE.Vector3(-0.45, 0.8, 0.4).normalize() }, uCam: { value: new THREE.Vector3() },
        uBg: { value: new THREE.Vector3(0, 0, 0) }, uFogStart: { value: 20 }, uFogLen: { value: 30 },
        uFreq: { value: o.freq ?? 14 }, uEdge: { value: o.edge ?? 0.8 }, uFill: { value: o.fill ?? 1 }, uHatch: { value: o.hatch ?? 1 }, uHeatTop: { value: o.heatTop ? 1 : 0 },
      },
      depthTest: true, depthWrite: true,
    });
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
  }
  get u() { return this.mat.uniforms; }
  clear() { this.count = 0; }
  /** Add a box centred at p with full size s; q = quaternion [x,y,z,w]; heat 0..2; fade 0..1 (to the fog colour); style 0 bone/ink, 1 cobalt slab, 2 solid bone (+3: heat on all faces with heatTop). */
  add(p: P3, s: P3, heat = 0, fade = 1, style = 0, seed = 0, q: [number, number, number, number] = [0, 0, 0, 1]) {
    if (this.count >= this.capacity) return;
    const i = this.count++;
    this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
    this.size[i * 3] = s.x; this.size[i * 3 + 1] = s.y; this.size[i * 3 + 2] = s.z;
    this.rot[i * 4] = q[0]; this.rot[i * 4 + 1] = q[1]; this.rot[i * 4 + 2] = q[2]; this.rot[i * 4 + 3] = q[3];
    this.data[i * 4] = heat; this.data[i * 4 + 1] = fade; this.data[i * 4 + 2] = style; this.data[i * 4 + 3] = seed;
  }
  render(renderer: THREE.WebGLRenderer, out: THREE.WebGLRenderTarget, cam: Cam3, bg: RGB, fogStart: number, fogLen: number) {
    for (const a of this.attrs) { a.needsUpdate = true; a.addUpdateRange(0, this.count * a.itemSize); }
    this.geo.instanceCount = this.count;
    const u = this.mat.uniforms;
    (u.uCam!.value as THREE.Vector3).copy(cam.cam.position);
    (u.uBg!.value as THREE.Vector3).set(bg[0], bg[1], bg[2]);
    u.uFogStart!.value = fogStart; u.uFogLen!.value = fogLen;
    if (this.count > 0) { renderer.setRenderTarget(out); renderer.render(this.scene, cam.cam); }
    for (const a of this.attrs) a.clearUpdateRanges();
  }
}

/** Quaternion [x,y,z,w] for a rotation of `a` radians about a unit axis. */
export const quatAxis = (ax: number, ay: number, az: number, a: number): [number, number, number, number] => {
  const s = Math.sin(a / 2), l = Math.hypot(ax, ay, az) || 1;
  return [(ax / l) * s, (ay / l) * s, (az / l) * s, Math.cos(a / 2)];
};
export const quatMul = (a: [number, number, number, number], b: [number, number, number, number]): [number, number, number, number] => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];

// ------------------------------------------------------------------ engraved weight matrix panels

const PANEL_VERT = /* glsl */ `
precision highp float;
in vec3 position; in vec2 uv;
uniform mat4 modelViewMatrix; uniform mat4 projectionMatrix;
out vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const PANEL_FRAG = /* glsl */ `
precision highp float;
precision highp int;
in vec2 vUv;
out vec4 fragColor;
${GLSL_COMMON}
uniform vec2 uCells; uniform float uSeed, uT, uAlpha, uHotRow, uHotCol, uHot, uReveal, uSweep;
void main() {
  vec2 g = vUv * uCells;
  vec2 cell = floor(g), f = fract(g);
  // a weight in [-1, 1]: smooth low-rank structure plus noise (real weight matrices are not white noise)
  float w = 0.55 * sin(cell.x * 0.37 + uSeed) * sin(cell.y * 0.29 - uSeed * 1.7) + 0.45 * (hash12(cell + uSeed * 13.1) * 2.0 - 1.0);
  w += 0.12 * sin(uT * 1.3 + cell.x * 0.21 + cell.y * 0.13);
  float mag = sat(abs(w));
  // each cell engraved: hatch density = |w|, direction = sign(w)
  vec2 q = (f - 0.5);
  float ang = w > 0.0 ? 0.785 : -0.785;
  float u = (rot2(ang) * g).y * 3.0;
  float hk = hatch(u, mag * 0.75);
  float inside = step(abs(q.x), 0.42) * step(abs(q.y), 0.42);
  float grid = pxLine((0.5 - max(abs(q.x), abs(q.y))) / max(fwidth(g.x), 1e-5), 0.0, 1.0);
  // frame
  vec2 e = min(vUv, 1.0 - vUv) / max(fwidth(vUv), 1e-6);
  float frame = pxLine(min(e.x, e.y), 0.5, 1.6);
  float reveal = step(vUv.x + (1.0 - vUv.y) * 0.3, uReveal * 1.3);
  vec3 col = C_BONE * (hk * inside * 0.55 + grid * 0.10) + C_BONE * frame * 0.8;
  // hot row/column (the token being processed) and a gold sweep (the forward pass)
  float hr = 1.0 - step(0.5, abs(cell.y - uHotRow));
  float hcl = 1.0 - step(0.5, abs(cell.x - uHotCol));
  float hot = max(hr, hcl) * uHot;
  float sw = exp(-abs(vUv.x - uSweep) * 30.0) * step(0.0, uSweep) * step(uSweep, 1.0);
  col = mix(col, C_SIGNAL * (1.2 + 0.8 * hk) * inside + C_EMBER * frame, sat(hot * (0.4 + mag)));
  col += C_SIGNAL * sw * (0.4 + 1.6 * hk * inside);
  float a = uAlpha * reveal;
  fragColor = vec4(col * a, 0.0);
}`;

/** An engraved weight matrix on a plane (additive), local XY, centred, `w`×`h` world units. */
export class MatrixPanel {
  mesh: THREE.Mesh;
  mat: THREE.RawShaderMaterial;
  constructor(public w: number, public h: number, cols: number, rows: number, seed: number) {
    this.mat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: PANEL_VERT, fragmentShader: PANEL_FRAG,
      uniforms: {
        uCells: { value: new THREE.Vector2(cols, rows) }, uSeed: { value: seed }, uT: { value: 0 }, uAlpha: { value: 1 },
        uHotRow: { value: -9 }, uHotCol: { value: -9 }, uHot: { value: 0 }, uReveal: { value: 1 }, uSweep: { value: -1 },
      },
      transparent: true, depthTest: true, depthWrite: false, side: THREE.DoubleSide,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), this.mat);
    this.mesh.frustumCulled = false;
  }
  get u() { return this.mat.uniforms; }
}

// ------------------------------------------------------------------ timing

/** Beat times in [t0, t1). */
export function beatsIn(au: AudioData, t0: number, t1: number): number[] {
  const out: number[] = [];
  const i0 = Math.ceil(au.beatAt(t0) - 1e-6);
  for (let i = i0; i < i0 + 400; i++) {
    const t = au.timeOfBeat(i);
    if (t >= t1) break;
    if (t >= t0 - 1e-6) out.push(t);
  }
  return out;
}
/** The last beat at or before t (+tol). */
export const beatBefore = (au: AudioData, t: number, tol = 0.05) => au.timeOfBeat(Math.floor(au.beatAt(t + tol)));

export function findWord(line: Line, q: string, from = 0): Word {
  const n = norm(q);
  for (let i = from; i < line.words.length; i++) if (norm(line.words[i]!.w) === n) return line.words[i]!;
  throw new Error(`word not found: ${q} in "${line.text}"`);
}

/** Number with thin-space thousands grouping (1,204,000). */
export const grouped = (n: number) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/** Heat → CSS colour for freshly made glyphs: white-hot → gold → bone as it cools. */
export function heatCss(heat: number, alpha: number, cool: 'bone' | 'signal' = 'bone') {
  const h = Math.max(0, Math.min(1, heat));
  const end = cool === 'bone' ? [236, 234, 228] : [255, 176, 32];
  let r: number, g: number, b: number;
  if (h > 0.5) { const k = (h - 0.5) * 2; r = lerp(255, 255, k); g = lerp(176, 244, k); b = lerp(32, 214, k); }
  else { const k = h * 2; r = lerp(end[0]!, 255, k); g = lerp(end[1]!, 176, k); b = lerp(end[2]!, 32, k); }
  return `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${alpha})`;
}
