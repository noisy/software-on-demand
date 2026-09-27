// Thumbnails by A2 (docs/THUMBNAILS.md): five staged hero shots built from the oldworld / glass plates themselves.
// Each slot instantiates its plate (read-only reuse), freezes it at a chosen song time, re-aims its camera, and lays
// a headline over it.
//   k=1 the glass shattering at the strike — "BREAK THE GLASS."
//   k=2 macro on the struck lobby signs, the cursor finishing LABEL — "NO GATEKEEPERS."
//   k=3 cobalt blueprint pyramid of 100 badges, hands up — "IT USED TO TAKE 100 PEOPLE"
//   k=4 the faceless artist walking out through the open gate into gold light — "WALK OUT. BUILD."
//   k=5 the blueprint tower mid-extrusion, crown lit — "THE TOWER IS OPTIONAL."
import * as THREE from 'three';
import { Scene, type Frame, type PostOverrides, type SceneCtx } from '../engine/scene';
import { Layer2D } from '../engine/gl';
import { rgba } from '../engine/palette';
import { headline, kicker, wordmark } from './_thumb';
import OldWorld from './oldworld';
import Glass from './glass';
import { TOWER, type V3 } from './tower-geo';

interface Pose { p: V3; g: V3; fov: number; roll: number }
const FZ = TOWER.D / 2;

interface Design {
  plate: 'glass' | 'oldworld';
  t: number; // plate time to freeze
  pose: (inst: any) => Pose;
  draw: (c: CanvasRenderingContext2D) => void;
  post?: PostOverrides;
  patch?: (inst: any) => void;
}

const DESIGNS: Record<number, Design> = {
  1: {
    plate: 'glass', t: 144.735,
    pose: (g) => { const im = g.impacts[g.impacts.length - 1]; return { p: [im.x - 1.7, im.y - 1.25, FZ + 3.3], g: [im.x + 0.75, im.y + 0.05, FZ], fov: 56, roll: -0.05 }; },
    draw: (c) => {
      shade(c, 'left');
      headline(c, ['BREAK', 'THE', 'GLASS.'], { x: 96, y: 330, size: 250, gold: ['glass.'], width: 75, lineGap: 0.86 });
      kicker(c, 'A SONG FOR BUILDERS', 100, 905);
    },
    post: { bloom: 1.1 },
    patch: (g) => {
      // a clean break: no lobby signage in the shot
      g.drawSigns = () => {};
      for (const sg of g.signs) { sg.lab.mesh.visible = false; if (sg.no) sg.no.mesh.visible = false; }
      g.gateSign.mesh.visible = false;
    },
  },
  2: {
    plate: 'glass', t: 134.12,
    pose: () => ({ p: [5.6, 2.35, FZ + 3.3], g: [2.2, 3.85, FZ], fov: 40, roll: -0.05 }),
    draw: (c) => {
      shade(c, 'bottom');
      headline(c, ['NO GATEKEEPERS.'], { x: 96, y: 960, size: 205, gold: ['gatekeepers.'], width: 75, maxWidth: 1450 });
      wordmark(c, 96, 128, 50);
    },
  },
  3: {
    plate: 'oldworld', t: 30.66,
    pose: () => ({ p: [13.5, 1.6, 17], g: [-4.6, 9.6, -4.5], fov: 46, roll: -0.03 }),
    patch: (o) => {
      // keep the hands up but leave the HANDS, stamp out of the picture
      const orig = o.drawPyramid.bind(o);
      o.drawPyramid = (...a: unknown[]) => {
        const L = o.L1;
        o.L1 = { ...L, words: L.words.map((w: any, i: number) => (i === 6 ? { ...w, start: 1e6 } : w)) };
        orig(...a);
        o.L1 = L;
      };
    },
    draw: (c) => {
      shade(c, 'left');
      headline(c, ['IT USED', 'TO TAKE', '100 PEOPLE.'], { x: 96, y: 250, size: 200, gold: ['100'], width: 75, maxWidth: 900 });
      kicker(c, 'NOW IT TAKES ONE', 96, 860);
    },
  },
  4: {
    plate: 'glass', t: 139.95,
    pose: (g) => { const z = g.figZ(139.95); return { p: [-2.7, 0.3, z + 1.1], g: [0.6, 0.72, z - 0.1], fov: 34, roll: 0.0 }; },
    patch: (g) => {
      g.drawPlanted = () => { for (const p of g.planted) p.lab.mesh.visible = false; for (const l of g.towerHeld) l.mesh.visible = false; };
      g.drawSigns = () => {};
      for (const sg of g.signs) { sg.lab.mesh.visible = false; if (sg.no) sg.no.mesh.visible = false; }
      g.gateSign.mesh.visible = false;
    },
    draw: (c) => {
      shade(c, 'right');
      headline(c, ['WALK OUT.', 'BUILD.'], { x: 1848, y: 330, size: 250, align: 'right', gold: ['build.'], width: 75 });
      wordmark(c, 96, 128, 50);
    },
  },
  5: {
    plate: 'oldworld', t: 33.2,
    pose: () => ({ p: [-17, TOWER.ROOF - 21, 14], g: [-8.0, TOWER.ROOF - 4.5, -4.5], fov: 50, roll: -0.05 }),
    patch: (o) => {
      // light the whole crown sign, no callout
      const set = o.crown.set.bind(o.crown);
      o.crown.set = (x: any) => set({ ...x, wipe: 1.01 });
      const real = o.nameLab.mesh as THREE.Mesh;
      real.visible = false;
      o.nameLab.mesh = new THREE.Object3D();
      // no sign bands on the façade: just the slab and its crown
      o.towerH = () => TOWER.TOP + TOWER.MAST + 0.1;
      for (const sg of o.signs) { sg.lab.mesh.visible = false; sg.panel.visible = false; }
      o.signs = o.signs.map((sg: any) => ({ ...sg, y0: 1e9, y1: 1e9 }));
    },
    draw: (c) => {
      shade(c, 'left');
      headline(c, ['THE TOWER', 'IS OPTIONAL.'], { x: 96, y: 790, size: 190, gold: ['optional.'], width: 75, maxWidth: 900 });
      kicker(c, 'EVERYONE’S A BUILDER', 100, 190);
    },
  },
};

/** Soft ink gradient behind the type side, for legibility at 320×180. */
function shade(c: CanvasRenderingContext2D, side: 'left' | 'right' | 'bottom') {
  const g = side === 'bottom' ? c.createLinearGradient(0, 1080, 0, 560) : side === 'left' ? c.createLinearGradient(0, 0, 1100, 0) : c.createLinearGradient(1920, 0, 820, 0);
  g.addColorStop(0, rgba('ink', 0.72));
  g.addColorStop(0.55, rgba('ink', 0.35));
  g.addColorStop(1, rgba('ink', 0));
  c.fillStyle = g;
  c.fillRect(0, 0, 1920, 1080);
}

export default class ThumbA2 extends Scene {
  layer = new Layer2D();
  plate!: Scene;
  d!: Design;

  override async init() {
    const k = Number(this.ctx.params.k ?? 1);
    this.d = DESIGNS[k] ?? DESIGNS[1]!;
    const sec = this.ctx.audio.sections.find((s) => s.name === (this.d.plate === 'glass' ? 'bridge' : 'verse1'))!;
    const ctx: SceneCtx = { ...this.ctx, id: this.d.plate, params: {}, start: sec.start, end: sec.end };
    this.plate = this.d.plate === 'glass' ? new Glass(ctx) : new OldWorld(ctx);
    await this.plate.init();
    const inst = this.plate as any;
    this.d.patch?.(inst);
    const pose = this.d.pose(inst);
    inst.camAt = () => ({ p: [...pose.p] as V3, g: [...pose.g] as V3, fov: pose.fov, roll: pose.roll });
  }

  override render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const au = this.ctx.audio, t = this.d.t;
    const beat = au.beatAt(t), bar = au.barAt(t);
    const pf: Frame = {
      ...f, t, dt: 0, lt: t - (this.plate as any).ctx.start, p: 0, start: (this.plate as any).ctx.start, end: (this.plate as any).ctx.end,
      seeked: false, preroll: false, beat, bar, beatPhase: beat - Math.floor(beat), barPhase: bar - Math.floor(bar),
      a: au.sample(t), under: null, tin: 1, tout: 0,
    };
    const post = this.plate.render(pf, out) ?? {};
    const c = this.layer.ctx;
    this.layer.clear();
    this.d.draw(c);
    this.ctx.comp.draw(this.ctx.renderer, this.layer.upload(), out);
    return { ...post, shake: [0, 0], flash: 0, grain: 0.035, vignette: 0.42, ca: 0.6, ...this.d.post };
  }
}
