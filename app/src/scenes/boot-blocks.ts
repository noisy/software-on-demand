// Instanced boxes for boot: the building blocks (bone voxels that arrive white-hot), the grey towers of the
// old world (window grids in world units, so a stack of voxels and the fused slab it becomes look the same)
// and their cyanotype flip (cobalt faces, bone hairline edges, section hatching). One shader, three looks,
// blended per instance: iData = (heat, mode 0 bone / 1 grey / 2 blueprint, voxel-edge amount).
import * as THREE from 'three';
import { GLSL_COMMON } from '../engine/glsl/common';

const VERT = /* glsl */ `
precision highp float;
in vec3 position; in vec3 normal;
in vec3 iPos; in vec3 iScale; in vec4 iRot; in vec3 iData;
uniform mat4 projectionMatrix; uniform mat4 viewMatrix;
out vec3 vLocal; out vec3 vScale; out vec3 vN; out vec3 vNl; out vec3 vW; out vec3 vData;
vec3 qrot(vec4 q, vec3 v) { return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v); }
void main() {
  vec3 lp = position * iScale;
  vec3 wp = iPos + qrot(iRot, lp);
  vN = qrot(iRot, normal); vNl = normal; vLocal = lp; vScale = iScale; vW = wp; vData = iData;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}`;

const FRAG = /* glsl */ `
precision highp float;
in vec3 vLocal; in vec3 vScale; in vec3 vN; in vec3 vNl; in vec3 vW; in vec3 vData;
out vec4 fragColor;
uniform vec3 camPos; uniform float fogNear; uniform float fogFar; uniform float t;
${GLSL_COMMON}
void main() {
  vec3 n = normalize(vN);
  vec3 hs = vScale * 0.5;
  vec3 d = hs - abs(vLocal);
  float mn = min(d.x, min(d.y, d.z)), mx = max(d.x, max(d.y, d.z));
  float e2 = d.x + d.y + d.z - mn - mx;           // distance to the nearest edge of this face (world)
  vec3 an = abs(vNl);
  bool isTop = an.y > 0.5;
  bool isX = an.x > 0.5;
  vec2 fc = isX ? vLocal.zy : isTop ? vLocal.xz : vLocal.xy;
  float hWorld = isX ? vW.z : vW.x;               // horizontal coordinate along a facade (world)
  vec3 L = normalize(vec3(-0.5, 0.78, 0.62));
  float diff = max(0.0, dot(n, L));
  float light = 0.16 + 0.6 * diff + 0.24 * (0.5 + 0.5 * n.y);
  float hot = vData.x, mode = vData.y, vox = vData.z;
  float fw = max(fwidth(e2), 1e-5);
  float lod = 1.0 - smoothstep(0.06, 0.22, fw);   // voxel detail fades when a block is < ~6 px

  // ---- 0: bone building block ----
  float dark = 1.0 - light;
  float ink = engrave(fc * 1.0, dark * 0.95, 7.0, 0.75) * lod;
  vec3 c0 = C_BONE * (0.14 + 0.86 * light) * (1.0 - 0.5 * ink);
  float gapW = max(0.045, fw * 0.8);
  float gap = (1.0 - smoothstep(gapW - fw, gapW + fw, e2)) * mix(0.35, 1.0, lod);
  c0 = mix(c0, C_INK * 0.6, gap * 0.85 * max(vox, 0.35));

  // ---- 1: grey tower ----
  vec3 c1 = mix(C_INK2 * 1.1, C_GRAPHITE * 0.85, light);
  if (!isTop) {
    float fl = hatch(vW.y, 0.07), mu = hatch(hWorld / 0.75 + 0.5, 0.05);
    float wl = 1.0 - smoothstep(0.05, 0.12, fwidth(vW.y));
    c1 += C_ASH * 0.16 * max(fl, mu * 0.8) * wl;
    vec2 cell = floor(vec2(hWorld / 0.75, vW.y));
    float lit = step(0.965, hash12(cell + floor(vW.xz * 0.01) * 17.0));
    c1 = mix(c1, C_ASH * 0.55, lit * 0.6 * (1.0 - fl) * (1.0 - mu) * wl);
  }
  float edge1 = pxLine(e2 / fw, 0.5, 1.5);
  c1 = mix(c1, C_ASH * 0.8, edge1 * 0.8);
  c1 = mix(c1, C_INK * 0.7, gap * vox);

  // ---- 2: blueprint (bone on cobalt) ----
  vec3 c2 = C_COBALT * (0.72 + 0.55 * light);
  if (!isTop) {
    float fl = hatch(vW.y, 0.05), mu = hatch(hWorld / 0.75 + 0.5, 0.04);
    float wl = 1.0 - smoothstep(0.05, 0.12, fwidth(vW.y));
    c2 = mix(c2, C_BONE * 0.55, max(fl, mu) * 0.22 * wl);
    if (isX) c2 = mix(c2, C_BONE * 0.6, hatch((vW.y + vW.z) * 1.4, 0.07) * 0.18 * (1.0 - smoothstep(0.1, 0.3, fwidth(vW.y * 1.4))));
  } else {
    c2 = mix(c2, C_BONE * 0.6, hatch((vW.x - vW.z) * 0.9, 0.06) * 0.14);
  }
  float edge2 = pxLine(e2 / fw, 0.6, 1.7);
  c2 = mix(c2, C_BONE * 0.92, edge2);

  vec3 col = mode < 1.0 ? mix(c0, c1, mode) : mix(c1, c2, mode - 1.0);
  // white-hot arrival
  col = mix(col, C_SIGNAL * (0.9 + 0.8 * hot), smoothstep(0.0, 0.55, hot));
  col += C_EMBER * max(0.0, hot - 0.7) * 3.5;
  // fog to the paper
  float dist = length(vW - camPos);
  float fg = 1.0 - exp(-max(0.0, dist - fogNear) / fogFar);
  vec3 fogCol = mix(C_INK, C_COBALT, clamp(mode - 1.0, 0.0, 1.0));
  col = mix(col, fogCol, fg);
  fragColor = vec4(col, 1.0);
}`;

export function blockMaterial() {
  return new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: VERT, fragmentShader: FRAG,
    uniforms: { camPos: { value: new THREE.Vector3() }, fogNear: { value: 60 }, fogFar: { value: 300 }, t: { value: 0 } },
    depthTest: true, depthWrite: true,
  });
}

export class BlockSet {
  geo = new THREE.InstancedBufferGeometry();
  mesh: THREE.Mesh;
  count = 0;
  private p: Float32Array; private s: Float32Array; private r: Float32Array; private d: Float32Array;
  private attrs: THREE.InstancedBufferAttribute[];
  constructor(public cap: number, mat: THREE.Material) {
    const box = new THREE.BoxGeometry(1, 1, 1);
    this.geo.index = box.index;
    this.geo.setAttribute('position', box.getAttribute('position'));
    this.geo.setAttribute('normal', box.getAttribute('normal'));
    this.p = new Float32Array(cap * 3); this.s = new Float32Array(cap * 3); this.r = new Float32Array(cap * 4); this.d = new Float32Array(cap * 3);
    this.attrs = [new THREE.InstancedBufferAttribute(this.p, 3), new THREE.InstancedBufferAttribute(this.s, 3), new THREE.InstancedBufferAttribute(this.r, 4), new THREE.InstancedBufferAttribute(this.d, 3)];
    this.attrs.forEach((a) => a.setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('iPos', this.attrs[0]!); this.geo.setAttribute('iScale', this.attrs[1]!);
    this.geo.setAttribute('iRot', this.attrs[2]!); this.geo.setAttribute('iData', this.attrs[3]!);
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.frustumCulled = false;
  }
  begin() { this.count = 0; }
  /** Add a box: centre, size, rotation quaternion, heat, mode, voxel edges. */
  push(x: number, y: number, z: number, sx: number, sy: number, sz: number, qx: number, qy: number, qz: number, qw: number, hot: number, mode: number, vox: number) {
    if (this.count >= this.cap) return;
    const i = this.count++;
    this.p[i * 3] = x; this.p[i * 3 + 1] = y; this.p[i * 3 + 2] = z;
    this.s[i * 3] = sx; this.s[i * 3 + 1] = sy; this.s[i * 3 + 2] = sz;
    this.r[i * 4] = qx; this.r[i * 4 + 1] = qy; this.r[i * 4 + 2] = qz; this.r[i * 4 + 3] = qw;
    this.d[i * 3] = hot; this.d[i * 3 + 1] = mode; this.d[i * 3 + 2] = vox;
  }
  commit() {
    for (const a of this.attrs) { a.needsUpdate = true; a.clearUpdateRanges(); a.addUpdateRange(0, this.count * a.itemSize); }
    this.geo.instanceCount = this.count;
    this.mesh.visible = this.count > 0;
  }
}

/** Quaternion from axis (unit) and angle, written into out[0..3]. */
export function quatAxis(ax: number, ay: number, az: number, ang: number, out: number[]) {
  const s = Math.sin(ang / 2);
  out[0] = ax * s; out[1] = ay * s; out[2] = az * s; out[3] = Math.cos(ang / 2);
  return out;
}
