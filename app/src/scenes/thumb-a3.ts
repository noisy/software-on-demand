// Thumbnails, author A3 (jevons, niche) — see docs/THUMBNAILS.md. ctx.params.k selects the design:
//  1. the engraved bell ringing, shockwave rings, the demand line shooting up — "JEVONS WAS RIGHT."
//  2. the price tag: $1,000,000 struck through, a huge $1, torn digits flying — "SOFTWARE GOT CHEAP."
//  3. the dot-map table at night, hundreds of gold niche pins, one hero pin — "EVERY NICHE IS WORTH IT."
//  4. the engraved steam engine + governor on cobalt — "THE COAL QUESTION, 2026"
//  5. the Jevons chart on cobalt: the cost curve plunges, the demand line rockets up — "CHEAPER MEANS MORE."
// Stills: deterministic, no dependence on t beyond the fixed pose.
import * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '../engine/scene';
import { FSPass, Layer2D, W, H, clearRT } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { LIN, rgba } from '../engine/palette';
import { F, font, layout } from '../engine/type';
import { clamp, hash, lerp, mulberry32, noise1, smootherstep, TAU } from '../engine/util';
import { cursorTip } from './_motifs';
import { headline, kicker, wordmark } from './_thumb';
import { Machine, Bell, MACH, BELL_AX, bellR } from './jevons-machine';
import { Projector, setCam, setEngraveCam, engraveMat, v3, add3, sub3, norm3, mulRGB, type CamKey, type P3, type RGB } from './jevons-kit';
import { landDots, llToXZ, MAP } from './niche-map';

const COB = LIN.cobalt;

export default class ThumbA3 extends Scene {
  k = 1;
  cam = new THREE.PerspectiveCamera(32, W / H, 0.05, 500);
  pr = new Projector();
  world = new THREE.Scene();
  mach: Machine | null = null;
  bell: Bell | null = null;
  mats: THREE.RawShaderMaterial[] = [];
  L3 = new LineBatch(60000, { screen2D: false, blend: 'add', depthTest: true });
  Ld = new LineBatch(9000, { screen2D: false, worldWidth: true, blend: 'add', depthTest: true });
  L2 = new LineBatch(4000, { screen2D: true, blend: 'add' });
  text = new Layer2D();
  bg = new FSPass(/* glsl */ `
    uniform vec3 uA; uniform vec3 uB; uniform vec2 uC; uniform float uR; uniform vec3 uGlow; uniform vec2 uGC;
    void main() {
      vec2 p = (vUv - 0.5) * vec2(16.0 / 9.0, 1.0);
      float r = length(p - uC);
      vec3 c = mix(uB, uA, 1.0 - smoothstep(0.0, uR, r));
      c += uGlow * (1.0 - smoothstep(0.0, 0.75, length(p - uGC)));
      fragColor = vec4(c, 1.0);
    }`, { uA: { value: new THREE.Vector3() }, uB: { value: new THREE.Vector3() }, uC: { value: new THREE.Vector2() }, uR: { value: 1.2 }, uGlow: { value: new THREE.Vector3() }, uGC: { value: new THREE.Vector2() } });
  dots: { x: number; z: number }[] = [];

  override async init() {
    this.k = +(this.ctx.params.k ?? 1);
    const k = this.k;
    if (k === 1) {
      this.bell = new Bell();
      // the thumbnail keeps the bell alone: no ringing wheel competing with the silhouette
      for (const ch of this.bell.body.children) if (Math.abs(ch.position.x - 1.62) < 1e-3) ch.visible = false;
      this.world.add(this.bell.root);
      this.mats.push(...this.bell.mats);
    }
    if (k === 4) {
      this.mach = new Machine();
      this.world.add(this.mach.root);
      this.mats.push(...this.mach.mats);
      for (const m of this.mats) (m.uniforms.uBody!.value as THREE.Vector3).set(...mulRGB(COB, 0.55));
    }
    if (k === 3) {
      this.dots = landDots();
      const mWood = engraveMat({ world: 14, cross: 0.3, border: 1, sil: 0, line: mulRGB(LIN.bone, 0.5), hair: 0.05 });
      const mTop = engraveMat({ world: 0.001, cross: 0, sil: 0, hair: 0, line: mulRGB(LIN.ink2, 1), body: mulRGB(LIN.ink2, 0.8) });
      this.mats.push(mWood, mTop);
      const TW = MAP.W + 1.6, TD = MAP.H + 2.4;
      const top = new THREE.Mesh(new THREE.BoxGeometry(TW, 0.4, TD), mTop);
      top.position.set(0, -0.2, 0.55);
      this.world.add(top);
      const fr = (w: number, d: number, x: number, z: number) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.12, d), mWood); m.position.set(x, 0.04, z); this.world.add(m); };
      fr(TW, 0.3, 0, 0.55 - TD / 2 + 0.15); fr(TW, 0.3, 0, 0.55 + TD / 2 - 0.15); fr(0.3, TD, -TW / 2 + 0.15, 0.55); fr(0.3, TD, TW / 2 - 0.15, 0.55);
    }
  }

  setBg(a: RGB, b: RGB, cx = 0, cy = 0, r = 1.2, glow: RGB = [0, 0, 0], gx = 0, gy = 0) {
    const u = this.bg.u;
    (u.uA!.value as THREE.Vector3).set(...a); (u.uB!.value as THREE.Vector3).set(...b);
    (u.uC!.value as THREE.Vector2).set(cx, cy); u.uR!.value = r;
    (u.uGlow!.value as THREE.Vector3).set(...glow); (u.uGC!.value as THREE.Vector2).set(gx, gy);
  }

  render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer, comp } = this.ctx;
    const t = f.t;
    this.L3.clear(); this.Ld.clear(); this.L2.clear();
    const Tx = this.text; Tx.clear();
    const c = Tx.ctx;
    let post: PostOverrides = {};
    const k = this.k;
    const cam = k === 1 ? this.bellCam() : k === 2 ? this.tagCam() : k === 3 ? this.mapCam() : k === 4 ? this.engineCam() : this.chartCam();
    setCam(this.cam, cam);
    this.pr.update(this.cam);
    if (k === 1) this.poseBell();
    if (k === 4) this.mach!.pose(1.1, 0.6, 1.05);
    setEngraveCam(this.mats, this.cam, k === 4 ? v3(0.3, 0.8, 0.55) : v3(-0.45, 0.7, 0.6));

    if (k === 1) this.setBg(mulRGB(LIN.ink2, 1.1), LIN.ink, 0.25, 0.1, 1.0, mulRGB(LIN.blood, 0.12), 0.3, -0.1);
    else if (k === 2) this.setBg(mulRGB(LIN.ink2, 1.0), LIN.ink, -0.2, 0.0, 1.1, mulRGB(LIN.blood, 0.08), -0.2, -0.1);
    else if (k === 3) this.setBg(mulRGB(LIN.ink2, 0.9), LIN.ink, 0.0, -0.2, 1.1, mulRGB(LIN.blood, 0.1), 0.0, -0.3);
    else this.setBg(mulRGB(COB, 1.25), mulRGB(COB, 0.55), k === 4 ? 0.35 : 0.3, 0.05, 1.3);
    clearRT(renderer, out, LIN.ink);
    this.bg.render(renderer, out);
    renderer.setRenderTarget(out);
    renderer.clearDepth();
    renderer.render(this.world, this.cam);

    if (k === 1) post = this.drawBell(c, t);
    else if (k === 2) post = this.drawTag(c, t);
    else if (k === 3) post = this.drawMap(c, t);
    else if (k === 4) post = this.drawEngine(c, t);
    else post = this.drawChart(c, t);

    this.Ld.render(renderer, out, this.cam);
    this.L3.render(renderer, out, this.cam);
    c.setTransform(1, 0, 0, 1, 0, 0);
    this.drawType(c);
    comp.draw(renderer, Tx.upload(), out);
    this.L2.render(renderer, out);
    return { vignette: 0.45, grain: 0.05, bloom: 0.6, ...post };
  }

  // ------------------------------------------------------------------ 1: the bell
  bellCam(): CamKey {
    const b = MACH.bell;
    const C = v3(b.x, b.y - BELL_AX + 1.0, b.z);
    const a = 0.55;
    return { pos: add3(C, v3(Math.sin(a) * 7.0, -1.6, Math.cos(a) * 7.0)), tgt: add3(C, v3(-2.3, 0.45, 0.9)), roll: -0.07, fov: 36 };
  }
  poseBell() { this.bell!.pose(-0.3, 0.42); }

  drawBell(c: CanvasRenderingContext2D, _t: number): PostOverrides {
    const bell = this.bell!;
    const L = this.L3, s = LIN.signal, e = LIN.ember;
    const mouth = bell.toWorld(v3(0, 0.05, 0));
    const n = bell.dirToWorld(v3(0, 1, 0));
    const ax1 = v3(1, 0, 0), ax2 = norm3(v3(0, n.z, -n.y));
    // shockwave rings leaving the mouth
    for (let q = 0; q < 5; q++) {
      const R = 1.5 + q * 1.15 + q * q * 0.22;
      const a = [2.2, 1.3, 0.8, 0.5, 0.3][q]!;
      const col = q === 0 ? mulRGB(e, 1.3) : s;
      let p0: P3 | null = null;
      for (let i = 0; i <= 160; i++) {
        const th = (i / 160) * TAU;
        const p = add3(add3(mouth, v3(ax1.x * Math.cos(th) * R + ax2.x * Math.sin(th) * R, ax2.y * Math.sin(th) * R, ax2.z * Math.sin(th) * R)), v3(n.x * -0.2 * q, n.y * -0.2 * q, n.z * -0.2 * q));
        if (p0) L.seg(p0.x, p0.y, p0.z, p.x, p.y, p.z, 3 - q * 0.4, col[0] * a, col[1] * a, col[2] * a, 1);
        p0 = p;
      }
    }
    // vibration rays around the waist
    const rc = bell.toWorld(v3(0, 1.0, 0));
    for (let i = 0; i < 34; i++) {
      const q = (i / 34) * TAU + 0.1;
      const d = v3(Math.cos(q), Math.sin(q) * 0.9, 0.35 * Math.sin(q * 2));
      const r0 = 2.1 + 0.3 * hash(i, 2), r1 = r0 + 0.6 + 0.9 * hash(i, 3);
      const a = 1.1 * (0.4 + 0.6 * hash(i, 9));
      L.seg(rc.x + d.x * r0, rc.y + d.y * r0, rc.z + d.z * r0, rc.x + d.x * r1, rc.y + d.y * r1, rc.z + d.z * r1, 2, s[0] * a, s[1] * a, s[2] * a, 1);
    }
    // the demand line shooting up past the bell (right of it), its head in frame
    const e2 = this.cam.matrixWorld.elements;
    const right = v3(e2[0]!, 0, e2[2]!);
    const bc = v3(MACH.bell.x, MACH.bell.y - BELL_AX + 1.0, MACH.bell.z);
    // placed in camera space: right of the bell, its head in the upper right third
    const fw = v3(-e2[8]!, -e2[9]!, -e2[10]!), cp = this.pr.camPos, dd = 4.2;
    const X = cp.x + fw.x * dd + right.x * 1.8, Z = cp.z + fw.z * dd + right.z * 1.8, yTop = cp.y + fw.y * dd + 0.85;
    void bc;
    // (bottom end kept in front of the camera: LineBatch drops segments with an end behind it)
    this.L3.seg(X, yTop - 8, Z, X, yTop, Z, 7, s[0] * 2.4, s[1] * 2.4, s[2] * 2.4, 1);
    this.L3.seg(X, yTop - 8, Z, X, yTop, Z, 34, s[0] * 0.14, s[1] * 0.14, s[2] * 0.14, 1);
    for (let d = 0; d < 7; d++) {
      const y = yTop - 1.2 - d * 1.5;
      this.L3.seg(X - 0.35, y, Z, X + 0.35, y, Z, 2, 0.5, 0.5, 0.48, 1);
    }
    const hp = this.pr.p(v3(X, yTop, Z));
    if (hp) cursorTip(this.L2, hp.x, hp.y, 1.3, 3.2, 1.4);
    // clapper strike point: a white-hot contact on the sound bow
    const hit = bell.toWorld(v3(0, 0.25, -bellR(0.25) + 0.1));
    const hs = this.pr.p(hit);
    if (hs) cursorTip(this.L2, hs.x, hs.y, 0.7, 2.2, 1.2);
    // the inscription, lit
    this.inscription(c, 'JEVONS · 1865 · ', 1.02, -0.2, true);
    return { bloom: 0.75, flash: 0 };
  }

  inscription(c: CanvasRenderingContext2D, text: string, y: number, a0: number, gold: boolean) {
    const bell = this.bell!;
    const fam = F.archivo(112.5, 700);
    const r = bellR(y) + 0.012;
    const lay = layout(text, fam, 100, 6);
    const em = Math.min(0.3, (0.9 * TAU * r) / (lay.width / 100));
    c.font = font(fam, 100);
    c.textAlign = 'center';
    c.textBaseline = 'alphabetic';
    for (const g of lay.glyphs) {
      if (g.ch === ' ') continue;
      const a = a0 + ((g.x + g.w / 2) * em) / 100 / r;
      const P = bell.toWorld(v3(Math.sin(a) * r, y - 0.12, Math.cos(a) * r));
      const nrm = norm3(bell.dirToWorld(v3(Math.sin(a), 0.2, Math.cos(a))));
      const fac = this.pr.facing(P, nrm);
      if (fac < 0.15) continue;
      const Xd = bell.dirToWorld(v3(Math.cos(a), 0, -Math.sin(a)));
      const Yd = bell.dirToWorld(norm3(v3(Math.sin(a) * -0.2, 1, Math.cos(a) * -0.2)));
      if (!this.pr.plane(c, P, Xd, Yd, em / 100)) continue;
      c.fillStyle = gold ? rgba('signal', clamp((fac - 0.15) * 3)) : rgba('bone', 0.6);
      c.fillText(g.ch, 0, 0);
    }
    c.setTransform(1, 0, 0, 1, 0, 0);
  }

  // ------------------------------------------------------------------ 2: the price tag
  tagCam(): CamKey { return { pos: v3(0.4, 0.6, 10.5), tgt: v3(0.2, 0.0, 0), roll: 0.0, fov: 34 }; }

  drawTag(c: CanvasRenderingContext2D, _t: number): PostOverrides {
    const L = this.L3, b = LIN.bone, s = LIN.signal;
    // chart grid tilted behind, the gold cost curve plunging diagonally across it
    const gz = -3.2;
    for (let i = -14; i <= 14; i++) {
      const a = i % 4 === 0 ? 0.2 : 0.08;
      L.seg(i * 0.5, -6, gz, i * 0.5, 6, gz, 1, b[0] * a, b[1] * a, b[2] * a, 1);
    }
    for (let j = -12; j <= 12; j++) {
      const a = j % 4 === 0 ? 0.2 : 0.07;
      L.seg(-8, j * 0.5, gz, 8, j * 0.5, gz, 1, b[0] * a, b[1] * a, b[2] * a, 1);
    }
    const curve = (x: number) => 3.1 - 0.12 * (x + 7) + 0.06 * noise1(x * 3, 2) - 7.0 * smootherstep(-0.5, 2.6, x);
    let prev: P3 | null = null;
    for (let x = -7.5; x <= 5.4; x += 0.02) {
      const p = v3(x, curve(x), gz + 0.02);
      if (prev) {
        const hot = clamp((x + 1) / 5);
        L.seg(prev.x, prev.y, prev.z, p.x, p.y, p.z, 4, lerp(b[0] * 0.6, s[0] * 2, hot), lerp(b[1] * 0.6, s[1] * 2, hot), lerp(b[2] * 0.6, s[2] * 2, hot), 1);
        L.seg(prev.x, prev.y, prev.z, p.x, p.y, p.z, 18, s[0] * 0.1 * hot, s[1] * 0.1 * hot, s[2] * 0.1 * hot, 1);
      }
      prev = p;
    }
    const head = v3(5.4, curve(5.4), gz + 0.02);
    // the tag, hung from a string, big and slightly turned
    const O = v3(-3.0, 1.9, 0.8);
    const ang = -0.12;
    const X = v3(Math.cos(ang), Math.sin(ang), 0.18), Y = v3(-Math.sin(ang), Math.cos(ang), 0);
    const pin = this.pr.p(v3(-3.3, 7.5, 0.4)), hole = this.pr.p(O);
    if (pin && hole) {
      c.strokeStyle = rgba('bone', 0.8); c.lineWidth = 3;
      c.beginPath(); c.moveTo(pin.x, pin.y); c.lineTo(hole.x, hole.y); c.stroke();
    }
    if (this.pr.plane(c, O, norm3(X), Y, 0.0088)) {
      const ww = 600, hh = 390;
      c.beginPath();
      c.moveTo(-ww / 2 + 60, 0); c.lineTo(ww / 2 - 60, 0); c.lineTo(ww / 2, 60); c.lineTo(ww / 2, hh); c.lineTo(-ww / 2, hh); c.lineTo(-ww / 2, 60); c.closePath();
      c.fillStyle = rgba('bone', 1); c.fill();
      c.fillStyle = rgba('ink', 1);
      c.beginPath(); c.arc(0, 40, 16, 0, TAU); c.fill();
      c.strokeStyle = rgba('ink', 0.5); c.lineWidth = 4;
      c.strokeRect(-ww / 2 + 18, 80, ww - 36, hh - 98);
      c.textAlign = 'center'; c.textBaseline = 'alphabetic';
      c.font = font(F.mono(600), 60);
      c.fillStyle = rgba('ink', 0.75);
      c.fillText('$1,000,000', 0, 158);
      c.strokeStyle = rgba('signal', 1); c.lineWidth = 9;
      c.beginPath(); c.moveTo(-190, 136); c.lineTo(190, 128); c.stroke();
      c.font = font(F.mono(700), 230);
      c.fillStyle = rgba('ink', 1);
      c.fillText('$1', 0, 350);
    }
    // the torn-off digit groups tumbling away
    const pieces: [P3, number, string][] = [[v3(-0.1, -1.1, 1.4), 0.6, ',000'], [v3(1.3, -1.9, 0.9), -0.45, ',000'], [v3(-0.6, -2.6, 1.8), 1.2, '00']];
    for (const [P, rot, txt] of pieces) {
      if (!this.pr.plane(c, P, v3(Math.cos(rot), Math.sin(rot), 0), v3(-Math.sin(rot), Math.cos(rot), 0), 0.0075)) continue;
      c.fillStyle = rgba('bone', 0.9);
      c.fillRect(-150, -95, 300, 130);
      c.fillStyle = rgba('ink', 1);
      c.font = font(F.mono(700), 110);
      c.textAlign = 'center';
      c.fillText(txt, 0, 10);
    }
    c.setTransform(1, 0, 0, 1, 0, 0);
    const hp = this.pr.p(head);
    if (hp) cursorTip(this.L2, hp.x, hp.y, 1.1, 2.6, 1.3);
    return { bloom: 0.7 };
  }

  // ------------------------------------------------------------------ 3: the niche map
  mapCam(): CamKey { return { pos: v3(-0.3, 1.25, 2.2), tgt: v3(1.2, 0.15, -2.0), roll: -0.05, fov: 46 }; }

  drawMap(c: CanvasRenderingContext2D, _t: number): PostOverrides {
    const b = LIN.bone, s = LIN.signal, e = LIN.ember;
    const rnd = mulberry32(77);
    const lit = new Set<number>();
    for (let i = 0; i < 700; i++) lit.add(Math.floor(rnd() * this.dots.length));
    const hero = llToXZ(12, 8);
    this.dots.forEach((d, i) => {
      const r = Math.hypot(d.x - hero.x, d.z - hero.z);
      const warm = Math.exp(-r * r / 3.5) * 0.9;
      const k = 0.28 + warm * 0.7;
      const col: RGB = [lerp(b[0], s[0], warm) * k, lerp(b[1], s[1], warm) * k, lerp(b[2], s[2], warm) * k];
      this.Ld.seg(d.x - 0.001, 0.03, d.z, d.x + 0.001, 0.03, d.z, 0.04, col[0], col[1], col[2], 1);
      if (lit.has(i)) {
        const h = 0.2 + hash(i, 4) * 0.3;
        this.L3.seg(d.x, 0.02, d.z, d.x, h, d.z, 1.4, s[0] * 1.2, s[1] * 1.2, s[2] * 1.2, 1);
        this.L3.seg(d.x, h, d.z, d.x + 0.001, h, d.z, 6, e[0] * 2, e[1] * 2, e[2] * 2, 1);
        this.L3.seg(d.x, h, d.z, d.x + 0.001, h, d.z, 16, s[0] * 0.15, s[1] * 0.15, s[2] * 0.15, 1);
      }
    });
    // graticule
    for (let lat = -60; lat <= 80; lat += 20) { const z = llToXZ(0, lat).z; this.L3.seg(-9, 0.002, z, 9, 0.002, z, 1, b[0] * 0.06, b[1] * 0.06, b[2] * 0.06, 1); }
    for (let lon = -180; lon <= 180; lon += 30) { const x = llToXZ(lon, 0).x; this.L3.seg(x, 0.002, -4.2, x, 0.002, 3, 1, b[0] * 0.06, b[1] * 0.06, b[2] * 0.06, 1); }
    // hero pin (Lyon): tall, with its flag and a ripple ring
    const H0 = 0.6;
    this.L3.seg(hero.x, 0, hero.z, hero.x, H0, hero.z, 3.2, s[0] * 2, s[1] * 2, s[2] * 2, 1);
    for (let q = 0; q < 3; q++) {
      const R = 0.35 + q * 0.42, a = [1.4, 0.8, 0.4][q]!;
      let p0: P3 | null = null;
      for (let i = 0; i <= 90; i++) {
        const th = (i / 90) * TAU;
        const p = v3(hero.x + Math.cos(th) * R, 0.04, hero.z + Math.sin(th) * R);
        if (p0) this.L3.seg(p0.x, p0.y, p0.z, p.x, p.y, p.z, 2, s[0] * a, s[1] * a, s[2] * a, 1);
        p0 = p;
      }
    }
    const hp = this.pr.p(v3(hero.x, H0, hero.z));
    if (hp) cursorTip(this.L2, hp.x, hp.y, 0.9, 2.6, 1.3);
    // (no flag: the headline carries the words)
    if (hp) return { bloom: 0.75 };
    const P = v3(hero.x, H0, hero.z);
    const to = norm3(sub3(this.pr.camPos, P));
    if (this.pr.plane(c, P, norm3(v3(to.z, 0, -to.x)), v3(0, 1, 0), 0.0034)) {
      c.fillStyle = rgba('ink', 0.85); c.fillRect(8, -150, 520, 160);
      c.fillStyle = rgba('signal', 1); c.fillRect(0, -150, 8, 160);
      c.font = font(F.mono(700), 58); c.fillStyle = rgba('bone', 1); c.textAlign = 'left';
      c.fillText('BAKERY ROTA', 30, -80);
      c.font = font(F.mono(400, true), 44); c.fillStyle = rgba('ash', 1);
      c.fillText('Lyon · 6 users', 30, -20);
    }
    c.setTransform(1, 0, 0, 1, 0, 0);
    return { bloom: 0.75 };
  }

  // ------------------------------------------------------------------ 4: the engine on cobalt
  engineCam(): CamKey { return { pos: v3(16.6, 6.0, 1.9), tgt: v3(7.6, 3.4, -7.4), roll: 0.05, fov: 36 }; }

  drawEngine(c: CanvasRenderingContext2D, _t: number): PostOverrides {
    const b = LIN.bone;
    // blueprint floor grid
    for (let z = -13; z <= 1; z += 0.5) this.L3.seg(-2, MACH.floorY, z, 22, MACH.floorY, z, 1, b[0] * 0.12, b[1] * 0.12, b[2] * 0.12, 1);
    for (let x = -2; x <= 22; x += 0.5) this.L3.seg(x, MACH.floorY, -13, x, MACH.floorY, 1, 1, b[0] * 0.12, b[1] * 0.12, b[2] * 0.12, 1);
    // the governor's balls: white-hot glints (the cursor lives here)
    const bp = this.mach!.ballPos(0.6, 1.05, 0);
    const s1 = this.pr.p(bp);
    if (s1) cursorTip(this.L2, s1.x - 6, s1.y - 10, 1.0, 1.6, 1.1);
    // dimension line across the flywheel (drawing convention), gold
    const A = add3(MACH.fly, v3(0, -MACH.flyR, 1.2)), B = add3(MACH.fly, v3(0, MACH.flyR, 1.2));
    const s = LIN.signal;
    void s; void B;
    const pa = null as { x: number; y: number } | null; void A;
    if (pa) {
      c.save(); c.translate(pa.x - 16, pa.y); c.rotate(-Math.PI / 2);
      c.font = font(F.mono(600), 30); c.fillStyle = rgba('signal', 1); c.textAlign = 'center';
      c.fillText('Ø 6.1 m · 14 t', 0, 0); c.restore();
    }
    return { bloom: 0.55 };
  }

  // ------------------------------------------------------------------ 5: the Jevons chart on cobalt
  chartCam(): CamKey { return { pos: v3(12.6, 2.6, 12.5), tgt: v3(14.2, 3.7, 0), roll: 0.04, fov: 34 }; }

  drawChart(c: CanvasRenderingContext2D, _t: number): PostOverrides {
    const L = this.L3, b = LIN.bone, s = LIN.signal;
    const y0 = 0.6, X1 = 17.2;
    for (let i = 0; i <= 80; i++) {
      const X = i * 0.25, major = i % 4 === 0, a = major ? 0.32 : 0.12;
      L.seg(X, -0.4, 0, X, 11, 0, major ? 1.5 : 1, b[0] * a, b[1] * a, b[2] * a, 1);
    }
    for (let d = 0; d <= 9; d++) { const y = y0 + d * 1.15; L.seg(-0.2, y, 0, 20, y, 0, 1.4, b[0] * 0.3, b[1] * 0.3, b[2] * 0.3, 1); }
    const cost = (X: number) => y0 + 1.15 * Math.max(0, (6.6 - 0.07 * X + 0.07 * noise1(X * 3.1, 12)) * (1 - smootherstep(11.5, 14.5, X)));
    let prev: P3 | null = null;
    for (let X = 4; X <= X1; X += 0.02) {
      const p = v3(X, cost(X), 0.03);
      if (prev) {
        L.seg(prev.x, prev.y, 0.03, p.x, p.y, 0.03, 5, b[0] * 0.95, b[1] * 0.95, b[2] * 0.95, 1);
      }
      prev = p;
    }
    // the demand line: straight up from the bottom of the plunge, gold, past the top of the frame
    const dx = X1;
    L.seg(dx, y0, 0.05, dx, 40, 0.05, 8, s[0] * 2.5, s[1] * 2.5, s[2] * 2.5, 1);
    L.seg(dx, y0, 0.05, dx, 40, 0.05, 40, s[0] * 0.13, s[1] * 0.13, s[2] * 0.13, 1);
    // the knee where cheap turns into more
    const kp = this.pr.p(v3(dx, y0, 0.05));
    if (kp) cursorTip(this.L2, kp.x, kp.y, 0.4, 2.6, 1.4);
    // labels on the chart plane
    const lab = (txt: string, x: number, y: number, em: number, col: string, fam = F.mono(700)) => {
      if (!this.pr.plane(c, v3(x, y, 0.05), v3(1, 0, 0), v3(0, 1, 0), em / 100)) return;
      c.font = font(fam, 100); c.fillStyle = col; c.textAlign = 'left'; c.fillText(txt, 0, 0);
    };
    lab('COST', 13.5, 4.5, 0.62, rgba('bone', 1));
    lab('DEMAND', dx + 0.4, 5.2, 0.62, rgba('signal', 1));
    c.setTransform(1, 0, 0, 1, 0, 0);
    return { bloom: 0.6 };
  }

  // ------------------------------------------------------------------ type
  drawType(c: CanvasRenderingContext2D) {
    const k = this.k;
    c.textAlign = 'left'; c.textBaseline = 'alphabetic';
    if (k === 1) {
      kicker(c, 'W. S. JEVONS, 1865', 110, 250, { size: 34 });
      headline(c, ['JEVONS', 'WAS RIGHT.'], { x: 104, y: 480, size: 230, width: 75, gold: ['right.'], maxWidth: 880 });
      wordmark(c, 112, 1000, 50);
    } else if (k === 2) {
      headline(c, ['SOFTWARE', 'GOT CHEAP.'], { x: 1840, y: 330, size: 220, width: 75, align: 'right', gold: ['cheap.'], maxWidth: 900 });
      kicker(c, 'A SONG ABOUT SOFTWARE ON DEMAND', 1840, 640, { size: 30, align: 'right' });
      wordmark(c, 112, 1000, 50);
    } else if (k === 3) {
      headline(c, ['EVERY NICHE', 'IS WORTH IT.'], { x: W / 2, y: 250, size: 190, width: 75, align: 'center', gold: ['niche'], maxWidth: 1500 });
      wordmark(c, 112, 1000, 50);
    } else if (k === 4) {
      kicker(c, 'MORE EFFICIENT ENGINES, MORE COAL', 110, 150, { size: 30 });
      headline(c, ['THE COAL', 'QUESTION,', '2026'], { x: 104, y: 370, size: 200, width: 75, gold: ['2026'], maxWidth: 820 });
      wordmark(c, 112, 1000, 50);
    } else {
      headline(c, ['CHEAPER', 'MEANS', 'MORE.'], { x: 104, y: 330, size: 230, width: 75, gold: ['more.'], maxWidth: 780 });
      kicker(c, 'JEVONS PARADOX · A SONG FOR BUILDERS', 110, 1000, { size: 30 });
    }
  }
}
