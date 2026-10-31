import './harness-noaudio';
import * as THREE from 'three';
import { renderRaycast } from './rayrender';
import { TurtleRig, ShredderRig, EnemyRig } from '../src/game/models';
import { TURTLES } from '../src/core/utils';

function pose(mode: string, extra: any = {}) {
  return {
    mode, speed: 0, runPhase: 0, time: 0.4, attackPhase: 0.45, attackKind: 'light1',
    hurt: 0, ko: 0, blocking: false, specialSpin: 0, ...extra,
  };
}

// closeup of one turtle, 3/4 view
const s1 = new THREE.Scene();
const leo = new TurtleRig(TURTLES.leo);
leo.root.position.set(0, 0, 0);
leo.root.rotation.y = -0.45;
for (let k = 0; k < 40; k++) leo.update(1 / 60, pose('idle') as any);
s1.add(leo.root);
renderRaycast(s1, {
  width: 320, height: 300,
  camPos: new THREE.Vector3(0.6, 1.75, 2.6), lookAt: new THREE.Vector3(0, 1.5, 0),
  fov: 40, bgTop: [14, 20, 30], bgBottom: [40, 56, 70],
}, 'shots/leo-closeup.png');

// attack pose
const s2 = new THREE.Scene();
const raph = new TurtleRig(TURTLES.raph);
raph.root.rotation.y = 0.2;
for (let k = 0; k < 20; k++) raph.update(1 / 60, pose('attack', { attackPhase: 0.35, attackKind: 'light1' }) as any);
s2.add(raph.root);
renderRaycast(s2, {
  width: 320, height: 300,
  camPos: new THREE.Vector3(1.9, 2.1, 3.1), lookAt: new THREE.Vector3(0, 1.25, 0),
  fov: 42, bgTop: [16, 12, 18], bgBottom: [44, 30, 34],
}, 'shots/raph-attack.png');

// shredder closeup
const s3 = new THREE.Scene();
const sh = new ShredderRig();
sh.root.rotation.y = -0.4;
for (let k = 0; k < 40; k++) sh.update(1 / 60, { speed: 0, phase: 0, attack: 0, hurt: 0, rage: 0.3, time: 0.5 });
s3.add(sh.root);
renderRaycast(s3, {
  width: 320, height: 320,
  camPos: new THREE.Vector3(0.9, 2.1, 3.2), lookAt: new THREE.Vector3(0, 1.6, 0),
  fov: 42, bgTop: [20, 8, 10], bgBottom: [52, 20, 22],
}, 'shots/shredder-closeup.png');

// run pose
const s4 = new THREE.Scene();
const mikey = new TurtleRig(TURTLES.mikey);
mikey.root.rotation.y = 1.9;
for (let k = 0; k < 40; k++) mikey.update(1 / 60, pose('run', { speed: 1, runPhase: 2.2 }) as any);
s4.add(mikey.root);
renderRaycast(s4, {
  width: 300, height: 300,
  camPos: new THREE.Vector3(2.6, 1.9, 2.2), lookAt: new THREE.Vector3(0, 1.1, 0),
  fov: 44, bgTop: [14, 18, 26], bgBottom: [36, 48, 60],
}, 'shots/mikey-run.png');
console.log('closeups done');
