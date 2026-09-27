// hook-magic — chorus 3 (A4): the magician.
//   The bridge's glass flies out in slow motion, still carrying the held word GLASS., and its shards land as
//   the segments of a magic circle of code glyphs ({} <> λ ∑ ∫ →, Plex Mono) on the ground. BUILDER is
//   conjured out of the circle; the cursor grows into a wand and writes "a wizard with a plan." in light,
//   then draws the plan (an elevation) which lifts into 3D and fills with the sung floors. The hook is the
//   spell: gold extruded words inside an armillary of glyph rings that multiply on the beat, and at the end
//   the whole circle collapses into the cursor (→ outro).
import * as THREE from 'three';
import type { Frame, PostOverrides } from '../engine/scene';
import { W, H } from '../engine/gl';
import { SCALE } from '../engine/scale';
import { F, font } from '../engine/type';
import { strokeText, writtenLength, type StrokeText } from '../engine/stroke';
import { rgba } from '../engine/palette';
import { clamp, ease, frameIdx, hash, lerp, noise1, prog, pulse, smoothstep, TAU } from '../engine/util';
import { cursorBlink, cursorCaret, cursorTip, weldSparks } from './_motifs';
import { XF, applyCam, camIn, lin, mix3, orbit, scl3, toScreen, v3, type CamState, type RGB } from './hook-kit';
import { circle3 } from './hook-parts';
import type Hook from './hook';

type Cut = { t: number; id: string };

// ------------------------------------------------------------------ glyph rings
const GLYPHS = ['{', '}', '<', '>', 'λ', '∑', '∫', '→', '=', ';', '/', '*', '|', '&', '0', '1'];
const G_VERT = /* glsl */ `
precision highp float;
in vec3 position;
in vec3 iPos; in vec3 iR; in vec3 iU; in float iG; in vec4 iCol;
uniform mat4 projectionMatrix; uniform mat4 viewMatrix;
out vec2 vUv; out vec4 vCol;
void main() {
  vec3 p = iPos + iR * position.x + iU * position.y;
  float gx = mod(iG, 4.0), gy = floor(iG / 4.0);
  vUv = (vec2(gx, 3.0 - gy) + (position.xy * 0.5 + 0.5)) / 4.0;
  vCol = iCol;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;
const G_FRAG = /* glsl */ `
precision highp float;
in vec2 vUv; in vec4 vCol;
out vec4 fragColor;
uniform sampler2D atlas;
void main() {
  float a = texture(atlas, vUv).r * vCol.a;
  if (a < 0.003) discard;
  fragColor = vec4(vCol.rgb * a, 0.0);
}`;

class GlyphBatch {
  geo = new THREE.InstancedBufferGeometry();
  mesh: THREE.Mesh;
  count = 0;
  private A: { P: Float32Array; R: Float32Array; U: Float32Array; G: Float32Array; C: Float32Array };
  private attrs: THREE.InstancedBufferAttribute[];
  constructor(public cap: number) {
    this.geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
    this.geo.setIndex([0, 1, 2, 0, 2, 3]);
    this.A = { P: new Float32Array(cap * 3), R: new Float32Array(cap * 3), U: new Float32Array(cap * 3), G: new Float32Array(cap), C: new Float32Array(cap * 4) };
    this.attrs = [new THREE.InstancedBufferAttribute(this.A.P, 3), new THREE.InstancedBufferAttribute(this.A.R, 3), new THREE.InstancedBufferAttribute(this.A.U, 3), new THREE.InstancedBufferAttribute(this.A.G, 1), new THREE.InstancedBufferAttribute(this.A.C, 4)];
    this.attrs.forEach((a) => a.setUsage(THREE.DynamicDrawUsage));
    ['iPos', 'iR', 'iU', 'iG', 'iCol'].forEach((n, i) => this.geo.setAttribute(n, this.attrs[i]!));
    const mat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: G_VERT, fragmentShader: G_FRAG,
      uniforms: { atlas: { value: GlyphBatch.atlas() } },
      transparent: true, depthTest: true, depthWrite: false, side: THREE.DoubleSide,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
    });
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
  }
  static atlas() {
    const cell = 128 * SCALE, cv = document.createElement('canvas');
    cv.width = cv.height = cell * 4;
    const c = cv.getContext('2d')!;
    c.fillStyle = '#000'; c.fillRect(0, 0, cv.width, cv.height);
    c.fillStyle = '#fff'; c.strokeStyle = '#fff';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = font(F.mono(500), cell * 0.78);
    GLYPHS.forEach((g, i) => {
      const x = (i % 4 + 0.5) * cell, y = (Math.floor(i / 4) + 0.5) * cell;
      if (g === 'λ') {
        // Plex Mono has no λ: drawn in its weight and proportions
        c.lineWidth = cell * 0.075; c.lineCap = 'butt';
        c.beginPath(); c.moveTo(x - cell * 0.2, y - cell * 0.3); c.quadraticCurveTo(x - cell * 0.02, y - cell * 0.32, x + cell * 0.04, y - cell * 0.16); c.lineTo(x + cell * 0.24, y + cell * 0.3); c.stroke();
        c.beginPath(); c.moveTo(x + cell * 0.01, y - cell * 0.05); c.lineTo(x - cell * 0.22, y + cell * 0.3); c.stroke();
      } else c.fillText(g, x, y + cell * 0.04);
    });
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.NoColorSpace; tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.anisotropy = 8;
    return tex;
  }
  clear() { this.count = 0; }
  add(p: THREE.Vector3, r: THREE.Vector3, u: THREE.Vector3, g: number, c: RGB, a: number) {
    if (this.count >= this.cap || a <= 0.003) return;
    const i = this.count++, A = this.A;
    A.P.set([p.x, p.y, p.z], i * 3); A.R.set([r.x, r.y, r.z], i * 3); A.U.set([u.x, u.y, u.z], i * 3);
    A.G[i] = g; A.C.set([c[0], c[1], c[2], a], i * 4);
  }
  commit() {
    for (const a of this.attrs) { a.needsUpdate = true; a.clearUpdateRanges(); a.addUpdateRange(0, this.count * a.itemSize); }
    this.geo.instanceCount = this.count;
    this.mesh.visible = this.count > 0;
  }
}
/** Code-like glyph strings for the rings (indices into GLYPHS). */
const RING_CODE = ['{λ→∑}', '<∫=λ>', '{∑;∫}', '→|λ|→', '<*/>', '{0→1}', '∫λ∑→'].map((s) => Array.from(s).map((ch) => Math.max(0, GLYPHS.indexOf(ch))));

// ------------------------------------------------------------------ glass shards
const S_VERT = /* glsl */ `
precision highp float;
in vec3 position; in vec2 uv; in float aA;
uniform mat4 projectionMatrix; uniform mat4 viewMatrix;
out vec2 vUv; out float vA;
void main() { vUv = uv; vA = aA; gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0); }`;
const S_FRAG = /* glsl */ `
precision highp float;
in vec2 vUv; in float vA;
out vec4 fragColor;
uniform sampler2D map; uniform float prog; uniform vec3 glass; uniform vec3 sung; uniform vec3 dim;
void main() {
  float txt = texture(map, vUv).r;
  float s = step(vUv.x, prog);
  vec3 tc = mix(dim, sung, s);
  vec3 c = glass * 0.35 + tc * txt;
  float a = (0.32 + 0.68 * txt) * vA;
  fragColor = vec4(c * vA, a);
}`;

interface Shard { c: THREE.Vector2; v: [THREE.Vector2, THREE.Vector2, THREE.Vector2]; uv: [THREE.Vector2, THREE.Vector2, THREE.Vector2]; vel: THREE.Vector3; axis: THREE.Vector3; spin: number; ring: number; th: number; d: number }

export class Magic {
  cuts: Cut[] = [];
  glyphs = new GlyphBatch(9000);
  shards: Shard[] = [];
  shardGeo = new THREE.BufferGeometry();
  shardMat!: THREE.RawShaderMaterial;
  shardMesh!: THREE.Mesh;
  glassW!: { start: number; end: number };
  plan!: { st: StrokeText; times: [number, number][]; x0: number; y0: number; k: number };
  elev: { a: THREE.Vector3; b: THREE.Vector3; l0: number; l1: number }[] = [];
  elevLen = 0;
  // key times
  tShatter = 0; tLand = 0; tCircle = 0; tWand = 0; tPlan0 = 0; tPlan1 = 0; tExtrude = 0; tCollapse = 0;
  static PLANE = { c: v3(0, 22, 30), w: 104, h: 46 };
  constructor(public h: Hook) {}

  async init() {
    const h = this.h, T = h.T, ctx = h['ctx'];
    const lines = ctx.lyrics.linesIn(ctx.start - 2, ctx.start + 2);
    const gl = lines.find((l) => /glass/i.test(l.text));
    const gw = gl ? gl.words[gl.words.length - 1]! : { start: ctx.start, end: ctx.start + 1.2 };
    this.glassW = { start: gw.start, end: gw.end };
    const wStand = T.lc.words[T.lc.words.length - 1]!;
    this.tShatter = ctx.start;
    this.tLand = h.downbeatAfter(gw.end + 0.3);           // the circle closes on the downbeat before "Now"
    this.tWand = h.downbeatAfter(T.la.end + 1.5);          // the downbeat before "a wizard"
    this.tPlan0 = T.lb.words[0]!.start; this.tPlan1 = T.lb.end;
    this.tExtrude = h.beatT(T.lc.words[0]!.start - 0.45);
    this.tCollapse = T.hw[2]!.end;
    const hooks: Cut[] = [
      { t: T.hw[0]!.start, id: 'h0' },
      { t: h.beatT(T.hw[0]!.start + 0.6), id: 'h0b' },
      { t: T.hw[1]!.start, id: 'h1' },
      { t: T.hw[2]!.start, id: 'h2' },
      { t: this.tCollapse, id: 'collapse' },
    ];
    this.cuts = [
      { t: ctx.start, id: 'shards' },
      { t: gw.end, id: 'circles' },
      { t: this.tLand, id: 'summon' },
      { t: h.downbeatAfter(T.la.end), id: 'summon2' },
      { t: this.tWand, id: 'wand' },
      { t: h.downbeatAfter(T.lb.end - 0.1), id: 'wand2' },
      { t: h.downbeatAfter(T.lc.words[0]!.start), id: 'tower' },
      { t: wStand.start, id: 'standing' },
      ...hooks,
    ];
    h.collapseT = this.cuts.find((c) => c.id === 'tower')!.t;
    h.world.add(this.glyphs.mesh);
    this.buildShards();
    this.buildPlan();
    // BUILDER stands at the centre of the circle
    h.xfB = new XF();
    h.xfT = new XF();
    h.hookWords.forEach((hw) => { hw.xf = new XF(); hw.xf.o.set(0, 26, 20); });
  }

  // ------------------------------------------------------------------ build
  private buildShards() {
    const P = Magic.PLANE;
    // the word on the glass
    const cw = 2048, ch = Math.round((cw * P.h) / P.w);
    const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
    const c = cv.getContext('2d')!;
    c.fillStyle = '#000'; c.fillRect(0, 0, cw, ch);
    c.fillStyle = '#fff';
    c.font = font(F.archivo(112.5, 900), ch * 0.52);
    c.textAlign = 'center'; c.textBaseline = 'alphabetic';
    c.fillText('GLASS.', cw / 2, ch * 0.7);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.NoColorSpace; tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter;
    // jittered grid, each cell split into two triangles
    const nx = 16, ny = 8;
    const pt = (i: number, j: number) => {
      const edge = i === 0 || j === 0 || i === nx || j === ny;
      const jx = edge ? 0 : (hash(i, j, 1) - 0.5) * 0.8, jy = edge ? 0 : (hash(i, j, 2) - 0.5) * 0.8;
      return new THREE.Vector2(((i + jx) / nx - 0.5) * P.w, ((j + jy) / ny - 0.5) * P.h);
    };
    const uvOf = (p: THREE.Vector2) => new THREE.Vector2(p.x / P.w + 0.5, p.y / P.h + 0.5);
    let k = 0;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const a = pt(i, j), b = pt(i + 1, j), cc = pt(i + 1, j + 1), d = pt(i, j + 1);
      const tris = hash(i, j, 3) < 0.5 ? [[a, b, cc], [a, cc, d]] : [[a, b, d], [b, cc, d]];
      for (const tri of tris) {
        const cen = tri[0]!.clone().add(tri[1]!).add(tri[2]!).multiplyScalar(1 / 3);
        const dir = cen.clone().add(new THREE.Vector2(0, 2)).normalize();
        const sp = 6 + 22 * hash(k, 4);
        this.shards.push({
          c: cen, v: tri.map((p) => p.clone().sub(cen)) as Shard['v'], uv: tri.map(uvOf) as Shard['uv'],
          vel: v3(dir.x * sp, dir.y * sp, 6 + 26 * hash(k, 5)), axis: v3(hash(k, 6) - 0.5, hash(k, 7) - 0.5, hash(k, 8) - 0.5).normalize(),
          spin: (hash(k, 9) - 0.5) * 5, ring: k % 4, th: 0, d: hash(k, 10),
        });
        k++;
      }
    }
    // ring targets: each ring's shards spread evenly around it
    for (let r = 0; r < 4; r++) {
      const list = this.shards.filter((s) => s.ring === r).sort((a, b) => Math.atan2(a.c.y, a.c.x) - Math.atan2(b.c.y, b.c.x));
      list.forEach((s, i) => (s.th = (i / list.length) * TAU + r * 0.4));
    }
    const n = this.shards.length * 3;
    this.shardGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage));
    const uv = new Float32Array(n * 2);
    this.shards.forEach((s, i) => s.uv.forEach((u, j) => { uv[(i * 3 + j) * 2] = u.x; uv[(i * 3 + j) * 2 + 1] = u.y; }));
    this.shardGeo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    this.shardGeo.setAttribute('aA', new THREE.BufferAttribute(new Float32Array(n), 1).setUsage(THREE.DynamicDrawUsage));
    this.shardMat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: S_VERT, fragmentShader: S_FRAG,
      uniforms: { map: { value: tex }, prog: { value: 0 }, glass: { value: new THREE.Vector3(...mix3(scl3(lin('cobalt'), 3.2), lin('bone', 0.5), 0.25)) }, sung: { value: new THREE.Vector3(...lin('signal', 1.3)) }, dim: { value: new THREE.Vector3(...lin('bone', 0.55)) } },
      transparent: true, depthTest: true, depthWrite: false, side: THREE.DoubleSide,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    this.shardMesh = new THREE.Mesh(this.shardGeo, this.shardMat);
    this.shardMesh.frustumCulled = false;
    this.h.world.add(this.shardMesh);
  }

  /** "a wizard with a plan." written by the wand (single stroke), and the plan: the tower's elevation. */
  private buildPlan() {
    const T = this.h.T, line = T.lb;
    const text = line.text;
    const st = strokeText(text, 'script', 100);
    const capW = 4.4; // world cap height
    const k = capW / st.capHeight;
    // char times: each word's chars across its sung time; spaces/punctuation at the word boundaries
    const times: [number, number][] = [];
    let wi = 0, ci = 0;
    const chars = Array.from(text);
    const wordChars = line.words.map((w) => Array.from(w.w).length);
    for (let i = 0; i < chars.length; i++) {
      const w = line.words[Math.min(wi, line.words.length - 1)]!;
      if (chars[i] === ' ') { times.push([w.end, w.end]); wi++; ci = 0; continue; }
      const n = wordChars[wi] ?? 1;
      times.push([lerp(w.start, w.end, ci / n), lerp(w.start, w.end, (ci + 1) / n)]);
      ci++;
    }
    this.plan = { st, times, x0: (-st.width * k) / 2, y0: 45, k };
    // the elevation of the tower, drawn in order (ground, outline, floors, spire, dimensions)
    const [x0, x1] = this.h.towerX as [number, number], z1 = this.h.towerZ[1]!;
    let y = 1.4;
    const levels = [y];
    for (const fl of this.h.floors) { y += fl.h; levels.push(y); }
    const top = y;
    const L: [number, number, number, number][] = [
      [-40, 0, 40, 0],
      [x0, 1.4, x0, top], [x0, top, x1, top], [x1, top, x1, 1.4], [x1, 1.4, x0, 1.4],
      ...levels.slice(1, -1).map((yy) => [x0, yy, x1, yy] as [number, number, number, number]),
      [0, top + 1.2, 0, top + 15],
      [x0 - 5, 1.4, x0 - 5, top], [x0 - 6.2, 1.4, x0 - 3.8, 1.4], [x0 - 6.2, top, x0 - 3.8, top],
      [x0, -3, x1, -3], [x0, -4.2, x0, -1.8], [x1, -4.2, x1, -1.8],
    ];
    let acc = 0;
    for (const [ax, ay, bx, by] of L) {
      const a = v3(ax, ay, z1 + 0.4), b = v3(bx, by, z1 + 0.4);
      const l = a.distanceTo(b);
      this.elev.push({ a, b, l0: acc, l1: acc + l });
      acc += l;
    }
    this.elevLen = acc;
  }

  cutAt(t: number) { let c = this.cuts[0]!; for (const x of this.cuts) if (t >= x.t) c = x; return c; }

  // ------------------------------------------------------------------ render
  render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const h = this.h, t = f.t, ctx = h['ctx'], renderer = ctx.renderer;
    const cut = this.cutAt(t);
    const o: PostOverrides = { bloom: 0.7, bloomThreshold: 0.95, bloomKnee: 0.3, vignette: 0.45, ca: 1.2, grain: 0.055 };
    let shake = 0;
    h.fx.clear(); h.L3.clear(); h.vox.clear(); h.slabs.clear(); h.hvox.clear(); this.glyphs.clear();
    h.hud.clear();

    applyCam(h.cam, this.camera(t, cut));
    shake += this.drawAll(t, f, cut, o);

    h.bg.u.lift!.value = 0.4;
    (h.bg.u.glowC!.value as THREE.Vector2).set(0.5, 0.45); h.bg.u.glowR!.value = 0.75;
    (h.bg.u.glowCol!.value as THREE.Vector3).set(...scl3(lin('blood'), 0.05 + 0.05 * f.a.bass));
    h.bg.render(renderer, out);
    renderer.setRenderTarget(out); renderer.clearDepth();
    h.vox.commit(); h.slabs.commit(); this.glyphs.commit();
    renderer.render(h.world, h.cam);
    h.L3.render(renderer, out, h.cam);
    h.fx.render(renderer, out);
    h.drawHud(t, { t: cut.t, id: cut.id === 'collapse' ? 'h2' : cut.id });
    this.drawHud3(t, cut);
    ctx.comp.draw(renderer, h.hud.upload(), out);
    (h.bg.u.glowCol!.value as THREE.Vector3).set(0, 0, 0);

    o.exposure = 1 + 0.3 * pulse(t - cut.t, 0, 0.05) * (cut.t > ctx.start + 0.01 ? 1 : 0);
    if (cut.id === 'collapse') { o.exposure = 1; o.vignette = 0.5; }
    if (shake > 0.05) o.shake = [noise1(t * 55, 1) * shake, noise1(t * 55, 2) * shake];
    return o;
  }

  // ------------------------------------------------------------------ camera
  private camera(t: number, cut: Cut): CamState {
    const h = this.h, T = h.T;
    const lt = t - cut.t;
    const P = Magic.PLANE;
    switch (cut.id) {
      case 'shards': {
        const k = clamp(lt / (this.glassW.end - this.tShatter));
        return { pos: v3(lerp(-6, 4, k), P.c.y + lerp(2, -1, k), lerp(140, 118, ease.outCubic(k))), target: v3(0, P.c.y, P.c.z), fov: 36, roll: lerp(-0.04, 0.02, k) };
      }
      case 'circles': {
        const k = ease.inOutCubic(clamp(lt / (this.tLand - cut.t)));
        return { pos: v3(lerp(4, 0, k), lerp(P.c.y - 1, 92, k), lerp(100, 62, k)), target: v3(0, lerp(P.c.y, 0, k), lerp(P.c.z, 0, k)), fov: lerp(36, 42, k), roll: lerp(0.02, 0, k) };
      }
      case 'summon': {
        const k = clamp(lt / 1.9);
        return { pos: orbit(v3(0, 5, 0), lerp(-0.55, 0.15, ease.inOutCubic(k)), lerp(0.2, 0.12, k), lerp(88, 78, k)), target: v3(0, 5.5, 0), fov: 38, roll: 0.02 };
      }
      case 'summon2': {
        const k = clamp(lt / (this.tWand - cut.t));
        return { pos: orbit(v3(0, 6, 0), lerp(0.15, 0.55, k), lerp(0.14, 0.62, ease.inOutCubic(k)), lerp(80, 120, k)), target: v3(0, lerp(5.5, 12, k), 0), fov: 40, roll: -0.03 };
      }
      case 'wand': {
        const k = clamp(lt / (this.cuts.find((c) => c.id === 'wand2')!.t - cut.t));
        return { pos: v3(lerp(-14, 8, k), lerp(38, 35, k), lerp(104, 94, k)), target: v3(lerp(-6, 5, k), 36, 9), fov: 36, roll: lerp(-0.03, 0.02, k) };
      }
      case 'wand2': {
        const k = ease.inOutCubic(clamp(lt / (this.cuts.find((c) => c.id === 'tower')!.t - cut.t)));
        return { pos: orbit(v3(0, 18, 2), lerp(0.05, -0.62, k), lerp(0.2, 0.3, k), lerp(98, 92, k)), target: v3(0, 18, 2), fov: 38, roll: 0.02 };
      }
      case 'tower': {
        const top = h.towerTop(t);
        return { pos: v3(34 - lt * 5, 3 + top * 0.3, 60 - lt * 4), target: v3(0, Math.max(6, top - 2), 2), fov: 40, roll: 0.04 };
      }
      case 'standing': {
        const whip = prog(t, T.hw[0]!.start - 0.35, T.hw[0]!.start, ease.inCubic);
        return { pos: orbit(v3(0, 18, 0), lerp(-0.4, -0.15, clamp(lt / 1.6)), lerp(0.08, 0.2, clamp(lt / 1.6)), lerp(122, 108, clamp(lt / 1.6))), target: v3(0, 20 + whip * 24, 0), fov: 38 - whip * 6, roll: -0.02 - whip * 0.16 };
      }
      default: return this.hookCam(t, cut);
    }
  }
  private hookCam(t: number, cut: Cut): CamState {
    const h = this.h, T = h.T;
    const wi = cut.id === 'h0' || cut.id === 'h0b' ? 0 : cut.id === 'h1' ? 1 : 2;
    const hw = h.hookWords[wi]!, X = hw.xf, lt = t - cut.t;
    const fov = 34, d = h.fitDist(hw.sw, fov, 1.24);
    if (cut.id === 'h0') { const k = clamp(lt / 0.8); return camIn(X, [lerp(-10, -3, k), lerp(-6, -3, k), d * lerp(1.06, 0.98, k)], [0, 0, 0], fov, lerp(-0.08, -0.03, k)); }
    if (cut.id === 'h0b') { const k = clamp(lt / 0.4); return camIn(X, [lerp(26, 30, k), lerp(12, 14, k), d * 0.84], [2, 0, 0], fov, 0.07); }
    if (cut.id === 'h1') { const k = clamp(lt / 0.3); return camIn(X, [lerp(-6, -9, k), lerp(10, 12, k), 44 - k * 4], [0, 0, 2], 40, -0.12); }
    // DEMAND, held: a slow push with a roll that unwinds, then the collapse holds dead centre
    const k = clamp((t - T.hw[2]!.start) / (this.tCollapse - T.hw[2]!.start));
    const c = prog(t, this.tCollapse, h['ctx'].end, ease.inOutCubic);
    return camIn(X, [lerp(-3, 0, k) * (1 - c), lerp(-3, 0, k) * (1 - c), d * lerp(1.04, 0.9, ease.outCubic(k)) * (1 + 0.25 * c)], [0, 0, 0], fov, lerp(0.05, 0, k) * (1 - c));
  }

  // ------------------------------------------------------------------ the world of the spell
  private drawAll(t: number, f: Frame, cut: Cut, o: PostOverrides): number {
    const h = this.h, T = h.T, L3 = h.L3, cam = h.cam;
    let shake = 0;
    const gold = lin('signal');
    const isHook = cut.id.startsWith('h') || cut.id === 'collapse';

    // ---- glass shards (the bridge's last word, held) → ring segments
    const shardsOn = t < this.tLand + 0.2;
    this.shardMesh.visible = shardsOn;
    if (shardsOn) shake += this.drawShards(t);

    // ---- the ground circle (forms as the shards land; stays under everything that follows)
    const form = prog(t, this.glassW.end + 0.1, this.tLand, ease.inOutCubic);
    if (!isHook && form > 0) this.groundCircle(t, f, form, cut);

    // ---- BUILDER conjured from the circle
    const bOn = t < this.tWand + 0.2 && t > T.la.words[0]!.start - 0.8;
    if (bOn) {
      const fade = 1 - smoothstep(this.tWand - 0.6, this.tWand, t);
      shake += h.drawBuilder(t, 'rise', 0, fade, (i, x) => {
        const a = (x / 36) * 1.6 + Math.PI / 2 + (hash(i, 41) - 0.5) * 0.5;
        return [Math.cos(a) * 30, 0.2, Math.sin(a) * 30];
      }) * 0.6;
      const xC = h.caretX(t);
      if (t > T.la.words[0]!.start - 0.4 && t < this.tWand - 0.9) {
        caretAt(h, cam, v3(xC, 0, 1.3), v3(xC, 10.6, 1.3), t > T.la.end ? cursorBlink(f.beatPhase) : 1, t);
        weldSparks(h.fx, t, (tb) => {
          if (tb < T.la.words[0]!.start - 0.1 || tb > T.la.end + 0.3) return null;
          const s = toScreen(cam, h.caretX(tb), 0.1, 1.3);
          return s.ok ? { x: s.x, y: s.y } : null;
        }, { rate: (tb) => { let r = 20; for (const s of T.syl) r += 300 * pulse(tb, s + 0.06, 0.05); return Math.min(r, 700); }, rateMax: 700, life: 0.5, speed: 420, gravity: 900, intensity: 1 });
      }
    } else for (const { p } of h.leadPlanes) p.set({ opacity: 0 });

    // ---- the armillary: vertical glyph rings rise around BUILDER in the gap, and stay around the tower
    const arm = smoothstep(T.la.end, this.tWand, t) * (isHook ? 0 : 1);
    if (arm > 0) this.armillary(t, v3(0, 6 + 14 * arm, 0), 40 + 4 * arm, arm * (cut.id === 'wand' ? 0.35 : 1), f);

    // ---- the wand: the caret grows into it, writes the line, draws the plan
    const wandOn = t > this.tWand - 0.9 && t < h.collapseT + 0.3;
    if (wandOn) shake += this.drawWand(t, f);

    // ---- the tower of sung words inside the plan's frame
    if (cut.id === 'tower' || cut.id === 'standing') {
      shake += h.drawTower(t, f, { plinth: false, caret: false, fogFar: [300, 1200], floorCol: scl3(lin('ink2'), 1.4) });
      this.towerRings(t);
    } else h.hideTower();

    // ---- the hook: the spell
    if (isHook) shake += this.drawSpell(t, f, cut, o);
    else for (const hw of h.hookWords) hw.group.visible = false;

    h.vox.fog(400, 1500); h.slabs.fog(400, 1500);
    for (const { p } of h.leadPlanes) p.fog(400, 1500);
    void gold;
    return shake;
  }

  private drawShards(t: number): number {
    const P = Magic.PLANE, L3 = this.h.L3;
    const pos = this.shardGeo.getAttribute('position') as THREE.BufferAttribute;
    const aA = this.shardGeo.getAttribute('aA') as THREE.BufferAttribute;
    const t0 = this.tShatter, tg = this.glassW.end;
    // slow motion while "glass." is held, then they fly
    // (glass hands over shards already in flight: start a little way into the burst)
    const tau = 0.07 + 0.2 * Math.min(t - t0, tg - t0) + Math.max(0, t - tg) * 0.9;
    const bone = lin('bone'), ember = lin('ember'), gold = lin('signal');
    const q = new THREE.Quaternion(), qf = new THREE.Quaternion().setFromAxisAngle(v3(1, 0, 0), -Math.PI / 2);
    const tmp = new THREE.Vector3();
    this.shardMat.uniforms.prog!.value = clamp((t - this.glassW.start) / (this.glassW.end - this.glassW.start)) * 0.84 + 0.08;
    let shake = 0;
    this.shards.forEach((s, i) => {
      const land = ease.inOutCubic(clamp((t - tg - 0.1 - s.d * 0.45) / 0.85));
      const free = v3(P.c.x + s.c.x + s.vel.x * tau, P.c.y + s.c.y + s.vel.y * tau, P.c.z + s.vel.z * tau);
      const R = [22, 30, 36, 42][s.ring]!;
      // (barely turning while the word is held, so GLASS. still reads; tumbling once it flies)
      const spinA = s.spin * (0.35 * Math.min(tau, 0.46) + Math.max(0, tau - 0.46));
      q.setFromAxisAngle(s.axis, spinA);
      // the landing: flat on the ground, tangent to its ring, turning with it
      const th = s.th + t * 0.12 * (s.ring % 2 ? -1 : 1);
      const target = v3(Math.cos(th) * R, 0.1, Math.sin(th) * R);
      const qt = qf.clone().premultiply(new THREE.Quaternion().setFromAxisAngle(v3(0, 1, 0), -th + Math.PI / 2));
      q.slerp(qt, land);
      const c = free.lerp(target, land);
      const sc = lerp(1, 0.35, land);
      const alpha = 1 - smoothstep(0.75, 1, land);
      const pts: THREE.Vector3[] = [];
      for (let j = 0; j < 3; j++) {
        const v = s.v[j]!;
        tmp.set(v.x * sc, v.y * sc, 0).applyQuaternion(q).add(c);
        pos.setXYZ(i * 3 + j, tmp.x, tmp.y, tmp.z);
        aA.setX(i * 3 + j, alpha);
        pts.push(tmp.clone());
      }
      // edges: bone, a glint travelling along some of them
      const glint = hash(i, frameIdx(t) >> 2) < 0.06 ? 1 : 0;
      const ec = mix3(scl3(bone, 0.85), scl3(ember, 2.5), glint + land * 0.4);
      const ea = alpha * 0.9 + land * (1 - alpha) * 0.9;
      const ecc = land > 0.75 ? scl3(gold, 1.6) : ec;
      for (let j = 0; j < 3; j++) { const a = pts[j]!, b = pts[(j + 1) % 3]!; L3.seg(a.x, a.y, a.z, b.x, b.y, b.z, 1.2, ecc[0], ecc[1], ecc[2], ea); }
    });
    pos.needsUpdate = true; aA.needsUpdate = true;
    shake += 12 * pulse(t, this.tShatter, 0.08) + 6 * pulse(t, tg, 0.06);
    // the strike point the glass broke from (glass's last frame): the cursor's tip, fading as the word is held
    const tipA = 1 - smoothstep(t0 + 0.25, t0 + 0.9, t);
    if (tipA > 0) { const sp = toScreen(this.h.cam, P.c.x, P.c.y, P.c.z); if (sp.ok) cursorTip(this.h.fx, sp.x, sp.y, t, 1.6, tipA); }
    return shake;
  }

  /** The main circle on the ground: rings, glyph bands, an octagram, ticks — revealed by `form` 0..1. */
  private groundCircle(t: number, f: Frame, form: number, cut: Cut) {
    const L3 = this.h.L3, G = this.glyphs;
    const gold = lin('signal'), ember = lin('ember');
    const X = v3(1, 0, 0), Z = v3(0, 0, 1), C = v3(0, 0.05, 0);
    const beatK = pulse(t, this.h['ctx'].audio.timeOfBeat(Math.floor(f.beat)), 0.12);
    const I = 0.9 + 0.5 * beatK + 0.8 * pulse(t, this.tLand, 0.2);
    const dimTower = cut.id === 'tower' || cut.id === 'standing' || cut.id === 'wand' || cut.id === 'wand2' ? 0.55 : 1;
    const col = scl3(gold, I * dimTower);
    const a1 = form * TAU;
    for (const [r, w, dir] of [[20, 1.6, 1], [22, 1.2, -1], [30, 1.2, 1], [34, 1.6, -1], [42, 2.0, 1], [44.5, 1.0, -1]] as const) {
      const ph = t * 0.1 * dir;
      circle3(L3, C, X, Z, r, w, col, 1, 140, ph, ph + a1);
    }
    // ticks between 42 and 44.5
    const rot = t * 0.05;
    for (let i = 0; i < 120 * form; i++) {
      const a = rot + (i / 120) * TAU, L = i % 10 === 0 ? 2.5 : 1.2;
      L3.seg(Math.cos(a) * 42, 0.05, Math.sin(a) * 42, Math.cos(a) * (42 + L), 0.05, Math.sin(a) * (42 + L), 1, col[0] * 0.8, col[1] * 0.8, col[2] * 0.8, 1);
    }
    // octagram inside r = 20 (two squares) and spokes to the outer bands
    const sq = t * -0.18;
    for (let s = 0; s < 2; s++) for (let i = 0; i < 4; i++) {
      if ((s * 4 + i) / 8 > form) continue;
      const a = sq + s * (Math.PI / 4) + (i / 4) * TAU, b = a + TAU / 4;
      L3.seg(Math.cos(a) * 20, 0.05, Math.sin(a) * 20, Math.cos(b) * 20, 0.05, Math.sin(b) * 20, 1.3, col[0], col[1], col[2], 1);
    }
    for (let i = 0; i < 12 * form; i++) {
      const a = rot * 2 + (i / 12) * TAU;
      L3.seg(Math.cos(a) * 22, 0.05, Math.sin(a) * 22, Math.cos(a) * 30, 0.05, Math.sin(a) * 30, 0.9, col[0] * 0.6, col[1] * 0.6, col[2] * 0.6, 1);
    }
    // glyph bands: code glyphs lying on the ground, reading around the circle
    const band = (r: number, hgt: number, n: number, speed: number, code: number, c: RGB) => {
      const g = RING_CODE[code % RING_CODE.length]!;
      for (let i = 0; i < n; i++) {
        const fr = i / n;
        if (fr > form) break;
        const a = t * speed + fr * TAU;
        const p = v3(Math.cos(a) * r, 0.08, Math.sin(a) * r);
        const tan = v3(-Math.sin(a), 0, Math.cos(a)).multiplyScalar(hgt * 0.36 * Math.sign(speed || 1));
        const up = v3(Math.cos(a), 0, Math.sin(a)).multiplyScalar(hgt * 0.5);
        const flick = 0.75 + 0.25 * hash(i, code, frameIdx(t) >> 3);
        G.add(p, tan.negate(), up, g[i % g.length]!, c, flick);
      }
    };
    band(26, 4.8, 44, 0.16, 0, scl3(mix3(gold, ember, 0.3), 1.4 * I * dimTower));
    band(38.2, 3.2, 70, -0.1, 1, scl3(gold, 1.1 * I * dimTower));
  }

  /** Vertical glyph rings (an armillary) around a centre: three rings on turning axes. */
  private armillary(t: number, c: THREE.Vector3, R: number, a: number, f: Frame, spinK = 1) {
    const L3 = this.h.L3, G = this.glyphs, gold = lin('signal');
    const beatK = pulse(t, this.h['ctx'].audio.timeOfBeat(Math.floor(f.beat)), 0.1);
    for (let k = 0; k < 3; k++) {
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.4 + k * 0.9 + t * 0.21 * spinK * (k % 2 ? -1 : 1), t * 0.33 * spinK + k * 2.1, 0.2 * k));
      const u = v3(1, 0, 0).applyQuaternion(q), v = v3(0, 1, 0).applyQuaternion(q);
      const r = R * (1 - k * 0.12);
      circle3(L3, c, u, v, r, 1.4, scl3(gold, (1.1 + beatK) * a), 1, 120);
      circle3(L3, c, u, v, r - 4.2, 1.0, scl3(gold, 0.7 * a), 1, 120);
      const g = RING_CODE[(k + 2) % RING_CODE.length]!;
      const n = Math.round(r * 1.25);
      for (let i = 0; i < n; i++) {
        const an = (i / n) * TAU + t * 0.4 * (k % 2 ? 1 : -1);
        const dir = u.clone().multiplyScalar(Math.cos(an)).addScaledVector(v, Math.sin(an));
        const tan = u.clone().multiplyScalar(-Math.sin(an)).addScaledVector(v, Math.cos(an));
        G.add(c.clone().addScaledVector(dir, r - 2.1), tan.multiplyScalar(-1.15), dir.clone().multiplyScalar(1.6), g[i % g.length]!, scl3(gold, 1.3 * a), 0.9);
      }
    }
  }

  /** Where the wand's tip is and what it has drawn: the line (single stroke) and then the plan. */
  private drawWand(t: number, f: Frame): number {
    const h = this.h, L3 = h.L3, cam = h.cam, T = h.T;
    const gold = lin('signal'), ember = lin('ember');
    const pl = this.plan;
    const toW = (x: number, y: number) => v3(pl.x0 + x * pl.k, pl.y0 - y * pl.k, 9.4);
    // written line
    const len = writtenLength(pl.st, pl.times, t);
    let head: THREE.Vector3 | null = null;
    const w2 = this.cuts.find((c) => c.id === 'wand2')!.t;
    const lineFade = 1 - smoothstep(w2 + 0.1, w2 + 0.7, t);
    const heat = (s0: number) => Math.exp(-Math.max(0, len - s0) / 120);
    for (let i = 0; i < pl.st.strokes.length && lineFade > 0; i++) {
      const s0 = pl.st.startLen[i]!;
      if (s0 >= len) break;
      const pts = pl.st.strokes[i]!, Ls = pl.st.lens[i]!;
      for (let j = 1; j < pts.length; j++) {
        if (s0 + Ls[j - 1]! >= len) break;
        const a = pts[j - 1]!, bRaw = pts[j]!;
        let b = bRaw;
        if (s0 + Ls[j]! > len) { const u = (len - s0 - Ls[j - 1]!) / Math.max(1e-6, Ls[j]! - Ls[j - 1]!); b = { x: a.x + (bRaw.x - a.x) * u, y: a.y + (bRaw.y - a.y) * u }; }
        const A = toW(a.x, a.y), B = toW(b.x, b.y);
        const hk = heat(s0 + Ls[j]!);
        const c = mix3(scl3(gold, 1.25), scl3(ember, 3.2), hk);
        L3.seg(A.x, A.y, A.z, B.x, B.y, B.z, 3.2, c[0], c[1], c[2], lineFade);
        L3.seg(A.x, A.y, A.z, B.x, B.y, B.z, 9, gold[0] * 0.25, gold[1] * 0.25, gold[2] * 0.25, lineFade * 0.6);
        head = B;
      }
    }
    // the plan (elevation), drawn after the line, then lifted into 3D
    const pk = prog(t, this.tPlan1 + 0.05, this.tExtrude - 0.05, ease.inOutQuad);
    const plen = pk * this.elevLen;
    const ext = ease.inOutCubic(prog(t, this.tExtrude - 0.05, this.tExtrude + 0.45, (x) => x));
    const depth = (this.h.towerZ[1]! - this.h.towerZ[0]!) * ext;
    const bone = lin('bone');
    let pHead: THREE.Vector3 | null = null;
    const planFade = 1 - 0.5 * smoothstep(h.collapseT + 0.5, h.collapseT + 1.5, t);
    for (const e of this.elev) {
      if (e.l0 >= plen) break;
      const u = clamp((plen - e.l0) / (e.l1 - e.l0));
      const b = e.a.clone().lerp(e.b, u);
      const c = scl3(gold, 1.1 * planFade);
      L3.seg(e.a.x, e.a.y, e.a.z, b.x, b.y, b.z, 1.6, c[0], c[1], c[2], 1);
      if (depth > 0.01 && e.a.y > -1 && Math.abs(e.a.x) < 30) {
        // the lifted copy at the back and the depth edges
        L3.seg(e.a.x, e.a.y, e.a.z - depth, b.x, b.y, b.z - depth, 1.2, c[0] * 0.6, c[1] * 0.6, c[2] * 0.6, 1);
        L3.seg(e.a.x, e.a.y, e.a.z, e.a.x, e.a.y, e.a.z - depth, 1.0, bone[0] * 0.5, bone[1] * 0.5, bone[2] * 0.5, 1);
      }
      if (u < 1) pHead = b;
    }
    if (pk > 0 && pk < 1 && pHead) head = pHead;
    // the wand itself: grows out of the caret at BUILDER's end, tilts, and follows its tip
    const grow = ease.inOutCubic(prog(t, this.tWand - 0.9, this.tWand - 0.1, (x) => x));
    const idle = v3(26, 30, 12);
    let tip = head ?? (len > 0 || pk > 0 ? toW(pl.st.width, 0) : idle);
    if (!head && pk >= 1) tip = this.elev[this.elev.length - 1]!.b.clone();
    const caretBase = v3(h.caretX(this.tWand - 1), 0, 1.3), caretTop = v3(h.caretX(this.tWand - 1), 10.6, 1.3);
    const tipNow = caretBase.clone().lerp(tip, grow);
    const handNow = caretTop.clone().lerp(tip.clone().add(v3(14, -18, 22)), grow);
    const fade = 1 - smoothstep(h.collapseT - 0.1, h.collapseT + 0.25, t);
    if (fade > 0) {
      const a = toScreen(cam, tipNow.x, tipNow.y, tipNow.z), b = toScreen(cam, handNow.x, handNow.y, handNow.z);
      if (a.ok && b.ok) {
        h.fx.seg2(a.x, a.y, b.x, b.y, 5, scl3(gold, 2.0 * fade), 1);
        h.fx.seg2(a.x, a.y, b.x, b.y, 16, scl3(gold, 0.35 * fade), 0.4);
        h.fx.seg2(b.x, b.y, b.x + (b.x - a.x) * 0.15, b.y + (b.y - a.y) * 0.15, 8, scl3(lin('blood'), 1.2 * fade), 1);
        cursorTip(h.fx, a.x, a.y, t, 1.5, fade);
      }
      const drawing = (len > 0 && len < pl.st.total) || (pk > 0 && pk < 1);
      weldSparks(h.fx, t, (tb) => {
        const lb = writtenLength(pl.st, pl.times, tb);
        const pkb = prog(tb, this.tPlan1 + 0.05, this.tExtrude - 0.05, ease.inOutQuad);
        if (!((lb > 0 && lb < pl.st.total) || (pkb > 0 && pkb < 1))) return null;
        return a.ok ? { x: a.x, y: a.y } : null;
      }, { rate: drawing ? 140 : 0, life: 0.4, speed: 260, gravity: 500, intensity: 0.9, seed: 7 });
    }
    void T; void f;
    return 0;
  }

  /** Each floor gets a horizontal glyph ring around it as it is conjured. */
  private towerRings(t: number) {
    const h = this.h, G = this.glyphs, L3 = h.L3, gold = lin('signal');
    let y = 1.4;
    h.floors.forEach((fl, i) => {
      const hh = h.floorH(fl, t);
      if (hh <= 0.01) return;
      const k = pulse(t, fl.t0, 0.25);
      const yy = y + hh * 0.5 + (1 - ease.outExpo(clamp((t - fl.t0) / 0.3))) * -6;
      const R = 30 + i * 0.5 - k * 4;
      const c = v3(0, yy, 2);
      circle3(L3, c, v3(1, 0, 0), v3(0, 0, 1), R, 1.2, scl3(gold, 0.6 + 1.6 * k), 1, 100, t * 0.2, t * 0.2 + TAU);
      const g = RING_CODE[i % RING_CODE.length]!;
      const n = 48;
      for (let j = 0; j < n; j++) {
        const a = (j / n) * TAU + t * (i % 2 ? 0.3 : -0.3);
        const dir = v3(Math.cos(a), 0, Math.sin(a));
        G.add(c.clone().addScaledVector(dir, R + 2), v3(-Math.sin(a), 0, Math.cos(a)).multiplyScalar(-1.0), v3(0, 1.4, 0), g[j % g.length]!, scl3(gold, 0.5 + 1.2 * k), 0.9);
      }
      y += hh;
    });
  }

  // ------------------------------------------------------------------ the spell (hook)
  private drawSpell(t: number, f: Frame, cut: Cut, o: PostOverrides): number {
    const h = this.h, T = h.T, L3 = h.L3, G = this.glyphs;
    const wi = cut.id === 'h0' || cut.id === 'h0b' ? 0 : cut.id === 'h1' ? 1 : 2;
    const w = T.hw[wi]!, lt = t - w.start;
    const gold = lin('signal'), ember = lin('ember');
    const col = prog(t, this.tCollapse, h['ctx'].end - 0.05, ease.inOutCubic);
    const S = Math.max(0.001, 1 - col);
    let shake = 0;
    const C = h.hookWords[wi]!.xf.o;
    h.hookWords.forEach((hw, i) => {
      hw.group.visible = i === wi && S > 0.02;
      if (i !== wi) return;
      const e = ease.outExpo(clamp(lt / 0.13));
      hw.xf.place(hw.group, 0, 0, lerp(wi === 1 ? 18 : 45, 0, e), lerp(-0.2, 0, e), S);
      hw.mats.u.heat.value = 0.45 + 0.8 * pulse(t, w.start, 0.12) + 0.4 * pulse(t, h['ctx'].audio.timeOfBeat(Math.floor(f.beat)), 0.1);
      hw.mats.u.fogNear.value = 400; hw.mats.u.fogFar.value = 1600;
    });
    shake += (wi === 2 ? 26 : 18) * pulse(t, w.start + 0.05, 0.06) * S;
    o.flash = 0;
    o.bloom = 0.85;
    // the great circle behind the word, facing the camera, and the armillary around it
    const beats = [T.hw[0]!.start, T.hw[1]!.start, T.hw[2]!.start];
    const au = h['ctx'].audio;
    for (let b = Math.ceil(au.beatAt(T.hw[2]!.start)); au.timeOfBeat(b) < this.tCollapse; b++) beats.push(au.timeOfBeat(b));
    const nRings = beats.filter((b) => t >= b).length; // one more ring every word and every beat of DEMAND
    const beatK = pulse(t, au.timeOfBeat(Math.floor(f.beat)), 0.1);
    const X = v3(1, 0, 0), Y = v3(0, 1, 0);
    for (let k = 0; k < nRings + 2; k++) {
      const born = k < 2 ? T.hw[0]!.start : beats[k - 2]!;
      const g = ease.outExpo(clamp((t - born) / 0.25));
      const R = (26 + k * 9) * g * S + 0.01;
      const cz = C.clone().add(v3(0, 0, -12 - k * 1.5));
      const a = 1 - k * 0.05;
      const cc = mix3(scl3(gold, (1.2 + beatK) * a), scl3(ember, 3), pulse(t, born, 0.12));
      const ph = t * (k % 2 ? 0.25 : -0.18) * (1 + k * 0.1);
      circle3(L3, cz, X, Y, R, k % 3 === 0 ? 2.2 : 1.3, cc, 1, 160, ph, ph + TAU);
      // glyph band on every other ring
      if (k % 2 === 0) {
        const code = RING_CODE[k % RING_CODE.length]!;
        const n = Math.round(R * 1.1);
        for (let i = 0; i < n; i++) {
          const an = ph + (i / n) * TAU;
          const dir = X.clone().multiplyScalar(Math.cos(an)).addScaledVector(Y, Math.sin(an));
          const tan = X.clone().multiplyScalar(-Math.sin(an)).addScaledVector(Y, Math.cos(an));
          G.add(cz.clone().addScaledVector(dir, R - 2.4 * S), tan.multiplyScalar(-1.3 * S), dir.clone().multiplyScalar(1.8 * S), code[i % code.length]!, scl3(gold, 1.4 * a), 0.95);
        }
      }
      // ticks and a polygon inscribed every third ring
      if (k % 3 === 1) {
        const m = 6 + k;
        for (let i = 0; i < m; i++) {
          const a0 = -ph * 0.6 + (i / m) * TAU, a1 = a0 + (TAU * 2) / m;
          L3.seg(cz.x + Math.cos(a0) * R, cz.y + Math.sin(a0) * R, cz.z, cz.x + Math.cos(a1) * R, cz.y + Math.sin(a1) * R, cz.z, 1.0, cc[0] * 0.6, cc[1] * 0.6, cc[2] * 0.6, 1);
        }
      }
    }
    // the armillary around the word (spins up through the hook)
    this.armillary(t, C.clone(), (40 + 3 * Math.min(nRings, 4)) * S, 0.9 * Math.max(0, S), f, 1.5 + nRings * 0.3);
    // the collapse: the rings and the word drain into the centre and condense into one sigil around the
    // cursor's tip — outro's first frame (a circle with a hexagram, ~0.93 H across, tilted back 0.35 rad)
    if (col > 0) {
      const s = toScreen(h.cam, C.x, C.y, C.z);
      const D = h.cam.position.distanceTo(C);
      const R = 0.46 * 2 * D * Math.tan((h.cam.fov * Math.PI) / 360);
      const draw = ease.outCubic(smoothstep(0.15, 0.85, col));
      const tilt = new THREE.Quaternion().setFromAxisAngle(v3(1, 0, 0), 0.35 * smoothstep(0.3, 1, col));
      const U = v3(1, 0, 0).applyQuaternion(tilt), Vv = v3(0, 1, 0).applyQuaternion(tilt);
      const rot = (1 - col) * (1 - col) * 2.2;
      const P = (r: number, a: number) => C.clone().addScaledVector(U, Math.cos(a + rot) * r).addScaledVector(Vv, Math.sin(a + rot) * r);
      const cc = scl3(gold, 2.6 + 0.6 * (1 - col));
      const segP = (a: THREE.Vector3, b: THREE.Vector3, w: number, k = 1) => L3.seg(a.x, a.y, a.z, b.x, b.y, b.z, w, cc[0] * k, cc[1] * k, cc[2] * k, 1);
      for (const [r, w] of [[1, 3.2], [0.9, 2.3], [0.58, 2.0]] as const) {
        const n = 96;
        for (let i = 0; i < n * draw; i++) segP(P(R * r, (i / n) * TAU + Math.PI / 2), P(R * r, ((i + 1) / n) * TAU + Math.PI / 2), w);
      }
      for (const r0 of [0, Math.PI / 3]) for (let i = 0; i < 3; i++) {
        const a0 = r0 + Math.PI / 2 + (i / 3) * TAU, a1 = a0 + TAU / 3;
        const A = P(R * 0.9, a0), B = P(R * 0.9, a1);
        segP(A, A.clone().lerp(B, draw), 1.4);
      }
      for (let i = 0; i < 72 * draw; i++) { const a = (i / 72) * TAU; segP(P(R * (i % 6 === 0 ? 0.86 : 0.93), a), P(R * 0.9, a), 1, 0.8); }
      for (let i = 0; i < 6; i++) { const a = Math.PI / 2 + (i / 6) * TAU; const c0 = P(R * 0.9, a); circle3(L3, c0, U, Vv, R * 0.06 * draw, 1.2, cc, 1, 16); }
      const code = RING_CODE[0]!;
      for (let i = 0; i < 12 * draw; i++) {
        const a = (i / 12) * TAU + 0.13 + rot;
        const dir = U.clone().multiplyScalar(Math.cos(a)).addScaledVector(Vv, Math.sin(a));
        const tan = U.clone().multiplyScalar(-Math.sin(a)).addScaledVector(Vv, Math.cos(a));
        G.add(C.clone().addScaledVector(dir, R * 0.95), tan.multiplyScalar(-R * 0.028), dir.clone().multiplyScalar(R * 0.04), code[i % code.length]!, scl3(gold, 1.4), 0.95);
      }
      // the tip at the centre (the word drained into it)
      cursorTip(h.fx, s.x, s.y, t, lerp(3.2, 2.8, smoothstep(0.4, 1, col)), 1.2);
      // sparks sucked into the centre
      for (let i = 0; i < 140 * (1 - col); i++) {
        const a = hash(i, 51) * TAU, r0 = (160 + 700 * hash(i, 52)) * (1 - col);
        const x = s.x + Math.cos(a) * r0, y = s.y + Math.sin(a) * r0;
        h.fx.seg2(x, y, x + (s.x - x) * 0.08, y + (s.y - y) * 0.08, 1.6, scl3(gold, 1.8), 0.8);
      }
      shake += 8 * pulse(t, this.tCollapse, 0.06);
    }
    return shake;
  }

  private drawHud3(t: number, cut: Cut) {
    const h = this.h, c = h.hud.ctx, T = h.T;
    c.font = font(F.mono(400), 14);
    c.letterSpacing = '0px';
    if (cut.id === 'shards' || cut.id === 'circles') {
      c.fillStyle = rgba('bone', 0.65);
      c.fillText(`fragments  ${String(this.shards.length).padStart(4, '0')}`, 96, H - 88);
      c.fillStyle = rgba('signal', 0.85);
      c.fillText(cut.id === 'shards' ? 'gate: removed' : `circle: ${Math.round(prog(t, this.glassW.end, this.tLand) * 100)} % closed`, 96, H - 66);
    }
    if (cut.id === 'wand' || cut.id === 'wand2') {
      c.fillStyle = rgba('bone', 0.6);
      c.fillText('drawn by: a wizard · scale 1:1 · sheet 1 of 1', 96, H - 88);
      c.fillStyle = rgba('signal', 0.85);
      c.fillText(`plan  ${Math.round(prog(t, this.tPlan0, this.tExtrude) * 100)} %`, 96, H - 66);
    }
    if (cut.id === 'collapse') {
      c.fillStyle = rgba('bone', 0.5 * (1 - smoothstep(this.tCollapse, this.tCollapse + 0.8, t)));
      c.fillText('compiling spell → cursor', W - 96 - 240, H - 66);
    }
    void T;
  }
}

/** A caret standing in the world (thin wrapper so the magic module can draw it the same way). */
function caretAt(h: Hook, cam: THREE.PerspectiveCamera, bot: THREE.Vector3, top: THREE.Vector3, on: number, t: number) {
  const a = toScreen(cam, bot.x, bot.y, bot.z), b = toScreen(cam, top.x, top.y, top.z);
  if (!a.ok || !b.ok) return;
  const hPx = Math.hypot(a.x - b.x, a.y - b.y);
  const I = on;
  const w = Math.max(3, hPx * 0.06);
  h.fx.seg2(a.x, a.y, b.x, b.y, w, scl3(lin('signal'), 2.0 * I), 1);
  h.fx.seg2(a.x, a.y, b.x, b.y, w * 3, scl3(lin('signal'), 0.4 * I), 0.35);
  cursorTip(h.fx, a.x, a.y, t, Math.max(0.6, hPx / 70), I);
}
