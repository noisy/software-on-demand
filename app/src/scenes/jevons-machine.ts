// The jevons plate's hardware, as engraved three.js meshes: a mill steam engine (flywheel, crank, connecting
// rod, crosshead, cylinder), a Watt centrifugal governor, and a swinging bell on its headstock with a wheel.
// Every part uses the engraving material from jevons-kit; poses are set per frame from pure functions of t.
import * as THREE from 'three';
import { LIN } from '../engine/palette';
import { clamp, TAU } from '../engine/util';
import { engraveMat, latheGeo, mulRGB, v3, type P3 } from './jevons-kit';

const BONE = mulRGB(LIN.bone, 0.8);
const DIM = mulRGB(LIN.bone, 0.55);
const GOLD = mulRGB(LIN.signal, 0.9);

/** World layout (the chart plane is z = 0, x 0..16, y 0..9). */
export const MACH = {
  fly: v3(8.6, 2.2, -7.6), // flywheel centre (axis along z)
  flyR: 3.05,
  crankZ: -5.75,
  crankR: 0.9,
  rodL: 2.7,
  cylX0: 1.6, cylX1: 4.0,
  gov: v3(12.4, -0.5, -6.0), // governor column foot
  govPivotY: 6.35,
  govArm: 1.25,
  floorY: -0.5,
  bell: v3(13.2, 16.2, -2.4), // bell axle (swing axis along x)
};

function box(w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}
function cylY(r0: number, r1: number, h: number, mat: THREE.Material, seg = 24) {
  return new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, h, seg, 1), mat);
}

export class Machine {
  root = new THREE.Group();
  mats: THREE.RawShaderMaterial[] = [];
  flywheel = new THREE.Group();
  crank = new THREE.Group();
  rod!: THREE.Mesh;
  crosshead!: THREE.Mesh;
  pistonRod!: THREE.Mesh;
  gov = new THREE.Group();
  govArms: THREE.Group[] = [];
  govLinks: THREE.Mesh[] = [];
  govCollar!: THREE.Mesh;
  /** materials by role, so the scene can dim / brighten them */
  mIron: THREE.RawShaderMaterial;
  mSteel: THREE.RawShaderMaterial;
  mBrass: THREE.RawShaderMaterial;
  mBox: THREE.RawShaderMaterial;

  constructor() {
    this.mIron = engraveMat({ freq: [120, 60], cross: 0.5, sil: 0.9 });
    this.mSteel = engraveMat({ freq: [60, 18], cross: 0.3, sil: 0.9, line: BONE });
    this.mBrass = engraveMat({ freq: [70, 26], cross: 0.8, sil: 1, line: GOLD, glint: 1.2 });
    this.mBox = engraveMat({ world: 16, cross: 0.4, border: 1, sil: 0, line: DIM, hair: 0.06 });
    this.mats.push(this.mIron, this.mSteel, this.mBrass, this.mBox);
    this.buildFlywheel();
    this.buildEngine();
    this.buildGovernor();
  }

  private buildFlywheel() {
    const M = MACH;
    const rim = latheGeo([[2.62, -0.26], [2.72, -0.33], [2.95, -0.33], [3.04, -0.2], [3.07, 0], [3.04, 0.2], [2.95, 0.33], [2.72, 0.33], [2.62, 0.26], [2.62, -0.26]], 160);
    const mRim = engraveMat({ freq: [260, rim.len / 0.035], cross: 0.55, sil: 0.9 });
    this.mats.push(mRim);
    const rimM = new THREE.Mesh(rim.geo, mRim);
    rimM.rotation.x = Math.PI / 2;
    this.flywheel.add(rimM);
    const hub = latheGeo([[0.16, -0.62], [0.52, -0.62], [0.6, -0.45], [0.6, 0.45], [0.52, 0.62], [0.16, 0.62]], 48);
    const mHub = engraveMat({ freq: [80, hub.len / 0.03], cross: 0.6, sil: 0.9 });
    this.mats.push(mHub);
    const hubM = new THREE.Mesh(hub.geo, mHub);
    hubM.rotation.x = Math.PI / 2;
    this.flywheel.add(hubM);
    // six tapered, elliptical spokes
    const spokeLen = 2.1;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      const s = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.17, spokeLen, 14, 1), this.mIron);
      s.scale.set(1, 1, 0.55);
      const piv = new THREE.Group();
      s.position.y = 0.55 + spokeLen / 2;
      piv.add(s);
      piv.rotation.z = a;
      this.flywheel.add(piv);
    }
    this.flywheel.position.set(M.fly.x, M.fly.y, M.fly.z);
    this.root.add(this.flywheel);
    // shaft, bearings and pedestals
    const shaft = cylY(0.17, 0.17, 4.0, this.mSteel, 20);
    shaft.rotation.x = Math.PI / 2;
    shaft.position.set(M.fly.x, M.fly.y, M.fly.z + 0.6);
    this.root.add(shaft);
    for (const z of [M.fly.z - 1.15, M.fly.z + 1.35]) {
      this.root.add(box(0.9, M.fly.y - M.floorY - 0.2, 0.7, this.mBox, M.fly.x, (M.fly.y + M.floorY) / 2 - 0.1, z));
      const brg = cylY(0.34, 0.34, 0.6, this.mIron, 24);
      brg.rotation.x = Math.PI / 2;
      brg.position.set(M.fly.x, M.fly.y, z);
      this.root.add(brg);
    }
    // crank: arm + pin (rotates with the flywheel)
    const arm = box(M.crankR + 0.5, 0.42, 0.22, this.mBox, M.crankR / 2, 0, 0);
    this.crank.add(arm);
    const pin = cylY(0.13, 0.13, 0.55, this.mBrass, 16);
    pin.rotation.x = Math.PI / 2;
    pin.position.set(M.crankR, 0, 0.2);
    this.crank.add(pin);
    this.crank.position.set(M.fly.x, M.fly.y, M.crankZ);
    this.root.add(this.crank);
  }

  private buildEngine() {
    const M = MACH, y = M.fly.y, z = M.crankZ + 0.3;
    // bed plate
    this.root.add(box(M.fly.x - M.cylX0 + 0.8, 0.35, 1.5, this.mBox, (M.cylX0 + M.fly.x) / 2 - 0.2, M.floorY + 0.17, z));
    // cylinder (axis along x) with flanges, on a pedestal
    const cyl = latheGeo([[0.0, -1.3], [0.78, -1.3], [0.78, -1.12], [0.64, -1.12], [0.64, 1.12], [0.78, 1.12], [0.78, 1.3], [0.2, 1.3], [0.2, 1.45], [0.0, 1.45]], 48);
    const mCyl = engraveMat({ freq: [90, cyl.len / 0.03], cross: 0.55, sil: 0.9 });
    this.mats.push(mCyl);
    const c = new THREE.Mesh(cyl.geo, mCyl);
    c.rotation.z = -Math.PI / 2;
    c.position.set((M.cylX0 + M.cylX1) / 2 - 0.1, y, z);
    this.root.add(c);
    this.root.add(box(2.2, y - M.floorY - 0.7, 1.1, this.mBox, (M.cylX0 + M.cylX1) / 2 - 0.1, (y + M.floorY) / 2 - 0.3, z));
    // steam chest on top
    this.root.add(box(1.5, 0.5, 0.8, this.mBox, (M.cylX0 + M.cylX1) / 2 - 0.1, y + 0.9, z));
    // crosshead guides
    const gx0 = 4.6, gx1 = 7.2;
    for (const dy of [0.32, -0.32]) this.root.add(box(gx1 - gx0, 0.08, 0.5, this.mSteel, (gx0 + gx1) / 2, y + dy, z));
    this.root.add(box(0.2, 0.9, 0.7, this.mBox, gx0, y, z));
    this.root.add(box(0.2, 0.9, 0.7, this.mBox, gx1, y, z));
    this.crosshead = box(0.5, 0.52, 0.42, this.mBox, 6, y, z);
    this.root.add(this.crosshead);
    this.pistonRod = cylY(0.07, 0.07, 1, this.mSteel, 12);
    this.pistonRod.rotation.z = Math.PI / 2;
    this.root.add(this.pistonRod);
    // connecting rod (a tapered steel bar, oriented per frame)
    this.rod = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.15, 1, 16, 1), this.mSteel);
    this.root.add(this.rod);
  }

  private buildGovernor() {
    const M = MACH, g = M.gov;
    // column (lathe) up to the spindle
    const col = latheGeo([[0.0, 0.0], [0.55, 0.0], [0.55, 0.2], [0.36, 0.35], [0.26, 0.6], [0.22, 3.2], [0.32, 3.4], [0.32, 3.6], [0.0, 3.6]], 40);
    const mCol = engraveMat({ freq: [60, col.len / 0.03], cross: 0.5, sil: 0.9 });
    this.mats.push(mCol);
    const cm = new THREE.Mesh(col.geo, mCol);
    cm.position.set(g.x, g.y, g.z);
    this.root.add(cm);
    // rotating head
    const sy0 = g.y + 3.6, sy1 = M.govPivotY + 0.1;
    const spindle = cylY(0.05, 0.05, sy1 - sy0, this.mSteel, 12);
    spindle.position.y = (sy0 + sy1) / 2;
    this.gov.add(spindle);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 10), this.mBrass);
    cap.position.y = M.govPivotY + 0.12 - 0;
    this.gov.add(cap);
    for (let s = 0; s < 2; s++) {
      const arm = new THREE.Group();
      const bar = cylY(0.035, 0.035, M.govArm, this.mSteel, 10);
      bar.position.y = -M.govArm / 2;
      arm.add(bar);
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.3, 28, 18), this.mBrass);
      ball.position.y = -M.govArm;
      arm.add(ball);
      arm.position.y = M.govPivotY;
      const side = new THREE.Group();
      side.rotation.y = s * Math.PI;
      side.add(arm);
      this.gov.add(side);
      this.govArms.push(arm);
      const link = cylY(0.025, 0.025, 1, this.mSteel, 8);
      side.add(link);
      this.govLinks.push(link);
    }
    const collar = latheGeo([[0.05, -0.12], [0.16, -0.12], [0.2, 0], [0.16, 0.12], [0.05, 0.12]], 24);
    this.govCollar = new THREE.Mesh(collar.geo, this.mBrass);
    this.gov.add(this.govCollar);
    this.gov.position.set(g.x, 0, g.z);
    this.root.add(this.gov);
  }

  /** Pose everything: flywheel angle phi (rad), governor spin psi and arm angle theta (from vertical). */
  pose(phi: number, psi: number, theta: number) {
    const M = MACH;
    this.flywheel.rotation.z = phi;
    this.crank.rotation.z = phi;
    const pin = { x: M.fly.x + Math.cos(phi) * M.crankR, y: M.fly.y + Math.sin(phi) * M.crankR };
    const xc = pin.x - Math.sqrt(M.rodL * M.rodL - (pin.y - M.fly.y) ** 2);
    const z = M.crankZ + 0.3;
    this.crosshead.position.set(xc, M.fly.y, z);
    // piston rod from the cylinder cover to the crosshead
    const x0 = M.cylX1 + 0.35;
    this.pistonRod.scale.set(1, Math.max(0.01, xc - x0), 1);
    this.pistonRod.position.set((xc + x0) / 2, M.fly.y, z);
    // connecting rod from crosshead to crank pin
    const dx = pin.x - xc, dy = pin.y - M.fly.y;
    const L = Math.hypot(dx, dy);
    this.rod.scale.set(1, L, 1);
    this.rod.position.set((pin.x + xc) / 2, (pin.y + M.fly.y) / 2, z + 0.02);
    this.rod.rotation.set(0, 0, Math.atan2(dy, dx) - Math.PI / 2);
    // governor
    this.gov.rotation.y = psi;
    const th = clamp(theta, 0.15, 1.35);
    for (const a of this.govArms) a.rotation.z = th;
    // collar rides the spindle: linked to the arms' mid-points
    const midR = Math.sin(th) * M.govArm * 0.55, midY = M.govPivotY - Math.cos(th) * M.govArm * 0.55;
    const linkL = 0.95;
    const cy = midY - Math.sqrt(Math.max(0.01, linkL * linkL - midR * midR));
    this.govCollar.position.y = cy;
    for (const l of this.govLinks) {
      // arm rotates +th about z (toward +x): mid point at (midR, midY)
      const ax = midR, ay = midY;
      l.scale.set(1, linkL, 1);
      l.position.set(ax / 2, (ay + cy) / 2, 0);
      l.rotation.set(0, 0, Math.atan2(ay - cy, ax) - Math.PI / 2);
    }
  }

  /** World position of a governor ball (for sparks/annotations). */
  ballPos(psi: number, theta: number, side: number): P3 {
    const M = MACH;
    const r = Math.sin(theta) * M.govArm, y = M.govPivotY - Math.cos(theta) * M.govArm;
    const a = psi + side * Math.PI;
    return v3(M.gov.x + Math.cos(a) * r, y, M.gov.z - Math.sin(a) * r);
  }

  setBright(k: number) { for (const m of this.mats) m.uniforms.uBright!.value = k; }
}

// ------------------------------------------------------------------ the bell

/** Outer profile of the bell (r, y), crown at the top; the waist band carries the inscription. */
export const BELL_OUT: [number, number][] = [[0.02, 2.02], [0.5, 2.02], [0.68, 1.92], [0.78, 1.72], [0.81, 1.45], [0.84, 1.15], [0.9, 0.86], [1.02, 0.56], [1.17, 0.3], [1.28, 0.11], [1.32, 0.0]];
const BELL_IN: [number, number][] = [[1.19, 0.03], [1.08, 0.22], [0.94, 0.47], [0.8, 0.82], [0.72, 1.14], [0.68, 1.46], [0.62, 1.74], [0.45, 1.86], [0.02, 1.86]];
/** Bell radius at height y on the outer profile. */
export function bellR(y: number) {
  for (let i = 1; i < BELL_OUT.length; i++) {
    const a = BELL_OUT[i - 1]!, b = BELL_OUT[i]!;
    if (y <= a[1] && y >= b[1]) return a[0] + ((b[0] - a[0]) * (a[1] - y)) / Math.max(1e-6, a[1] - b[1]);
  }
  return BELL_OUT[BELL_OUT.length - 1]![0];
}
/** Bell local origin: the lip centre is at y = 0; hung so the axle is at BELL_AX above the lip. */
export const BELL_AX = 2.35;

export class Bell {
  root = new THREE.Group(); // at the axle; rotation.x = swing
  body = new THREE.Group(); // bell + headstock + wheel (swings)
  clapper = new THREE.Group();
  frame = new THREE.Group();
  mats: THREE.RawShaderMaterial[] = [];
  mBell: THREE.RawShaderMaterial;

  constructor() {
    const prof = [...BELL_OUT, ...BELL_IN];
    const lg = latheGeo(prof, 96, 0.015);
    this.mBell = engraveMat({ freq: [180, lg.len / 0.036], cross: 0.65, sil: 1, glint: 1.4, fog: 0.02, fogStart: 16 });
    const mIron = engraveMat({ freq: [60, 20], cross: 0.4, sil: 0.9, fog: 0.02, fogStart: 16 });
    const mWood = engraveMat({ world: 18, cross: 0.3, border: 1, sil: 0.5, line: DIM, hair: 0.05, fog: 0.02, fogStart: 16 });
    const mSpoke = engraveMat({ freq: [8, 0], cross: 0, sil: 0.8, line: DIM, fog: 0.02, fogStart: 16 });
    this.mats.push(mSpoke);
    const mGold = engraveMat({ freq: [40, 20], cross: 0.8, sil: 1, line: GOLD, glint: 1.2, fog: 0.02, fogStart: 16 });
    this.mats.push(this.mBell, mIron, mWood, mGold);
    const bell = new THREE.Mesh(lg.geo, this.mBell);
    bell.position.y = -BELL_AX;
    this.body.add(bell);
    // headstock (timber) + crown staples
    this.body.add(box(3.0, 0.42, 0.62, mWood, 0, -BELL_AX + 2.25, 0));
    // gudgeons
    for (const s of [-1, 1]) {
      const g = cylY(0.09, 0.09, 0.5, mIron, 12);
      g.rotation.z = Math.PI / 2;
      g.position.set(s * 1.7, 0, 0);
      this.body.add(g);
    }
    // the bell wheel (YZ plane) on the +x side
    const wheel = new THREE.Group();
    const wr = 1.35;
    const tor = new THREE.Mesh(new THREE.TorusGeometry(wr, 0.05, 8, 120), mIron);
    tor.rotation.y = Math.PI / 2;
    wheel.add(tor);
    for (let i = 0; i < 8; i++) {
      const sp = cylY(0.03, 0.03, wr * 2, mSpoke, 8);
      sp.rotation.x = (i / 8) * Math.PI;
      wheel.add(sp);
    }
    wheel.position.set(1.62, 0, 0);
    this.body.add(wheel);
    // clapper: a rod and a ball hanging inside, pivoting under the crown
    const rod = cylY(0.045, 0.06, 1.35, mIron, 10);
    rod.position.y = -0.7;
    this.clapper.add(rod);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.16, 18, 12), mGold);
    ball.position.y = -1.45;
    this.clapper.add(ball);
    this.clapper.position.y = -BELL_AX + 1.8;
    this.body.add(this.clapper);
    this.root.add(this.body);
    // frame: bearing blocks hung from iron straps up to a beam out of frame (nothing crosses the camera's orbit)
    for (const s of [-1, 1]) {
      this.frame.add(box(0.5, 0.34, 0.7, mWood, s * 1.95, -0.12, 0));
      const strap = cylY(0.05, 0.05, 6, mIron, 8);
      strap.position.set(s * 1.95, 3.0, 0);
      this.frame.add(strap);
    }
    this.frame.add(box(5.2, 0.5, 0.7, mWood, 0, 6.2, 0));
    this.root.add(this.frame);
    this.root.position.set(MACH.bell.x, MACH.bell.y, MACH.bell.z);
  }

  pose(swing: number, clapperRel: number) {
    this.body.rotation.x = swing;
    this.clapper.rotation.x = clapperRel;
    this.root.updateMatrixWorld(true);
  }

  /** Bell-local point (lip at y = 0) to world, with the current swing. */
  toWorld(p: P3, out = new THREE.Vector3()): P3 {
    out.set(p.x, p.y - BELL_AX, p.z).applyMatrix4(this.body.matrixWorld);
    return v3(out.x, out.y, out.z);
  }
  dirToWorld(d: P3): P3 {
    const v = new THREE.Vector3(d.x, d.y, d.z).transformDirection(this.body.matrixWorld);
    return v3(v.x, v.y, v.z);
  }
}
