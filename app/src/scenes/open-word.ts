// A word on its own plane in 3D, written left to right by the cursor (a slanted wipe that follows the
// italic), gold at the pen and cooling to bone behind it. Depth of field is faked with the texture's
// mip chain (a LOD bias grows with defocus) plus an alpha falloff.
import * as THREE from 'three';
import { font } from '../engine/type';
import { SCALE } from '../engine/scale';
import { LIN } from '../engine/palette';

const VERT = /* glsl */ `
precision highp float;
in vec3 position; in vec2 uv;
uniform mat4 projectionMatrix; uniform mat4 modelViewMatrix;
out vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const FRAG = /* glsl */ `
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D map;
uniform vec2 texPx;      // texture size (px)
uniform float basePx;    // baseline y from the top (px)
uniform float inkL, inkW; // ink extent along x (px)
uniform float slant;     // tan of the italic angle
uniform float prog;      // 0..1 written
uniform float feather;   // fraction of the word
uniform float hotLen;    // fraction of the word behind the pen that is still gold
uniform float cool;      // 0 = gold trail visible, 1 = fully cooled to bone
uniform float gold;      // 0..1: the whole word gold (magic)
uniform float flare;     // additive white-hot on the gold
uniform float opacity;
uniform float blur;      // mip bias
uniform vec3 cBone, cGold, cEmber;
void main() {
  float a = texture(map, vUv, blur).a;
  if (a <= 0.002) discard;
  float xpx = vUv.x * texPx.x;
  float yAbove = basePx - (1.0 - vUv.y) * texPx.y;
  float u = (xpx - yAbove * slant - inkL) / max(1.0, inkW);
  float e = prog * (1.0 + feather);
  float shown = prog >= 1.0 ? 1.0 : 1.0 - smoothstep(e - feather, e, u);
  if (prog <= 0.0) shown = 0.0;
  float behind = max(0.0, e - feather - u);
  float hot = (1.0 - smoothstep(0.0, hotLen, behind)) * (1.0 - cool);
  vec3 col = mix(cBone, cGold * 1.35, hot);
  col = mix(col, cEmber * 2.2, hot * (1.0 - smoothstep(0.0, hotLen * 0.25, behind)) * 0.6);
  col = mix(col, cGold * (1.02 + flare * 1.3) + cEmber * flare * 1.0, gold);
  float al = a * shown * opacity;
  fragColor = vec4(col * al, al);
}`;

export interface WordPlaneOpts { capH: number; px?: number; slant?: number }

export class WordPlane {
  mesh: THREE.Mesh;
  mat: THREE.RawShaderMaterial;
  /** World sizes: advance width, ink left/width, ascender (caret top) and cap height. */
  adv: number; inkL: number; inkW: number; asc: number; capH: number;
  /** World units per canvas px. */
  k: number;
  constructor(public text: string, family: string, o: WordPlaneOpts) {
    const px = (o.px ?? 200) * SCALE;
    const cv = document.createElement('canvas');
    const c0 = cv.getContext('2d')!;
    c0.font = font(family, px);
    const m = c0.measureText(text);
    const cap = c0.measureText('H').actualBoundingBoxAscent;
    const asc = Math.max(m.actualBoundingBoxAscent, cap);
    const desc = Math.max(0, m.actualBoundingBoxDescent);
    const pad = Math.ceil(px * 0.12);
    const inkLpx = -m.actualBoundingBoxLeft, inkRpx = m.actualBoundingBoxRight;
    const x0 = pad - Math.min(0, inkLpx); // pen origin in the canvas
    const Wc = Math.ceil(x0 + Math.max(inkRpx, m.width) + pad), Hc = Math.ceil(asc + desc + pad * 2);
    cv.width = Wc; cv.height = Hc;
    const c = cv.getContext('2d')!;
    c.font = font(family, px);
    c.fillStyle = '#fff';
    c.textBaseline = 'alphabetic';
    const by = pad + asc;
    c.fillText(text, x0, by);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.NoColorSpace;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.anisotropy = 8;
    const k = o.capH / cap;
    this.k = k;
    this.capH = o.capH;
    this.adv = m.width * k;
    this.inkL = inkLpx * k;
    this.inkW = (inkRpx - inkLpx) * k;
    this.asc = asc * k;
    const geo = new THREE.PlaneGeometry(Wc * k, Hc * k);
    // pen origin (x0, baseline) at the local origin
    geo.translate(Wc * k / 2 - x0 * k, -(Hc * k / 2 - by * k), 0);
    this.mat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: VERT, fragmentShader: FRAG,
      uniforms: {
        map: { value: tex }, texPx: { value: new THREE.Vector2(Wc, Hc) }, basePx: { value: by },
        inkL: { value: x0 + inkLpx }, inkW: { value: inkRpx - inkLpx }, slant: { value: o.slant ?? 0.2 },
        prog: { value: 0 }, feather: { value: 0.06 }, hotLen: { value: 0.35 }, cool: { value: 0 }, gold: { value: 0 }, flare: { value: 0 },
        opacity: { value: 1 }, blur: { value: 0 },
        cBone: { value: new THREE.Vector3(...LIN.bone) }, cGold: { value: new THREE.Vector3(...LIN.signal) }, cEmber: { value: new THREE.Vector3(...LIN.ember) },
      },
      transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
  }
  set(o: { prog?: number; cool?: number; gold?: number; flare?: number; opacity?: number; blur?: number }) {
    const u = this.mat.uniforms;
    for (const [key, v] of Object.entries(o)) if (v !== undefined) u[key]!.value = v;
  }
}
