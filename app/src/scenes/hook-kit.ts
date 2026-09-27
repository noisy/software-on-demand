// hook-kit — GPU building material for the three choruses (A4):
//  - Blocks: instanced unit cubes (the building material) with a faceted shade, crisp seams, fog.
//  - Solids: extruded 3D type from the font outlines (per glyph), with engraved sides.
//  - WordPlane: a word on a plane in 3D (canvas texture) with a karaoke wipe.
//  - small helpers: palette triplets, camera setup, 3D -> screen projection, beat grid.
import * as THREE from 'three';
import { LIN } from '../engine/palette';
import { F, font, layout, ot } from '../engine/type';
import { SCALE } from '../engine/scale';
import { W, H } from '../engine/gl';
import type { AudioData } from '../engine/audio';

export type RGB = [number, number, number];
export const lin = (k: keyof typeof LIN, s = 1): RGB => [LIN[k][0] * s, LIN[k][1] * s, LIN[k][2] * s];
export const mix3 = (a: RGB, b: RGB, k: number): RGB => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
export const scl3 = (a: RGB, k: number): RGB => [a[0] * k, a[1] * k, a[2] * k];
export const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const glv = (c: RGB) => `vec3(${c.map((x) => x.toFixed(5)).join(',')})`;

// ------------------------------------------------------------------ blocks
const BLOCK_VERT = /* glsl */ `
precision highp float;
in vec3 position; in vec3 normal;
in vec3 iPos; in vec4 iRot; in vec3 iScl; in vec4 iCol; in float iGrid;
uniform mat4 projectionMatrix; uniform mat4 viewMatrix;
out vec3 vN; out vec3 vNL; out vec3 vL; out vec3 vS; out vec4 vCol; out float vDepth; out vec3 vW; out float vGrid;
vec3 qrot(vec4 q, vec3 v) { return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v); }
void main() {
  vec3 lp = position * iScl;
  vec3 p = qrot(iRot, lp) + iPos;
  vN = qrot(iRot, normal);
  vNL = normal;
  vL = lp; vS = iScl * 0.5; vCol = iCol; vW = p; vGrid = iGrid;
  vec4 mv = viewMatrix * vec4(p, 1.0);
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;
const BLOCK_FRAG = /* glsl */ `
precision highp float;
in vec3 vN; in vec3 vNL; in vec3 vL; in vec3 vS; in vec4 vCol; in float vDepth; in vec3 vW; in float vGrid;
out vec4 fragColor;
uniform vec3 keyDir; uniform vec3 fogCol; uniform float fogNear; uniform float fogFar; uniform float edgeW; uniform float grid;
uniform vec3 rimCol;
void main() {
  vec3 n = normalize(vN);
  // distance to the face's border in world units (constant seam width at any block size)
  vec3 a = abs(vNL);
  vec2 q, s;
  if (a.x > a.y && a.x > a.z) { q = vL.yz; s = vS.yz; } else if (a.y > a.z) { q = vL.xz; s = vS.xz; } else { q = vL.xy; s = vS.xy; }
  vec2 d2 = s - abs(q);
  float d = min(d2.x, d2.y);
  float fw = fwidth(d) * 1.2;
  float edge = 1.0 - smoothstep(edgeW - fw, edgeW + fw, d);
  // block seams on big slabs: a seam every grid world units (0 = none)
  float gs = vGrid >= 0.0 ? vGrid : grid;
  if (gs > 0.0) {
    vec2 qq = (q + s) / gs;
    vec2 g = abs(fract(qq) - 0.5);
    vec2 gw = fwidth(qq) * 1.2;
    float gl = max(smoothstep(0.5 - gw.x, 0.5, g.x), smoothstep(0.5 - gw.y, 0.5, g.y));
    edge = max(edge, gl * 0.5);
  }
  float lam = max(dot(n, normalize(keyDir)), 0.0);
  float shade = 0.26 + 0.62 * lam + 0.16 * max(n.y, 0.0);
  vec3 base = vCol.rgb;
  float glow = vCol.a;
  vec3 lit = base * shade;
  float lu = dot(base, vec3(0.2126, 0.7152, 0.0722));
  vec3 edgeC = lu > 0.25 ? base * 0.3 : base * 1.2 + rimCol;
  vec3 c = mix(lit, edgeC, edge * 0.9);
  c = mix(c, base * (1.0 + 0.25 * (1.0 - edge)), glow);
  float fk = smoothstep(fogNear, fogFar, vDepth);
  c = mix(c, fogCol, fk);
  fragColor = vec4(clamp(c, 0.0, 16.0), 1.0);
}`;

/** A similarity transform (origin, rotation, uniform scale) for placing a set piece anywhere. */
export class XF {
  o = new THREE.Vector3(); q = new THREE.Quaternion(); s = 1;
  private v = new THREE.Vector3();
  static basis(o: THREE.Vector3, right: THREE.Vector3, up: THREE.Vector3, fwd: THREE.Vector3, s = 1) {
    const x = new XF(); x.o.copy(o); x.s = s;
    x.q.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, fwd));
    return x;
  }
  /** Local -> world (returns a shared vector unless `out` is given). */
  apply(x: number, y: number, z: number, out?: THREE.Vector3) {
    const v = (out ?? this.v).set(x * this.s, y * this.s, z * this.s).applyQuaternion(this.q).add(this.o);
    return v;
  }
  dir(x: number, y: number, z: number) { return new THREE.Vector3(x, y, z).applyQuaternion(this.q); }
  place(o: THREE.Object3D, x: number, y: number, z: number, rz = 0, sc = 1) {
    this.apply(x, y, z, o.position);
    o.quaternion.copy(this.q);
    if (rz) o.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), rz));
    o.scale.setScalar(sc * this.s);
  }
}
const _qa = new THREE.Quaternion();

/** Instanced cubes. Fill with add() every frame after clear(); render through a THREE.Scene (see `scene`). */
export class Blocks {
  geo = new THREE.InstancedBufferGeometry();
  mat: THREE.RawShaderMaterial;
  mesh: THREE.Mesh;
  count = 0;
  /** Optional transform applied to everything add()ed. */
  xf: XF | null = null;
  private P: Float32Array; private R: Float32Array; private S: Float32Array; private C: Float32Array; private G: Float32Array;
  private attrs: THREE.InstancedBufferAttribute[];
  constructor(public cap: number, o: { edgeW?: number; grid?: number; rim?: RGB } = {}) {
    const box = new THREE.BoxGeometry(1, 1, 1);
    this.geo.setAttribute('position', box.getAttribute('position'));
    this.geo.setAttribute('normal', box.getAttribute('normal'));
    this.geo.setIndex(box.getIndex());
    this.P = new Float32Array(cap * 3); this.R = new Float32Array(cap * 4); this.S = new Float32Array(cap * 3); this.C = new Float32Array(cap * 4); this.G = new Float32Array(cap);
    this.attrs = [new THREE.InstancedBufferAttribute(this.P, 3), new THREE.InstancedBufferAttribute(this.R, 4), new THREE.InstancedBufferAttribute(this.S, 3), new THREE.InstancedBufferAttribute(this.C, 4), new THREE.InstancedBufferAttribute(this.G, 1)];
    this.attrs.forEach((x) => x.setUsage(THREE.DynamicDrawUsage));
    ['iPos', 'iRot', 'iScl', 'iCol', 'iGrid'].forEach((n, i) => this.geo.setAttribute(n, this.attrs[i]!));
    this.mat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: BLOCK_VERT, fragmentShader: BLOCK_FRAG,
      uniforms: {
        keyDir: { value: new THREE.Vector3(-0.45, 0.8, 0.55) }, fogCol: { value: new THREE.Vector3(...LIN.ink) },
        fogNear: { value: 200 }, fogFar: { value: 900 }, edgeW: { value: o.edgeW ?? 0.05 }, grid: { value: o.grid ?? 0 },
        rimCol: { value: new THREE.Vector3(...scl3(o.rim ?? lin('bone'), 0.22)) },
      },
      depthTest: true, depthWrite: true,
    });
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.frustumCulled = false;
  }
  get u() { return this.mat.uniforms; }
  clear() { this.count = 0; }
  /** Add a block: centre, size, rotation quaternion (x,y,z,w), linear colour, glow 0..1 (unlit emissive). */
  add(x: number, y: number, z: number, sx: number, sy: number, sz: number, q: [number, number, number, number] | null, c: RGB, glow = 0, grid = -1) {
    if (this.count >= this.cap) return;
    if (this.xf) {
      const X = this.xf, w = X.apply(x, y, z);
      x = w.x; y = w.y; z = w.z; sx *= X.s; sy *= X.s; sz *= X.s;
      if (q) { _qa.set(q[0], q[1], q[2], q[3]).premultiply(X.q); } else _qa.copy(X.q);
      q = [_qa.x, _qa.y, _qa.z, _qa.w];
    }
    const i = this.count++;
    this.P[i * 3] = x; this.P[i * 3 + 1] = y; this.P[i * 3 + 2] = z;
    this.S[i * 3] = sx; this.S[i * 3 + 1] = sy; this.S[i * 3 + 2] = sz;
    if (q) { this.R[i * 4] = q[0]; this.R[i * 4 + 1] = q[1]; this.R[i * 4 + 2] = q[2]; this.R[i * 4 + 3] = q[3]; }
    else { this.R[i * 4] = 0; this.R[i * 4 + 1] = 0; this.R[i * 4 + 2] = 0; this.R[i * 4 + 3] = 1; }
    this.C[i * 4] = c[0]; this.C[i * 4 + 1] = c[1]; this.C[i * 4 + 2] = c[2]; this.C[i * 4 + 3] = glow;
    this.G[i] = grid;
  }
  commit() {
    for (const a of this.attrs) { a.needsUpdate = true; a.clearUpdateRanges(); a.addUpdateRange(0, this.count * a.itemSize); }
    this.geo.instanceCount = this.count;
    this.mesh.visible = this.count > 0;
  }
  fog(near: number, far: number, col: RGB = lin('ink')) {
    this.u.fogNear!.value = near; this.u.fogFar!.value = far; (this.u.fogCol!.value as THREE.Vector3).set(...col);
  }
}

/** Quaternion from Euler angles (XYZ order) as a tuple. */
const _q = new THREE.Quaternion(), _e = new THREE.Euler();
export function quat(rx: number, ry: number, rz: number): [number, number, number, number] {
  _e.set(rx, ry, rz); _q.setFromEuler(_e);
  return [_q.x, _q.y, _q.z, _q.w];
}

// ------------------------------------------------------------------ solids (extruded type)
const SOLID_VERT = /* glsl */ `
precision highp float;
in vec3 position; in vec3 normal;
uniform mat4 projectionMatrix; uniform mat4 modelViewMatrix; uniform mat4 modelMatrix; uniform mat3 normalMatrix;
out vec3 vN; out vec3 vObj; out float vDepth; out vec3 vWN;
void main() {
  vObj = position;
  vN = normalize(normalMatrix * normal);
  vWN = normalize(mat3(modelMatrix) * normal);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;
const SOLID_FRAG = /* glsl */ `
precision highp float;
in vec3 vN; in vec3 vObj; in float vDepth; in vec3 vWN;
out vec4 fragColor;
uniform vec3 face; uniform vec3 side; uniform vec3 hatchCol; uniform vec3 keyDir; uniform float depth; uniform float hatchFreq;
uniform vec3 fogCol; uniform float fogNear; uniform float fogFar; uniform float opacity; uniform float heat; uniform float isSide;
uniform vec3 hotCol;
float hatchL(float u, float dk) {
  float f = abs(fract(u) - 0.5);
  float hw = 0.5 * clamp(dk, 0.0, 1.0);
  float aa = max(fwidth(u), 1e-4);
  return 1.0 - smoothstep(hw - aa, hw + aa, 0.5 - f);
}
void main() {
  vec3 n = vWN;
  float nl = length(n);
  n = nl > 1e-5 ? n / nl : vec3(0.0, 0.0, 1.0);
  float lam = max(dot(n, normalize(keyDir)), 0.0);
  vec3 c;
  if (isSide < 0.5) {
    // caps: flat colour, a touch of light falloff so the face reads as a plane
    c = face * (0.92 + 0.08 * lam);
  } else {
    // sides: engraved — hatch lines running along the extrusion, denser in shadow
    float dk = 0.25 + 0.6 * (1.0 - lam);
    float h = hatchL(vObj.z * hatchFreq / max(depth, 1e-3), dk);
    c = mix(side * (0.35 + 0.65 * lam), hatchCol, h * 0.85);
    // front lip catches light (the bevel)
    float lip = smoothstep(depth * 0.9, depth, vObj.z);
    c = mix(c, face * 0.9, lip * 0.6);
  }
  c += hotCol * heat;
  float fk = smoothstep(fogNear, fogFar, vDepth);
  c = mix(c, fogCol, fk);
  c = clamp(c, 0.0, 16.0);
  if (!(c.r == c.r) || !(c.g == c.g) || !(c.b == c.b)) c = vec3(0.0);
  fragColor = vec4(c * opacity, opacity);
}`;

export interface SolidLook { face: RGB; side: RGB; hatch: RGB; hot?: RGB; hatchFreq?: number }

/** Two materials (caps, sides) for an ExtrudeGeometry. Shared uniforms object so a look can be animated per word. */
export function solidMaterials(look: SolidLook, depth: number, transparent = false) {
  const u = {
    face: { value: new THREE.Vector3(...look.face) }, side: { value: new THREE.Vector3(...look.side) }, hatchCol: { value: new THREE.Vector3(...look.hatch) },
    hotCol: { value: new THREE.Vector3(...(look.hot ?? lin('signal', 1.5))) }, heat: { value: 0 },
    keyDir: { value: new THREE.Vector3(-0.5, 0.7, 0.6) }, depth: { value: depth }, hatchFreq: { value: look.hatchFreq ?? 9 },
    fogCol: { value: new THREE.Vector3(...LIN.ink) }, fogNear: { value: 400 }, fogFar: { value: 1200 }, opacity: { value: 1 },
  };
  const mk = (side: number) => new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3, vertexShader: SOLID_VERT, fragmentShader: SOLID_FRAG,
    uniforms: { ...u, isSide: { value: side } },
    depthTest: true, depthWrite: !transparent, transparent,
    blending: transparent ? THREE.CustomBlending : THREE.NoBlending,
    blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendEquation: THREE.AddEquation,
  });
  const cap = mk(0), side = mk(1);
  // the two materials share the uniform *values* (objects), so setting one sets both
  for (const k of Object.keys(u) as (keyof typeof u)[]) side.uniforms[k] = cap.uniforms[k]!;
  return { mats: [cap, side] as THREE.Material[], u: cap.uniforms as unknown as typeof u };
}

type Cmd = { type: string; x?: number; y?: number; x1?: number; y1?: number; x2?: number; y2?: number };

/** Shapes (y up, units = px at `size`) of one glyph's outline, holes assigned by containment. */
export function glyphShapes(ch: string, family: string, size: number): THREE.Shape[] {
  const f = ot(family);
  const cmds = f.charToGlyph(ch).getPath(0, 0, size).commands as Cmd[];
  const paths: THREE.Path[] = [];
  let cur: THREE.Path | null = null;
  for (const c of cmds) {
    if (c.type === 'M') { cur = new THREE.Path(); cur.moveTo(c.x!, -c.y!); paths.push(cur); }
    else if (!cur) continue;
    else if (c.type === 'L') cur.lineTo(c.x!, -c.y!);
    else if (c.type === 'Q') cur.quadraticCurveTo(c.x1!, -c.y1!, c.x!, -c.y!);
    else if (c.type === 'C') cur.bezierCurveTo(c.x1!, -c.y1!, c.x2!, -c.y2!, c.x!, -c.y!);
  }
  const polys = paths.map((p) => p.getPoints(6));
  const area = (pts: THREE.Vector2[]) => { let a = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i]!, q = pts[(i + 1) % pts.length]!; a += p.x * q.y - q.x * p.y; } return a / 2; };
  const areas = polys.map(area);
  if (!areas.length) return [];
  let big = 0;
  areas.forEach((a, i) => { if (Math.abs(a) > Math.abs(areas[big]!)) big = i; });
  const outerSign = Math.sign(areas[big]!);
  const inside = (pt: THREE.Vector2, poly: THREE.Vector2[]) => {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i]!, b = poly[j]!;
      if ((a.y > pt.y) !== (b.y > pt.y) && pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x) c = !c;
    }
    return c;
  };
  const shapes: { s: THREE.Shape; poly: THREE.Vector2[]; a: number }[] = [];
  paths.forEach((p, i) => {
    if (Math.sign(areas[i]!) !== outerSign || Math.abs(areas[i]!) < 1e-6) return;
    const s = new THREE.Shape(); s.curves = p.curves; s.currentPoint = p.currentPoint; s.autoClose = true;
    shapes.push({ s, poly: polys[i]!, a: Math.abs(areas[i]!) });
  });
  paths.forEach((p, i) => {
    if (Math.sign(areas[i]!) === outerSign) return;
    const pt = polys[i]![0]!;
    let best: (typeof shapes)[number] | null = null;
    for (const s of shapes) if (inside(pt, s.poly) && (!best || s.a < best.a)) best = s;
    if (best) { const h = new THREE.Path(); h.curves = p.curves; best.s.holes.push(h); }
  });
  return shapes.map((s) => s.s);
}

export interface SolidGlyph {
  ch: string;
  geo: THREE.ExtrudeGeometry;
  /** Left edge of the glyph's advance and its advance (world units), relative to the word's left. */
  x: number; w: number;
  /** Ink centre (world units, relative to the word origin at left baseline). */
  cx: number; cy: number;
}
export interface SolidWord { text: string; glyphs: SolidGlyph[]; width: number; capH: number; depth: number }

/**
 * Extruded word, one geometry per glyph, laid out with the font's kerning. World units: the cap height is
 * `capH`; the extrusion runs from z = 0 (back) to z = depth (front face).
 */
export function solidWord(text: string, family: string, capH: number, depth: number, tracking = 0, bevel = 0.04): SolidWord {
  const size = 200;
  const capPx = size * 0.686;
  const k = capH / capPx;
  const lay = layout(text, family, size, tracking * size);
  const glyphs: SolidGlyph[] = [];
  for (const g of lay.glyphs) {
    const shapes = glyphShapes(g.ch, family, size);
    if (!shapes.length) continue;
    const geo = new THREE.ExtrudeGeometry(shapes, {
      depth: depth / k - 2 * bevel * capPx, bevelEnabled: bevel > 0, bevelThickness: bevel * capPx, bevelSize: bevel * capPx * 0.6, bevelSegments: 2, curveSegments: 5,
    });
    geo.translate(0, 0, bevel * capPx);
    geo.scale(k, k, k);
    geo.computeBoundingBox();
    const bb = geo.boundingBox!;
    const cx = (bb.min.x + bb.max.x) / 2, cy = (bb.min.y + bb.max.y) / 2;
    // centre each glyph on its own ink centre (so it can spin / shatter about itself)
    geo.translate(-cx, -cy, 0);
    glyphs.push({ ch: g.ch, geo, x: g.x * k, w: g.w * k, cx: g.x * k + cx, cy });
  }
  return { text, glyphs, width: lay.width * k, capH, depth };
}

// ------------------------------------------------------------------ words on planes
const PLANE_VERT = /* glsl */ `
precision highp float;
in vec3 position; in vec2 uv;
uniform mat4 projectionMatrix; uniform mat4 modelViewMatrix;
out vec2 vUv; out float vDepth;
void main() { vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vDepth = -mv.z; gl_Position = projectionMatrix * mv; }`;
const PLANE_FRAG = /* glsl */ `
precision highp float;
in vec2 vUv; in float vDepth;
out vec4 fragColor;
uniform sampler2D map; uniform float prog; uniform float u0; uniform float u1; uniform float feather;
uniform vec3 cDim; uniform vec3 cSung; uniform vec3 cDone; uniform float aDim; uniform float done; uniform float opacity;
uniform vec3 fogCol; uniform float fogNear; uniform float fogFar;
void main() {
  float fill = texture(map, vUv).r;
  float u = clamp((vUv.x - u0) / max(1e-4, u1 - u0), 0.0, 1.0);
  float e = prog * (1.0 + feather);
  float sung = prog <= 0.0 ? 0.0 : 1.0 - smoothstep(e - feather, e, u);
  vec3 cs = mix(cSung, cDone, done);
  vec3 rgb = fill * (sung * cs + (1.0 - sung) * aDim * cDim);
  float a = fill * (sung + (1.0 - sung) * aDim);
  float fk = smoothstep(fogNear, fogFar, vDepth);
  rgb *= 1.0 - fk; a *= 1.0 - fk;
  fragColor = vec4(rgb, a) * opacity;
}`;

/**
 * A line of text on a plane (local XY, facing +Z) — anchor at (ax, ay) of the ink box (0 = left/baseline,
 * 1 = right/cap top). World cap height `capH`. Karaoke via `set({prog})`: unsung dim bone, sung gold, cooling to cDone.
 */
export class WordPlane {
  mesh: THREE.Mesh;
  mat: THREE.RawShaderMaterial;
  w: number; h: number;
  constructor(public text: string, family: string, capH: number, o: { px?: number; ax?: number; ay?: number; tracking?: number } = {}) {
    const px = (o.px ?? 160) * SCALE;
    const cv = document.createElement('canvas');
    const c = cv.getContext('2d')!;
    c.font = font(family, px);
    const tr = (o.tracking ?? 0) * px;
    c.letterSpacing = `${tr}px`;
    const m = c.measureText(text);
    const cap = c.measureText('H').actualBoundingBoxAscent;
    const asc = Math.max(m.actualBoundingBoxAscent, cap), desc = Math.max(0, m.actualBoundingBoxDescent);
    const inkL = -m.actualBoundingBoxLeft, inkR = m.actualBoundingBoxRight;
    const pad = Math.ceil(px * 0.06);
    const cw = Math.ceil(inkR - inkL + pad * 2), ch = Math.ceil(asc + desc + pad * 2);
    cv.width = cw; cv.height = ch;
    const c2 = cv.getContext('2d')!;
    c2.fillStyle = '#000'; c2.fillRect(0, 0, cw, ch);
    c2.font = font(family, px); c2.letterSpacing = `${tr}px`; c2.textBaseline = 'alphabetic';
    c2.fillStyle = '#fff';
    const bx = pad - inkL, by = pad + asc;
    c2.fillText(text, bx, by);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.NoColorSpace; tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.anisotropy = 8;
    const s = capH / cap;
    this.w = (inkR - inkL) * s; this.h = capH;
    const gw = cw * s, gh = ch * s;
    const geo = new THREE.PlaneGeometry(gw, gh);
    const axPx = pad + (inkR - inkL) * (o.ax ?? 0), ayPx = by - cap * (o.ay ?? 0);
    geo.translate(gw / 2 - axPx * s, -(gh / 2 - ayPx * s), 0);
    this.mat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: PLANE_VERT, fragmentShader: PLANE_FRAG,
      uniforms: {
        map: { value: tex }, prog: { value: 0 }, u0: { value: pad / cw }, u1: { value: (cw - pad) / cw }, feather: { value: 0.06 },
        cDim: { value: new THREE.Vector3(...LIN.bone) }, cSung: { value: new THREE.Vector3(...lin('signal', 1.1)) }, cDone: { value: new THREE.Vector3(...lin('bone', 0.82)) },
        aDim: { value: 0.3 }, done: { value: 0 }, opacity: { value: 1 },
        fogCol: { value: new THREE.Vector3(...LIN.ink) }, fogNear: { value: 400 }, fogFar: { value: 1200 },
      },
      transparent: true, depthTest: true, depthWrite: false, side: THREE.DoubleSide,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
  }
  set(o: { prog?: number; done?: number; opacity?: number; aDim?: number; sung?: RGB; dim?: RGB; doneC?: RGB }) {
    const u = this.mat.uniforms;
    if (o.prog !== undefined) u.prog!.value = o.prog;
    if (o.done !== undefined) u.done!.value = o.done;
    if (o.opacity !== undefined) u.opacity!.value = o.opacity;
    if (o.aDim !== undefined) u.aDim!.value = o.aDim;
    if (o.sung) (u.cSung!.value as THREE.Vector3).set(...o.sung);
    if (o.dim) (u.cDim!.value as THREE.Vector3).set(...o.dim);
    if (o.doneC) (u.cDone!.value as THREE.Vector3).set(...o.doneC);
    this.mesh.visible = (u.opacity!.value as number) > 0.002;
  }
  fog(near: number, far: number) { this.mat.uniforms.fogNear!.value = near; this.mat.uniforms.fogFar!.value = far; }
}

// ------------------------------------------------------------------ voxel text
export interface Voxel { x: number; y: number; letter: number }
/**
 * Cells (integer grid, y up, origin left baseline) filling a word set in `family`, `capCells` cells tall.
 * Each cell knows which letter it belongs to (for letter-by-letter assembly).
 */
export function voxelText(text: string, family: string, capCells: number, tracking = 0): { cells: Voxel[]; width: number; letters: { x0: number; x1: number }[] } {
  const size = 400;
  const cell = (size * 0.686) / capCells;
  const lay = layout(text, family, size, tracking * size);
  const cv = document.createElement('canvas');
  const Wc = Math.ceil(lay.width + size * 0.2), Hc = Math.ceil(size * 1.1);
  cv.width = Wc; cv.height = Hc;
  const c = cv.getContext('2d', { willReadFrequently: true })!;
  const base = Math.round(size * 0.9);
  const cells: Voxel[] = [];
  const letters: { x0: number; x1: number }[] = [];
  lay.glyphs.forEach((g, li) => {
    c.clearRect(0, 0, Wc, Hc);
    c.font = font(family, size);
    c.fillStyle = '#fff';
    c.fillText(g.ch, g.x, base);
    const data = c.getImageData(0, 0, Wc, Hc).data;
    let x0 = Infinity, x1 = -Infinity;
    const nx = Math.ceil(Wc / cell), ny = Math.ceil(base / cell) + 1;
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        // coverage from 3x3 samples in the cell
        let cov = 0;
        for (let sy = 0; sy < 3; sy++) for (let sx = 0; sx < 3; sx++) {
          const px = Math.floor((i + (sx + 0.5) / 3) * cell), py = Math.floor(base - (j + (sy + 0.5) / 3) * cell);
          if (px < 0 || py < 0 || px >= Wc || py >= Hc) continue;
          if (data[(py * Wc + px) * 4 + 3]! > 127) cov++;
        }
        if (cov >= 5) { cells.push({ x: i, y: j, letter: li }); x0 = Math.min(x0, i); x1 = Math.max(x1, i); }
      }
    }
    letters.push({ x0, x1 });
  });
  return { cells, width: Math.ceil(lay.width / cell), letters };
}

// ------------------------------------------------------------------ camera & projection
export interface CamState { pos: THREE.Vector3; target: THREE.Vector3; fov: number; roll?: number; up?: THREE.Vector3 }
export function applyCam(cam: THREE.PerspectiveCamera, s: CamState) {
  cam.fov = s.fov;
  cam.position.copy(s.pos);
  if (s.up) cam.up.copy(s.up); else cam.up.set(0, 1, 0);
  cam.lookAt(s.target);
  if (s.roll) cam.rotateZ(s.roll);
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld(true);
}
/** Orbit position around `c`: yaw about +y (0 = on +z), pitch up from the horizon, distance d. */
/** A camera defined in a set piece's local frame. */
export function camIn(xf: XF, pos: [number, number, number], target: [number, number, number], fov: number, roll = 0): CamState {
  return { pos: xf.apply(pos[0], pos[1], pos[2], new THREE.Vector3()), target: xf.apply(target[0], target[1], target[2], new THREE.Vector3()), fov, roll, up: xf.dir(0, 1, 0) };
}
export function orbit(c: THREE.Vector3, yaw: number, pitch: number, d: number) {
  return new THREE.Vector3(c.x + Math.sin(yaw) * Math.cos(pitch) * d, c.y + Math.sin(pitch) * d, c.z + Math.cos(yaw) * Math.cos(pitch) * d);
}
const _p = new THREE.Vector3();
/** World -> logical screen px (y down). `ok` false when behind the camera. */
export function toScreen(cam: THREE.Camera, x: number, y: number, z: number) {
  _p.set(x, y, z).applyMatrix4(cam.matrixWorldInverse);
  const behind = _p.z > -0.01;
  _p.applyMatrix4((cam as THREE.PerspectiveCamera).projectionMatrix);
  return { x: (_p.x * 0.5 + 0.5) * W, y: (0.5 - _p.y * 0.5) * H, ok: !behind, depth: -_p.z };
}
/** Pixels per world unit at distance d for a camera with vertical fov (deg). */
export const pxPerUnit = (fovDeg: number, d: number) => H / (2 * Math.tan((fovDeg * Math.PI) / 360) * d);

// ------------------------------------------------------------------ beat grid
export function beatsIn(au: AudioData, t0: number, t1: number): number[] {
  const out: number[] = [];
  const i0 = Math.ceil(au.beatAt(t0) - 1e-6);
  for (let i = i0; i < i0 + 500; i++) {
    const t = au.timeOfBeat(i);
    if (t >= t1) break;
    if (t >= t0 - 1e-6) out.push(t);
  }
  return out;
}
/** The time of the nearest 16th note grid point at or after t (from the beat grid). */
export const sixteenth = (au: AudioData, t: number, k: number) => au.timeOfBeat(Math.floor(au.beatAt(t) * 4 + 1e-6) / 4 + k / 4);

export { F, glv };
