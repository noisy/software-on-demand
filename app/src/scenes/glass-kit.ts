// glass's building blocks (A2): the night environment (sky + reflected city) shared by the sky pass, the tower's
// glass and the wet plaza; the faceless walking figure; the crack network and the shards.
import { hash, mulberry32, TAU, clamp } from '../engine/util';

// ------------------------------------------------------------------ GLSL: night environment
/** vec3 env(vec3 dir): cobalt night sky, clouds, horizon glow, a far skyline with a few lit windows. */
export const GLSL_ENV = /* glsl */ `
vec3 env(vec3 r, float t) {
  float y = r.y;
  vec3 sky = mix(C_COBALT * 0.95, C_COBALT * 0.16, smoothstep(0.0, 0.75, y));
  vec2 cp = r.xz / (abs(y) + 0.22);
  float cl = fbm(cp * 0.55 + vec2(t * 0.012, 3.0), 4);
  sky += C_COBALT * 0.55 * smoothstep(0.05, 0.75, cl) * smoothstep(-0.02, 0.25, y) * (1.0 - smoothstep(0.4, 0.9, y));
  sky += C_COBALT * 0.9 * exp(-abs(y) * 14.0);
  float az = atan(r.x, r.z);
  float col = floor(az * 46.0);
  float bh = 0.015 + 0.1 * pow(hash11(col * 1.37 + 3.1), 2.6);
  if (y < bh) {
    vec3 c = C_INK * 1.1 + C_COBALT * 0.06;
    vec2 wc = vec2(az * 520.0, y * 520.0);
    float wl = step(0.955, hash12(floor(wc))) * step(0.004, y) * step(0.3, fract(wc.x)) * step(0.3, fract(wc.y));
    c += C_ASH * 0.35 * wl;
    sky = c;
  }
  if (y < 0.0) sky = mix(C_INK * 0.9, C_COBALT * 0.12, exp(y * 8.0));
  return sky;
}`;

// ------------------------------------------------------------------ the figure
export type P3 = [number, number, number];
/** Joint positions of a faceless walker (height hgt) at (x, z) heading +z, walk phase ph (radians). */
export function walker(x: number, z: number, hgt: number, ph: number, stride = 1) {
  const k = hgt;
  const hipY = 0.5 * k, shY = 0.8 * k, headY = 0.93 * k;
  const bob = Math.abs(Math.cos(ph)) * 0.015 * k * stride;
  const P = (dx: number, y: number, dz: number): P3 => [x + dx * k, y + bob, z + dz * k];
  const leg = (side: number, p: number) => {
    const a = 0.42 * Math.sin(p) * stride;
    const knee = 0.55 * Math.max(0, Math.sin(p + 1.3)) * stride + 0.05;
    const th = 0.25, sh = 0.25;
    const hip = P(side * 0.06, hipY, 0);
    const kn: P3 = [hip[0], hip[1] - Math.cos(a) * th * k, hip[2] + Math.sin(a) * th * k];
    const b = a - knee;
    const ft: P3 = [kn[0], Math.max(0.01 * k, kn[1] - Math.cos(b) * sh * k), kn[2] + Math.sin(b) * sh * k];
    return [hip, kn, ft] as const;
  };
  const arm = (side: number, p: number) => {
    const a = -0.38 * Math.sin(p) * stride, el = 0.3 + 0.2 * Math.max(0, -Math.sin(p)) * stride;
    const sh = P(side * 0.11, shY, 0);
    const e: P3 = [sh[0] + side * 0.01 * k, sh[1] - Math.cos(a) * 0.17 * k, sh[2] + Math.sin(a) * 0.17 * k];
    const b = a + el;
    const hnd: P3 = [e[0], e[1] - Math.cos(b) * 0.16 * k, e[2] + Math.sin(b) * 0.16 * k];
    return [sh, e, hnd] as const;
  };
  return {
    head: P(0, headY, 0.01), neck: P(0, 0.86 * k, 0), chest: P(0, shY - 0.02 * k, 0), pelvis: P(0, hipY + 0.03 * k, 0),
    legL: leg(-1, ph), legR: leg(1, ph + Math.PI), armL: arm(-1, ph + Math.PI), armR: arm(1, ph),
  };
}

// ------------------------------------------------------------------ cracks
export interface Crack { pts: [number, number][]; len: Float32Array; total: number; depth: number; off: number }
/**
 * A radial crack burst around (x, y) on a plane: n main cracks, each a jittered walk that branches.
 * `reach` scales lengths; `bias` (radians, or null) pulls cracks toward a direction (e.g. up the façade).
 */
export function crackBurst(x: number, y: number, seed: number, n: number, reach: number, bounds: { x0: number; x1: number; y0: number; y1: number }, bias: number | null = null): Crack[] {
  const rnd = mulberry32(seed);
  const out: Crack[] = [];
  const walk = (sx: number, sy: number, a0: number, L: number, depth: number, off: number) => {
    const pts: [number, number][] = [[sx, sy]];
    let a = a0, px = sx, py = sy, s = 0;
    const step = 0.05 + 0.04 * reach * 0.2;
    while (s < L) {
      a += (rnd() - 0.5) * 0.5;
      if (bias !== null) a += Math.atan2(Math.sin(bias - a), Math.cos(bias - a)) * 0.06;
      const st = step * (0.6 + rnd() * 0.8);
      px += Math.cos(a) * st; py += Math.sin(a) * st;
      if (px < bounds.x0 || px > bounds.x1) { a = Math.PI - a; px = clamp(px, bounds.x0, bounds.x1); }
      if (py < bounds.y0 || py > bounds.y1) break;
      pts.push([px, py]);
      s += st;
      if (depth < 2 && rnd() < 0.05 + 0.03 * depth) walk(px, py, a + (rnd() < 0.5 ? -1 : 1) * (0.4 + rnd() * 0.6), (L - s) * (0.3 + rnd() * 0.5), depth + 1, off + s);
    }
    const len = new Float32Array(pts.length);
    for (let i = 1; i < pts.length; i++) len[i] = len[i - 1]! + Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]);
    // a branch starts growing when its parent's tip passes the branch point (off = parent length there)
    out.push({ pts, len, total: len[len.length - 1] ?? 0, depth, off });
  };
  for (let i = 0; i < n; i++) {
    const a = bias !== null ? bias + (rnd() - 0.5) * 1.6 : (i / n) * TAU + (rnd() - 0.5) * 0.5;
    walk(x, y, a, reach * (0.5 + rnd() * 0.8), 0, 0);
  }
  return out;
}

// ------------------------------------------------------------------ shards
export interface Shard { pts: [number, number][]; cx: number; cy: number; d: number; seed: number }
/** Partition the rectangle into radial/ring cells around (px, py) — the classic impact pattern. */
export function shatter(px: number, py: number, rect: { x0: number; x1: number; y0: number; y1: number }, seed: number): Shard[] {
  const rnd = mulberry32(seed);
  const NA = 16;
  const angles: number[] = [];
  for (let i = 0; i < NA; i++) angles.push((i / NA) * TAU + (rnd() - 0.5) * 0.3);
  const radii = [0, 0.09, 0.22, 0.4, 0.65, 0.95, 1.35, 1.85, 2.5, 3.3, 4.4, 5.8, 7.6, 10, 13];
  const out: Shard[] = [];
  for (let i = 0; i < NA; i++) {
    const a0 = angles[i]!, a1 = angles[(i + 1) % NA]! + (i === NA - 1 ? TAU : 0);
    for (let j = 0; j + 1 < radii.length; j++) {
      const j0 = radii[j]! * (1 + (hash(i, j, seed) - 0.5) * 0.25), j1 = radii[j + 1]! * (1 + (hash(i + 1, j + 1, seed) - 0.5) * 0.25);
      const poly: [number, number][] = [];
      const am = (a0 + a1) / 2;
      const P = (r: number, a: number): [number, number] => [px + Math.cos(a) * r, py + Math.sin(a) * r];
      if (j0 < 1e-3) poly.push([px, py]); else { poly.push(P(j0, a0)); poly.push(P(j0 * 1.02, am)); poly.push(P(j0, a1)); }
      poly.push(P(j1, a1)); poly.push(P(j1 * 1.02, am)); poly.push(P(j1, a0));
      const c = clipRect(poly, rect);
      if (c.length < 3) continue;
      let cx = 0, cy = 0;
      for (const p of c) { cx += p[0]; cy += p[1]; }
      cx /= c.length; cy /= c.length;
      out.push({ pts: c, cx, cy, d: Math.hypot(cx - px, cy - py), seed: hash(i, j, seed + 7) });
    }
  }
  return out;
}

function clipRect(poly: [number, number][], r: { x0: number; x1: number; y0: number; y1: number }) {
  const clip = (pts: [number, number][], inside: (p: [number, number]) => boolean, cut: (a: [number, number], b: [number, number]) => [number, number]) => {
    const out: [number, number][] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i]!, b = pts[(i + 1) % pts.length]!;
      const ia = inside(a), ib = inside(b);
      if (ia) out.push(a);
      if (ia !== ib) out.push(cut(a, b));
    }
    return out;
  };
  const lx = (x: number) => (a: [number, number], b: [number, number]): [number, number] => { const u = (x - a[0]) / (b[0] - a[0]); return [x, a[1] + (b[1] - a[1]) * u]; };
  const ly = (y: number) => (a: [number, number], b: [number, number]): [number, number] => { const u = (y - a[1]) / (b[1] - a[1]); return [a[0] + (b[0] - a[0]) * u, y]; };
  let p = clip(poly, (q) => q[0] >= r.x0, lx(r.x0));
  if (p.length) p = clip(p, (q) => q[0] <= r.x1, lx(r.x1));
  if (p.length) p = clip(p, (q) => q[1] >= r.y0, ly(r.y0));
  if (p.length) p = clip(p, (q) => q[1] <= r.y1, ly(r.y1));
  return p;
}
