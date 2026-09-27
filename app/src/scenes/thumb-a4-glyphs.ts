// thumb-a4-glyphs — code-glyph quads for the thumbnails' magic circles (same look as hook-magic's rings).
import * as THREE from 'three';
import { SCALE } from '../engine/scale';
import { F, font } from '../engine/type';
import type { RGB } from './hook-kit';

export const GLYPHS = ['{', '}', '<', '>', 'λ', '∑', '∫', '→', '=', ';', '/', '*', '|', '&', '0', '1'];
export const CODE = ['{λ→∑}', '<∫=λ>', '{∑;∫}', '→|λ|→', '<*/>', '{0→1}', '∫λ∑→'].map((s) => Array.from(s).map((ch) => Math.max(0, GLYPHS.indexOf(ch))));

const VERT = /* glsl */ `
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
const FRAG = /* glsl */ `
precision highp float;
in vec2 vUv; in vec4 vCol;
out vec4 fragColor;
uniform sampler2D atlas;
void main() {
  float a = texture(atlas, vUv).r * vCol.a;
  if (a < 0.003) discard;
  fragColor = vec4(vCol.rgb * a, 0.0);
}`;

export class Glyphs {
  geo = new THREE.InstancedBufferGeometry();
  mesh: THREE.Mesh;
  count = 0;
  private P: Float32Array; private R: Float32Array; private U: Float32Array; private G: Float32Array; private C: Float32Array;
  private attrs: THREE.InstancedBufferAttribute[];
  constructor(public cap: number) {
    this.geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
    this.geo.setIndex([0, 1, 2, 0, 2, 3]);
    this.P = new Float32Array(cap * 3); this.R = new Float32Array(cap * 3); this.U = new Float32Array(cap * 3); this.G = new Float32Array(cap); this.C = new Float32Array(cap * 4);
    this.attrs = [new THREE.InstancedBufferAttribute(this.P, 3), new THREE.InstancedBufferAttribute(this.R, 3), new THREE.InstancedBufferAttribute(this.U, 3), new THREE.InstancedBufferAttribute(this.G, 1), new THREE.InstancedBufferAttribute(this.C, 4)];
    ['iPos', 'iR', 'iU', 'iG', 'iCol'].forEach((n, i) => this.geo.setAttribute(n, this.attrs[i]!));
    const mat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: VERT, fragmentShader: FRAG, uniforms: { atlas: { value: atlas() } },
      transparent: true, depthTest: true, depthWrite: false, side: THREE.DoubleSide,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
    });
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
  }
  clear() { this.count = 0; }
  add(p: THREE.Vector3, r: THREE.Vector3, u: THREE.Vector3, g: number, c: RGB, a: number) {
    if (this.count >= this.cap || a <= 0.003) return;
    const i = this.count++;
    this.P.set([p.x, p.y, p.z], i * 3); this.R.set([r.x, r.y, r.z], i * 3); this.U.set([u.x, u.y, u.z], i * 3);
    this.G[i] = g; this.C.set([c[0], c[1], c[2], a], i * 4);
  }
  /** A band of glyphs around a circle (centre c, plane axes u, v), each glyph's up pointing outward. */
  ring(c: THREE.Vector3, u: THREE.Vector3, v: THREE.Vector3, r: number, h: number, n: number, phase: number, code: number, col: RGB, a = 0.95) {
    const g = CODE[code % CODE.length]!;
    for (let i = 0; i < n; i++) {
      const an = phase + (i / n) * Math.PI * 2;
      const dir = u.clone().multiplyScalar(Math.cos(an)).addScaledVector(v, Math.sin(an));
      const tan = u.clone().multiplyScalar(-Math.sin(an)).addScaledVector(v, Math.cos(an));
      this.add(c.clone().addScaledVector(dir, r), tan.multiplyScalar(-h * 0.36), dir.clone().multiplyScalar(h * 0.5), g[i % g.length]!, col, a);
    }
  }
  commit() {
    for (const a of this.attrs) { a.needsUpdate = true; a.clearUpdateRanges(); a.addUpdateRange(0, this.count * a.itemSize); }
    this.geo.instanceCount = this.count;
    this.mesh.visible = this.count > 0;
  }
}

function atlas() {
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
      // Plex Mono has no λ: drawn in its weight
      c.lineWidth = cell * 0.075;
      c.beginPath(); c.moveTo(x - cell * 0.2, y - cell * 0.3); c.quadraticCurveTo(x - cell * 0.02, y - cell * 0.32, x + cell * 0.04, y - cell * 0.16); c.lineTo(x + cell * 0.24, y + cell * 0.3); c.stroke();
      c.beginPath(); c.moveTo(x + cell * 0.01, y - cell * 0.05); c.lineTo(x - cell * 0.22, y + cell * 0.3); c.stroke();
    } else c.fillText(g, x, y + cell * 0.04);
  });
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.NoColorSpace; tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.anisotropy = 8;
  return tex;
}
