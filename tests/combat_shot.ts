import './harness-noaudio';
import * as THREE from 'three';
import { renderRaycast } from './rayrender';
import { TurtleRig, EnemyRig } from '../src/game/models';
import { FX } from '../src/game/fx';
import { TURTLES } from '../src/core/utils';
import { City } from '../src/world/city';
import { LEVELS } from '../src/game/levels';

const scene = new THREE.Scene();
const city = new City(scene, LEVELS[1]);
city.update(0.016);
const fx = new FX(scene); // FX needs a scene; signature is (scene)

const hero = new TurtleRig(TURTLES.leo);
hero.root.position.set(-0.2, 0, 6);
hero.root.rotation.y = Math.PI * 0.95;
for (let k = 0; k < 20; k++) hero.update(1 / 60, {
  mode: 'attack', speed: 0, runPhase: 0, time: 1, attackPhase: 0.42,
  attackKind: 'light1', hurt: 0, ko: 0, blocking: false, specialSpin: 0,
} as any);
scene.add(hero.root);

const e = new EnemyRig({ skin: 0xc28f66, cloth: 0x363c4b, accent: 0xff3b30, scale: 1.0 });
e.root.position.set(0.4, 0, 4.2);
e.root.rotation.y = -0.2;
for (let k = 0; k < 20; k++) e.update(1 / 60, { speed: 0, phase: 0, attack: 0.6, hurt: 1, ko: 0, time: 0.4 });
scene.add(e.root);

// simulate a slash + hit spark, then advance fx a couple frames
fx.slash(0.1, 1.2, 4.8, Math.PI * 0.95, TURTLES.leo.color, 1.15, {});
fx.hitSpark(0.35, 1.35, 4.3, 0xfff2b0, 1.2);
fx.damageNumber(0.3, 2.1, 4.3, 18, '#ffffff', false);
for (let i = 0; i < 3; i++) fx.update(1 / 120);

renderRaycast(scene, {
  width: 420, height: 280,
  camPos: new THREE.Vector3(-2.4, 3.0, 9.4),
  lookAt: new THREE.Vector3(0.1, 1.4, 4.8),
  fov: 52, bgTop: [10, 14, 22], bgBottom: [30, 40, 52], fog: 0.008,
}, 'shots/combat.png');
console.log('combat shot done');
