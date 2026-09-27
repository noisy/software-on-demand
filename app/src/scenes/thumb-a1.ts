// A1 thumbnails (docs/THUMBNAILS.md): five staged stills built from the open/boot plates. The plates are used
// read-only: an instance of the plate scene is created with its own timeline window, then its camera and
// annotation layer are replaced on that instance only (the plate modules themselves are untouched).
//   k=1  voxel BUILDERS at the slam, heat wave + dust (the title is the headline), low hero 3/4
//   k=2  macro on the prompt `> build me the future`, the B's blocks arcing out of it — "JUST TYPE IT."
//   k=3  Clarke's corridor: the gold 3D "magic." completes the headline — "INDISTINGUISHABLE FROM"
//   k=4  the grey city of the old world, one gold tower being welded up — "EVERYONE CAN BUILD NOW"
//   k=5  the cursor's sweep: half grey city, half cobalt blueprint — "EVERYONE’S A BUILDER"
import * as THREE from 'three';
import { Scene, type Frame, type PostOverrides, type SceneCtx } from '../engine/scene';
import { Layer2D, W, H } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { rgba } from '../engine/palette';
import { F, font } from '../engine/type';
import { hash, TAU } from '../engine/util';
import { cursorTip, weldSparks } from './_motifs';
import { headline, kicker, wordmark } from './_thumb';
import { applyRig, toScreen, type Rig } from './boot-kit';
import { BlockSet, blockMaterial, quatAxis } from './boot-blocks';
import Boot from './boot';
import Open from './open';

const ZT = -24; // boot's title front face

export default class ThumbA1 extends Scene {
  private k = 1;
  private sub!: Scene;
  private subCtx!: SceneCtx;
  private layer = new Layer2D();
  private extra = new THREE.Scene();
  private tower?: BlockSet;
  private fx = new LineBatch(6000, { blend: 'add' });

  override async init() {
    this.k = Number(this.ctx.params.k ?? 1);
    const au = this.ctx.audio;
    const sec = (n: string) => au.sections.find((s) => s.name === n)!;
    const useOpen = this.k === 3;
    this.subCtx = useOpen
      ? { ...this.ctx, id: 'open', params: {}, start: 0, end: sec('build').start }
      : { ...this.ctx, id: 'boot', params: {}, start: sec('build').start, end: sec('verse1').start };
    this.sub = useOpen ? new Open(this.subCtx) : new Boot(this.subCtx);
    await this.sub.init();
    const s = this.sub as any;
    // the plate's own annotations are replaced by the thumbnail's type
    s.drawHud = function () { this.hud.clear(); };
    if (!useOpen) {
      const rig = this.rig();
      s.camAt = () => rig;
    }
    if (this.k === 1) s.drawFx = function () { this.fx.clear(); };
    if (this.k === 2) {
      // the prompt line of the printout, retyped for the poster
      s.promptState = () => ({ row: 668, n: '> build me the future' });
      // no plinth, and every block launches from the cursor at the end of the line
      s.plinth = [];
      const caretX = s.q.x0 + 21 * 16.8 + 5;
      for (let i = 0; i < s.N; i++) { s.sx[i] = caretX * 0.1 - 96 + (s.sx[i] - Math.round(s.sx[i])) * 0.6; }
      const orig = s.drawTerminal.bind(s);
      let done = false;
      s.drawTerminal = (t: number) => {
        if (done) return;
        done = true;
        orig(t);
        const L = s.term as Layer2D, c = L.ctx;
        c.clearRect(0, 0, W, H);
        c.font = font(F.mono(400), 28);
        c.textBaseline = 'alphabetic';
        c.fillStyle = rgba('graphite', 0.9);
        c.fillText('# one afternoon, one person', 380, 624);
        c.fillStyle = rgba('signal');
        c.fillText('>', 380, 668);
        c.fillStyle = rgba('bone');
        c.fillText(' build me the future', 380 + c.measureText('>').width, 668);
        L.upload();
      };
    }
    if (useOpen) {
      // shift the corridor's framing down-right so the headline owns the top-left
      (s.cam as THREE.PerspectiveCamera).setViewOffset(W, H, -300, -170, W, H);
    }
    if (this.k === 4) {
      this.tower = new BlockSet(4000, blockMaterial());
      this.extra.add(this.tower.mesh);
    }
  }

  /** Staged camera for the boot-based designs. */
  private rig(): Rig {
    switch (this.k) {
      case 1: return { tx: 17, ty: 12, tz: ZT - 1.5, yaw: 0.4, pitch: -0.01, dist: 168, fov: 38, roll: -0.04 };
      case 2: return { tx: -34, ty: 7, tz: 5, yaw: -0.14, pitch: 0.64, dist: 48, fov: 42, roll: 0.0 };
      case 4: return { tx: -6, ty: 28, tz: -40, yaw: -0.42, pitch: 0.1, dist: 150, fov: 34, roll: 0.0 };
      default: return { tx: 0, ty: 22, tz: -90, yaw: 0.22, pitch: 0.075, dist: 185, fov: 36, roll: 0 };
    }
  }

  /** The song time each design freezes its plate at. */
  private tPlate(): number {
    switch (this.k) {
      case 1: return 18.02; // the slam: heat wave, ring, dust
      case 2: return 14.34; // the B's blocks in flight out of the prompt
      case 3: return 11.45; // "magic." gold, the tip flaring
      case 4: return 26.6; // the whole grey city standing
      default: return 27.54; // the sweep past the middle of the frame
    }
  }

  private frameAt(t: number): Frame {
    const au = this.ctx.audio, c = this.subCtx;
    const beat = au.beatAt(t), bar = au.barAt(t);
    return {
      t, dt: 0, lt: t - c.start, p: (t - c.start) / (c.end - c.start), start: c.start, end: c.end, seeked: false, preroll: false,
      beat, bar, beatPhase: beat - Math.floor(beat), barPhase: bar - Math.floor(bar), a: au.sample(t), under: null, tin: 1, tout: 0,
    };
  }

  override render(_f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer, comp } = this.ctx;
    const tp = this.tPlate();
    this.sub.render(this.frameAt(tp), out);
    const s = this.sub as any;
    if (this.k === 4) this.renderTower(out, s.cam as THREE.PerspectiveCamera, tp);
    const L = this.layer, c = L.ctx;
    L.clear();
    this.drawType(c);
    comp.draw(renderer, L.upload(), out);
    return { bloom: this.k === 1 ? 0.75 : 0.62, vignette: 0.5, grain: 0.05, ca: 1.0, hud: 0, flash: 0, shake: [0, 0], zoom: 1, exposure: 1 };
  }

  // ------------------------------------------------------------------ k=4: the gold tower
  private renderTower(out: THREE.WebGLRenderTarget, cam: THREE.PerspectiveCamera, t: number) {
    const B = this.tower!, q = [0, 0, 0, 1];
    const X = 0, Z = -16, FW = 6, FL = 60, top = 52; // footprint, full height, floors already built
    B.begin();
    for (let f = 0; f < top; f++) for (let a = 0; a < FW; a++) for (let b = 0; b < FW; b++) {
      if (a > 0 && a < FW - 1 && b > 0 && b < FW - 1 && f < top - 1) continue; // hollow core (never seen)
      const hot = 0.3 + 0.65 * Math.pow(f / top, 5);
      B.push(X - FW / 2 + a + 0.5, f + 0.5, Z - FW / 2 + b + 0.5, 0.96, 0.96, 0.96, 0, 0, 0, 1, hot, 0, 1);
    }
    // the floors still arriving: blocks arcing in from the weld point, snapping into the top
    const src = new THREE.Vector3(X + 16, top + 16, Z + 10);
    for (let i = 0; i < 70; i++) {
      const f = top + Math.floor(hash(i, 1) * (FL - top) * hash(i, 5));
      const a = Math.floor(hash(i, 2) * FW), b = Math.floor(hash(i, 3) * FW);
      const sx = X - FW / 2 + a + 0.5, sy = f + 0.5, sz = Z - FW / 2 + b + 0.5;
      const u = Math.pow(hash(i, 4), 0.7), e = 1 - (1 - u) * (1 - u);
      const mx = (src.x + sx) / 2, my = Math.max(src.y, sy) + 6, mz = (src.z + sz) / 2;
      const A = (1 - e) * (1 - e), Bq = 2 * (1 - e) * e, C = e * e;
      const x = A * src.x + Bq * mx + C * sx, y = A * src.y + Bq * my + C * sy, z = A * src.z + Bq * mz + C * sz;
      const ax = hash(i, 6) - 0.5, ay = hash(i, 7) - 0.5, az = hash(i, 8) - 0.5, n = Math.hypot(ax, ay, az) || 1;
      quatAxis(ax / n, ay / n, az / n, (1 - e) * 5, q);
      const sc = 0.7 + 0.26 * e;
      B.push(x, y, z, sc, sc, sc, q[0]!, q[1]!, q[2]!, q[3]!, 0.95, 0, 1);
    }
    B.commit();
    const m = B.mesh.material as THREE.RawShaderMaterial;
    (m.uniforms.camPos!.value as THREE.Vector3).copy(cam.position);
    m.uniforms.fogNear!.value = 110; m.uniforms.fogFar!.value = 280;
    const r = this.ctx.renderer;
    r.setRenderTarget(out);
    r.render(this.extra, cam);
    // the weld point at the source, throwing sparks
    const fx = this.fx;
    fx.clear();
    const p = toScreen(cam, src.x, src.y, src.z);
    if (p.ok) {
      weldSparks(fx, 10, () => ({ x: p.x, y: p.y }), { rate: 320, life: 0.55, speed: 420, gravity: 700, seed: 21, intensity: 1.1 });
      cursorTip(fx, p.x, p.y, t, 2.2, 1.3);
    }
    fx.render(r, out);
  }

  // ------------------------------------------------------------------ type
  private drawType(c: CanvasRenderingContext2D) {
    switch (this.k) {
      case 1:
        kicker(c, 'A SONG FOR BUILDERS', 96, 150, { size: 40 });
        c.save();
        c.font = font(F.mono(500), 40); c.letterSpacing = '4px'; c.fillStyle = rgba('ash', 0.95);
        c.fillText('5,400 BLOCKS · COMPILE 0.18 S', 96, 1080 - 110);
        c.restore();
        break;
      case 2:
        headline(c, ['JUST', 'TYPE IT.'], { x: 1848, y: 290, size: 250, align: 'right', gold: ['type'], width: 75 });
        break;
      case 3:
        headline(c, ['INDISTINGUISHABLE', 'FROM'], { x: 96, y: 250, size: 200, maxWidth: 1720, width: 75 });
        kicker(c, '— ARTHUR C. CLARKE, 1973', 104, 1080 - 104, { size: 34, color: 'ash' });
        break;
      case 4:
        headline(c, ['EVERYONE', 'CAN BUILD', 'NOW.'], { x: 96, y: 300, size: 205, gold: ['build'], width: 75 });
        wordmark(c, 100, 1080 - 96, 60);
        break;
      default:
        headline(c, ['EVERYONE’S', 'A BUILDER'], { x: 96, y: 290, size: 225, gold: ['builder'], width: 75 });
        kicker(c, 'THE OLD WORLD, REDRAWN', 104, 1080 - 110, { size: 34, color: 'bone' });
        break;
    }
    void TAU;
  }
}
