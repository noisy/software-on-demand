// Shared helpers for A6's plates (longtail, outro): camera aiming & projection, words rasterised into
// block grids ("letters assembled from blocks"), a unit box geometry and an MSAA target for the 3D passes.
import * as THREE from 'three';
import { W, H, makeRT } from '../engine/gl';
import { font } from '../engine/type';
import { LIN } from '../engine/palette';

export type V3 = [number, number, number];
export type RGB = [number, number, number];
export const lin = (k: keyof typeof LIN, s = 1): RGB => [LIN[k][0] * s, LIN[k][1] * s, LIN[k][2] * s];
export const mixRGB = (a: RGB, b: RGB, k: number): RGB => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];

/** Point the camera from `pos` at `target`, rolled by `roll` (rad) about its view axis. */
export function aim(cam: THREE.PerspectiveCamera, pos: V3, target: V3, roll = 0, fov?: number, up: V3 = [0, 1, 0]) {
  cam.position.set(pos[0], pos[1], pos[2]);
  cam.up.set(up[0], up[1], up[2]);
  cam.lookAt(target[0], target[1], target[2]);
  if (roll) cam.rotateZ(roll);
  if (fov !== undefined && fov !== cam.fov) cam.fov = fov;
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld(true);
}

const _v = new THREE.Vector3();
/** World -> logical screen px (y down). `z` = view depth (> 0 in front). */
export function project(cam: THREE.PerspectiveCamera, p: V3): { x: number; y: number; z: number; on: boolean } {
  _v.set(p[0], p[1], p[2]).applyMatrix4(cam.matrixWorldInverse);
  const z = -_v.z;
  _v.applyMatrix4(cam.projectionMatrix);
  const x = (_v.x * 0.5 + 0.5) * W, y = (0.5 - _v.y * 0.5) * H;
  return { x, y, z, on: z > cam.near && x > -200 && x < W + 200 && y > -200 && y < H + 200 };
}

/**
 * A word rasterised on a regular grid: cells (in grid units, x right, y UP from the baseline) whose
 * centre falls inside the glyphs. `cols`/`rows` = grid extent, `cap` = cap height in cells.
 */
export function rasterWord(text: string, family: string, size: number, step: number, tracking = 0) {
  const cv = document.createElement('canvas');
  const c0 = cv.getContext('2d')!;
  c0.font = font(family, size);
  (c0 as any).letterSpacing = `${tracking}px`;
  const m = c0.measureText(text);
  const cap = c0.measureText('H').actualBoundingBoxAscent;
  const pad = Math.ceil(size * 0.1);
  const w = Math.ceil(m.actualBoundingBoxRight + m.actualBoundingBoxLeft + pad * 2), h = Math.ceil(cap + size * 0.25 + pad * 2);
  cv.width = w; cv.height = h;
  const c = cv.getContext('2d', { willReadFrequently: true })!;
  c.font = font(family, size);
  (c as any).letterSpacing = `${tracking}px`;
  c.fillStyle = '#fff';
  const bx = pad + m.actualBoundingBoxLeft, by = pad + cap;
  c.fillText(text, bx, by);
  const data = c.getImageData(0, 0, w, h).data;
  const cells: { x: number; y: number; ch: number }[] = [];
  // glyph index of a column: from the kerned per-glyph layout
  const starts: number[] = [];
  let pre = '';
  for (const ch of Array.from(text)) { pre += ch; starts.push(bx + c.measureText(pre).width - c.measureText(ch).width); }
  const x0 = bx - m.actualBoundingBoxLeft;
  for (let y = pad; y < h; y += step) {
    for (let x = x0; x < w; x += step) {
      const ix = Math.round(x + step / 2), iy = Math.round(y + step / 2);
      if (ix >= w || iy >= h) continue;
      if (data[(iy * w + ix) * 4 + 3]! > 110) {
        let ch = 0;
        for (let k = 0; k < starts.length; k++) if (ix >= starts[k]!) ch = k;
        cells.push({ x: (x - x0) / step, y: (by - y) / step - 0.5, ch });
      }
    }
  }
  const cols = Math.ceil((m.actualBoundingBoxRight + m.actualBoundingBoxLeft) / step);
  return { cells, cols, cap: cap / step, rows: Math.ceil(h / step) };
}

/**
 * Unit box, x/z in [-0.5, 0.5], y in [0, 1] (sits on its base), with normals.
 * Faces are separate so the shader can shade them flat.
 */
export function boxGeometry(centerY = false) {
  const g = new THREE.BoxGeometry(1, 1, 1);
  if (!centerY) g.translate(0, 0.5, 0);
  return g;
}

/** Screen-sized MSAA HDR target for the 3D passes (resolved into `out` with the compositor). */
export const msaaRT = () => makeRT(W, H, { samples: 4 });

/** Vertex-shader header for RawShaderMaterials drawn by three (instanced). */
export const VS_HEAD = /* glsl */ `precision highp float;
in vec3 position; in vec3 normal;
uniform mat4 projectionMatrix; uniform mat4 viewMatrix; uniform mat4 modelMatrix;
`;

/** Rotation matrix about a unit axis. */
export const GLSL_ROT = /* glsl */ `
mat3 axisRot(vec3 a, float ang) {
  float c = cos(ang), s = sin(ang), t = 1.0 - c;
  return mat3(t*a.x*a.x + c, t*a.x*a.y + s*a.z, t*a.x*a.z - s*a.y,
              t*a.x*a.y - s*a.z, t*a.y*a.y + c, t*a.y*a.z + s*a.x,
              t*a.x*a.z + s*a.y, t*a.y*a.z - s*a.x, t*a.z*a.z + c);
}
mat3 yawRot(float a) { float c = cos(a), s = sin(a); return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }
`;

/** Beat times (analysed grid) in [t0, t1). */
export function beatsIn(beatAt: (t: number) => number, timeOfBeat: (i: number) => number, t0: number, t1: number) {
  const out: number[] = [];
  for (let i = Math.ceil(beatAt(t0) - 1e-3); ; i++) {
    const t = timeOfBeat(i);
    if (t >= t1 - 1e-3) break;
    out.push(t);
    if (out.length > 500) break;
  }
  return out;
}
