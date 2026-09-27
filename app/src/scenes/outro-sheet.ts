// The end card: an engineering drawing on cyanotype paper, BUILDERS · DRAWING NO. 001.
// Everything on it is timed. Text goes into one big canvas texture whose channels carry
// R = ink coverage, G = the moment the glyph appears (0..1 over [T0, T1]), B = tone (bone level);
// the sheet shader reveals each glyph at its time (hot gold, cooling to bone). Lines are timed
// segments drawn progressively by a LineBatch (the cursor is the pen); `pens` says where the cursor is.
import { F, font, layout } from '../engine/type';

export type V3 = [number, number, number];
/** A timed line on the sheet (sheet px, y down; z = height above the paper). */
export interface SheetLine { a: V3; b: V3; t0: number; t1: number; w: number; k: 0 | 1 | 2; dash?: [number, number] }
/** Where the cursor is during [t0, t1]: a pen drawing (caret 0) or a caret typing (caret = cap height, px). */
export interface PenEvent { t0: number; t1: number; at: (u: number) => V3; caret: number }

export const SHEET_W = 1920, SHEET_H = 1080;
export const CUBE = { x: 420, y: 640, s: 250 };

export interface SheetTimes { bars: number[]; beats: number[]; end: number }

export function buildSheet(T: SheetTimes, K: number) {
  const T0 = T.bars[0]! - 0.1, T1 = T.bars[5]! + 0.6;
  const cv = document.createElement('canvas');
  cv.width = Math.round(SHEET_W * K); cv.height = Math.round(SHEET_H * K);
  const c = cv.getContext('2d')!;
  c.fillStyle = '#000'; c.fillRect(0, 0, cv.width, cv.height);
  c.scale(K, K);
  c.textBaseline = 'alphabetic';
  const lines: SheetLine[] = [];
  const pens: PenEvent[] = [];
  const key = (t: number) => Math.max(0, Math.min(255, Math.round(((t - T0) / (T1 - T0)) * 255)));
  const style = (t: number, tone: number) => `rgb(255,${key(t)},${Math.round(tone * 255)})`;
  const B = T.bars;
  const beatAfter = (t: number, n = 0) => { const i = T.beats.findIndex((b) => b >= t - 1e-3); return T.beats[i + n] ?? t + n * 0.47; };
  const L = (a: [number, number], b: [number, number], t0: number, t1: number, w = 1.6, k: 0 | 1 | 2 = 0, dash?: [number, number]) =>
    lines.push({ a: [a[0], a[1], 0], b: [b[0], b[1], 0], t0, t1, w, k, dash });

  /** Type a string glyph by glyph over [t0, t1]; optionally register the caret. */
  const type = (s: string, x: number, y: number, fam: string, size: number, t0: number, t1: number, tone = 1, caret = true, tracking = 0) => {
    c.font = font(fam, size);
    (c as any).letterSpacing = `${tracking}px`;
    const lay = layout(s, fam, size, tracking);
    const n = lay.glyphs.length;
    lay.glyphs.forEach((g, i) => {
      c.fillStyle = style(t0 + ((t1 - t0) * i) / Math.max(1, n), tone);
      c.fillText(g.ch, x + g.x, y);
    });
    (c as any).letterSpacing = '0px';
    if (caret) {
      const xs = lay.glyphs.map((g) => x + g.x).concat([x + lay.width + 4]);
      const cap = size * 0.72;
      pens.push({ t0, t1, caret: cap, at: (u) => { const i = Math.min(n, Math.floor(u * n + 1e-6)); return [xs[i]! + 2, y - cap, 0]; } });
    }
    return lay.width;
  };
  /** A pen stroke: the cursor draws a polyline over [t0, t1]. */
  const pen = (pts: [number, number][], t0: number, t1: number, w = 1.6, k: 0 | 1 | 2 = 0) => {
    const lens = [0];
    for (let i = 1; i < pts.length; i++) lens.push(lens[i - 1]! + Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]));
    const tot = lens[lens.length - 1]! || 1;
    for (let i = 1; i < pts.length; i++) L(pts[i - 1]!, pts[i]!, t0 + ((t1 - t0) * lens[i - 1]!) / tot, t0 + ((t1 - t0) * lens[i]!) / tot, w, k);
    pens.push({ t0, t1, caret: 0, at: (u) => {
      const s = u * tot;
      let i = 1; while (i < pts.length - 1 && lens[i]! < s) i++;
      const a = pts[i - 1]!, b = pts[i]!, f = (s - lens[i - 1]!) / Math.max(1e-6, lens[i]! - lens[i - 1]!);
      return [a[0] + (b[0] - a[0]) * Math.min(1, f), a[1] + (b[1] - a[1]) * Math.min(1, f), 0];
    } });
  };
  const arrow = (x: number, y: number, dx: number, dy: number, t: number) => {
    const l = Math.hypot(dx, dy), ux = dx / l, uy = dy / l, s = 11;
    L([x, y], [x - ux * s - uy * s * 0.35, y - uy * s + ux * s * 0.35], t, t + 0.05, 1.4);
    L([x, y], [x - ux * s + uy * s * 0.35, y - uy * s - ux * s * 0.35], t, t + 0.05, 1.4);
  };

  // ---------------------------------------------------------------- bar 1: the sheet, the views
  const b0 = B[0]!;
  for (const [i0, w] of [[36, 2.4], [60, 1.2]] as [number, number][]) {
    const x0 = i0, y0 = i0, x1 = SHEET_W - i0, y1 = SHEET_H - i0;
    L([x0, y0], [x1, y0], b0 + 0.05, b0 + 0.45, w); L([x1, y0], [x1, y1], b0 + 0.1, b0 + 0.4, w);
    L([x1, y1], [x0, y1], b0 + 0.05, b0 + 0.45, w); L([x0, y1], [x0, y0], b0 + 0.1, b0 + 0.4, w);
  }
  // zone ticks: 1..8 across, A..D down
  c.font = font(F.mono(500), 13);
  for (let i = 0; i <= 8; i++) {
    const x = 60 + (1800 * i) / 8, t = b0 + 0.45 + i * 0.025;
    if (i > 0 && i < 8) { L([x, 36], [x, 60], t, t + 0.06, 1.2); L([x, SHEET_H - 60], [x, SHEET_H - 36], t, t + 0.06, 1.2); }
    if (i < 8) { c.fillStyle = style(t + 0.05, 0.6); c.fillText(String(i + 1), x + 1800 / 16 - 4, 53); c.fillText(String(i + 1), x + 1800 / 16 - 4, SHEET_H - 43); }
  }
  for (let j = 0; j <= 4; j++) {
    const y = 60 + (960 * j) / 4, t = b0 + 0.5 + j * 0.03;
    if (j > 0 && j < 4) { L([36, y], [60, y], t, t + 0.06, 1.2); L([SHEET_W - 60, y], [SHEET_W - 36, y], t, t + 0.06, 1.2); }
    if (j < 4) { c.fillStyle = style(t + 0.05, 0.6); const ch = 'DCBA'[j]!; c.fillText(ch, 44, y + 120 + 5); c.fillText(ch, SHEET_W - 52, y + 120 + 5); }
  }
  // the three orthographic views, drawn edge by edge by the cursor on 16ths
  const views: [string, number, number][] = [['FRONT', 760, 470], ['SIDE', 1000, 470], ['TOP', 760, 700]];
  const VS = 170;
  let tt = b0 + 0.14;
  const sixteenth = (beatAfter(b0, 1) - b0) / 4;
  views.forEach(([name, x, y], vi) => {
    c.font = font(F.mono(600), 15);
    c.fillStyle = style(tt, 0.75);
    (c as any).letterSpacing = '3px';
    c.fillText(name, x, name === 'TOP' ? y + VS + 26 : y - 14);
    (c as any).letterSpacing = '0px';
    pen([[x, y], [x + VS, y], [x + VS, y + VS], [x, y + VS], [x, y]], tt, tt + sixteenth * 4, 2.0);
    tt += sixteenth * 4 + 0.02;
    // centre lines (dash-dot), ticked in after the view
    L([x + VS / 2, y - 16], [x + VS / 2, y + VS + 16], tt - 0.05, tt + 0.1, 1.0, 2, [18, 6]);
    L([x - 16, y + VS / 2], [x + VS + 16, y + VS / 2], tt - 0.05, tt + 0.1, 1.0, 2, [18, 6]);
  });
  c.font = font(F.mono(500), 17);
  c.fillStyle = style(b0 + 0.9, 0.7);
  c.fillText('VIEW A — AS BUILT', CUBE.x - CUBE.s / 2, CUBE.y + CUBE.s / 2 + 52);

  // ---------------------------------------------------------------- bar 2: the title, typed
  const b1 = B[1]!;
  const TITLE = 'Everyone can be a builder now.';
  const tFam = F.archivo(100, 700), tSize = 80;
  const tEnd = b1 + 1.2;
  const tw = type(TITLE, 110, 200, tFam, tSize, b1 + 0.04, tEnd, 1, true, -0.5);
  L([110, 232], [110 + tw, 232], tEnd, tEnd + 0.25, 1.2);
  const PART = 'PART 001 — BLOCK, UNIT   ·   QTY: AS REQUIRED   ·   MATL: ANYTHING';
  type(PART, 112, 268, F.mono(500), 19, tEnd + 0.1, B[2]! - 0.12, 0.7);

  // ---------------------------------------------------------------- bar 3: dimensions, one per beat
  const b2 = B[2]!;
  const db = [0, 1, 2, 3].map((k) => beatAfter(b2, k));
  const dimText = (s: string, x: number, y: number, t: number, rot = 0) => {
    c.save(); c.translate(x, y); c.rotate(rot);
    c.font = font(F.mono(500), 18); c.textAlign = 'center';
    c.fillStyle = style(t, 1); c.fillText(s, 0, 0);
    c.restore(); c.textAlign = 'left';
  };
  { // front width
    const t = db[0]!, [x, y] = [760, 470];
    pen([[x, y + VS + 6], [x, y + VS + 40]], t, t + 0.06, 1.1); pen([[x + VS, y + VS + 6], [x + VS, y + VS + 40]], t + 0.06, t + 0.12, 1.1);
    pen([[x, y + VS + 30], [x + VS, y + VS + 30]], t + 0.12, t + 0.22, 1.1);
    arrow(x, y + VS + 30, -1, 0, t + 0.22); arrow(x + VS, y + VS + 30, 1, 0, t + 0.22);
    dimText('1.000', x + VS / 2, y + VS + 24, t + 0.24);
  }
  { // front height
    const t = db[1]!, [x, y] = [760, 470];
    pen([[x - 6, y], [x - 44, y]], t, t + 0.06, 1.1); pen([[x - 6, y + VS], [x - 44, y + VS]], t + 0.06, t + 0.12, 1.1);
    pen([[x - 34, y], [x - 34, y + VS]], t + 0.12, t + 0.22, 1.1);
    arrow(x - 34, y, 0, -1, t + 0.22); arrow(x - 34, y + VS, 0, 1, t + 0.22);
    dimText('1.000', x - 42, y + VS / 2, t + 0.24, -Math.PI / 2);
  }
  { // side depth
    const t = db[2]!, [x, y] = [1000, 470];
    pen([[x, y + VS + 6], [x, y + VS + 40]], t, t + 0.06, 1.1); pen([[x + VS, y + VS + 6], [x + VS, y + VS + 40]], t + 0.06, t + 0.12, 1.1);
    pen([[x, y + VS + 30], [x + VS, y + VS + 30]], t + 0.12, t + 0.22, 1.1);
    arrow(x, y + VS + 30, -1, 0, t + 0.22); arrow(x + VS, y + VS + 30, 1, 0, t + 0.22);
    dimText('1.000', x + VS / 2, y + VS + 24, t + 0.24);
  }
  { // the block's callout
    const t = db[3]!;
    const ax = CUBE.x + CUBE.s / 2, ay = CUBE.y - CUBE.s / 2;
    pen([[ax + 8, ay - 8], [ax + 110, ay - 150], [ax + 150, ay - 150]], t, t + 0.2, 1.1);
    c.font = font(F.mono(500), 20); c.fillStyle = style(t + 0.2, 1); c.fillText('□ 1.000 TYP.  (ALL SIDES)', ax + 160, ay - 143);
    c.font = font(F.mono(400), 15); c.fillStyle = style(t + 0.3, 0.6); c.fillText('tolerance: whatever you say', ax + 160, ay - 118);
  }

  // ---------------------------------------------------------------- bar 4: the title block
  const b3 = B[3]!;
  const X0 = 1236, X1 = 1860, Y0 = 716, Y1 = 1020;
  const rows = [826, 890, 954];
  pen([[X0, Y1], [X0, Y0], [X1, Y0]], b3 + 0.02, b3 + 0.24, 2.0);
  rows.forEach((y, i) => pen([[X0, y], [X1, y]], b3 + 0.24 + i * 0.06, b3 + 0.3 + i * 0.06, 1.2));
  L([1636, Y0], [1636, 954], b3 + 0.45, b3 + 0.52, 1.2);
  L([1392, 826], [1392, 890], b3 + 0.5, b3 + 0.55, 1.2);
  const cell = (label: string, value: string, x: number, yTop: number, t: number, vFam = F.mono(500), vSize = 24, h = 64) => {
    c.font = font(F.mono(500), 12);
    (c as any).letterSpacing = '2px';
    c.fillStyle = style(t, 0.55); c.fillText(label, x + 12, yTop + 20);
    (c as any).letterSpacing = '0px';
    type(value, x + 12, yTop + h - 16, vFam, vSize, t + 0.03, t + 0.03 + Math.min(0.2, value.length * 0.03), 1, true);
  };
  const e8 = (beatAfter(b3, 1) - b3) / 2;
  const f0 = beatAfter(b3, 1);
  cell('TITLE', 'BUILDERS', X0, Y0, f0, F.archivo(100, 900), 56, 110);
  cell('DRAWING NO.', '001', 1636, Y0, f0 + e8, F.mono(600), 46, 110);
  cell('SCALE', '1:1', X0, 826, f0 + 2 * e8);
  cell('DRAWN BY', 'EVERYONE', 1392, 826, f0 + 3 * e8);
  cell('DATE', '2026', 1636, 826, f0 + 4 * e8);
  cell('CHECKED', '—', X0, 890, f0 + 5 * e8);
  cell('SHEET', '1 OF 1', 1636, 890, f0 + 5.5 * e8);
  // third-angle projection symbol + the footnote
  const sy = 987, st = f0 + 6 * e8;
  const ring = (cx: number, r: number, t: number) => { const n = 20, pts: [number, number][] = []; for (let i = 0; i <= n; i++) { const a = (i / n) * Math.PI * 2; pts.push([cx + Math.cos(a) * r, sy + Math.sin(a) * r]); } for (let i = 1; i < pts.length; i++) L(pts[i - 1]!, pts[i]!, t, t + 0.12, 1.1); };
  ring(1276, 13, st); ring(1276, 5, st + 0.04);
  L([1300, sy - 7], [1300, sy + 7], st, st + 0.1, 1.1); L([1300, sy - 7], [1336, sy - 13], st, st + 0.1, 1.1);
  L([1336, sy - 13], [1336, sy + 13], st, st + 0.1, 1.1); L([1300, sy + 7], [1336, sy + 13], st, st + 0.1, 1.1);
  c.font = font(F.mono(500), 14);
  c.fillStyle = style(st + 0.08, 0.7);
  c.fillText('UNLESS OTHERWISE STATED, EVERYTHING IS BUILDABLE', 1352, sy + 5);

  // ---------------------------------------------------------------- bar 5: notes (the credits)
  const b4 = B[4]!;
  c.font = font(F.mono(600), 15);
  (c as any).letterSpacing = '3px';
  c.fillStyle = style(b4 + 0.02, 0.75); c.fillText('NOTES', 110, 868);
  (c as any).letterSpacing = '0px';
  L([110, 878], [520, 878], b4 + 0.02, b4 + 0.15, 1.1);
  const credits = ['1. Wizard / Builder: youtube.com/@noisycoder', '2. Wand: NoisyStudio.ai', '3. Music & vocals: Suno',
    '4. Lyrics & video: made with Claude Code, Opus 5.5', '5. Engine: pdoom-video by mexicat (MIT)'];
  // five lines, one per half beat, all typed before the camera's pull-back on the next bar
  const halfBeat = (beatAfter(b4, 1) - beatAfter(b4, 0)) / 2;
  credits.forEach((s, i) => { const t = beatAfter(b4, 0) + i * halfBeat; type(s, 110, 904 + i * 23, F.mono(500), 19, t + 0.03, t + 0.4, 1); });

  // ---------------------------------------------------------------- bar 6: the cursor comes home
  const b5 = B[5]!;
  const home: V3 = [110 + tw + 12, 200 - tSize * 0.72, 0];
  pens.push({ t0: b5 + 0.25, t1: T.end + 1, caret: tSize * 0.72, at: () => home });

  pens.sort((a, b) => a.t0 - b.t0);
  return { canvas: cv, lines, pens, T0, T1, title: { x: 110, y: 200, w: tw, size: tSize } };
}

/** Cursor position at t: the active pen event, or eased travel between the previous and the next one. */
export function penAt(pens: PenEvent[], t: number): { p: V3; caret: number; drawing: boolean } | null {
  if (!pens.length || t < pens[0]!.t0 - 0.25) return null;
  let prev: PenEvent | null = null;
  for (const e of pens) {
    if (t >= e.t0 && t <= e.t1) return { p: e.at((t - e.t0) / Math.max(1e-4, e.t1 - e.t0)), caret: e.caret, drawing: true };
    if (e.t0 > t) {
      const a = prev ? prev.at(1) : e.at(0), b = e.at(0);
      const g0 = prev ? prev.t1 : e.t0 - 0.25;
      const u = Math.min(1, Math.max(0, (t - g0) / Math.max(1e-3, e.t0 - g0)));
      const k = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
      const lift = Math.sin(u * Math.PI) * Math.min(60, Math.hypot(b[0] - a[0], b[1] - a[1]) * 0.15);
      return { p: [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, lift], caret: prev && prev.caret && e.caret ? e.caret : 0, drawing: false };
    }
    prev = e;
  }
  return prev ? { p: prev.at(1), caret: prev.caret, drawing: false } : null;
}
