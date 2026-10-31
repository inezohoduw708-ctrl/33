import * as THREE from 'three';
import { clamp, damp, lerp, angleLerp } from '../core/utils';
import { stdMat, radialTexture } from '../core/assets';
import type { TurtleDef } from '../types';

/* ------------------------------------------------------------------ */
/* Geometry helpers (cached so 40 enemies don't build 40 shedloads)    */
/* ------------------------------------------------------------------ */
const geoCache = new Map<string, THREE.BufferGeometry>();

function capsule(r: number, len: number, cap = 4, rad = 8): THREE.BufferGeometry {
  const key = `cap-${r}-${len}-${cap}-${rad}`;
  if (!geoCache.has(key)) geoCache.set(key, new THREE.CapsuleGeometry(r, len, cap, rad));
  return geoCache.get(key)!;
}
function sphere(r: number, w = 14, h = 10): THREE.BufferGeometry {
  const key = `sph-${r}-${w}-${h}`;
  if (!geoCache.has(key)) geoCache.set(key, new THREE.SphereGeometry(r, w, h));
  return geoCache.get(key)!;
}
function box(w: number, h: number, d: number): THREE.BufferGeometry {
  const key = `box-${w}-${h}-${d}`;
  if (!geoCache.has(key)) geoCache.set(key, new THREE.BoxGeometry(w, h, d));
  return geoCache.get(key)!;
}
function cyl(rt: number, rb: number, h: number, seg = 10): THREE.BufferGeometry {
  const key = `cyl-${rt}-${rb}-${h}-${seg}`;
  if (!geoCache.has(key)) geoCache.set(key, new THREE.CylinderGeometry(rt, rb, h, seg));
  return geoCache.get(key)!;
}
function torus(r: number, tube: number, arc = Math.PI * 2, seg = 6, rad = 16): THREE.BufferGeometry {
  const key = `tor-${r}-${tube}-${arc}-${seg}-${rad}`;
  if (!geoCache.has(key)) geoCache.set(key, new THREE.TorusGeometry(r, tube, seg, rad, arc));
  return geoCache.get(key)!;
}
function cone(r: number, h: number, seg = 8): THREE.BufferGeometry {
  const key = `cone-${r}-${h}-${seg}`;
  if (!geoCache.has(key)) geoCache.set(key, new THREE.ConeGeometry(r, h, seg));
  return geoCache.get(key)!;
}

function mesh(g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const o = new THREE.Mesh(g, m);
  o.position.set(x, y, z);
  o.castShadow = true;
  o.receiveShadow = false;
  return o;
}

const SKIN = 0x7cb845;
const SKIN_DARK = 0x57882c;
const PLASTRON = 0xd8c48a;
const SHELL = 0x6b4a26;
const SHELL_DARK = 0x40290f;

/**
 * Each character gets its own material instances so hit flashes / fades never
 * bleed across the dozens of other characters on screen.
 */
function ownMaterials(root: THREE.Object3D): THREE.MeshStandardMaterial[] {
  const map = new Map<THREE.Material, THREE.Material>();
  const out: THREE.MeshStandardMaterial[] = [];
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mat = mesh.material as THREE.Material | THREE.Material[];
    const cloneOne = (m: THREE.Material) => {
      let c = map.get(m);
      if (!c) {
        c = m.clone();
        map.set(m, c);
        if ((c as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
          (c as any).userData = {
            emissive: (c as THREE.MeshStandardMaterial).emissive.getHex(),
            intensity: (c as THREE.MeshStandardMaterial).emissiveIntensity,
          };
          out.push(c as THREE.MeshStandardMaterial);
        }
      }
      return c;
    };
    if (Array.isArray(mat)) mesh.material = mat.map(cloneOne);
    else if (mat) mesh.material = cloneOne(mat);
  });
  return out;
}

export function contactShadow(scale = 1, opacity = 0.34): THREE.Mesh {
  const g = new THREE.PlaneGeometry(1, 1);
  const m = new THREE.MeshBasicMaterial({
    map: radialTexture('rgba(0,0,0,0.95)', 'rgba(0,0,0,0)'),
    transparent: true,
    opacity,
    depthWrite: false,
    color: 0x000000,
  });
  const s = new THREE.Mesh(g, m);
  s.rotation.x = -Math.PI / 2;
  s.position.y = 0.02;
  s.scale.setScalar(scale);
  s.renderOrder = 2;
  return s;
}

/* ------------------------------------------------------------------ */
/* Weapons                                                             */
/* ------------------------------------------------------------------ */
function buildWeapon(kind: TurtleDef['weapon']): { obj: THREE.Group; tip: THREE.Object3D } {
  const g = new THREE.Group();
  const steel = stdMat(0xd8e4ee, { rough: 0.22, metal: 0.95 });
  const dark = stdMat(0x1c1c22, { rough: 0.5, metal: 0.6 });
  const wood = stdMat(0x6b3f1d, { rough: 0.75 });
  const tip = new THREE.Object3D();
  g.add(tip);

  if (kind === 'katana') {
    const blade = mesh(box(0.055, 1.05, 0.012), steel, 0, 0.62, 0);
    blade.rotation.x = 0;
    const edge = mesh(box(0.02, 1.05, 0.02), stdMat(0xf4fbff, { emissive: 0x88ccff, emissiveIntensity: 0.25, rough: 0.1, metal: 1 }), 0, 0.62, 0.002);
    const guard = mesh(cyl(0.075, 0.075, 0.02, 12), dark, 0, 0.1, 0);
    const grip = mesh(cyl(0.028, 0.032, 0.24, 8), stdMat(0x1d2a44, { rough: 0.9 }), 0, -0.03, 0);
    g.add(blade, edge, guard, grip);
    tip.position.set(0, 1.12, 0);
  } else if (kind === 'sai') {
    const main = mesh(cyl(0.014, 0.032, 0.52, 8), steel, 0, 0.34, 0);
    const prongL = mesh(box(0.02, 0.3, 0.02), steel, -0.07, 0.3, 0);
    prongL.rotation.z = 0.28;
    const prongR = prongL.clone();
    prongR.position.x = 0.07;
    prongR.rotation.z = -0.28;
    const grip = mesh(cyl(0.035, 0.035, 0.2, 8), dark, 0, 0.04, 0);
    g.add(main, prongL, prongR, grip);
    tip.position.set(0, 0.62, 0);
  } else if (kind === 'bo') {
    const staff = mesh(cyl(0.032, 0.032, 2.15, 10), wood, 0, 0.55, 0);
    const capA = mesh(cyl(0.041, 0.041, 0.08, 10), stdMat(0x2a2a30, { metal: 0.7, rough: 0.4 }), 0, 1.6, 0);
    const capB = mesh(cyl(0.041, 0.041, 0.08, 10), stdMat(0x2a2a30, { metal: 0.7, rough: 0.4 }), 0, -0.5, 0);
    g.add(staff, capA, capB);
    tip.position.set(0, 1.68, 0);
  } else {
    const stickA = mesh(cyl(0.03, 0.032, 0.5, 8), wood, 0, 0.26, 0);
    const chainStart = mesh(sphere(0.045, 8, 6), dark, 0, -0.02, 0);
    const chainEnd = mesh(sphere(0.045, 8, 6), dark, 0, -0.42, 0);
    const stickB = mesh(cyl(0.03, 0.032, 0.5, 8), wood, 0, -0.68, 0);
    const link = mesh(cyl(0.009, 0.009, 0.38, 5), steel, 0, -0.22, 0);
    g.add(stickA, chainStart, chainEnd, stickB, link);
    tip.position.set(0, 0.54, 0);
  }
  return { obj: g, tip };
}

/* ------------------------------------------------------------------ */
/* Turtle rig                                                          */
/* ------------------------------------------------------------------ */
export type PoseMode = 'idle' | 'run' | 'air' | 'attack' | 'hurt' | 'ko' | 'victory';

/** Common surface shared by enemy + boss rigs so entities can hold either. */
export interface CharacterRig {
  root: THREE.Group;
  update(dt: number, opts: any): void;
  flash?(color?: number): void;
}

export interface PoseParams {
  mode: PoseMode;
  speed: number; // 0..1 run blend
  runPhase: number;
  time: number;
  attackPhase: number; // 0..1
  attackKind: 'light1' | 'light2' | 'light3' | 'heavy' | 'special';
  hurt: number; // 0..1
  ko: number; // 0..1
  blocking: boolean;
  specialSpin: number; // 0..1
}

const ZERO: PoseParams = {
  mode: 'idle',
  speed: 0,
  runPhase: 0,
  time: 0,
  attackPhase: 0,
  attackKind: 'light1',
  hurt: 0,
  ko: 0,
  blocking: false,
  specialSpin: 0,
};

export class TurtleRig {
  root = new THREE.Group();
  body = new THREE.Group();
  hips = new THREE.Group();
  torso = new THREE.Group();
  head = new THREE.Group();
  armL = new THREE.Group();
  elbowL = new THREE.Group();
  armR = new THREE.Group();
  elbowR = new THREE.Group();
  legL = new THREE.Group();
  kneeL = new THREE.Group();
  legR = new THREE.Group();
  kneeR = new THREE.Group();
  weaponGroup = new THREE.Group();
  weaponTip = new THREE.Object3D();
  shadow: THREE.Mesh;
  shadowAnchor: THREE.Group;
  eyeGlow: THREE.PointLight;
  ownMats: THREE.MeshStandardMaterial[] = [];

  private maskMat: THREE.MeshStandardMaterial;
  private kneeAngleL = 0;
  private kneeAngleR = 0;
  private tmpQ = new THREE.Quaternion();
  private euler = new THREE.Euler();
  private cur: PoseParams = { ...ZERO };
  private bannerTails: THREE.Object3D[] = [];
  private offHand: THREE.Object3D | null = null;
  bladeTrail: THREE.Mesh;
  private specialRing: THREE.Mesh;

  constructor(public def: TurtleDef) {
    const accent = stdMat(def.color, { rough: 0.55, metal: 0.15 });
    this.maskMat = accent;
    const skin = stdMat(SKIN, { rough: 0.72, metal: 0.02 });
    const skinDark = stdMat(SKIN_DARK, { rough: 0.8 });
    const plastron = stdMat(PLASTRON, { rough: 0.75 });
    const shellMat = stdMat(SHELL, { rough: 0.9 });
    const shellDark = stdMat(SHELL_DARK, { rough: 0.95 });
    const wrap = stdMat(0x3b2a1c, { rough: 1 });
    const pads = stdMat(0x2a2f38, { rough: 0.85 });

    this.root.add(this.body);
    this.body.add(this.hips);
    this.hips.position.y = 0.95;

    /* ---- torso ---- */
    this.hips.add(this.torso);
    const belly = mesh(sphere(0.34, 16, 12), skin, 0, 0.3, 0);
    belly.scale.set(1.0, 1.12, 0.78);
    this.torso.add(belly);

    // plastron (belly plates)
    const plate = mesh(sphere(0.3, 14, 10), plastron, 0, 0.28, 0.15);
    plate.scale.set(0.82, 1.0, 0.55);
    this.torso.add(plate);
    for (let i = 0; i < 3; i++) {
      const seg = mesh(box(0.36 - i * 0.026, 0.095, 0.035), plastron, 0, 0.15 + i * 0.155, 0.315 - i * 0.014);
      seg.rotation.x = -0.12;
      this.torso.add(seg);
    }

    // shell
    const shell = mesh(sphere(0.38, 16, 12), shellMat, 0, 0.32, -0.16);
    shell.scale.set(1.02, 1.18, 0.72);
    this.torso.add(shell);
    const shellRim = mesh(torus(0.4, 0.06, Math.PI * 2, 6, 18), shellDark, 0, 0.3, -0.1);
    shellRim.rotation.x = Math.PI / 2;
    shellRim.scale.set(1.0, 1.12, 1);
    this.torso.add(shellRim);
    // shell pattern
    for (let i = 0; i < 5; i++) {
      const hex = mesh(cyl(0.1, 0.1, 0.05, 6), shellDark, 0, 0.02 + i * 0.13, -0.36);
      hex.rotation.x = Math.PI / 2 - 0.15;
      this.torso.add(hex);
    }

    // belt
    const belt = mesh(cyl(0.33, 0.34, 0.11, 14), stdMat(0x1c1a18, { rough: 0.9 }), 0, -0.02, 0);
    belt.scale.z = 0.78;
    this.torso.add(belt);
    const buckle = mesh(box(0.14, 0.12, 0.05), accent, 0, -0.02, 0.27);
    this.torso.add(buckle);

    /* ---- head ---- */
    this.head.position.set(0, 0.78, 0.01);
    this.torso.add(this.head);
    const skull = mesh(sphere(0.245, 18, 14), skin, 0, 0.08, 0);
    skull.scale.set(1.0, 0.98, 1.02);
    this.head.add(skull);
    const jaw = mesh(sphere(0.17, 14, 10), skin, 0, -0.06, 0.1);
    jaw.scale.set(1, 0.7, 0.9);
    this.head.add(jaw);
    // mask band
    const band = mesh(cyl(0.252, 0.252, 0.15, 18), this.maskMat, 0, 0.12, 0);
    band.scale.z = 1.02;
    this.head.add(band);
    const maskFront = mesh(box(0.5, 0.145, 0.055), this.maskMat, 0, 0.12, 0.195);
    this.head.add(maskFront);
    // eyes — big cartoon whites with glowing rim so they read in the dark
    const eyeMat = stdMat(0xf7fff4, { rough: 0.18, emissive: 0xdfe8ff, emissiveIntensity: 0.32 });
    const eyeGeo = sphere(0.072, 14, 10);
    for (const s of [-1, 1]) {
      const socket = mesh(sphere(0.082, 12, 8), stdMat(0x191309, { rough: 0.9 }), s * 0.105, 0.115, 0.185);
      socket.scale.set(1, 1.1, 0.5);
      this.head.add(socket);
      const eye = mesh(eyeGeo, eyeMat, s * 0.105, 0.118, 0.215);
      eye.scale.set(1, 1.1, 0.62);
      this.head.add(eye);
      const pupil = mesh(sphere(0.03, 10, 8), stdMat(0x0d0a08, { rough: 0.25 }), s * 0.107, 0.114, 0.252);
      pupil.scale.set(1, 1.2, 0.5);
      this.head.add(pupil);
    }
    // ninja scowl brow over the mask
    for (const s of [-1, 1]) {
      const scowl = mesh(box(0.15, 0.028, 0.05), this.maskMat, s * 0.12, 0.19, 0.235);
      scowl.rotation.z = s * -0.22;
      this.head.add(scowl);
    }
    // brow ridge
    const brow = mesh(box(0.34, 0.05, 0.08), stdMat(SKIN_DARK, { rough: 0.8 }), 0, 0.19, 0.19);
    brow.rotation.z = 0;
    this.head.add(brow);
    // mouth
    const mouth = mesh(box(0.13, 0.022, 0.03), stdMat(0x2c1d16, { rough: 0.6 }), 0, -0.055, 0.22);
    this.head.add(mouth);
    // bandana tails
    for (let i = 0; i < 2; i++) {
      const tail = new THREE.Group();
      tail.position.set(0.06 - i * 0.12, 0.12, -0.15);
      const strip = mesh(box(0.075, 0.42, 0.02), this.maskMat, 0, -0.2, 0);
      const strip2 = mesh(box(0.06, 0.22, 0.02), this.maskMat, 0, -0.44, -0.02);
      tail.add(strip, strip2);
      tail.rotation.x = 0.5;
      this.head.add(tail);
      this.bannerTails.push(tail);
    }
    this.eyeGlow = new THREE.PointLight(def.color, 0.4, 3.2, 2);
    this.eyeGlow.position.set(0, 0.11, 0.3);
    this.head.add(this.eyeGlow);

    /* ---- arms ---- */
    const arm = (side: number) => {
      const shoulder = new THREE.Group();
      shoulder.position.set(side * 0.35, 0.62, 0.02);
      shoulder.rotation.z = side * 0.14;
      this.torso.add(shoulder);
      shoulder.add(mesh(sphere(0.115, 12, 10), skin));
      const upper = mesh(capsule(0.088, 0.3), skin, 0, -0.21, 0);
      shoulder.add(upper);
      // arm wrap
      const rag = mesh(cyl(0.098, 0.098, 0.1, 10), wrap, 0, -0.3, 0);
      shoulder.add(rag);
      const elbow = new THREE.Group();
      elbow.position.set(0, -0.42, 0);
      shoulder.add(elbow);
      elbow.add(mesh(sphere(0.085, 10, 8), skin));
      const fore = mesh(capsule(0.078, 0.26), skin, 0, -0.19, 0);
      elbow.add(fore);
      const wrist = mesh(cyl(0.088, 0.088, 0.11, 10), wrap, 0, -0.34, 0);
      elbow.add(wrist);
      const hand = mesh(sphere(0.098, 12, 10), skin, 0, -0.43, 0.01);
      hand.scale.set(1, 0.9, 1.1);
      elbow.add(hand);
      const knuckles = mesh(box(0.16, 0.07, 0.1), pads, 0, -0.44, 0.06);
      elbow.add(knuckles);
      return { shoulder, elbow };
    };
    const L = arm(1);
    const R = arm(-1);
    this.armL = L.shoulder;
    this.elbowL = L.elbow;
    this.armR = R.shoulder;
    this.elbowR = R.elbow;

    /* ---- legs ---- */
    const leg = (side: number) => {
      const hip = new THREE.Group();
      hip.position.set(side * 0.17, -0.05, 0);
      this.hips.add(hip);
      hip.add(mesh(capsule(0.115, 0.28), skin, 0, -0.2, 0));
      const knee = new THREE.Group();
      knee.position.set(0, -0.42, 0);
      hip.add(knee);
      knee.add(mesh(sphere(0.095, 10, 8), skin));
      knee.add(mesh(capsule(0.088, 0.26), skin, 0, -0.18, 0));
      const shinWrap = mesh(cyl(0.105, 0.105, 0.13, 10), wrap, 0, -0.3, 0);
      knee.add(shinWrap);
      const foot = mesh(box(0.19, 0.11, 0.33), skinDark, 0, -0.4, 0.07);
      knee.add(foot);
      const toes = mesh(box(0.185, 0.06, 0.1), stdMat(0xe8e0cf, { rough: 0.7 }), 0, -0.42, 0.21);
      knee.add(toes);
      const pad = mesh(sphere(0.11, 10, 8), pads, 0, -0.32, 0.06);
      pad.scale.set(1, 0.7, 1.1);
      knee.add(pad);
      return { hip, knee };
    };
    const legL = leg(1);
    const legR = leg(-1);
    this.legL = legL.hip;
    this.kneeL = legL.knee;
    this.legR = legR.hip;
    this.kneeR = legR.knee;

    /* ---- weapon ---- */
    const w = buildWeapon(def.weapon);
    this.weaponGroup = w.obj;
    this.weaponTip = w.tip;
    // attach to right hand by default
    this.weaponGroup.position.set(0, -0.44, 0.04);
    this.weaponGroup.rotation.set(-2.55, 0, 0.08);
    this.elbowR.add(this.weaponGroup);

    // signature dual-wield per turtle
    if (def.weapon === 'katana' || def.weapon === 'sai') {
      const w2 = buildWeapon(def.weapon);
      w2.obj.position.set(0, -0.44, 0.04);
      w2.obj.rotation.set(-2.55, 0, -0.08);
      this.elbowL.add(w2.obj);
      this.offHand = w2.obj;
    } else if (def.weapon === 'nunchaku') {
      // a second pair on the left hand for the show-off
      const w2 = buildWeapon('nunchaku');
      w2.obj.position.set(0, -0.44, 0.04);
      w2.obj.rotation.set(-2.55, 0, -0.08);
      this.elbowL.add(w2.obj);
      this.offHand = w2.obj;
    }

    /* ---- shadow + special ring ---- */
    this.shadow = contactShadow(1.75, 0.34);
    // shadow lives in a non-rotating group so it stays axis-aligned on the ground
    this.shadowAnchor = new THREE.Group();
    this.shadowAnchor.add(this.shadow);
    this.root.add(this.shadowAnchor);

    const ringGeo = new THREE.RingGeometry(0.6, 2.4, 40);
    // additive blade trail that only shows during strikes
    this.bladeTrail = new THREE.Mesh(
      new THREE.PlaneGeometry(1.55, 0.55),
      new THREE.MeshBasicMaterial({
        color: def.color,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        map: radialTexture('rgba(255,255,255,0.85)', 'rgba(255,255,255,0)'),
      }),
    );
    this.bladeTrail.position.set(0, -0.5, 0.55);
    this.bladeTrail.visible = false;
    this.elbowR.add(this.bladeTrail);

    this.specialRing = new THREE.Mesh(
      ringGeo,
      new THREE.MeshBasicMaterial({
        color: def.color,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.specialRing.rotation.x = -Math.PI / 2;
    this.specialRing.position.y = 0.06;
    this.specialRing.visible = false;
    this.root.add(this.specialRing);

    this.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true;
        o.receiveShadow = false;
        o.frustumCulled = true;
      }
    });
    this.ownMats = ownMaterials(this.root);
    // mask material must stay the per-instance clone so tint changes are local
    this.maskMat = this.findMaskMat();
  }

  private findMaskMat(): THREE.MeshStandardMaterial {
    for (const m of this.ownMats) {
      if (m.color.getHex() === this.def.color) return m;
    }
    return this.ownMats[0];
  }

  setMaskColor(color: number) {
    this.maskMat.color.setHex(color);
  }

  /** Emissive pulse on the player's own materials (cloned at build time). */
  flashBody(color: number) {
    for (const m of this.ownMats) {
      m.emissive.setHex(color);
      m.emissiveIntensity = 1.1;
    }
  }

  clearFlash() {
    for (const m of this.ownMats) {
      const base = (m as any).userData as { emissive: number; intensity: number } | undefined;
      m.emissive.setHex(base?.emissive ?? 0x000000);
      m.emissiveIntensity = base?.intensity ?? 0;
    }
  }

  private applyEuler(target: THREE.Object3D, x: number, y: number, z: number, dt: number, lambda = 16) {
    this.euler.set(x, y, z);
    this.tmpQ.setFromEuler(this.euler);
    target.quaternion.slerp(this.tmpQ, 1 - Math.exp(-lambda * dt));
  }

  update(dt: number, p: PoseParams) {
    const c = this.cur;
    const k = (a: number, b: number) => damp(a, b, 15, dt);
    c.speed = k(c.speed, p.speed);
    c.runPhase = p.runPhase;
    c.attackPhase = p.attackPhase;
    c.attackKind = p.attackKind;
    c.mode = p.mode;
    c.hurt = k(c.hurt, p.hurt);
    c.ko = k(c.ko, p.ko);
    c.blocking = p.blocking;
    c.specialSpin = p.specialSpin;
    c.time = p.time;

    const t = p.time;
    const run = c.speed;
    const phase = c.runPhase;
    const breathe = Math.sin(t * 2.1) * 0.02;
    const atk = c.mode === 'attack' ? c.attackPhase : 0;
    const kind = c.attackKind;

    let bodyY = 0;
    let bodyRotX = 0;
    let bodyRotZ = 0;
    let bodyRotY = 0;
    let torsoX = 0;
    let torsoY = 0;
    let headX = 0;
    let headY = 0;

    // arms (ordered [right, left])
    let armR = { x: 0.1, y: 0, z: 0.12 };
    let armL = { x: 0.1, y: 0, z: -0.12 };
    let elbowR = -0.35;
    let elbowL = -0.35;
    let legLx = 0;
    let legRx = 0;
    let kneeLx = 0;
    let kneeRx = 0;

    if (c.mode === 'run') {
      const s = Math.sin(phase);
      const s2 = Math.sin(phase + Math.PI);
      legLx = s * 0.95 * run;
      legRx = s2 * 0.95 * run;
      kneeLx = Math.max(0, -Math.cos(phase)) * 1.15 * run + 0.05;
      kneeRx = Math.max(0, Math.cos(phase)) * 1.15 * run + 0.05;
      armR.x = -s * 0.85 * run + 0.15;
      armL.x = -s2 * 0.85 * run + 0.15;
      armR.z = 0.2;
      armL.z = -0.2;
      elbowR = -0.7 - Math.abs(s) * 0.4;
      elbowL = -0.7 - Math.abs(s2) * 0.4;
      bodyY = Math.abs(Math.sin(phase)) * 0.075 * run;
      bodyRotX = 0.16 * run;
      torsoY = Math.sin(phase) * 0.14 * run;
      headY = -Math.sin(phase) * 0.08 * run;
      bodyRotZ = Math.sin(phase) * 0.05 * run;
    } else if (c.mode === 'air') {
      legLx = -0.55;
      legRx = 0.35;
      kneeLx = 0.9;
      kneeRx = 0.3;
      armR.x = -1.5;
      armL.x = -1.7;
      armR.z = 0.55;
      armL.z = -0.55;
      elbowR = -0.5;
      elbowL = -0.5;
      bodyRotX = -0.06;
    } else if (c.mode === 'idle') {
      const sway = Math.sin(t * 1.4) * 0.035;
      bodyY = breathe * 0.5;
      armR.x = 0.12 + sway;
      armL.x = 0.12 - sway;
      armR.z = 0.18 + Math.sin(t * 1.7) * 0.02;
      armL.z = -0.18 - Math.sin(t * 1.7) * 0.02;
      elbowR = -0.45;
      elbowL = -0.45;
      bodyRotZ = Math.sin(t * 1.1) * 0.012;
      headY = Math.sin(t * 0.8) * 0.1;
      torsoX = Math.sin(t * 1.05) * 0.02;
      legLx = 0.02;
      legRx = -0.02;
      kneeLx = 0.06;
      kneeRx = 0.06;
    }

    if (c.mode === 'victory') {
      // arms up, chest out, small winning bounce
      const bounce = Math.abs(Math.sin(t * 3.4));
      armR.x = -2.5 + Math.sin(t * 3.4) * 0.18;
      armL.x = -2.5 - Math.sin(t * 3.4) * 0.18;
      armR.z = 0.5;
      armL.z = -0.5;
      elbowR = -0.35;
      elbowL = -0.35;
      bodyY = bounce * 0.07;
      bodyRotX = -0.06;
      headX = -0.12;
      legLx = 0.05;
      legRx = -0.05;
    }

    if (c.mode === 'attack') {
      const p1 = Math.sin(Math.min(1, atk) * Math.PI);
      if (kind === 'light1') {
        armR.x = lerp(0.2, -2.5, Math.sin(atk * Math.PI));
        armR.z = lerp(0.3, 0.85, p1);
        armR.y = lerp(0.4, -0.7, p1);
        elbowR = lerp(-0.4, -0.15, p1);
        armL.x = -0.6 * p1;
        armL.z = -0.35;
        elbowL = -0.8;
        torsoY = lerp(0.15, -0.7, p1);
        bodyRotY = lerp(0.1, -0.28, p1);
        headY = lerp(-0.1, 0.5, p1);
        legLx = 0.25 * p1;
        legRx = -0.2 * p1;
      } else if (kind === 'light2') {
        armL.x = lerp(0.2, -2.5, Math.sin(atk * Math.PI));
        armL.z = lerp(-0.3, -0.9, p1);
        armL.y = lerp(-0.4, 0.7, p1);
        elbowL = lerp(-0.4, -0.15, p1);
        armR.x = -0.5 * p1;
        armR.z = 0.4;
        elbowR = -0.9;
        torsoY = lerp(-0.15, 0.7, p1);
        bodyRotY = lerp(-0.1, 0.3, p1);
        headY = lerp(0.1, -0.5, p1);
      } else if (kind === 'light3') {
        // spinning kick / slash
        bodyRotY = atk * Math.PI * 2;
        armR.x = -1.5;
        armR.z = 1.2;
        armL.x = -1.2;
        armL.z = -1.2;
        elbowR = -0.2;
        legLx = -0.9 * p1;
        kneeLx = 1.1 * p1;
        legRx = 0.4 * p1;
        bodyY = 0.12 * p1;
      } else if (kind === 'heavy') {
        armR.x = lerp(-2.6, 0.9, Math.min(1, atk * 1.25));
        armR.z = 0.25;
        elbowR = lerp(-0.6, 0.05, Math.min(1, atk * 1.2));
        armL.x = lerp(-2.2, 0.7, Math.min(1, atk * 1.25));
        elbowL = -0.5;
        torsoX = lerp(-0.35, 0.4, Math.min(1, atk * 1.2));
        bodyY = -0.12 * Math.max(0, atk - 0.45);
        legLx = 0.3;
        legRx = -0.25;
        kneeLx = 0.4;
        kneeRx = 0.4;
        headX = 0.2;
      } else if (kind === 'special') {
        const spin = p1;
        bodyRotY = atk * Math.PI * 4;
        armR.x = -1.55;
        armR.z = 1.35;
        armL.x = -1.55;
        armL.z = -1.35;
        elbowR = -0.05;
        elbowL = -0.05;
        bodyY = 0.18 * Math.sin(atk * Math.PI);
        legLx = -0.3;
        legRx = 0.3;
        bodyRotX = 0.1;
        void spin;
      }
    }

    if (c.hurt > 0.02) {
      const h = c.hurt;
      bodyRotX -= 0.45 * h;
      headX -= 0.35 * h;
      armR.x += 0.8 * h;
      armL.x += 0.7 * h;
      bodyRotZ += 0.12 * h;
      bodyY -= 0.1 * h;
    }

    if (c.blocking) {
      armR.x = lerp(armR.x, -1.35, 0.55);
      armR.z = lerp(armR.z, 0.75, 0.55);
      armL.x = lerp(armL.x, -1.35, 0.55);
      armL.z = lerp(armL.z, -0.75, 0.55);
      elbowR = lerp(elbowR, -1.5, 0.5);
      elbowL = lerp(elbowL, -1.5, 0.5);
    }

    // blend knees toward computed angles with a bit of lag
    this.kneeAngleL = damp(this.kneeAngleL, kneeLx, 18, dt);
    this.kneeAngleR = damp(this.kneeAngleR, kneeRx, 18, dt);

    // KO: full body ragdoll fall — folded into the targets so later damps don't fight it
    if (c.ko > 0.01) {
      const ko = c.ko;
      bodyRotX = lerp(bodyRotX, -Math.PI * 0.46, ko);
      bodyRotZ = lerp(bodyRotZ, 0.18, ko);
      bodyY = lerp(bodyY, 0.1, ko);
      armR.x = lerp(armR.x, -0.4, ko);
      armL.x = lerp(armL.x, -0.3, ko);
      armR.z = lerp(armR.z, 0.6, ko);
      armL.z = lerp(armL.z, -0.6, ko);
      this.body.position.y = damp(this.body.position.y, 0.45 * ko, 9, dt);
    } else {
      this.body.position.y = damp(this.body.position.y, 0, 12, dt);
    }

    this.hips.position.y = damp(this.hips.position.y, 0.95 + bodyY, 20, dt);
    this.body.rotation.y = angleLerp(this.body.rotation.y, 0, 1 - Math.exp(-18 * dt));
    this.body.rotation.z = damp(this.body.rotation.z, bodyRotZ, 14, dt);
    this.body.rotation.x = damp(this.body.rotation.x, bodyRotX, 14, dt);

    // torso gets the yaw/twist (attack spin lives on the torso so feet stay planted-ish)
    this.applyEuler(this.torso, torsoX, torsoY + bodyRotY, 0, dt, 20);
    this.applyEuler(this.head, headX, headY, 0, dt + 0.02, 16);

    this.applyEuler(this.armR, armR.x, armR.y, armR.z, dt, 26);
    this.applyEuler(this.armL, armL.x, armL.y, armL.z, dt, 26);
    this.applyEuler(this.elbowR, elbowR, 0, 0, dt, 22);
    this.applyEuler(this.elbowL, elbowL, 0, 0, dt, 22);

    this.applyEuler(this.legL, legLx, 0, 0, dt, 22);
    this.applyEuler(this.legR, legRx, 0, 0, dt, 22);
    this.applyEuler(this.kneeL, this.kneeAngleL, 0, 0, dt, 22);
    this.applyEuler(this.kneeR, this.kneeAngleR, 0, 0, dt, 22);

    // bandana tails flutter
    for (let i = 0; i < this.bannerTails.length; i++) {
      const tail = this.bannerTails[i];
      const flutter = Math.sin(t * 7 + i * 1.7) * 0.12 + run * 0.3 + c.hurt * 0.3;
      tail.rotation.x = damp(tail.rotation.x, 0.5 + flutter, 8, dt);
      tail.rotation.z = damp(tail.rotation.z, Math.sin(t * 5 + i) * 0.14, 8, dt);
    }

    // blade trail lights up through the active part of a strike
    const striking = c.mode === 'attack' && kind !== 'special' && atk > 0.05 && atk < 0.92;
    const spinAttack = c.mode === 'attack' && kind === 'light3' && atk > 0.02;
    if (this.bladeTrail) {
      const m = this.bladeTrail.material as THREE.MeshBasicMaterial;
      if (striking || spinAttack) {
        this.bladeTrail.visible = true;
        m.opacity = Math.min(0.85, (1 - Math.abs(atk - 0.45) * 1.5) * 1.1);
        this.bladeTrail.scale.set(1 + atk * 0.35, 1 + atk * 0.2, 1);
        this.bladeTrail.rotation.z = -0.5 + atk * 1.1;
      } else {
        m.opacity = Math.max(0, m.opacity - dt * 6);
        if (m.opacity <= 0.01) this.bladeTrail.visible = false;
      }
    }

    // weapon spin during specials (both hands)
    this.weaponGroup.rotation.z = damp(this.weaponGroup.rotation.z, kind === 'special' ? 0.9 : 0.1, 8, dt);
    if (this.offHand) {
      this.offHand.rotation.z = damp(this.offHand.rotation.z, kind === 'special' ? -0.9 : -0.1, 8, dt);
    }

    // shadow follows ground contact
    const air = c.mode === 'air' ? 1 : 0;
    this.shadow.visible = c.ko < 0.6;
    this.shadow.scale.setScalar(1.9 * (1 - air * 0.25));

    // special ring
    if (c.specialSpin > 0.01) {
      this.specialRing.visible = true;
      const mat = this.specialRing.material as THREE.MeshBasicMaterial;
      mat.opacity = c.specialSpin * 0.7;
      this.specialRing.scale.setScalar(1 + (1 - c.specialSpin) * 1.6);
    } else {
      this.specialRing.visible = false;
    }

    // eye glow tracks energy
    this.eyeGlow.intensity = 0.3 + (c.mode === 'attack' ? 0.9 : 0) + c.specialSpin * 1.5;
  }
}

/* ------------------------------------------------------------------ */
/* Foot Clan enemy rigs                                                */
/* ------------------------------------------------------------------ */
export interface EnemyLook {
  skin: number;
  cloth: number;
  accent: number;
  scale: number;
  heavy?: boolean;
  gun?: boolean;
}

export class EnemyRig {
  root = new THREE.Group();
  body = new THREE.Group();
  hips = new THREE.Group();
  torso = new THREE.Group();
  head = new THREE.Group();
  armL = new THREE.Group();
  elbowL = new THREE.Group();
  armR = new THREE.Group();
  elbowR = new THREE.Group();
  legL = new THREE.Group();
  kneeL = new THREE.Group();
  legR = new THREE.Group();
  kneeR = new THREE.Group();
  shadow: THREE.Mesh;
  shadowAnchor: THREE.Group;
  weapon: THREE.Group;
  ownMats: THREE.MeshStandardMaterial[] = [];
  private curSpeed = 0;
  private curKo = 0;
  private curHurt = 0;
  private curAtk = 0;
  private kneeAngL = 0;
  private kneeAngR = 0;
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();

  constructor(public look: EnemyLook) {
    const cloth = stdMat(look.cloth, { rough: 0.9 });
    const skin = stdMat(look.skin, { rough: 0.65 });
    const accent = stdMat(look.accent, { rough: 0.5, emissive: look.accent, emissiveIntensity: 0.12 });
    const dark = stdMat(0x16161c, { rough: 0.85 });
    const steel = stdMat(0xb9c6d2, { rough: 0.3, metal: 0.9 });

    this.root.add(this.body);
    this.body.add(this.hips);
    this.hips.position.y = 0.92 * look.scale;

    this.hips.add(this.torso);
    const chest = mesh(sphere(0.31, 14, 10), cloth, 0, 0.28, 0);
    chest.scale.set(1, 1.1, 0.72);
    this.torso.add(chest);
    const harness = mesh(box(0.4, 0.12, 0.3), dark, 0, 0.34, 0.06);
    this.torso.add(harness);
    const belt = mesh(cyl(0.3, 0.31, 0.1, 12), dark, 0, 0.0, 0);
    belt.scale.z = 0.8;
    this.torso.add(belt);
    const sash = mesh(box(0.16, 0.55, 0.06), accent, 0.16, -0.2, 0.2);
    sash.rotation.z = 0.16;
    this.torso.add(sash);

    // shoulder pads (heavier look for brutes)
    if (look.heavy) {
      for (const s of [-1, 1]) {
        const pad = mesh(sphere(0.18, 10, 8), steel, s * 0.32, 0.55, 0);
        pad.scale.set(1.1, 0.7, 1.1);
        this.torso.add(pad);
        const spike = mesh(cone(0.05, 0.16, 6), steel, s * 0.38, 0.66, 0);
        this.torso.add(spike);
      }
    }

    this.head.position.y = 0.74;
    this.torso.add(this.head);
    const skull = mesh(sphere(0.21, 14, 10), skin, 0, 0.06, 0);
    skull.scale.set(0.94, 1.0, 0.96);
    this.head.add(skull);
    // ninja cowl
    const cowl = mesh(sphere(0.225, 14, 10), cloth, 0, 0.09, -0.01);
    cowl.scale.set(1, 1.0, 1.02);
    const faceHole = mesh(box(0.27, 0.11, 0.06), stdMat(0x0d0d12, { rough: 0.9 }), 0, 0.07, 0.19);
    const eyeGlow = stdMat(0xffcf5a, { emissive: 0xffcf5a, emissiveIntensity: 2.2, rough: 0.4 });
    for (const s of [-1, 1]) {
      const eye = mesh(box(0.075, 0.032, 0.02), eyeGlow, s * 0.075, 0.09, 0.215);
      this.head.add(eye);
    }
    this.head.add(cowl, faceHole);
    const hoodTail = mesh(box(0.16, 0.32, 0.03), cloth, 0, -0.16, -0.17);
    hoodTail.rotation.x = 0.35;
    this.head.add(hoodTail);

    const arm = (side: number) => {
      const sh = new THREE.Group();
      sh.position.set(side * 0.33, 0.56, 0);
      this.torso.add(sh);
      sh.add(mesh(sphere(0.1, 10, 8), cloth));
      sh.add(mesh(capsule(0.082, 0.28), cloth, 0, -0.2, 0));
      const el = new THREE.Group();
      el.position.y = -0.4;
      sh.add(el);
      el.add(mesh(capsule(0.074, 0.24), skin, 0, -0.17, 0));
      el.add(mesh(box(0.15, 0.1, 0.14), dark, 0, -0.36, 0.02));
      return { sh, el };
    };
    const aL = arm(1);
    const aR = arm(-1);
    this.armL = aL.sh;
    this.elbowL = aL.el;
    this.armR = aR.sh;
    this.elbowR = aR.el;

    const leg = (side: number) => {
      const hip = new THREE.Group();
      hip.position.set(side * 0.16, -0.03, 0);
      this.hips.add(hip);
      hip.add(mesh(capsule(0.105, 0.26), cloth, 0, -0.2, 0));
      const kn = new THREE.Group();
      kn.position.y = -0.4;
      hip.add(kn);
      kn.add(mesh(capsule(0.088, 0.24), cloth, 0, -0.17, 0));
      kn.add(mesh(box(0.17, 0.1, 0.3), dark, 0, -0.37, 0.05));
      return { hip, kn };
    };
    const lL = leg(1);
    const lR = leg(-1);
    this.legL = lL.hip;
    this.kneeL = lL.kn;
    this.legR = lR.hip;
    this.kneeR = lR.kn;

    // weapon
    this.weapon = new THREE.Group();
    if (look.gun) {
      const gun = mesh(box(0.09, 0.14, 0.42), dark, 0, 0, 0.16);
      const barrel = mesh(cyl(0.032, 0.032, 0.3, 8), steel, 0, 0.02, 0.42);
      barrel.rotation.x = Math.PI / 2;
      const glow = mesh(sphere(0.045, 8, 6), stdMat(0x2ff0ff, { emissive: 0x2ff0ff, emissiveIntensity: 3 }), 0, 0.02, 0.57);
      this.weapon.add(gun, barrel, glow);
      this.weapon.position.set(0, -0.36, 0.1);
      this.elbowR.add(this.weapon);
    } else if (look.heavy) {
      const blade = mesh(box(0.06, 0.9, 0.1), steel, 0, 0.36, 0);
      const grip = mesh(cyl(0.035, 0.035, 0.24, 8), dark, 0, -0.06, 0);
      this.weapon.add(blade, grip);
      this.weapon.position.set(0, -0.36, 0.06);
      this.weapon.rotation.x = -0.2;
      this.elbowR.add(this.weapon);
    } else {
      const blade = mesh(box(0.04, 0.62, 0.08), steel, 0, 0.28, 0);
      const grip = mesh(cyl(0.028, 0.028, 0.2, 8), dark, 0, -0.06, 0);
      this.weapon.add(blade, grip);
      this.weapon.position.set(0, -0.38, 0.05);
      this.weapon.rotation.x = -0.1;
      this.elbowR.add(this.weapon);
    }

    this.shadow = contactShadow(1.6 * look.scale, 0.45);
    this.shadowAnchor = new THREE.Group();
    this.shadowAnchor.add(this.shadow);
    this.root.add(this.shadowAnchor);

    this.root.scale.setScalar(look.scale);
    this.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = true;
    });
    this.ownMats = ownMaterials(this.root);
  }

  private apply(obj: THREE.Object3D, x: number, y: number, z: number, dt: number, lambda = 16) {
    this.e.set(x, y, z);
    this.q.setFromEuler(this.e);
    obj.quaternion.slerp(this.q, 1 - Math.exp(-lambda * dt));
  }

  update(
    dt: number,
    opts: { speed: number; phase: number; attack: number; hurt: number; ko: number; time: number; aim?: number },
  ) {
    this.curSpeed = damp(this.curSpeed, opts.speed, 12, dt);
    this.curHurt = damp(this.curHurt, opts.hurt, 12, dt);
    this.curKo = damp(this.curKo, opts.ko, 8, dt);
    this.curAtk = opts.attack;
    const run = this.curSpeed;
    const t = opts.time;
    const ph = opts.phase;

    let hipY = 0.92;
    let legL = 0;
    let legR = 0;
    let kneeL = 0.08;
    let kneeR = 0.08;
    let armRx = 0.15;
    let armLx = 0.15;
    let armRz = 0.15;
    let armLz = -0.15;
    let elbR = -0.4;
    let elbL = -0.4;
    let bodyX = 0;
    let torsoY = Math.sin(t * 1.6) * 0.05;

    if (run > 0.05) {
      const s = Math.sin(ph);
      legL = s * 0.95 * run;
      legR = -s * 0.95 * run;
      kneeL = Math.max(0, -Math.cos(ph)) * 1.1 * run + 0.08;
      kneeR = Math.max(0, Math.cos(ph)) * 1.1 * run + 0.08;
      armRx = -s * 0.75 * run + 0.1;
      armLx = s * 0.75 * run + 0.1;
      hipY = 0.92 + Math.abs(Math.sin(ph)) * 0.06 * run;
      bodyX = 0.12 * run;
      torsoY = Math.sin(ph) * 0.1 * run;
    }

    // attack: right arm chop
    if (this.curAtk > 0.001) {
      const p = Math.sin(Math.min(1, this.curAtk) * Math.PI);
      armRx = lerp(-2.3, 0.5, Math.min(1, this.curAtk * 1.3));
      elbR = lerp(-0.5, 0.1, p);
      armRz = 0.35;
      torsoY = lerp(0.35, -0.4, p);
      bodyX = 0.12 * p;
      legL = 0.22;
      legR = -0.16;
    }

    if (this.curHurt > 0.02) {
      bodyX -= 0.4 * this.curHurt;
      armRx += 0.7 * this.curHurt;
      armLx += 0.6 * this.curHurt;
      hipY -= 0.06 * this.curHurt;
    }

    if (this.curKo > 0.01) {
      bodyX = lerp(bodyX, -Math.PI * 0.48, this.curKo);
      hipY = lerp(hipY, 0.45, this.curKo);
      this.body.position.y = damp(this.body.position.y, 0.3 * this.curKo, 10, dt);
    } else {
      this.body.position.y = damp(this.body.position.y, 0, 12, dt);
    }

    this.kneeAngL = damp(this.kneeAngL, kneeL, 16, dt);
    this.kneeAngR = damp(this.kneeAngR, kneeR, 16, dt);
    this.hips.position.y = damp(this.hips.position.y, hipY * this.look.scale, 18, dt);
    this.body.rotation.x = damp(this.body.rotation.x, bodyX, 12, dt);
    this.apply(this.torso, 0, torsoY, 0, dt, 18);
    this.apply(this.head, 0, -torsoY * 0.8, 0, dt, 14);
    this.apply(this.armR, armRx, 0, armRz, dt, 20);
    this.apply(this.armL, armLx, 0, armLz, dt, 20);
    this.apply(this.elbowR, elbR, 0, 0, dt, 18);
    this.apply(this.elbowL, elbL, 0, 0, dt, 18);
    this.apply(this.legL, legL, 0, 0, dt, 18);
    this.apply(this.legR, legR, 0, 0, dt, 18);
    this.apply(this.kneeL, this.kneeAngL, 0, 0, dt, 18);
    this.apply(this.kneeR, this.kneeAngR, 0, 0, dt, 18);
    this.shadow.visible = this.curKo < 0.5;
  }

  flash(color = 0xffffff) {
    const restore = color === 0x000000;
    for (const m of this.ownMats) {
      const base = (m as any).userData as { emissive: number; intensity: number } | undefined;
      m.emissive.setHex(restore ? base?.emissive ?? 0 : color);
      m.emissiveIntensity = restore ? base?.intensity ?? 0 : 1.2;
    }
  }
}

/* ------------------------------------------------------------------ */
/* Shredder                                                           */
/* ------------------------------------------------------------------ */
export class ShredderRig {
  root = new THREE.Group();
  body = new THREE.Group();
  hips = new THREE.Group();
  torso = new THREE.Group();
  head = new THREE.Group();
  armL = new THREE.Group();
  elbowL = new THREE.Group();
  armR = new THREE.Group();
  elbowR = new THREE.Group();
  legL = new THREE.Group();
  kneeL = new THREE.Group();
  legR = new THREE.Group();
  kneeR = new THREE.Group();
  clawL = new THREE.Group();
  clawR = new THREE.Group();
  shadow: THREE.Mesh;
  shadowAnchor: THREE.Group;
  eyeLight: THREE.PointLight;
  ownMats: THREE.MeshStandardMaterial[] = [];
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private kneeLAngle = 0;
  private kneeRAngle = 0;
  auraRing: THREE.Mesh;

  constructor() {
    const steel = stdMat(0x9fb0c4, { rough: 0.24, metal: 1 });
    const steelDark = stdMat(0x3b4654, { rough: 0.35, metal: 0.9 });
    const cloth = stdMat(0x241a32, { rough: 0.9 });
    const crimson = stdMat(0x8f1222, { rough: 0.6 });
    const capeMat = new THREE.MeshStandardMaterial({
      color: 0x2a1430,
      roughness: 0.95,
      side: THREE.DoubleSide,
    });

    this.root.add(this.body);
    this.body.add(this.hips);
    this.hips.position.y = 1.15;

    this.hips.add(this.torso);
    const chest = mesh(sphere(0.4, 16, 12), cloth, 0, 0.34, 0);
    chest.scale.set(1.05, 1.15, 0.78);
    this.torso.add(chest);

    // armoured plates
    // layered chest armour instead of one slab
    const plateTop = mesh(box(0.5, 0.24, 0.15), steel, 0, 0.52, 0.3);
    plateTop.rotation.x = -0.2;
    this.torso.add(plateTop);
    for (const s of [-1, 1]) {
      const pec = mesh(box(0.26, 0.3, 0.14), steel, s * 0.2, 0.35, 0.29);
      pec.rotation.z = s * -0.08;
      pec.rotation.x = -0.08;
      this.torso.add(pec);
    }
    const abPlate = mesh(box(0.3, 0.13, 0.12), steelDark, 0, 0.13, 0.3);
    this.torso.add(abPlate);
    const abPlate2 = mesh(box(0.26, 0.11, 0.1), steelDark, 0, 0.0, 0.28);
    this.torso.add(abPlate2);
    // clan emblem
    const emblem = mesh(cyl(0.12, 0.12, 0.03, 3), stdMat(0xd41f2a, { emissive: 0xd41f2a, emissiveIntensity: 0.7, metal: 0.6, rough: 0.35 }), 0, 0.42, 0.37);
    emblem.rotation.x = Math.PI / 2;
    emblem.rotation.z = Math.PI;
    this.torso.add(emblem);
    // shoulder blades
    for (const s of [-1, 1]) {
      const blade = mesh(box(0.28, 0.42, 0.06), steel, s * 0.5, 0.74, -0.06);
      blade.rotation.z = s * 0.4;
      blade.rotation.y = s * -0.25;
      this.torso.add(blade);
      const spike = mesh(cone(0.09, 0.32, 5), steel, s * 0.6, 0.98, -0.1);
      spike.rotation.z = s * 0.55;
      this.torso.add(spike);
    }
    const belt = mesh(cyl(0.36, 0.38, 0.16, 14), crimson, 0, -0.02, 0);
    belt.scale.z = 0.82;
    this.torso.add(belt);

    // cape
    const capeGeo = new THREE.PlaneGeometry(0.98, 1.55, 8, 10);
    const pos = capeGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const t = (y + 0.775) / 1.55; // 0 top → 1 bottom
      pos.setZ(i, Math.sin(x * 5.5 + t * 2.4) * 0.055 + Math.sin(t * 5) * 0.05 - t * 0.1);
      pos.setX(i, x * (1 + t * 0.35));
    }
    capeGeo.computeVertexNormals();
    const cape = new THREE.Mesh(capeGeo, capeMat);
    cape.position.set(0, 0.15, -0.3);
    cape.rotation.x = 0.06;
    cape.castShadow = true;
    this.torso.add(cape);
    // high collar
    for (const s of [-1, 1]) {
      const collar = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.62, 4, 1, true), capeMat);
      collar.position.set(s * 0.24, 0.92, -0.16);
      collar.rotation.z = s * 0.28;
      collar.rotation.x = -0.24;
      this.torso.add(collar);
    }

    // head
    this.head.position.y = 0.92;
    this.torso.add(this.head);
    const skull = mesh(sphere(0.225, 16, 12), stdMat(0xe0bb48, { rough: 0.3, metal: 0.9 }), 0, 0.06, 0);
    skull.scale.set(0.92, 1.06, 0.98);
    this.head.add(skull);
    // jaw / chin guard
    const jaw = mesh(box(0.3, 0.13, 0.24), steelDark, 0, -0.11, 0.03);
    this.head.add(jaw);
    // helmet crest
    const helm = mesh(box(0.44, 0.14, 0.3), steelDark, 0, 0.2, -0.02);
    this.head.add(helm);
    const crest = mesh(box(0.05, 0.3, 0.34), steel, 0, 0.32, -0.06);
    crest.rotation.x = -0.15;
    this.head.add(crest);
    const maskPlate = mesh(box(0.4, 0.115, 0.08), stdMat(0x0d0f16, { rough: 0.55, metal: 0.4 }), 0, 0.08, 0.185);
    maskPlate.rotation.x = 0.06;
    this.head.add(maskPlate);
    const browBar = mesh(box(0.44, 0.055, 0.07), steel, 0, 0.155, 0.185);
    this.head.add(browBar);
    const eyeMat = stdMat(0xff2a1a, { emissive: 0xff2a1a, emissiveIntensity: 3.4, rough: 0.3 });
    for (const s of [-1, 1]) {
      const eye = mesh(box(0.105, 0.04, 0.03), eyeMat, s * 0.088, 0.082, 0.228);
      eye.rotation.z = s * 0.14;
      this.head.add(eye);
    }
    this.eyeLight = new THREE.PointLight(0xff2a1a, 1.2, 4, 2);
    this.eyeLight.position.set(0, 0.1, 0.3);
    this.head.add(this.eyeLight);
    // mouth grill
    const grill = mesh(box(0.2, 0.09, 0.045), stdMat(0x2a3038, { rough: 0.4, metal: 0.8 }), 0, -0.075, 0.21);
    this.head.add(grill);
    for (let i = 0; i < 3; i++) {
      const bar = mesh(box(0.19, 0.012, 0.02), stdMat(0x0a0c10, { rough: 0.5 }), 0, -0.05 - i * 0.025, 0.228);
      this.head.add(bar);
    }

    // arms
    const arm = (side: number, claw: THREE.Group) => {
      const sh = new THREE.Group();
      sh.position.set(side * 0.45, 0.62, 0);
      this.torso.add(sh);
      const pad = mesh(sphere(0.19, 12, 10), steel, 0, 0.03, 0);
      pad.scale.set(1.1, 0.85, 1.1);
      sh.add(pad);
      sh.add(mesh(capsule(0.11, 0.32), cloth, 0, -0.24, 0));
      const el = new THREE.Group();
      el.position.y = -0.48;
      sh.add(el);
      el.add(mesh(box(0.2, 0.16, 0.2), steelDark, 0, -0.02, 0));
      el.add(mesh(capsule(0.095, 0.28), cloth, 0, -0.22, 0));
      el.add(mesh(box(0.22, 0.12, 0.2), steel, 0, -0.4, 0));
      // triple claw blades
      const clawSteel = stdMat(0xe8f2fb, { rough: 0.12, metal: 1 });
      for (let i = 0; i < 3; i++) {
        const blade = mesh(box(0.032, 0.62, 0.075), clawSteel, -0.075 + i * 0.075, -0.72, 0.09);
        blade.rotation.x = -0.26;
        blade.rotation.z = (i - 1) * 0.06;
        blade.position.z = 0.04 + i * 0.03;
        claw.add(blade);
        const tip = mesh(box(0.024, 0.14, 0.05), clawSteel, -0.075 + i * 0.075, -1.03, 0.2);
        tip.rotation.x = -0.5;
        claw.add(tip);
      }
      const glove = mesh(box(0.16, 0.2, 0.16), steelDark, 0, -0.34, 0.02);
      claw.add(glove);
      claw.position.set(0, -0.44, 0.02);
      el.add(claw);
      return { sh, el };
    };
    const aL = arm(1, this.clawL);
    const aR = arm(-1, this.clawR);
    this.armL = aL.sh;
    this.elbowL = aL.el;
    this.armR = aR.sh;
    this.elbowR = aR.el;

    // legs
    const leg = (side: number) => {
      const hip = new THREE.Group();
      hip.position.set(side * 0.2, -0.02, 0);
      this.hips.add(hip);
      hip.add(mesh(capsule(0.13, 0.34), cloth, 0, -0.24, 0));
      const kn = new THREE.Group();
      kn.position.y = -0.52;
      hip.add(kn);
      kn.add(mesh(box(0.22, 0.16, 0.14), steel, 0, -0.02, 0.08));
      kn.add(mesh(capsule(0.105, 0.3), steelDark, 0, -0.22, 0));
      kn.add(mesh(box(0.22, 0.12, 0.36), steel, 0, -0.46, 0.07));
      return { hip, kn };
    };
    const lL = leg(1);
    const lR = leg(-1);
    this.legL = lL.hip;
    this.kneeL = lL.kn;
    this.legR = lR.hip;
    this.kneeR = lR.kn;

    this.shadow = contactShadow(2.4, 0.6);
    this.shadowAnchor = new THREE.Group();
    this.shadowAnchor.add(this.shadow);
    this.root.add(this.shadowAnchor);

    this.auraRing = new THREE.Mesh(
      new THREE.RingGeometry(0.9, 3.2, 48),
      new THREE.MeshBasicMaterial({
        color: 0xff2a1a,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.auraRing.rotation.x = -Math.PI / 2;
    this.auraRing.position.y = 0.05;
    this.shadowAnchor.add(this.auraRing);

    this.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = true;
    });
    this.ownMats = ownMaterials(this.root);
  }

  flash(color = 0xffffff) {
    const restore = color === 0x000000;
    for (const m of this.ownMats) {
      const base = (m as any).userData as { emissive: number; intensity: number } | undefined;
      m.emissive.setHex(restore ? base?.emissive ?? 0 : color);
      m.emissiveIntensity = restore ? base?.intensity ?? 0 : 1.2;
    }
  }

  private apply(obj: THREE.Object3D, x: number, y: number, z: number, dt: number, lambda = 14) {
    this.e.set(x, y, z);
    this.q.setFromEuler(this.e);
    obj.quaternion.slerp(this.q, 1 - Math.exp(-lambda * dt));
  }

  update(
    dt: number,
    opts: {
      speed: number;
      phase: number;
      attack: number;
      hurt: number;
      rage: number;
      time: number;
      taunt?: number;
      dead?: number;
    },
  ) {
    const run = clamp(opts.speed, 0, 1.4);
    const ph = opts.phase;
    const t = opts.time;
    let legL = 0;
    let legR = 0;
    let kneeL = 0.06;
    let kneeR = 0.06;
    let armRx = 0.12;
    let armLx = 0.12;
    let armRz = 0.2;
    let armLz = -0.2;
    let elbR = -0.35;
    let elbL = -0.35;
    let hipY = 1.15;
    let bodyX = 0;
    let torsoY = Math.sin(t * 1.2) * 0.03;
    const rage = opts.rage;

    if (run > 0.04) {
      const s = Math.sin(ph);
      legL = s * 0.85 * run;
      legR = -s * 0.85 * run;
      kneeL = Math.max(0, -Math.cos(ph)) * 1.0 * run + 0.06;
      kneeR = Math.max(0, Math.cos(ph)) * 1.0 * run + 0.06;
      armRx = -s * 0.6 * run + 0.1;
      armLx = s * 0.6 * run + 0.1;
      hipY = 1.15 - 0.06 * run;
      bodyX = 0.14 * run;
      torsoY = Math.sin(ph) * 0.1 * run;
    }

    if (opts.attack > 0.001) {
      const p = Math.sin(Math.min(1, opts.attack) * Math.PI);
      armRx = lerp(-2.6, 0.7, Math.min(1, opts.attack * 1.25));
      armLx = lerp(-1.9, 0.4, Math.min(1, opts.attack * 1.25));
      armRz = 0.4;
      armLz = -0.4;
      elbR = lerp(-0.5, 0.05, p);
      elbL = lerp(-0.5, 0.15, p);
      torsoY = lerp(0.4, -0.45, p);
      bodyX = 0.2 * p;
      legL = 0.28 * p;
      legR = -0.2 * p;
    }

    if (opts.hurt > 0.02) {
      bodyX -= 0.35 * opts.hurt;
      torsoY += 0.2 * opts.hurt;
      armRx += 0.6 * opts.hurt;
      armLx += 0.6 * opts.hurt;
    }

    if (opts.dead && opts.dead > 0.01) {
      bodyX = lerp(bodyX, -Math.PI * 0.47, opts.dead);
      hipY = lerp(hipY, 0.7, opts.dead);
      this.body.position.y = damp(this.body.position.y, 0.6 * opts.dead, 6, dt);
      this.eyeLight.intensity = lerp(this.eyeLight.intensity, 0, 1 - Math.exp(-4 * dt));
    } else {
      this.body.position.y = damp(this.body.position.y, 0, 10, dt);
      this.eyeLight.intensity = 1.0 + rage * 2.4 + Math.sin(t * 9) * 0.2 * rage;
    }

    this.kneeLAngle = damp(this.kneeLAngle, kneeL, 14, dt);
    this.kneeRAngle = damp(this.kneeRAngle, kneeR, 14, dt);
    this.hips.position.y = damp(this.hips.position.y, hipY, 14, dt);
    this.body.rotation.x = damp(this.body.rotation.x, bodyX, 10, dt);
    this.apply(this.torso, 0, torsoY, 0, dt, 16);
    this.apply(this.head, 0, -torsoY * 0.7, 0, dt, 12);
    this.apply(this.armR, armRx, 0, armRz, dt, 18);
    this.apply(this.armL, armLx, 0, armLz, dt, 18);
    this.apply(this.elbowR, elbR, 0, 0, dt, 16);
    this.apply(this.elbowL, elbL, 0, 0, dt, 16);
    this.apply(this.legL, legL, 0, 0, dt, 14);
    this.apply(this.legR, legR, 0, 0, dt, 14);
    this.apply(this.kneeL, this.kneeLAngle, 0, 0, dt, 14);
    this.apply(this.kneeR, this.kneeRAngle, 0, 0, dt, 14);

    if (this.auraRing) {
      const mat = this.auraRing.material as THREE.MeshBasicMaterial;
      mat.opacity = rage * 0.28 + Math.sin(t * 4) * 0.05 * rage;
      this.auraRing.scale.setScalar(1 + Math.sin(t * 2.2) * 0.06);
      this.auraRing.visible = rage > 0.05;
    }
    this.shadow.visible = !(opts.dead && opts.dead > 0.5);
  }
}
