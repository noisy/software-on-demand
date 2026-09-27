// oldworld's static drawings (A2): the org-chart pyramid of 100 badge cards (1 + 3 + 5 + … + 19 = 100),
// the hand glyph, the calendar lettering cache and the long tail of unbuilt plots. All in world units,
// all as bone-on-cobalt blueprint line work (SegList → LineBatch).
import { hash } from '../engine/util';
import { SegList, strokeLabel, lin, type V3, type RGB } from './tower-geo';

// ------------------------------------------------------------------ the pyramid
export const PYR = {
  ROWS: 10,
  PITCH: 1.3, // card spacing along x
  ROW_H: 2.0, // rise per row
  ROW_D: 1.0, // setback per row
  CARD_W: 1.0,
  CARD_H: 1.4,
  CARD_T: 0.12,
  APEX_S: 1.5, // the apex card (No. 100) is bigger
};
export const rowCount = (r: number) => 2 * (PYR.ROWS - 1 - r) + 1;
export interface CardDef { n: number; r: number; i: number; x: number; y: number; z: number; s: number; parent: number; hTower: number; seed: number }

/** Cards numbered 1..100 from the bottom-left to the apex. */
export function buildCards(): CardDef[] {
  const cards: CardDef[] = [];
  let n = 1;
  for (let r = 0; r < PYR.ROWS; r++) {
    const c = rowCount(r);
    for (let i = 0; i < c; i++) {
      const x = (i - (c - 1) / 2) * PYR.PITCH;
      const center = 1 - Math.abs(x) / 14;
      cards.push({
        n, r, i, x, y: r * PYR.ROW_H, z: -r * PYR.ROW_D, s: r === PYR.ROWS - 1 ? PYR.APEX_S : 1,
        parent: -1,
        hTower: 3 + 11 * hash(n, 3) * (0.35 + 0.65 * center) + 4 * center,
        seed: hash(n, 9),
      });
      n++;
    }
  }
  // parents: the card in the row above whose x is nearest (org-chart tree)
  for (const c of cards) {
    if (c.r === PYR.ROWS - 1) continue;
    let best = -1, bd = Infinity;
    for (const p of cards) if (p.r === c.r + 1) { const d = Math.abs(p.x - c.x * (rowCount(c.r + 1) / rowCount(c.r))); if (d < bd) { bd = d; best = p.n; } }
    c.parent = best;
  }
  return cards;
}

/** An open hand, palm facing us (outline polyline, wrist at y = 0, ~1 unit tall, x centred). */
export function handOutline(): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [];
  const P = (x: number, y: number) => pts.push({ x, y });
  const fingerPath = (bx: number, by: number, a: number, L: number, w: number) => {
    const dx = Math.sin(a), dy = Math.cos(a), nx = Math.cos(a), ny = -Math.sin(a);
    const lx = bx - nx * w / 2, ly = by - ny * w / 2;
    const cx = bx + dx * (L - w / 2), cy = by + dy * (L - w / 2);
    P(lx, ly);
    for (let k = 0; k <= 8; k++) {
      const th = (k / 8) * Math.PI;
      P(cx + (-nx * Math.cos(th) + dx * Math.sin(th)) * w / 2, cy + (-ny * Math.cos(th) + dy * Math.sin(th)) * w / 2);
    }
    P(bx + nx * w / 2, by + ny * w / 2);
  };
  P(-0.2, 0);
  P(-0.25, 0.2);
  fingerPath(-0.3, 0.27, -0.95, 0.36, 0.13); // thumb
  P(-0.27, 0.46);
  const fingers: [number, number, number][] = [[-0.195, 0.44, -0.13], [-0.065, 0.49, -0.04], [0.065, 0.46, 0.05], [0.19, 0.36, 0.16]];
  for (const [bx, L, a] of fingers) fingerPath(bx, 0.52, a, L, 0.125);
  P(0.26, 0.46);
  P(0.25, 0.14);
  P(0.2, 0);
  return pts;
}

/**
 * One badge card's face in local coords: centred on x, bottom at y = 0, in the z = 0 plane, width 1.
 * The hand glyph is returned separately (it rises out of the card on "hands,").
 */
export function cardFace(n: number): { face: Float32Array; hand: Float32Array } {
  const s = new SegList(), h = new SegList();
  const B = lin('bone', 0.72), M = lin('bone', 0.5);
  const hw = PYR.CARD_W / 2, H = PYR.CARD_H, ch = 0.08;
  s.poly([[-hw + ch, 0, 0], [hw - ch, 0, 0], [hw, ch, 0], [hw, H - ch, 0], [hw - ch, H, 0], [-hw + ch, H, 0], [-hw, H - ch, 0], [-hw, ch, 0]], 1.5, B, 1, 0, true);
  // lanyard slot
  s.poly([[-0.12, H - 0.1, 0], [0.12, H - 0.1, 0], [0.12, H - 0.15, 0], [-0.12, H - 0.15, 0]], 0.9, M, 1, 0, true);
  // photo frame
  s.poly([[-0.3, 0.52, 0], [0.3, 0.52, 0], [0.3, 1.14, 0], [-0.3, 1.14, 0]], 0.9, M, 0.9, 0, true);
  // name rules
  s.seg([-0.34, 0.4, 0], [0.34, 0.4, 0], 1.0, B, 0.8);
  s.seg([-0.34, 0.33, 0], [0.12, 0.33, 0], 0.8, M, 0.8);
  // number
  strokeLabel(s, `No. ${String(n).padStart(3, '0')}`, [-0.36, 0.11, 0], [1, 0, 0], [0, 1, 0], 0.075, 0.9, M, 1);
  // barcode ticks
  for (let k = 0; k < 8; k++) {
    const x = 0.2 + k * 0.024;
    if (hash(n, k) < 0.35) continue;
    s.seg([x, 0.08, 0], [x, 0.22, 0], 0.7, M, 0.8);
  }
  // the hand, in the photo frame
  const ho = handOutline();
  const k = 0.5, oy = 0.56;
  const pts: V3[] = ho.map((p) => [p.x * k, oy + p.y * k, 0]);
  h.poly(pts, 1.3, B, 1);
  // cuff lines
  h.seg([-0.11, oy + 0.02, 0], [0.11, oy + 0.02, 0], 1.0, B, 1);
  return { face: s.freeze(), hand: h.freeze() };
}

/** Org-chart connectors (elbows) between each card and its parent. Tag = the parent's row. */
export function connectors(cards: CardDef[]): Float32Array {
  const s = new SegList();
  const C = lin('bone', 0.6);
  const byN = new Map(cards.map((c) => [c.n, c]));
  for (const c of cards) {
    const p = byN.get(c.parent);
    if (!p) continue;
    const yb = p.y - 0.3, ze = p.z + PYR.ROW_D * 0.5;
    const top = c.y + PYR.CARD_H * c.s;
    // parent: forward along its tread and down its riser to the bus (drawn once per child, overlaps are harmless)
    s.seg([p.x, p.y, p.z], [p.x, p.y, ze], 1.1, C, 1, p.r);
    s.seg([p.x, p.y, ze], [p.x, yb, ze], 1.1, C, 1, p.r);
    s.seg([p.x, yb, ze], [c.x, yb, ze], 1.1, C, 1, p.r);
    s.seg([c.x, yb, ze], [c.x, yb, c.z], 1.1, C, 1, p.r);
    s.seg([c.x, yb, c.z], [c.x, top, c.z], 1.1, C, 1, p.r);
  }
  return s.freeze();
}

/** The stepped plinth under the rows: outlines + 45° section hatching on the risers. Tag = row. */
export function tiers(): Float32Array {
  const s = new SegList();
  const E = lin('bone', 0.7), Hh = lin('bone', 0.3);
  for (let r = 1; r < PYR.ROWS; r++) {
    const hw = (rowCount(r) * PYR.PITCH) / 2 + 0.35, y0 = (r - 1) * PYR.ROW_H, y1 = r * PYR.ROW_H;
    const zf = -r * PYR.ROW_D + PYR.ROW_D * 0.5, zb = -r * PYR.ROW_D - PYR.ROW_D * 0.5;
    // riser front face
    s.poly([[-hw, y0, zf], [hw, y0, zf], [hw, y1, zf], [-hw, y1, zf]], 1.6, E, 1, r, true);
    // tread back edge & sides
    s.seg([-hw, y1, zb], [hw, y1, zb], 1.0, E, 0.7, r);
    s.seg([-hw, y1, zf], [-hw, y1, zb], 1.2, E, 0.9, r);
    s.seg([hw, y1, zf], [hw, y1, zb], 1.2, E, 0.9, r);
    s.seg([-hw, 0, zf], [-hw, y0, zf], 1.2, E, 0.8, r);
    s.seg([hw, 0, zf], [hw, y0, zf], 1.2, E, 0.8, r);
    // section hatching on the riser
    const step = 0.32, hgt = y1 - y0;
    for (let x = -hw - hgt; x < hw; x += step) {
      let ax = x, ay = y0, bx = x + hgt, by = y1;
      if (ax < -hw) { ay += -hw - ax; ax = -hw; }
      if (bx > hw) { by -= bx - hw; bx = hw; }
      if (ay >= by) continue;
      s.seg([ax, ay, zf], [bx, by, zf], 0.7, Hh, 1, r);
    }
  }
  return s.freeze();
}

// ------------------------------------------------------------------ calendar lettering cache
/** Stroke lettering for day numbers / week labels in local cell units (cap 1, left-baseline origin). */
export function glyphCache(strings: string[]): Map<string, { d: Float32Array; w: number }> {
  const m = new Map<string, { d: Float32Array; w: number }>();
  for (const s of strings) {
    const sl = new SegList();
    const w = strokeLabel(sl, s, [0, 0, 0], [1, 0, 0], [0, 1, 0], 1, 1, lin('bone', 0.7), 1);
    m.set(s, { d: sl.freeze(), w });
  }
  return m;
}

// ------------------------------------------------------------------ the long tail (street level)
export interface Plot { i: number; x: number; z: number; w: number; d: number; h: number; hut: boolean; seed: number }
/** Demand curve h(i) ∝ 1/(1 + i·k)^a: a few head towers, then thousands of tiny plots to the horizon. */
export const demand = (i: number) => 58 / Math.pow(1 + i * 0.9, 1.25);
export function buildPlots(n = 700, x0 = 9): Plot[] {
  const out: Plot[] = [];
  let x = x0;
  for (let i = 1; i <= n; i++) {
    const h = demand(i);
    const w = i < 4 ? 6 - i : 1.6;
    const gap = i < 4 ? 3.5 : 0.7 + 0.4 * hash(i, 5);
    x += w / 2;
    out.push({ i, x, z: -4 + (i < 4 ? 0 : (hash(i, 7) - 0.5) * 0.8), w, d: i < 4 ? 5 : 1.6, h, hut: i < 4 || hash(i, 2) < 0.55, seed: hash(i, 11) });
    x += w / 2 + gap;
  }
  return out;
}

export type { V3, RGB };
