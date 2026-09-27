// A1 `open` — "The quote, flown through" (0 – 12.10 s, spoken intro).
// Black. The cursor blinks alone; on the first downbeats the corridor's crop marks draw themselves into
// the dark. Then Clarke's sentence is pen-written word by word as spoken, in Cormorant italic: every word
// sits on its own plane in a 3D corridor and the camera dollies through the sentence (monotone keys through
// the word midpoints), passing each word as the next is written — depth of field from mip bias and alpha,
// a slight roll per word. The cursor writes each word (a slanted wipe, gold at the pen, cooling to bone)
// and flies to the next plane in the gaps. "magic." — the word turns gold, the tip flares, weld sparks;
// the attribution types itself in mono. Last half second: the camera pulls back out of the corridor and
// the sentence collapses into one mono terminal line with the cursor at its end (boot's first frame).
import * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '../engine/scene';
import { FSPass, Layer2D, W, H } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { LIN, rgba } from '../engine/palette';
import { F, font } from '../engine/type';
import { Lyrics, type Line, type Word } from '../engine/lyrics';
import { clamp, ease, lerp, prog, pulse, smoothstep } from '../engine/util';
import { cursorBlink, cursorCaret, cursorTip, weldSparks } from './_motifs';
import { WordPlane } from './open-word';
import { ATTR, Mono, TERM, drawQuoteRow, quoteLine, toScreen, type QuoteLine, type RGB } from './boot-kit';

const FOV = 38;
const READ_D = 9; // plane distance from the camera at the word's midpoint
const TAN = Math.tan((FOV * Math.PI) / 360);
const UPP = (d: number) => (2 * d * TAN) / H; // world units per px at depth d

/** Composition of each word at its reading moment: cap height (px), left edge x, baseline y, plane yaw, camera roll. */
const SPEC: { cap: number; x: number; base: number; yaw: number; roll: number }[] = [
  { cap: 150, x: 330, base: 590, yaw: 0.16, roll: -0.03 }, // Any
  { cap: 112, x: 760, base: 730, yaw: -0.12, roll: 0.025 }, // sufficiently
  { cap: 124, x: 250, base: 420, yaw: 0.1, roll: -0.02 }, // advanced
  { cap: 160, x: 560, base: 650, yaw: -0.08, roll: 0.04 }, // technology
  { cap: 124, x: 1300, base: 430, yaw: 0.18, roll: -0.03 }, // is
  { cap: 118, x: 200, base: 610, yaw: -0.06, roll: 0.02 }, // indistinguishable
  { cap: 118, x: 1180, base: 470, yaw: 0.14, roll: -0.035 }, // from
  { cap: 230, x: 470, base: 660, yaw: 0, roll: 0.0 }, // magic.
];

interface Placed { wp: WordPlane; word: Word; pos: THREE.Vector3; quat: THREE.Quaternion; zc: number; capW: number; tPos: THREE.Vector3; tScale: number }

export default class Open extends Scene {
  cam = new THREE.PerspectiveCamera(FOV, W / H, 0.05, 3000);
  bg = new FSPass(/* glsl */ `
    uniform float t;
    void main() {
      vec2 p = (vUv - 0.5) * vec2(16.0 / 9.0, 1.0);
      float n = snoise(vec3(p * 1.6, t * 0.05)) * 0.5 + 0.5;
      vec3 c = C_INK * (0.92 + 0.12 * n) + C_INK2 * 0.18 * smoothstep(0.9, 0.0, length(p));
      fragColor = vec4(c, 1.0);
    }`, { t: { value: 0 } });
  words3 = new THREE.Scene();
  lines = new LineBatch(20000, { screen2D: false, blend: 'add' });
  fx = new LineBatch(8000, { blend: 'add' });
  hud = new Layer2D();
  private line!: Line;
  private q!: QuoteLine;
  private P: Placed[] = [];
  private camZ!: Mono; private camX!: Mono; private camY!: Mono; private camRoll!: Mono; private camYaw!: Mono;
  private cf = new THREE.Vector3();
  private tPull0 = 11.6; private tPull1 = 11.98;
  private tMagic = 11.0;
  private downs: number[] = [];
  private route: { a: THREE.Vector3; b: THREE.Vector3 }[] = [];
  private qa = new THREE.Quaternion(); private qb = new THREE.Quaternion(); private e = new THREE.Euler();

  override async init() {
    const { lyrics, audio } = this.ctx;
    this.line = lyrics.get('Any sufficiently');
    this.q = quoteLine(this.line.text);
    const ws = this.line.words;
    this.tMagic = ws[ws.length - 1]!.start;
    this.downs = audio.downbeats.filter((d) => d < this.ctx.end);
    const fam = F.serif(400, true);
    const mids = ws.map((w) => (w.start + w.end) / 2);
    // corridor: camera stations at each word's midpoint; spacing follows the time between words
    const zc: number[] = [0];
    for (let i = 1; i < ws.length; i++) zc.push(zc[i - 1]! - clamp((ws[i]!.start - ws[i - 1]!.end) * 10 + 7, 7, 16));
    const tLast = this.tPull0;
    // long words: the camera eases in while the word is written, then snaps to the next on its onset
    const zk: [number, number][] = [[0, 13], [2.18, 10], [4.16, 4.2]];
    ws.forEach((w, i) => {
      if (w.end - w.start > 0.4) zk.push([w.start + 0.04, zc[i]! + 1.2], [w.end, zc[i]! - 1.2]);
      else zk.push([mids[i]!, zc[i]!]);
    });
    const tech = ws[3]!;
    zk.push([tech.end + 0.8, zc[3]! - 3.2]);
    zk.push([tLast, zc[zc.length - 1]! - 1.4]);
    this.camZ = new Mono(zk);
    const sx = [0.5, -0.4, 0.35, -0.5, 0.45, -0.3, 0.4, 0];
    const sy = [-0.2, 0.25, -0.15, 0.2, -0.25, 0.1, -0.2, 0];
    this.camX = new Mono([[0, -0.3], ...mids.map((m, i) => [m, sx[i]!] as [number, number]), [tLast, 0]]);
    this.camY = new Mono([[0, 0.2], ...mids.map((m, i) => [m, sy[i]!] as [number, number]), [tLast, 0]]);
    this.camRoll = new Mono([[0, 0.05], [4.16, -0.01], ...mids.map((m, i) => [m, SPEC[i]!.roll] as [number, number]), [tLast, 0.01]]);
    this.camYaw = new Mono([[0, 0.02], ...mids.map((m, i) => [m, (SPEC[i]!.x < 900 ? 1 : -1) * 0.025] as [number, number]), [tLast, 0]]);

    // place each word so that it lands on its composition at its midpoint
    const cam = this.cam;
    const zLine = 0 + 26 - READ_D; // the terminal line plane (in front of the final camera)
    this.cf.set(0, 0, 26);
    const uppF = UPP(READ_D);
    ws.forEach((w, i) => {
      const s = SPEC[i]!;
      const capW = s.cap * UPP(READ_D);
      const wp = new WordPlane(w.w, fam, { capH: capW, px: 220, slant: 0.2 });
      this.words3.add(wp.mesh);
      this.poseCam(mids[i]!);
      const advPx = wp.adv / UPP(READ_D);
      const x = clamp(s.x, 110, W - 110 - advPx);
      const p = this.unproject(x, s.base, READ_D);
      const quat = cam.quaternion.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, s.yaw, 0)));
      const mw = this.q.words[i]!;
      const tPos = new THREE.Vector3(this.cf.x + (mw.x - W / 2) * uppF, this.cf.y - (TERM.base - H / 2) * uppF, zLine);
      const tScale = (mw.w * uppF) / Math.max(1e-3, wp.adv);
      this.P.push({ wp, word: w, pos: p, quat, zc: zc[i]!, capW, tPos, tScale });
    });
    // the pen's route through the corridor: end of each word -> start of the next (baseline height)
    const mat = (P: Placed) => new THREE.Matrix4().compose(P.pos, P.quat, new THREE.Vector3(1, 1, 1));
    for (let i = 0; i + 1 < this.P.length; i++) {
      const A = this.P[i]!, B = this.P[i + 1]!;
      this.route.push({
        a: new THREE.Vector3(A.wp.inkL + A.wp.inkW + 0.1 * A.capW, -0.1 * A.capW, 0).applyMatrix4(mat(A)),
        b: new THREE.Vector3(B.wp.inkL - 0.06 * B.capW, -0.1 * B.capW, 0).applyMatrix4(mat(B)),
      });
    }
  }

  // ------------------------------------------------------------------ camera
  private poseCam(t: number) {
    const cam = this.cam;
    cam.position.set(this.camX.at(t), this.camY.at(t), this.camZ.at(t));
    this.e.set(0.012 * Math.sin(t * 0.7), this.camYaw.at(t), this.camRoll.at(t), 'YXZ');
    cam.quaternion.setFromEuler(this.e);
    cam.fov = FOV;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
  }
  private unproject(px: number, py: number, depth: number) {
    const v = new THREE.Vector3((px / W) * 2 - 1, 1 - (py / H) * 2, 0.5).unproject(this.cam);
    const dir = v.sub(this.cam.position).normalize();
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.cam.quaternion);
    return this.cam.position.clone().addScaledVector(dir, depth / dir.dot(fwd));
  }
  /** Pull-back progress (camera) and per-word collapse progress. */
  private pull(t: number) { return prog(t, this.tPull0, this.tPull1, ease.inOutCubic); }
  private collapse(i: number, t: number) {
    const n = this.P.length;
    const a = this.tPull0 + 0.04 + (i / (n - 1)) * 0.08;
    return prog(t, a, a + 0.3, ease.inOutExpo);
  }

  /** Word plane transform at t (corridor pose, then its slot in the terminal line). */
  private poseWord(i: number, t: number) {
    const P = this.P[i]!, m = P.wp.mesh;
    const u = this.collapse(i, t);
    m.position.lerpVectors(P.pos, P.tPos, u);
    m.quaternion.slerpQuaternions(P.quat, this.qb.identity(), u);
    m.scale.setScalar(lerp(1, P.tScale, u));
    m.updateMatrixWorld();
    return u;
  }

  /** The caret (bottom, top) in world space at time t, and whether it is writing / flying. */
  private caret(t: number): { b: THREE.Vector3; top: THREE.Vector3; busy: number } {
    const ws = this.line.words, n = ws.length;
    const at = (i: number, x: number) => {
      const P = this.P[i]!, m = P.wp.mesh;
      const b = new THREE.Vector3(x, -0.1 * P.capW, 0).applyMatrix4(m.matrixWorld);
      const top = new THREE.Vector3(x, P.wp.asc * 1.02, 0).applyMatrix4(m.matrixWorld);
      return { b, top };
    };
    const startX = (i: number) => this.P[i]!.wp.inkL - 0.06 * this.P[i]!.capW;
    const endX = (i: number) => this.P[i]!.wp.inkL + this.P[i]!.wp.inkW + 0.1 * this.P[i]!.capW;
    for (let i = 0; i < n; i++) this.poseWord(i, t);
    if (t < ws[0]!.start) return { ...at(0, startX(0)), busy: 0 };
    for (let i = 0; i < n; i++) {
      const w = ws[i]!, P = this.P[i]!;
      if (t <= w.end) {
        const p = Lyrics.wordProgress(w, t);
        return { ...at(i, lerp(startX(i), P.wp.inkL + P.wp.inkW * p, smoothstep(0, 0.08, p)) ), busy: 1 };
      }
      const nx = ws[i + 1];
      if (!nx || t < nx.start) {
        if (!nx) return { ...at(i, endX(i)), busy: 0 };
        const ta = Math.max(w.end, nx.start - 0.42);
        if (t < ta) return { ...at(i, endX(i)), busy: 0 };
        const u = ease.inOutCubic(clamp((t - ta) / (nx.start - ta)));
        const A = at(i, endX(i)), B = at(i + 1, startX(i + 1));
        return { b: A.b.lerp(B.b, u), top: A.top.lerp(B.top, u), busy: 1 };
      }
    }
    return { ...at(n - 1, endX(n - 1)), busy: 0 };
  }

  // ------------------------------------------------------------------ render
  override render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer } = this.ctx;
    const t = f.t;
    const ws = this.line.words;
    const pull = this.pull(t);

    // camera: corridor dolly, then the fast pull back to the terminal
    this.poseCam(Math.min(t, this.tPull0));
    if (pull > 0) {
      this.qa.copy(this.cam.quaternion);
      this.cam.position.lerp(this.cf, pull);
      this.cam.quaternion.slerpQuaternions(this.qa, this.qb.identity(), pull);
      this.cam.updateMatrixWorld();
    } else if (t > this.tPull0) this.poseCam(this.tPull0);
    const cam = this.cam;
    const final = t >= this.tPull0 + 0.42;

    this.bg.u.t!.value = t;
    this.bg.render(renderer, out);

    // ---- which word is in focus ----
    let focus = 0;
    for (let i = 0; i < ws.length; i++) if (t >= ws[i]!.start - 0.3) focus = i;

    // ---- word planes ----
    const lb = this.lines;
    lb.clear();
    const graph = LIN.graphite, ash = LIN.ash, bone = LIN.bone;
    const fDepth = (() => {
      const P = this.P[focus]!;
      const v = P.wp.mesh.position.clone().applyMatrix4(cam.matrixWorldInverse);
      return Math.max(2, -v.z);
    })();
    for (let i = 0; i < this.P.length; i++) {
      const P = this.P[i]!, w = P.word, wp = P.wp;
      const u = this.poseWord(i, t);
      const v = wp.mesh.position.clone().applyMatrix4(cam.matrixWorldInverse);
      const depth = -v.z;
      const pr = Lyrics.wordProgress(w, t);
      const near = smoothstep(0.8, 3.4, depth);
      const far = 1 - smoothstep(40, 80, depth);
      const dF = pull > 0 ? READ_D : fDepth;
      const defocus = Math.abs(depth - dF) / dF;
      const isMagic = i === ws.length - 1;
      const gold = isMagic ? smoothstep(w.start + 0.12, w.end - 0.05, t) * (1 - smoothstep(0.55, 0.9, u)) : 0;
      const flare = isMagic ? pulse(t, w.start + 0.2, 0.18) * 1.2 + pulse(t, w.end - 0.02, 0.12) * 0.8 : 0;
      wp.set({
        prog: pr, cool: smoothstep(w.end, w.end + 0.35, t), gold, flare,
        opacity: near * far * (1 - smoothstep(0.62, 0.92, u)) * (depth > 0 ? 1 : 0),
        blur: clamp(defocus * 3.2, 0, 4.5) * (1 - pull),
      });

      // corridor furniture: crop marks around the ink box, drawn into the dark on the first downbeats
      const mw = wp.mesh.matrixWorld;
      const cap = P.capW, m = 0.3 * cap, L = 0.34 * cap;
      const x0 = wp.inkL - m, x1 = wp.inkL + wp.inkW + m, y0 = -0.42 * cap - m * 0.6, y1 = wp.asc + m * 0.6;
      const tRev = (i < 4 ? this.downs[0] ?? 2.18 : this.downs[1] ?? 4.16) + (i % 4) * 0.09;
      const rev = prog(t, tRev, tRev + 0.5, ease.outExpo);
      const lit = smoothstep(w.start - 0.1, w.start + 0.2, t);
      const fade = (1 - pull) * near * far;
      if (rev > 0 && fade > 0.01) {
        const col: RGB = [lerp(graph[0], ash[0], lit), lerp(graph[1], ash[1], lit), lerp(graph[2], ash[2], lit)];
        const al = (0.55 + 0.35 * lit) * fade;
        const pts: [number, number, number, number][] = [
          [x0, y1, 1, -1], [x1, y1, -1, -1], [x0, y0, 1, 1], [x1, y0, -1, 1],
        ];
        const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
        for (const [cx, cy, dx, dy] of pts) {
          for (const [ex, ey] of [[dx * L * rev, 0], [0, dy * L * rev]] as const) {
            tmp.set(cx, cy, 0).applyMatrix4(mw); tmp2.set(cx + ex, cy + ey, 0).applyMatrix4(mw);
            lb.seg(tmp.x, tmp.y, tmp.z, tmp2.x, tmp2.y, tmp2.z, 1.3, col[0], col[1], col[2], al);
          }
        }
        // baseline hairline, extending with the pen
        if (pr > 0) {
          const bx1 = lerp(wp.inkL, x1 + m, pr);
          tmp.set(x0 - m, -0.16 * cap, 0).applyMatrix4(mw); tmp2.set(bx1, -0.16 * cap, 0).applyMatrix4(mw);
          lb.seg(tmp.x, tmp.y, tmp.z, tmp2.x, tmp2.y, tmp2.z, 1.1, bone[0] * 0.5, bone[1] * 0.5, bone[2] * 0.5, 0.55 * fade);
        }
      }
    }
    // dotted route of the pen, drawn into the dark with the crop marks; lit once the cursor has flown it
    for (let i = 0; i < this.route.length; i++) {
      const r = this.route[i]!, nx = ws[i + 1]!;
      const tRev = (i + 1 < 4 ? this.downs[0] ?? 2.18 : this.downs[1] ?? 4.16) + ((i + 1) % 4) * 0.09;
      const rev = prog(t, tRev, tRev + 0.6, ease.outCubic);
      if (rev <= 0) continue;
      const len = r.a.distanceTo(r.b), n = Math.max(2, Math.floor(len / 0.32));
      const flown = smoothstep(nx.start - 0.45, nx.start, t);
      for (let k = 0; k < n * rev; k++) {
        const u0 = k / n, u1 = Math.min(1, u0 + 0.28 / n);
        const lit = u0 < flown ? 1 : 0;
        const dv = new THREE.Vector3(lerp(r.a.x, r.b.x, u0), lerp(r.a.y, r.b.y, u0), lerp(r.a.z, r.b.z, u0)).applyMatrix4(cam.matrixWorldInverse);
        const dd = -dv.z, fa = smoothstep(2.5, 7, dd) * (1 - smoothstep(35, 70, dd));
        if (fa < 0.01) continue;
        const c = lit ? LIN.ash : LIN.graphite;
        const ax = lerp(r.a.x, r.b.x, u0), ay = lerp(r.a.y, r.b.y, u0), az = lerp(r.a.z, r.b.z, u0);
        const bx = lerp(r.a.x, r.b.x, u1), by = lerp(r.a.y, r.b.y, u1), bz = lerp(r.a.z, r.b.z, u1);
        lb.seg(ax, ay, az, bx, by, bz, 1.6, c[0], c[1], c[2], (0.5 + 0.3 * lit) * (1 - pull) * fa);
      }
    }
    lb.render(renderer, out, cam);
    renderer.setRenderTarget(out);
    renderer.render(this.words3, cam);

    // ---- the cursor (2D, projected) ----
    const fx = this.fx;
    fx.clear();
    const head2D = (tt: number) => {
      const c = this.caretAt(tt);
      return c ? { x: c.bx, y: c.by } : null;
    };
    const cNow = this.caretAt(t);
    const q = this.q;
    if (final) {
      cursorCaret(fx, q.caretX, q.caretY, q.caretH, cursorBlink(f.beatPhase), t);
    } else if (cNow) {
      const on = t < ws[0]!.start ? smoothstep(0.3, 0.7, t) * cursorBlink(f.beatPhase) : cNow.busy > 0 ? 1 : cursorBlink(f.beatPhase);
      // motion trail while flying between planes
      if (cNow.busy > 0 && pull <= 0) {
        let prev = { x: cNow.bx, y: cNow.by }, run = 0;
        for (let k = 1; k <= 10; k++) {
          const c = this.caretAt(t - k * 0.014);
          if (!c) break;
          const d = Math.hypot(c.bx - prev.x, c.by - prev.y);
          run += d;
          if (run > 260) break;
          if (d > 1.5) fx.seg2(prev.x, prev.y, c.bx, c.by, Math.max(1.5, cNow.h * 0.05) * (1 - k / 11), [LIN.signal[0] * 1.6, LIN.signal[1] * 1.6, LIN.signal[2] * 1.6], (1 - k / 11) * 0.8);
          prev = { x: c.bx, y: c.by };
        }
      }
      // during the collapse the caret slides onto the end of the terminal line
      const uc = smoothstep(0.35, 1, this.collapse(ws.length - 1, t));
      const bx = lerp(cNow.bx, q.caretX, uc), by = lerp(cNow.by, q.caretY + q.caretH, uc), h = lerp(cNow.h, q.caretH, uc);
      cursorCaret(fx, bx, by - h, h, on, t);
      if (t > this.tMagic) {
        const fl = pulse(t, this.tMagic + 0.2, 0.25) + pulse(t, ws[ws.length - 1]!.end, 0.15) * 0.8;
        cursorTip(fx, bx, by, t, (1.2 + fl * 3.5) * (1 - uc * 0.6), (0.6 + fl * 2.2) * (1 - uc * 0.5));
      }
      const wm = ws[ws.length - 1]!;
      weldSparks(fx, t, head2D, {
        rate: (tb) => (tb < wm.start ? 0 : tb < wm.end + 0.1 ? 260 : 260 * Math.max(0, 1 - (tb - wm.end - 0.1) / 0.35)),
        rateMax: 260, life: 0.6, speed: 520, gravity: 900, intensity: 1.2, seed: 11,
      });
    }
    for (let i = 0; i < this.P.length; i++) this.poseWord(i, t);
    fx.render(renderer, out);

    // ---- mono layer: word labels, attribution, the terminal line ----
    this.drawHud(t, f.beatPhase, pull, final);
    this.ctx.comp.draw(renderer, this.hud.upload(), out);

    const fl = pulse(t, this.tMagic + 0.2, 0.25);
    return { bloom: 0.6 + fl * 0.25, vignette: 0.42, grain: 0.06, exposure: smoothstep(0.0, 0.25, t) };
  }

  /** Caret at time tt projected to the screen (bottom point and height, px). */
  private caretAt(tt: number) {
    const c = this.caret(tt);
    const cam = this.cam;
    const b = toScreen(cam, c.b.x, c.b.y, c.b.z), top = toScreen(cam, c.top.x, c.top.y, c.top.z);
    if (!b.ok || !top.ok) return null;
    return { bx: b.x, by: b.y, h: Math.max(4, Math.hypot(b.x - top.x, b.y - top.y)), busy: c.busy };
  }

  private drawHud(t: number, beatPhase: number, pull: number, final: boolean) {
    const L = this.hud, c = L.ctx;
    L.clear();
    const ws = this.line.words, cam = this.cam;
    c.textBaseline = 'alphabetic';
    // tiny mono labels on each plane: index and onset, typed as the word starts
    for (let i = 0; i < this.P.length; i++) {
      const P = this.P[i]!, w = P.word, wp = P.wp;
      const lab = `${String(i + 1).padStart(2, '0')}  ${w.start.toFixed(3)} s`;
      const n = Math.floor(clamp((t - w.start + 0.05) / 0.2) * lab.length);
      if (n <= 0) continue;
      const cap = P.capW, m = 0.3 * cap;
      const p = new THREE.Vector3(wp.inkL - m, wp.asc + m * 0.6 + 0.16 * cap, 0).applyMatrix4(wp.mesh.matrixWorld);
      const s = toScreen(cam, p.x, p.y, p.z);
      if (!s.ok) continue;
      const pxu = H / (2 * s.z * TAN);
      const size = 0.13 * cap * pxu;
      const a = smoothstep(7, 11, size) * (1 - smoothstep(34, 60, size)) * (1 - pull);
      if (a < 0.01) continue;
      c.font = font(F.mono(400), Math.min(size, 40));
      c.fillStyle = rgba('ash', 0.85 * a);
      c.fillText(lab.slice(0, n), s.x, s.y);
    }
    // status line, deadpan
    const cols = Lyrics.lineCharProgress(this.line, t);
    const sa = smoothstep(ws[0]!.start - 0.3, ws[0]!.start, t) * (1 - pull);
    if (sa > 0.01) {
      c.font = font(F.mono(400), 14);
      c.fillStyle = rgba('graphite', 0.95 * sa);
      c.fillText(`clarke.txt   ln 1, col ${Math.floor(cols) + 1}   utf-8   spoken`, 96, H - 84);
      c.textAlign = 'right';
      c.fillText(`t ${t.toFixed(2).padStart(5, '0')} s`, W - 96, H - 84);
      c.textAlign = 'left';
    }
    // the attribution types itself under "magic.", then flies into the terminal's second row
    const wm = ws[ws.length - 1]!, Pm = this.P[this.P.length - 1]!;
    const tA = wm.end - 0.1;
    const nA = clamp((t - tA) * 130, 0, ATTR.length);
    const u = this.collapse(this.P.length - 1, t);
    if (nA > 0 && !final) {
      const p = new THREE.Vector3(Pm.wp.inkL + 0.05 * Pm.capW, -0.62 * Pm.capW, 0).applyMatrix4(Pm.wp.mesh.matrixWorld);
      const s = toScreen(cam, p.x, p.y, p.z);
      if (s.ok) {
        const pxu = H / (2 * s.z * TAN);
        const size0 = clamp(0.115 * Pm.capW * pxu / Math.max(0.2, Pm.wp.mesh.scale.x), 10, 40) * Math.max(0.2, Pm.wp.mesh.scale.x);
        const size = lerp(Math.max(size0, 12), TERM.attrSize, u);
        const x = lerp(s.x, this.q.attrX, u), y = lerp(s.y, TERM.attrBase, u);
        c.font = font(TERM.famDim(), size);
        c.fillStyle = rgba('ash', 0.9);
        c.fillText(ATTR.slice(0, Math.floor(nA)), x, y);
      }
    }
    // the terminal line: each word appears as its plane lands in its slot
    const wa = (i: number) => (final ? 1 : smoothstep(0.6, 0.95, this.collapse(i, t)));
    drawQuoteRow(c, this.q, wa, final ? ATTR.length : 0, 1);
    void beatPhase;
  }
}
