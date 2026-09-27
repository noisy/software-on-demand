// Thumbnails by A6 (docs/THUMBNAILS.md). Each is a staged still built from A6's own plates, rendered
// through a private instance of the plate at a chosen song time with a re-staged camera, then a headline.
//  k=1  the lit long tail to the horizon — "THE LONG TAIL IS OPEN"
//  k=2  the cobalt title block — "DRAWN BY: EVERYONE"
//  k=3  the callback tunnel, the globe flying past — "THE ONE-PERSON STUDIO"
//  k=4  the block-built SOFTWARE ON DEMAND. (the headline is the object)
//  k=5  macro: the unit block on the drawing, the cursor welding its corner — "EVERYONE’S A BUILDER"
import type * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { Layer2D, W, H } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { headline, kicker } from './_thumb';
import { cursorTip, cursorCaret, weldSparks } from './_motifs';
import { project, type V3 } from './longtail-kit';
import Longtail from './longtail';
import Outro from './outro';

type AnyScene = Scene & Record<string, any>;

// ---- longtail geometry (mirrors the plate's road, read-only) ----
const RA = 60, RL = 300;
const road = (s: number): V3 => [s, 0, RA * Math.sin(s / RL)];
const side = (s: number): V3 => { const dz = (RA / RL) * Math.cos(s / RL); const l = Math.hypot(1, dz); return [-dz / l, 0, 1 / l]; };
const at = (s: number, lat: number, y: number): V3 => { const r = road(s), n = side(s); return [r[0] + n[0] * lat, y, r[2] + n[2] * lat]; };

export default class ThumbA6 extends Scene {
  private plate!: AnyScene;
  private songT = 0;
  private ui = new Layer2D();
  private fx = new LineBatch(4000);

  override async init() {
    const k = (this.ctx.params.k as number) ?? 1;
    const au = this.ctx.audio;
    const sec = (n: string) => au.sections.find((s) => s.name === n)!.start;
    if (k === 1) {
      this.plate = new Longtail({ ...this.ctx, id: 'longtail@thumb', params: {}, start: sec('inst1'), end: sec('verse2') }) as unknown as AnyScene;
    } else {
      this.plate = new Outro({ ...this.ctx, id: 'outro@thumb', params: {}, start: sec('outro'), end: au.duration }) as unknown as AnyScene;
    }
    await this.plate.init();
    const P = this.plate;
    const noop = () => {};
    if (k === 1) {
      this.songT = 74.3;
      P.drawCounter = noop; P.drawCallouts = noop;
      P.camera = () => ({ pos: at(500, 1.2, 7.5), tgt: at(760, -2, 5.2), roll: 0.035, fov: 44 });
    } else if (k === 2) {
      this.songT = 182.3;
      P.sheetCam = () => ({ pos: [1200, -1130, 520] as V3, tgt: [1450, -690, 0] as V3, roll: -0.02, fov: 40 });
    } else if (k === 3) {
      this.songT = 165.36;
      P.drawTunnelNotes = noop; P.drawFig = noop;
    } else if (k === 4) {
      this.songT = 171.3;
      P.drawHookNotes = noop;
      P.hookCam = () => ({ pos: [-52, -30, 196] as V3, tgt: [6, 1, 0] as V3, roll: 0.06, fov: 46 });
    } else {
      this.songT = 182.3;
      P.sheetCam = () => ({ pos: [80, -1300, 250] as V3, tgt: [660, -600, 100] as V3, roll: -0.03, fov: 40 });
    }
  }

  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const { renderer, comp, audio } = this.ctx;
    const k = (this.ctx.params.k as number) ?? 1;
    const T = this.songT;
    const P = this.plate;
    const bp = audio.beatAt(T), br = audio.barAt(T);
    const fr: Frame = {
      ...f, t: T, dt: 0, lt: T - (P as any).ctx.start, p: 0.5, start: (P as any).ctx.start, end: (P as any).ctx.end, seeked: true, preroll: false,
      beat: bp, bar: br, beatPhase: 0.2, barPhase: br - Math.floor(br), a: audio.sample(T), under: null, tin: 1, tout: 0,
    };
    const post = (P.render(fr, out) ?? {}) as Record<string, unknown>;
    const L = this.ui; L.clear();
    const c = L.ctx;
    const fx = this.fx; fx.clear();
    if (k === 1) {
      headline(c, ['THE LONG TAIL', 'IS OPEN'], { x: 110, y: 250, size: 212, width: 75, gold: ['open'], shadow: 0.8 });
      kicker(c, 'A SONG FOR BUILDERS', 116, 520, { size: 34 });
    } else if (k === 2) {
      headline(c, ['DRAWN BY:', 'EVERYONE'], { x: 110, y: 260, size: 220, width: 75, gold: ['everyone'], shadow: 0.9 });
      // the cursor, still blinking after EVERYONE in the title block
      const cam = P.cam as THREE.PerspectiveCamera;
      const top = project(cam, [1532, -852, 0.5]), bot = project(cam, [1532, -879, 0.5]);
      cursorCaret(fx, top.x, top.y, Math.max(8, bot.y - top.y), 1, 1.3);
    } else if (k === 3) {
      headline(c, ['THE ONE-', 'PERSON', 'STUDIO'], { x: 104, y: 290, size: 205, width: 75, gold: ['studio'], shadow: 0.9 });
    } else if (k === 4) {
      kicker(c, 'A SONG ABOUT SOFTWARE ON DEMAND', 110, 1000, { size: 34 });
    } else {
      // the cursor welding the block's top corner
      const cam = P.cam as THREE.PerspectiveCamera;
      const p = project(cam, [295, -765, 250]);
      const tt = 3.37;
      weldSparks(fx, tt, (tb) => (tb > 2.8 ? { x: p.x, y: p.y } : null), { rate: 260, speed: 420, life: 0.55, gravity: 700, seed: 21, intensity: 1.3, width: 2.4 });
      cursorTip(fx, p.x, p.y, tt, 2.6, 1.2);
      headline(c, ['EVERYONE’S', 'A BUILDER'], { x: W - 100, y: 250, size: 205, width: 75, align: 'right', gold: ['builder'], shadow: 0.9 });
    }
    fx.render(renderer, out);
    comp.draw(renderer, L.upload(), out);
    void H;
    return { ...post, fade: 0, flash: 0, shake: [0, 0] as [number, number], zoom: 1, hud: 0 };
  }
}
