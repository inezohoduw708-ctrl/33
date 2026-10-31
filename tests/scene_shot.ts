import './harness-noaudio';
import * as THREE from 'three';
import { renderRaycast } from './rayrender';
import { TurtleRig, ShredderRig, EnemyRig } from '../src/game/models';
import { TURTLES, TURTLE_ORDER } from '../src/core/utils';
import { City } from '../src/world/city';
import { LEVELS } from '../src/game/levels';

const scene = new THREE.Scene();
const poses = (t: number, mode: any): any => ({
  mode,
  speed: 0,
  runPhase: 0,
  time: t,
  attackPhase: 0.5,
  attackKind: 'light1',
  hurt: 0,
  ko: 0,
  blocking: false,
  specialSpin: 0,
});

// ---- 1. turtle lineup portrait ----
TURTLE_ORDER.forEach((id, i) => {
  const rig = new TurtleRig(TURTLES[id]);
  rig.root.position.set(-3.6 + i * 2.4, 0, 0);
  rig.root.rotation.y = -0.25 + i * 0.16;
  for (let k = 0; k < 40; k++) rig.update(1 / 60, poses(k / 60 + i, 'idle'));
  scene.add(rig.root);
});
const hits1 = renderRaycast(
  scene,
  {
    width: 440,
    height: 300,
    camPos: new THREE.Vector3(0, 2.1, 8.4),
    lookAt: new THREE.Vector3(0, 1.15, 0),
    fov: 46,
    bgTop: [10, 16, 24],
    bgBottom: [30, 45, 60],
  },
  'shots/turtles.png',
);
console.log('turtle portrait hits:', hits1);

// ---- 2. enemy + boss lineup ----
const scene2 = new THREE.Scene();
const e1 = new EnemyRig({ skin: 0xb9855c, cloth: 0x23252e, accent: 0xff3b30, scale: 1.0 });
e1.root.position.set(-2.4, 0, 0);
const e2 = new EnemyRig({ skin: 0x8f6a4a, cloth: 0x1d1f26, accent: 0xffd23b, scale: 1.34, heavy: true });
e2.root.position.set(0, 0, 0);
const e3 = new EnemyRig({ skin: 0xc09068, cloth: 0x1f2a33, accent: 0x2ff0ff, scale: 1.0, gun: true });
e3.root.position.set(2.2, 0, 0);
const boss = new ShredderRig();
boss.root.position.set(5.2, 0, 0);
for (const [r, o] of [[e1, 0], [e2, 1], [e3, 2]] as any) {
  for (let k = 0; k < 30; k++) r.update(1 / 60, { speed: 0, phase: 0, attack: 0, hurt: 0, ko: 0, time: o });
}
for (let k = 0; k < 30; k++) boss.update(1 / 60, { speed: 0, phase: 0, attack: 0, hurt: 0, rage: 0.5, time: 0 });
scene2.add(e1.root, e2.root, e3.root, boss.root);
const hits2 = renderRaycast(
  scene2,
  {
    width: 440,
    height: 300,
    camPos: new THREE.Vector3(1.4, 2.3, 10),
    lookAt: new THREE.Vector3(1.4, 1.3, 0),
    fov: 48,
    bgTop: [12, 8, 14],
    bgBottom: [40, 22, 30],
  },
  'shots/villains.png',
);
console.log('villain portrait hits:', hits2);

// ---- 3. city street view ----
const scene3 = new THREE.Scene();
const city = new City(scene3, LEVELS[0]);
city.update(1 / 60);
const t3 = new TurtleRig(TURTLES.leo);
t3.root.position.set(0, 0, 8);
t3.root.rotation.y = Math.PI;
for (let k = 0; k < 30; k++) t3.update(1 / 60, poses(0, 'idle'));
scene3.add(t3.root);
const t4 = new TurtleRig(TURTLES.raph);
t4.root.position.set(2.4, 0, 3);
t4.root.rotation.y = Math.PI * 0.7;
for (let k = 0; k < 30; k++) t4.update(1 / 60, poses(0, 'idle'));
scene3.add(t4.root);
const hits3 = renderRaycast(
  scene3,
  {
    width: 400,
    height: 260,
    camPos: new THREE.Vector3(0, 5.5, 24),
    lookAt: new THREE.Vector3(0, 3, 0),
    fov: 62,
    bgTop: [8, 12, 22],
    bgBottom: [26, 34, 46],
    fog: 0.006,
  },
  'shots/city.png',
);
console.log('city view hits:', hits3);
