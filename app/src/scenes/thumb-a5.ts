// Thumbnail candidates by A5 (docs/THUMBNAILS.md): staged hero shots re-using the internals and machine plates
// (subclassed read-only: a frozen plate time and a staged camera), with a headline on top.
//   k=1 the ladder of abstraction, ENGLISH on top            — WE STOPPED / READING CODE
//   k=2 attention arcs over the token row                     — WEIGHTS & / ATTENTION
//   k=3 GPU die macro, a gold matmul wavefront                — HOW THE / MAGIC WORKS
//   k=4 next-token bars, "demand" pulling ahead               — SOFTWARE ON ___
//   k=5 the loss landscape, the gold bead rolling into it     — DOWNHILL / FROM HERE
import type * as THREE from 'three';
import { Scene, type Frame, type PostOverrides, type SceneCtx } from '../engine/scene';
import { Layer2D } from '../engine/gl';
import Internals from './internals';
import Machine from './machine';
import { orbit, type CamPose } from './internals-kit';
import { headline, kicker, wordmark } from './_thumb';
import { rgba } from '../engine/palette';

class StagedInternals extends Internals {
  pose: CamPose | null = null;
  override camera(t: number): CamPose { return this.pose ?? super.camera(t); }
}
class StagedMachine extends Machine {
  pose: CamPose | null = null;
  override camera(t: number): CamPose { return this.pose ?? super.camera(t); }
}

interface Design { plate: 'internals' | 'machine'; t: number; pose: CamPose; post?: PostOverrides }

export default class ThumbA5 extends Scene {
  text = new Layer2D();
  inner!: StagedInternals | StagedMachine;
  d!: Design;

  designs(): Design[] {
    return [
      // 1: the ladder from below-right, the compiled app on the ENGLISH roof
      { plate: 'internals', t: 89.99, pose: { pos: { x: 8.0, y: 14.0, z: 30 }, tgt: { x: -15.5, y: 18.0, z: 1 }, roll: -0.03, fov: 40 } },
      // 2: attention, low along the token row
      { plate: 'internals', t: 79.25, pose: { pos: orbit({ x: 1.2, y: 2.9, z: 0.2 }, 0.6, 0.12, 9.6), tgt: { x: 1.2, y: 2.9, z: 0.2 }, roll: -0.05, fov: 38 } },
      // 3: the die, macro 3/4, a kick's wavefront crossing it
      { plate: 'machine', t: 113.62, pose: { pos: orbit({ x: 7.5, y: 0, z: 0.0 }, -1.05, 0.48, 14.5), tgt: { x: 7.5, y: 0, z: 0.0 }, roll: 0.08, fov: 40 } },
      // 4: the next-token bars, low and close
      { plate: 'machine', t: 127.75, pose: { pos: orbit({ x: 1.2, y: 2.0, z: 0.8 }, -0.28, 0.3, 11.5), tgt: { x: 1.2, y: 2.0, z: 0.8 }, roll: 0.03, fov: 40 } },
      // 5: behind the bead on the slope, the basin below
      { plate: 'machine', t: 121.05, pose: { pos: { x: 0, y: 0, z: 0 }, tgt: { x: 0, y: 0, z: 0 }, roll: 0.05, fov: 44 } },
    ];
  }

  override async init() {
    const k = (this.ctx.params.k as number) ?? 1;
    this.d = this.designs()[k - 1]!;
    const sec = (n: string) => this.ctx.audio.sections.find((s) => s.name === n)!;
    const win = this.d.plate === 'internals' ? sec('verse2') : sec('inst2');
    const ctx: SceneCtx = { ...this.ctx, id: this.d.plate, params: {}, start: win.start, end: win.end };
    this.inner = this.d.plate === 'internals' ? new StagedInternals(ctx) : new StagedMachine(ctx);
    await this.inner.init();
    // the plates' deadpan figure footnotes stay in the film: a thumbnail has no room for them
    const ic = this.inner.text.ctx, fill = ic.fillText.bind(ic);
    ic.fillText = (s: string, x: number, y: number, mw?: number) => { if (!s.startsWith('FIG.')) fill(s, x, y, mw); };
    if (k === 5) {
      // stage the camera behind the bead, looking downhill toward the basin
      const m = this.inner as StagedMachine;
      const bp = m.beadP(this.d.t), v = m.beadVel(this.d.t);
      this.d.pose = { pos: { x: bp.x - v.x * 2.7 + 1.4, y: bp.y + 1.6, z: bp.z - v.z * 2.7 + 0.8 }, tgt: { x: bp.x + v.x * 5 - 1.2, y: bp.y - 1.6, z: bp.z + v.z * 5 }, roll: 0.06, fov: 46 };
    }
    this.inner.pose = this.d.pose;
  }

  frameAt(t: number): Frame {
    const au = this.ctx.audio, s = this.inner['ctx'].start, e = this.inner['ctx'].end;
    const beat = au.beatAt(t), bar = au.barAt(t);
    return {
      t, dt: 0, lt: t - s, p: (t - s) / (e - s), start: s, end: e, seeked: true, preroll: false,
      beat, bar, beatPhase: beat - Math.floor(beat), barPhase: bar - Math.floor(bar),
      a: { ...au.sample(t), kick: 0, snare: 0, hat: 0, vonset: 0 }, under: null, tin: 1, tout: 0,
    };
  }

  override render(_f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const k = (this.ctx.params.k as number) ?? 1;
    const po = this.inner.render(this.frameAt(this.d.t), out) ?? {};
    const T = this.text; T.clear();
    const c = T.ctx;
    // a soft ink scrim behind the type (the art stays, the headline gets a quiet ground)
    const scrim = (x: number, y: number, rx: number, ry: number, a: number) => {
      c.save(); c.translate(x, y); c.scale(rx, ry);
      const g = c.createRadialGradient(0, 0, 0, 0, 0, 1);
      g.addColorStop(0, rgba('ink', a)); g.addColorStop(0.6, rgba('ink', a * 0.7)); g.addColorStop(1, rgba('ink', 0));
      c.fillStyle = g; c.fillRect(-1, -1, 2, 2); c.restore();
    };
    const band = (y0: number, y1: number, a: number) => {
      const g = c.createLinearGradient(0, y0, 0, y1);
      g.addColorStop(0, rgba('ink', a)); g.addColorStop(1, rgba('ink', 0));
      c.fillStyle = g; c.fillRect(0, Math.min(y0, y1) - (y0 < y1 ? 200 : 0), 1920, Math.abs(y1 - y0) + 200);
    };
    if (k === 2) { band(-200, 460, 0.9); scrim(560, 190, 900, 330, 0.5); }
    if (k === 3) scrim(1500, 560, 700, 520, 0.75);
    if (k === 4) scrim(960, 200, 1100, 260, 0.85);
    if (k === 1) scrim(420, 320, 700, 420, 0.6);
    if (k === 1) {
      kicker(c, 'A SONG FOR BUILDERS', 110, 150, { size: 30 });
      headline(c, ['WE STOPPED', 'READING', 'CODE.'], { x: 104, y: 400, size: 190, gold: ['code.'], width: 75, shadow: 0.9 });
    } else if (k === 2) {
      headline(c, ['WEIGHTS &', 'ATTENTION'], { x: 104, y: 260, size: 210, gold: ['attention'], width: 75, shadow: 0.9 });
      wordmark(c, 110, 1080 - 96, 50);
    } else if (k === 3) {
      headline(c, ['HOW THE', 'MAGIC', 'WORKS'], { x: 1920 - 104, y: 330, size: 225, align: 'right', gold: ['magic'], width: 75, shadow: 0.9 });
      kicker(c, 'INSIDE THE MACHINE', 1920 - 110, 150, { size: 30, align: 'right' });
    } else if (k === 4) {
      headline(c, ['SOFTWARE ON ___'], { x: 960, y: 320, size: 215, align: 'center', gold: ['___'], width: 75, shadow: 0.9, maxWidth: 1700 });
      wordmark(c, 110, 125, 44);
    } else {
      headline(c, ['DOWNHILL', 'FROM HERE.'], { x: 104, y: 1080 - 300, size: 200, gold: ['downhill'], width: 75, shadow: 0.9 });
      kicker(c, 'TRAINED ALL NIGHT', 110, 150, { size: 30 });
    }
    this.ctx.comp.draw(this.ctx.renderer, T.upload(), out);
    return { ...po, shake: [0, 0], flash: 0, zoom: 1, ca: 1.0, grain: 0.04, ...(this.d.post ?? {}) };
  }
}
