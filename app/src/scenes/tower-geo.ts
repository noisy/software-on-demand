// THE TOWER ("BIG SOFTWARE CO.") — one geometry for both of its plates (A2):
//  - oldworld draws it as a cyanotype blueprint (bone lines on cobalt), extruding floor by floor;
//  - glass renders the very same slab as real glass at night, and breaks it.
// Plus the small 3D kit both plates share: a segment list for LineBatch (static geometry, clipped reveals),
// text on planes in 3D (Label3D: typed / wiped / stamped), single-stroke technical lettering in 3D, a camera aim.
import * as THREE from 'three';
import { F, font, layout } from '../engine/type';
import { strokeText, type StrokeFontName } from '../engine/stroke';
import { LIN } from '../engine/palette';
import { GLSL_COMMON } from '../engine/glsl/common';
import { SCALE } from '../engine/scale';
import type { LineBatch } from '../engine/lines';
import type { Line } from '../engine/lyrics';

export type V3 = [number, number, number];
export type RGB = [number, number, number];
export const lin = (k: keyof typeof LIN, s = 1): RGB => [LIN[k][0] * s, LIN[k][1] * s, LIN[k][2] * s];
export const v3add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const v3sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const v3mul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
export const v3lerp = (a: V3, b: V3, k: number): V3 => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];

// ------------------------------------------------------------------ the tower (world units ~ metres / 4)
/** Footprint centred on the origin, front face at z = +D/2, ground at y = 0. */
export const TOWER = {
  W: 10, // x extent
  D: 7, // z extent
  LOBBY: 4.5, // double-height lobby
  FLOORS: 40,
  FH: 1.5, // floor-to-floor
  BAYS_X: 8, // front/back bays
  BAYS_Z: 5, // side bays
  CROWN_H: 4.0, // crown sign frame above the roof
  CROWN_HW: 6.6, // the sign overhangs the slab
  MAST: 9, // mast above the crown (at the back)
  NAME: 'BIG SOFTWARE CO.',
  get ROOF() { return this.LOBBY + this.FLOORS * this.FH; },
  get TOP() { return this.ROOF + this.CROWN_H; },
  /** Lobby door opening (front face), x half-width and height. */
  DOOR_HW: 1.9,
  DOOR_H: 3.2,
};
/** y of the underside of floor k (k = 0 is the lobby floor at 0; 1..FLOORS above the lobby; FLOORS + 1 = the roof). */
export const floorY = (k: number) => (k <= 0 ? 0 : TOWER.LOBBY + (k - 1) * TOWER.FH);
/** Floor index at height y (fractional). */
export const floorAt = (y: number) => (y < TOWER.LOBBY ? y / TOWER.LOBBY : 1 + (y - TOWER.LOBBY) / TOWER.FH);

/** A window cell on the front face: bay i (0..BAYS_X-1), floor k (1..FLOORS). Centre, half sizes. */
export function frontCell(i: number, k: number) {
  const bw = TOWER.W / TOWER.BAYS_X;
  return { x: -TOWER.W / 2 + (i + 0.5) * bw, y: floorY(k) + TOWER.FH / 2, z: TOWER.D / 2, hw: bw / 2, hh: TOWER.FH / 2 };
}

// ------------------------------------------------------------------ segment lists
/**
 * Static line geometry for a LineBatch: segments with width, linear colour, alpha and a free tag (e.g. a
 * reveal time or a group id). Built once in init(), emitted every frame with optional clipping/fading.
 */
export class SegList {
  d: number[] = [];
  get n() { return this.d.length / 12; }
  seg(a: V3, b: V3, w: number, c: RGB, al = 1, tag = 0) {
    this.d.push(a[0], a[1], a[2], b[0], b[1], b[2], w, c[0], c[1], c[2], al, tag);
  }
  poly(pts: V3[], w: number, c: RGB, al = 1, tag = 0, closed = false) {
    for (let i = 1; i < pts.length; i++) this.seg(pts[i - 1]!, pts[i]!, w, c, al, tag);
    if (closed && pts.length > 2) this.seg(pts[pts.length - 1]!, pts[0]!, w, c, al, tag);
  }
  /** Dashed segment (blueprint hidden / centre lines): dash, gap in world units; `dot` adds a dot per gap (centre line). */
  dashed(a: V3, b: V3, dash: number, gap: number, w: number, c: RGB, al = 1, tag = 0, dot = false) {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const dir = v3mul(v3sub(b, a), 1 / Math.max(1e-6, L));
    for (let s = 0; s < L; s += dash + gap) {
      const e = Math.min(L, s + dash);
      this.seg(v3add(a, v3mul(dir, s)), v3add(a, v3mul(dir, e)), w, c, al, tag);
      if (dot && e + gap * 0.5 < L) {
        const m = e + gap * 0.5;
        this.seg(v3add(a, v3mul(dir, m - 0.02)), v3add(a, v3mul(dir, m + 0.02)), w, c, al, tag);
      }
    }
  }
  /** Circle in the plane spanned by unit vectors u, v around centre c. */
  circle(cn: V3, r: number, u: V3, v: V3, w: number, c: RGB, al = 1, tag = 0, n = 32, a0 = 0, a1 = Math.PI * 2) {
    const pts: V3[] = [];
    for (let i = 0; i <= n; i++) {
      const a = a0 + (a1 - a0) * (i / n);
      pts.push(v3add(cn, v3add(v3mul(u, Math.cos(a) * r), v3mul(v, Math.sin(a) * r))));
    }
    this.poly(pts, w, c, al, tag);
  }
  freeze() { return new Float32Array(this.d); }
}

export interface EmitOpts {
  /** Clip everything above this y (extrusion reveal). */
  clipY?: number;
  /** Only segments with tag <= maxTag (e.g. reveal time). */
  maxTag?: number;
  /** Multiply alpha / colour. */
  alpha?: number;
  gain?: number;
  /** Replace colour. */
  color?: RGB;
  /** Per-point transform (world). */
  xf?: (x: number, y: number, z: number, out: V3) => void;
  /** Translate. */
  off?: V3;
  /** Width multiplier. */
  widthK?: number;
  /** Per-tag brightness (0 skips the segment). */
  tagGain?: (tag: number) => number;
}
const _pa: V3 = [0, 0, 0], _pb: V3 = [0, 0, 0];
/** Emit a frozen segment list into a LineBatch. */
export function emitSegs(lb: LineBatch, d: Float32Array, o: EmitOpts = {}) {
  const clipY = o.clipY ?? Infinity, maxTag = o.maxTag ?? Infinity, A = o.alpha ?? 1, G = o.gain ?? 1, wk = o.widthK ?? 1;
  const ox = o.off?.[0] ?? 0, oy = o.off?.[1] ?? 0, oz = o.off?.[2] ?? 0;
  const tg = o.tagGain;
  for (let i = 0; i < d.length; i += 12) {
    if (d[i + 11]! > maxTag) continue;
    const kg = tg ? tg(d[i + 11]!) : 1;
    if (kg <= 0) continue;
    let ax = d[i]!, ay = d[i + 1]!, az = d[i + 2]!, bx = d[i + 3]!, by = d[i + 4]!, bz = d[i + 5]!;
    if (ay > clipY && by > clipY) continue;
    if (ay > clipY || by > clipY) {
      const u = (clipY - ay) / (by - ay);
      const cx = ax + (bx - ax) * u, cz = az + (bz - az) * u;
      if (ay > clipY) { ax = cx; ay = clipY; az = cz; } else { bx = cx; by = clipY; bz = cz; }
    }
    if (o.xf) { o.xf(ax, ay, az, _pa); o.xf(bx, by, bz, _pb); ax = _pa[0]; ay = _pa[1]; az = _pa[2]; bx = _pb[0]; by = _pb[1]; bz = _pb[2]; }
    const r = o.color ? o.color[0] : d[i + 7]!, g = o.color ? o.color[1] : d[i + 8]!, b = o.color ? o.color[2] : d[i + 9]!;
    lb.seg(ax + ox, ay + oy, az + oz, bx + ox, by + oy, bz + oz, d[i + 6]! * wk, r * G * kg, g * G * kg, b * G * kg, d[i + 10]! * A);
  }
}

// ------------------------------------------------------------------ single-stroke lettering in 3D
/**
 * Technical lettering (a stroke font) laid on a plane: origin = left baseline (or per `align`), `right` and `up`
 * unit vectors, cap height capH (world). Returns the segments added and the world width.
 */
export function strokeLabel(sl: SegList, text: string, origin: V3, right: V3, up: V3, capH: number, w: number, c: RGB, al = 1, o: { font?: StrokeFontName; align?: number; tag?: number; tracking?: number } = {}) {
  const st = strokeText(text, o.font ?? 'tech', 100, (o.tracking ?? 0) * 100);
  const k = capH / Math.max(1e-3, st.capHeight);
  const ox = -st.width * k * (o.align ?? 0);
  for (let si = 0; si < st.strokes.length; si++) {
    const s = st.strokes[si]!;
    const tag = o.tag ?? 0;
    for (let i = 1; i < s.length; i++) {
      const p = s[i - 1]!, q = s[i]!;
      const P = v3add(origin, v3add(v3mul(right, ox + p.x * k), v3mul(up, -p.y * k)));
      const Q = v3add(origin, v3add(v3mul(right, ox + q.x * k), v3mul(up, -q.y * k)));
      sl.seg(P, Q, w, c, al, tag);
    }
  }
  return st.width * k;
}

/** Per-character [start, end] times for a lyric line (spaces take the gap), for writtenLength(). */
export function lineCharTimes(l: Line, text = l.text): [number, number][] {
  const out: [number, number][] = [];
  let wi = 0, ci = 0;
  const chars = Array.from(text);
  let wordChars = Array.from(l.words[0]?.w ?? '');
  for (let i = 0; i < chars.length; i++) {
    const w = l.words[Math.min(wi, l.words.length - 1)]!;
    if (chars[i] === ' ') {
      const nx = l.words[wi + 1];
      out.push([w.end, nx ? nx.start : w.end]);
      wi++; ci = 0; wordChars = Array.from(l.words[wi]?.w ?? '');
      continue;
    }
    const n = Math.max(1, wordChars.length);
    const a = w.start + (w.end - w.start) * (ci / n), b = w.start + (w.end - w.start) * ((ci + 1) / n);
    out.push([a, b]);
    ci++;
  }
  return out;
}

// ------------------------------------------------------------------ text on planes (Label3D)
const LABEL_VERT = /* glsl */ `
precision highp float;
in vec3 position; in vec2 uv;
uniform mat4 projectionMatrix; uniform mat4 modelViewMatrix; uniform mat4 modelMatrix;
out vec2 vUv; out float vWy;
void main() { vUv = uv; vWy = (modelMatrix * vec4(position, 1.0)).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const LABEL_FRAG = /* glsl */ `
precision highp float;
in vec2 vUv; in float vWy;
out vec4 fragColor;
${GLSL_COMMON}
uniform sampler2D map;
uniform float clipY;        // world-space extrusion clip (built idiom): hidden above
uniform float u0, u1;       // ink extent in uv.x
uniform float reveal;       // hard cut (typed / built): visible where u <= reveal
uniform float wipe;         // soft sung progress: colB where sung, colA where not
uniform float feather;
uniform vec3 colA; uniform float alA;
uniform vec3 colB; uniform float alB;
uniform float grain;        // rubber-stamp voids 0..1
uniform float seed;
uniform float opacity;
void main() {
  float cov = texture(map, vUv).r;
  float u = (vUv.x - u0) / max(1e-4, u1 - u0);
  if (u > reveal || vWy > clipY) discard;
  if (grain > 0.0) {
    vec2 p = vUv * vec2((u1 - u0) * 60.0, 12.0) + seed * 17.0;
    float n = snoise(p * 1.3) * 0.55 + snoise(p * 4.1) * 0.3 + snoise(p * 11.0) * 0.15;
    cov *= smoothstep(-0.75, -0.35, n + (1.0 - grain) * 0.9);
    cov *= 0.82 + 0.18 * smoothstep(-0.5, 0.5, snoise(p * 0.4));
  }
  float e = wipe * (1.0 + feather);
  float sung = wipe >= 1.0 ? 1.0 : wipe <= 0.0 ? 0.0 : 1.0 - smoothstep(e - feather, e, u);
  vec3 c = mix(colA, colB, sung);
  float a = mix(alA, alB, sung) * cov * opacity;
  if (a <= 0.001) discard;
  fragColor = vec4(c * a, a);
}`;

export interface LabelOpts {
  capH: number; // world cap height
  px?: number; // texture px per em (before SCALE)
  ax?: number; // 0 left .. 1 right of the ink box
  ay?: number; // 0 baseline .. 1 cap top
  tracking?: number; // em
  depthTest?: boolean;
}

/**
 * A line of text on a plane in 3D (local XY, facing +Z, anchored per ax/ay). `set()` drives typed reveals
 * (`reveal`), karaoke wipes (`wipe`, colA -> colB) and a rubber-stamp texture (`grain`).
 */
export class Label3D {
  mesh: THREE.Mesh;
  mat: THREE.RawShaderMaterial;
  tex: THREE.CanvasTexture;
  w: number; h: number;
  /** Right edge of glyph i as a fraction of the ink box (for typed reveals). */
  glyphEnd: number[] = [];
  /** Left edge (world, from the ink box's left) of glyph i. */
  glyphX: number[] = [];
  text: string;
  constructor(text: string, family: string, o: LabelOpts) {
    this.text = text;
    const px = (o.px ?? 180) * SCALE;
    const tr = (o.tracking ?? 0) * px;
    const cv = document.createElement('canvas');
    const c0 = cv.getContext('2d')!;
    c0.font = font(family, px);
    c0.letterSpacing = `${tr}px`;
    const m = c0.measureText(text);
    const cap = c0.measureText('H').actualBoundingBoxAscent;
    const asc = Math.max(m.actualBoundingBoxAscent, cap), desc = Math.max(0, m.actualBoundingBoxDescent);
    const inkL = -m.actualBoundingBoxLeft, inkR = m.actualBoundingBoxRight;
    const pad = Math.ceil(px * 0.06);
    const Wc = Math.ceil(inkR - inkL + pad * 2), Hc = Math.ceil(asc + desc + pad * 2);
    cv.width = Wc; cv.height = Hc;
    const c = cv.getContext('2d')!;
    c.fillStyle = '#000'; c.fillRect(0, 0, Wc, Hc);
    c.font = font(family, px);
    c.letterSpacing = `${tr}px`;
    c.textBaseline = 'alphabetic';
    c.fillStyle = '#fff';
    const bx = pad - inkL, by = pad + asc;
    c.fillText(text, bx, by);
    this.tex = new THREE.CanvasTexture(cv);
    this.tex.colorSpace = THREE.NoColorSpace;
    this.tex.generateMipmaps = true;
    this.tex.minFilter = THREE.LinearMipmapLinearFilter;
    this.tex.magFilter = THREE.LinearFilter;
    this.tex.anisotropy = 8;
    const s = o.capH / cap;
    this.w = (inkR - inkL) * s;
    this.h = o.capH;
    const lay = layout(text, family, px, tr);
    const inkW = Math.max(1, inkR - inkL);
    for (const g of lay.glyphs) {
      this.glyphEnd.push((g.x + g.w - inkL) / inkW);
      this.glyphX.push((g.x - inkL) * s);
    }
    const gw = Wc * s, gh = Hc * s;
    const geo = new THREE.PlaneGeometry(gw, gh);
    const ax = o.ax ?? 0.5, ay = o.ay ?? 0.5;
    const axPx = pad + (inkR - inkL) * ax;
    const ayPx = by - cap * ay;
    geo.translate(gw / 2 - axPx * s, -(gh / 2 - ayPx * s), 0);
    this.mat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: LABEL_VERT, fragmentShader: LABEL_FRAG,
      uniforms: {
        map: { value: this.tex }, u0: { value: pad / Wc }, u1: { value: (Wc - pad) / Wc },
        reveal: { value: 2 }, wipe: { value: 0 }, feather: { value: 0.06 },
        colA: { value: new THREE.Vector3(...LIN.bone) }, alA: { value: 1 },
        colB: { value: new THREE.Vector3(...LIN.signal) }, alB: { value: 1 },
        grain: { value: 0 }, seed: { value: 0 }, opacity: { value: 1 }, clipY: { value: 1e9 },
      },
      transparent: true, depthTest: o.depthTest ?? true, depthWrite: false, side: THREE.DoubleSide,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
  }
  get u() { return this.mat.uniforms; }
  /** Reveal the first n glyphs (typed), fractional n reveals nothing extra (hard steps). */
  revealGlyphs(n: number) {
    const k = Math.floor(n);
    this.u.reveal!.value = k <= 0 ? -1 : k >= this.glyphEnd.length ? 2 : this.glyphEnd[k - 1]! + 1e-4;
  }
  set(o: { colA?: RGB; alA?: number; colB?: RGB; alB?: number; wipe?: number; reveal?: number; grain?: number; seed?: number; opacity?: number; feather?: number; clipY?: number }) {
    const u = this.u;
    if (o.clipY !== undefined) u.clipY!.value = o.clipY;
    if (o.colA) (u.colA!.value as THREE.Vector3).set(...o.colA);
    if (o.colB) (u.colB!.value as THREE.Vector3).set(...o.colB);
    if (o.alA !== undefined) u.alA!.value = o.alA;
    if (o.alB !== undefined) u.alB!.value = o.alB;
    if (o.wipe !== undefined) u.wipe!.value = o.wipe;
    if (o.reveal !== undefined) u.reveal!.value = o.reveal;
    if (o.grain !== undefined) u.grain!.value = o.grain;
    if (o.seed !== undefined) u.seed!.value = o.seed;
    if (o.opacity !== undefined) u.opacity!.value = o.opacity;
    if (o.feather !== undefined) u.feather!.value = o.feather;
  }
  /** Place the plane: position, and its local axes from right/up vectors (normal = right x up). */
  place(pos: V3, right: V3 = [1, 0, 0], up: V3 = [0, 1, 0], scale = 1) {
    const r = new THREE.Vector3(...right).normalize(), u = new THREE.Vector3(...up).normalize();
    const n = new THREE.Vector3().crossVectors(r, u).normalize();
    const m = new THREE.Matrix4().makeBasis(r, u, n);
    this.mesh.quaternion.setFromRotationMatrix(m);
    this.mesh.position.set(...pos);
    this.mesh.scale.setScalar(scale);
    this.mesh.updateMatrixWorld();
  }
}
export { F };

// ------------------------------------------------------------------ camera
/** Aim a perspective camera: position, look-at target, vertical fov (deg), roll (rad). */
export function aim(cam: THREE.PerspectiveCamera, pos: V3, target: V3, fov: number, roll = 0) {
  cam.fov = fov;
  cam.position.set(pos[0], pos[1], pos[2]);
  cam.up.set(0, 1, 0);
  cam.lookAt(target[0], target[1], target[2]);
  if (roll) cam.rotateZ(roll);
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld();
}
const _pv = new THREE.Vector3();
/** World -> logical screen px (y down); z > 1 or w < 0 means behind. */
export function toScreen(cam: THREE.Camera, p: V3, W = 1920, H = 1080) {
  _pv.set(p[0], p[1], p[2]).project(cam);
  const behind = _pv.z > 1;
  return { x: (_pv.x * 0.5 + 0.5) * W, y: (0.5 - _pv.y * 0.5) * H, behind };
}

// ------------------------------------------------------------------ the tower as a blueprint
/**
 * The tower's blueprint line drawing (world space, footprint centred on the origin). Tag = floor index the
 * segment belongs to (for floor-by-floor extrusion); annotations get tag 99. Colours are bone at blueprint
 * weights: edges heavy, floor lines medium, mullions light.
 */
export function towerBlueprint(): { body: Float32Array; notes: Float32Array } {
  const T = TOWER, hx = T.W / 2, hz = T.D / 2;
  const body = new SegList(), notes = new SegList();
  const EDGE = lin('bone', 0.78), MID = lin('bone', 0.62), LIGHT = lin('bone', 0.5);
  const corners: [number, number][] = [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]];
  // corner columns (per floor, so the extrusion clip reveals them floor by floor)
  for (let k = 0; k <= T.FLOORS; k++) {
    const y0 = floorY(k), y1 = floorY(k + 1);
    for (const [x, z] of corners) body.seg([x, y0, z], [x, y1, z], 2.4, EDGE, 1, k);
  }
  // floor plates
  for (let k = 0; k <= T.FLOORS + 1; k++) {
    const y = floorY(k);
    const heavy = k === 0 || k === 1 || k === T.FLOORS + 1 || k % 10 === 1;
    for (let i = 0; i < 4; i++) {
      const [ax, az] = corners[i]!, [bx, bz] = corners[(i + 1) % 4]!;
      body.seg([ax, y, az], [bx, y, bz], heavy ? 2.0 : 1.1, heavy ? EDGE : MID, heavy ? 1 : 0.85, k);
    }
  }
  // mullions on all four faces
  for (let k = 1; k <= T.FLOORS; k++) {
    const y0 = floorY(k), y1 = floorY(k + 1);
    for (let i = 1; i < T.BAYS_X; i++) {
      const x = -hx + (i * T.W) / T.BAYS_X;
      body.seg([x, y0, hz], [x, y1, hz], 0.9, LIGHT, 0.8, k);
      body.seg([x, y0, -hz], [x, y1, -hz], 0.9, LIGHT, 0.5, k);
    }
    for (let i = 1; i < T.BAYS_Z; i++) {
      const z = -hz + (i * T.D) / T.BAYS_Z;
      body.seg([hx, y0, z], [hx, y1, z], 0.9, LIGHT, 0.7, k);
      body.seg([-hx, y0, z], [-hx, y1, z], 0.9, LIGHT, 0.7, k);
    }
  }
  // lobby: entrance, canopy, fins
  {
    const z = hz;
    body.poly([[-T.DOOR_HW, 0, z], [-T.DOOR_HW, T.DOOR_H, z], [T.DOOR_HW, T.DOOR_H, z], [T.DOOR_HW, 0, z]], 1.6, EDGE, 1, 0);
    body.seg([0, 0, z], [0, T.DOOR_H, z], 1.0, MID, 0.9, 0);
    // canopy slab
    const cy = T.DOOR_H + 0.35;
    body.poly([[-3, cy, z], [-3, cy, z + 1.6], [3, cy, z + 1.6], [3, cy, z]], 1.4, EDGE, 1, 0);
    body.poly([[-3, cy + 0.2, z], [-3, cy + 0.2, z + 1.6], [3, cy + 0.2, z + 1.6], [3, cy + 0.2, z]], 1.0, MID, 0.8, 0);
    for (const x of [-4.2, -3.4, 3.4, 4.2]) body.seg([x, 0, z], [x, T.LOBBY, z], 1.0, MID, 0.8, 0);
  }
  // crown: parapet, sign truss, mast
  {
    const R = T.ROOF, k = T.FLOORS + 1;
    for (let i = 0; i < 4; i++) {
      const [ax, az] = corners[i]!, [bx, bz] = corners[(i + 1) % 4]!;
      body.seg([ax, R + 0.6, az], [bx, R + 0.6, bz], 1.4, EDGE, 1, k);
    }
    for (const [x, z] of corners) body.seg([x, R, z], [x, R + 0.6, z], 1.4, EDGE, 1, k);
    // sign truss on the front edge
    const z = hz - 0.3, x0 = -T.CROWN_HW, x1 = T.CROWN_HW, y0 = R + 0.8, y1 = T.TOP;
    for (const x of [-hx + 0.6, hx - 0.6]) body.seg([x, R + 0.6, z - 0.6], [x, y0, z - 0.6], 1.2, EDGE, 1, k + 1);
    body.poly([[x0, y0, z], [x0, y1, z], [x1, y1, z], [x1, y0, z]], 1.6, EDGE, 1, k + 1);
    const n = 10;
    for (let i = 0; i < n; i++) {
      const a = x0 + ((x1 - x0) * i) / n, b = x0 + ((x1 - x0) * (i + 1)) / n;
      body.seg([a, y0, z - 0.6], [b, y1, z - 0.6], 0.8, LIGHT, 0.7, k + 1);
      body.seg([a, y1, z - 0.6], [b, y0, z - 0.6], 0.8, LIGHT, 0.7, k + 1);
      body.seg([a, y0, z - 0.6], [a, y1, z - 0.6], 0.8, LIGHT, 0.6, k + 1);
    }
    body.seg([x0, y1, z], [x0, y1, z - 0.6], 0.8, LIGHT, 0.7, k + 1);
    body.seg([x1, y1, z], [x1, y1, z - 0.6], 0.8, LIGHT, 0.7, k + 1);
    // mast
    body.seg([0, R, -hz + 1.5], [0, R + T.MAST, -hz + 1.5], 1.4, EDGE, 1, k + 1);
    for (let i = 1; i < 5; i++) body.seg([-0.3, R + (i * T.MAST) / 5, -hz + 1.5], [0.3, R + (i * T.MAST) / 5, -hz + 1.5], 0.8, LIGHT, 0.8, k + 1);
  }
  // ---- annotations (blueprint conventions)
  {
    const R = T.ROOF, dx = hx + 2.2, z = hz;
    const A = lin('bone', 0.55);
    // height dimension line with arrow ticks
    notes.seg([dx, 0, z], [dx, R, z], 0.9, A, 1, 99);
    for (const y of [0, T.LOBBY, R]) notes.seg([hx + 0.4, y, z], [dx + 0.6, y, z], 0.8, A, 1, 99);
    for (const y of [0, R]) {
      const s = y === 0 ? 1 : -1;
      notes.seg([dx, y, z], [dx - 0.18, y + s * 0.5, z], 0.9, A, 1, 99);
      notes.seg([dx, y, z], [dx + 0.18, y + s * 0.5, z], 0.9, A, 1, 99);
    }
    strokeLabel(notes, `${(R * 4).toFixed(2)} m`, [dx - 0.25, R * 0.5, z], [0, 1, 0], [-1, 0, 0], 0.55, 1.0, A, 1, { align: 0.5, tag: 99 });
    // level markers every 10 floors
    for (let k = 1; k <= T.FLOORS + 1; k += 10) {
      const y = floorY(k);
      notes.poly([[-hx - 0.6, y, z], [-hx - 1.0, y + 0.4, z], [-hx - 0.2, y + 0.4, z], [-hx - 0.6, y, z]], 0.9, A, 1, k);
      notes.seg([-hx - 0.2, y + 0.4, z], [-hx - 3.2, y + 0.4, z], 0.8, A, 1, k);
      strokeLabel(notes, `+${(y * 4).toFixed(2)}`, [-hx - 3.2, y + 0.55, z], [1, 0, 0], [0, 1, 0], 0.36, 0.9, A, 1, { tag: k });
      strokeLabel(notes, `L${String(k).padStart(2, '0')}`, [-hx - 3.2, y - 0.5, z], [1, 0, 0], [0, 1, 0], 0.3, 0.8, A, 0.8, { tag: k });
    }
    // centre line (dash-dot) up the front face
    notes.dashed([0, -1, hz + 0.02], [0, T.TOP + 2, hz + 0.02], 1.4, 0.5, 0.7, A, 0.6, 99, true);
    // section mark A–A at the base
    for (const s of [-1, 1]) {
      const cx = s * (hx + 3.6);
      notes.circle([cx, 1.2, hz], 0.7, [1, 0, 0], [0, 1, 0], 0.9, A, 1, 0, 24);
      notes.seg([cx - 0.7, 1.2, hz], [cx + 0.7, 1.2, hz], 0.8, A, 1, 0);
      strokeLabel(notes, 'A', [cx, 1.4, hz], [1, 0, 0], [0, 1, 0], 0.36, 0.9, A, 1, { align: 0.5, tag: 0 });
      notes.seg([cx - s * 0.7, 1.2, hz], [cx - s * 2.0, 1.2, hz], 1.4, A, 1, 0);
    }
  }
  return { body: body.freeze(), notes: notes.freeze() };
}
