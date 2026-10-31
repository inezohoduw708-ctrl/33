import './harness-noaudio';
import * as THREE from 'three';
import { renderRaycast } from './rayrender';
import { TurtleRig, EnemyRig, ShredderRig } from '../src/game/models';
import { FX } from '../src/game/fx';
import { TURTLES } from '../src/core/utils';
import { City } from '../src/world/city';
import { LEVELS } from '../src/game/levels';

const scene = new THREE.Scene();
const city = new City(scene, LEVELS[3]);
city.update(0.016);
const fx = new FX(scene);

const turtle = new TurtleRig(TURTLES.leo);
turtle.root.position.set(0.4, 0, 6.2);
turtle.root.rotation.y = Math.PI * 0.9;
for (let k = 0; k < 30; k++) turtle.update(1 / 60, {
  mode: 'attack', speed: 0, runPhase: 0, time: 1, attackPhase: 0.5,
  attackKind: 'light3', hurt: 0, ko: 0, blocking: false, specialSpin: 0,
} as any);
scene.add(turtle.root);

const foot1 = new EnemyRig({ skin: 0xc28f66, cloth: 0x363c4b, accent: 0xff3b30, scale: 1 });
foot1.root.position.set(-1.6, 0, 3.6);
const foot2 = new EnemyRig({ skin: 0xb08052, cloth: 0x453a52, accent: 0xff8a1f, scale: 1.08 });
foot2.root.position.set(2.3, 0, 3.2);
foot2.root.rotation.y = -0.5;
const brute = new EnemyRig({ skin: 0xa57852, cloth: 0x2f3542, accent: 0xffd23b, scale: 1.34, heavy: true });
brute.root.position.set(4.6, 0, 1.2);
brute.root.rotation.y = -0.9;
for (const [r, o] of [[foot1, 1], [foot2, 2], [brute, 3]] as any) {
  for (let k = 0; k < 30; k++) r.update(1 / 60, { speed: 0.4, phase: 2, attack: o === 3 ? 0.8 : 0, hurt: 0, ko: 0, time: o });
}
const boss = new ShredderRig();
boss.root.position.set(-3.4, 0, -1.6);
boss.root.rotation.y = 0.6;
for (let k = 0; k < 40; k++) boss.update(1 / 60, { speed: 0.5, phase: 1.2, attack: 0.3, hurt: 0, rage: 0.9, time: 1 });
scene.add(foot1.root, foot2.root, brute.root, boss.root);

fx.slash(0.2, 1.25, 8.6, Math.PI * 0.9, 0xffffff, 1.4, { heavy: true });
fx.slash(-0.6, 1.1, 8.2, Math.PI * 1.2, TURTLES.leo.color, 1.1, {});
fx.hitSpark(-1.4, 1.3, 4.2, 0xfff2b0, 1.3);
fx.warnRing(2.3, 3.2, 2.2, 0.4);
fx.dust(1.4, 0.2, 4.5, 10);
for (let i = 0; i < 4; i++) fx.update(1 / 120);

renderRaycast(scene, {
  width: 480, height: 300,
  camPos: new THREE.Vector3(0.2, 4.6, 15.5),
  lookAt: new THREE.Vector3(0.4, 1.4, 3.4),
  fov: 54, bgTop: [8, 10, 18], bgBottom: [24, 30, 42], fog: 0.012,
}, 'shots/battle.png');
console.log('battle shot done');
process.exit(0);
