// Line-art (engraved wireframe) models of the video's key objects, for the outro's callback tunnel.
// Each model is a flat list of 3D segments in local units (fits a radius ~1), with an ink class per
// segment: 0 = bone line, 1 = gold (the part that matters), 2 = graphite (hatching, hidden detail).
import { strokeText } from '../engine/stroke';
import { TAU, mulberry32 } from '../engine/util';

export type Model = { segs: Float32Array; n: number; name: string };
type P = [number, number, number];

class Builder {
  a: number[] = [];
  seg(p: P, q: P, k = 0) { this.a.push(p[0], p[1], p[2], q[0], q[1], q[2], k); }
  poly(pts: P[], k = 0, closed = false) {
    for (let i = 1; i < pts.length; i++) this.seg(pts[i - 1]!, pts[i]!, k);
    if (closed && pts.length > 2) this.seg(pts[pts.length - 1]!, pts[0]!, k);
  }
  circle(c: P, r: number, axis: 'x' | 'y' | 'z', n = 48, k = 0, a0 = 0, a1 = TAU) {
    const pts: P[] = [];
    for (let i = 0; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n, u = Math.cos(a) * r, v = Math.sin(a) * r;
      pts.push(axis === 'y' ? [c[0] + u, c[1], c[2] + v] : axis === 'z' ? [c[0] + u, c[1] + v, c[2]] : [c[0], c[1] + u, c[2] + v]);
    }
    this.poly(pts, k);
  }
  box(c: P, h: P, k = 0) {
    const v = (sx: number, sy: number, sz: number): P => [c[0] + sx * h[0], c[1] + sy * h[1], c[2] + sz * h[2]];
    for (const sy of [-1, 1]) this.poly([v(-1, sy, -1), v(1, sy, -1), v(1, sy, 1), v(-1, sy, 1)], k, true);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) this.seg(v(sx, -1, sz), v(sx, 1, sz), k);
  }
  /** Single-stroke lettering on the plane z = z0 (x right, y up), left-baseline at (x0, y0), cap height ch. */
  text(s: string, x0: number, y0: number, z0: number, ch: number, k = 0, font: 'tech' | 'sans' | 'readable' = 'tech', center = false) {
    const st = strokeText(s, font, 100);
    const sc = ch / Math.max(1e-3, st.capHeight);
    const dx = center ? -st.width * sc * 0.5 : 0;
    for (const stroke of st.strokes) this.poly(stroke.map((p) => [x0 + dx + p.x * sc, y0 - p.y * sc, z0] as P), k);
  }
  done(name: string): Model { return { segs: Float32Array.from(this.a), n: this.a.length / 7, name }; }
}

/** The unit block (boot, the builder's material): edges, section hatch on one face, a gold top. */
function block() {
  const b = new Builder();
  const h = 0.62;
  b.box([0, 0, 0], [h, h, h], 0);
  b.poly([[-h * 0.6, h, -h * 0.6], [h * 0.6, h, -h * 0.6], [h * 0.6, h, h * 0.6], [-h * 0.6, h, h * 0.6]], 1, true);
  for (let i = 1; i < 9; i++) { // 45° section hatch on the front face
    const u = -h + (2 * h * i) / 9;
    const p: P = [u, -h, h], q: P = [h, -u, h];
    const p2: P = [-h, -u, h], q2: P = [-u, h, h];
    b.seg(p, q, 2); if (i > 1) b.seg(p2, q2, 2);
  }
  return b.done('BLOCK');
}

/** The tower ("BIG SOFTWARE CO."): a tall slab, floor lines, a gold crown sign. */
function tower() {
  const b = new Builder();
  const w = 0.34, d = 0.22, hh = 0.95;
  b.box([0, -0.1, 0], [w, hh, d], 0);
  for (let i = 1; i < 24; i++) {
    const y = -0.1 - hh + (2 * hh * i) / 24;
    b.poly([[-w, y, d], [w, y, d], [w, y, -d]], 2);
  }
  for (const x of [-w / 3, w / 3]) b.seg([x, -0.1 - hh, d], [x, -0.1 + hh, d], 2);
  b.box([0, 0.97, 0], [w * 1.25, 0.1, d * 0.5], 1);
  b.text('BIG SOFTWARE CO.', 0, 0.94, d * 0.5 + 0.001, 0.07, 1, 'tech', true);
  return b.done('TOWER');
}

/** The bell (Jevons rang it): a lathe of parallels & meridians, a gold lip, the clapper. */
function bell() {
  const b = new Builder();
  const prof: [number, number][] = [[0.16, 0.78], [0.3, 0.74], [0.38, 0.5], [0.41, 0.15], [0.5, -0.25], [0.68, -0.6], [0.8, -0.74], [0.82, -0.8]];
  prof.forEach(([r, y], i) => b.circle([0, y, 0], r, 'y', 48, i === prof.length - 1 ? 1 : i % 2 ? 2 : 0));
  for (let m = 0; m < 16; m++) {
    const a = (m / 16) * TAU;
    b.poly(prof.map(([r, y]) => [Math.cos(a) * r, y, Math.sin(a) * r] as P), m % 2 ? 2 : 0);
  }
  b.box([0, 0.9, 0], [0.34, 0.05, 0.05], 0);           // yoke
  b.seg([0, 0.78, 0], [0.05, -0.62, 0], 1);           // clapper
  b.circle([0.05, -0.68, 0], 0.07, 'z', 16, 1);
  return b.done('BELL');
}

/** The flywheel (the engine of The Coal Question): double rim, curved spokes, hub, axle. */
function flywheel() {
  const b = new Builder();
  for (const z of [-0.09, 0.09]) { b.circle([0, 0, z], 0.98, 'z', 72, z > 0 ? 1 : 0); b.circle([0, 0, z], 0.84, 'z', 72, 0); b.circle([0, 0, z], 0.16, 'z', 24, 0); }
  for (let i = 0; i < 24; i++) { const a = (i / 24) * TAU; b.seg([Math.cos(a) * 0.98, Math.sin(a) * 0.98, -0.09], [Math.cos(a) * 0.98, Math.sin(a) * 0.98, 0.09], 2); }
  for (let s = 0; s < 6; s++) {
    const a0 = (s / 6) * TAU;
    const pts: P[] = [];
    for (let k = 0; k <= 6; k++) { const r = 0.16 + (0.68 * k) / 6, a = a0 + 0.25 * Math.sin((k / 6) * Math.PI); pts.push([Math.cos(a) * r, Math.sin(a) * r, 0]); }
    b.poly(pts, 0);
  }
  b.seg([0, 0, -0.6], [0, 0, 0.6], 2);
  return b.done('FLYWHEEL');
}

/** A token: the word "demand" on a tile, with its id. */
function token() {
  const b = new Builder();
  const w = 0.95, h = 0.4, r = 0.1, t = 0.08;
  const rr = (z: number, k: number) => {
    const pts: P[] = [];
    const corner = (cx: number, cy: number, a0: number) => { for (let i = 0; i <= 6; i++) { const a = a0 + (i / 6) * (Math.PI / 2); pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r, z]); } };
    corner(w - r, h - r, 0); corner(-w + r, h - r, Math.PI / 2); corner(-w + r, -h + r, Math.PI); corner(w - r, -h + r, 1.5 * Math.PI);
    b.poly(pts, k, true);
  };
  rr(t, 0); rr(-t, 2);
  for (const [x, y] of [[w, 0], [-w, 0], [0, h], [0, -h]] as [number, number][]) b.seg([x, y, t], [x, y, -t], 2);
  b.text('demand', 0, -0.1, t + 0.001, 0.26, 1, 'readable', true);
  b.text('id 7342 · p 0.93', 0, -0.3, t + 0.001, 0.07, 2, 'tech', true);
  return b.done('TOKEN');
}

/** The globe (a planet of builders): graticule, gold lights, a tilted orbit. */
function globe() {
  const b = new Builder();
  for (let i = -3; i <= 3; i++) { const la = (i / 4) * (Math.PI / 2); b.circle([0, Math.sin(la) * 0.9, 0], Math.cos(la) * 0.9, 'y', 48, i === 0 ? 0 : 2); }
  for (let m = 0; m < 12; m++) {
    const a = (m / 12) * Math.PI;
    const pts: P[] = [];
    for (let k = 0; k <= 32; k++) { const t = (k / 32) * TAU; pts.push([Math.cos(t) * Math.cos(a) * 0.9, Math.sin(t) * 0.9, Math.cos(t) * Math.sin(a) * 0.9]); }
    b.poly(pts, m % 3 ? 2 : 0);
  }
  const rnd = mulberry32(77);
  for (let i = 0; i < 60; i++) {
    const u = rnd() * 2 - 1, a = rnd() * TAU, s = Math.sqrt(1 - u * u);
    const p: P = [Math.cos(a) * s * 0.905, u * 0.905, Math.sin(a) * s * 0.905];
    b.seg(p, [p[0] * 1.02, p[1] * 1.02, p[2] * 1.02], 1);
  }
  const pts: P[] = [];
  for (let k = 0; k <= 64; k++) { const t = (k / 64) * TAU; const x = Math.cos(t) * 1.25, z = Math.sin(t) * 1.25; pts.push([x, z * 0.35, z * 0.94]); }
  b.poly(pts, 1);
  return b.done('GLOBE');
}

/** The GPU die: package, pins, the die's tile grid, one tile computing. */
function gpu() {
  const b = new Builder();
  const P0 = 0.92, D = 0.52, t = 0.05;
  b.box([0, 0, 0], [P0, P0, t], 0);
  b.box([0, 0, t + 0.03], [D, D, 0.03], 0);
  for (let i = 1; i < 8; i++) {
    const u = -D + (2 * D * i) / 8;
    b.seg([u, -D, t + 0.061], [u, D, t + 0.061], 2);
    b.seg([-D, u, t + 0.061], [D, u, t + 0.061], 2);
  }
  const c = (2 * D) / 8;
  b.poly([[-c * 0.5, -c * 0.5, t + 0.062], [c * 0.5, -c * 0.5, t + 0.062], [c * 0.5, c * 0.5, t + 0.062], [-c * 0.5, c * 0.5, t + 0.062]], 1, true);
  b.poly([[-D, -D, t + 0.062], [D, -D, t + 0.062], [D, D, t + 0.062], [-D, D, t + 0.062]], 1, true);
  for (let i = 0; i < 16; i++) {
    const u = -P0 + 0.08 + ((2 * P0 - 0.16) * i) / 15;
    b.seg([u, P0, 0], [u, P0 + 0.08, 0], 0); b.seg([u, -P0, 0], [u, -P0 - 0.08, 0], 0);
    b.seg([P0, u, 0], [P0 + 0.08, u, 0], 0); b.seg([-P0, u, 0], [-P0 - 0.08, u, 0], 0);
    if (i % 3 === 0) { b.seg([u * 0.55, D, t], [u, P0, t], 2); b.seg([u * 0.55, -D, t], [u, -P0, t], 2); }
  }
  return b.done('GPU DIE');
}

/** A shard of the glass wall: irregular pane, thickness, cracks, one gold edge. */
function shard() {
  const b = new Builder();
  const v: [number, number][] = [[-0.55, 0.92], [0.18, 0.7], [0.75, -0.2], [0.35, -0.95], [-0.62, -0.3]];
  for (const z of [0.03, -0.03]) b.poly(v.map(([x, y]) => [x, y, z] as P), z > 0 ? 0 : 2, true);
  v.forEach(([x, y]) => b.seg([x, y, 0.03], [x, y, -0.03], 2));
  b.seg([v[1]![0], v[1]![1], 0.035], [v[2]![0], v[2]![1], 0.035], 1);
  const o: P = [-0.05, 0.1, 0.03];
  for (const [x, y] of [[-0.4, 0.6], [0.5, 0.1], [0.1, -0.7], [-0.45, -0.2], [0.25, 0.55]] as [number, number][]) {
    b.poly([o, [o[0] + (x - o[0]) * 0.45 + 0.05, o[1] + (y - o[1]) * 0.45 - 0.04, 0.03], [x, y, 0.03]], 0);
  }
  return b.done('SHARD');
}

/** The sigil (hook 3's magic circle): rings, a hexagram, rune ticks — all gold. */
export function sigil() {
  const b = new Builder();
  b.circle([0, 0, 0], 1, 'z', 96, 1); b.circle([0, 0, 0], 0.9, 'z', 96, 1); b.circle([0, 0, 0], 0.58, 'z', 72, 1);
  for (const r0 of [0, Math.PI / 3]) {
    const pts: P[] = [];
    for (let i = 0; i < 3; i++) { const a = r0 + Math.PI / 2 + (i / 3) * TAU; pts.push([Math.cos(a) * 0.9, Math.sin(a) * 0.9, 0]); }
    b.poly(pts, 1, true);
  }
  for (let i = 0; i < 72; i++) { const a = (i / 72) * TAU, l = i % 6 === 0 ? 0.86 : 0.93; b.seg([Math.cos(a) * l, Math.sin(a) * l, 0], [Math.cos(a) * 0.9, Math.sin(a) * 0.9, 0], 1); }
  for (let i = 0; i < 6; i++) { const a = Math.PI / 2 + (i / 6) * TAU; b.circle([Math.cos(a) * 0.9, Math.sin(a) * 0.9, 0], 0.06, 'z', 16, 1); }
  // glyphs on the ring (plain ASCII so the stroke font has them)
  const glyphs = ['{', '}', '<', '>', '/', '=', '*', '+', '[', ']', '(', ')'];
  glyphs.forEach((g, i) => {
    const a = (i / glyphs.length) * TAU + 0.13;
    const st = strokeText(g, 'tech', 100), sc = 0.075 / Math.max(1e-3, st.capHeight);
    const ca = Math.cos(a - Math.PI / 2), sa = Math.sin(a - Math.PI / 2);
    for (const s of st.strokes) b.poly(s.map((p) => { const x = (p.x - st.width / 2) * sc, y = -p.y * sc - 0.04; return [Math.cos(a) * 0.95 + x * ca - y * sa, Math.sin(a) * 0.95 + x * sa + y * ca, 0] as P; }), 1);
  });
  return b.done('SIGIL');
}

/** The nine callback objects, in the video's order. */
export function callbackModels(): Model[] {
  return [block(), tower(), bell(), flywheel(), token(), globe(), gpu(), shard(), sigil()];
}
