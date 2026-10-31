import './harness-noaudio';
import * as THREE from 'three';
import { renderRaycast } from './rayrender';
import { TurtleRig } from '../src/game/models';
import { TURTLES, TURTLE_ORDER } from '../src/core/utils';
import { City } from '../src/world/city';
import { LEVELS } from '../src/game/levels';

const scene = new THREE.Scene();
const city = new City(scene, { ...LEVELS[0], timeOfDay: 'dusk', seed: 777 });
city.update(0.016);
TURTLE_ORDER.forEach((id, i) => {
  const rig = new TurtleRig(TURTLES[id]);
  rig.root.position.set(-3.7 + i * 2.45, 0, 14);
  rig.root.rotation.y = -0.3 + i * 0.18;
  for (let k = 0; k < 40; k++) rig.update(1 / 60, {
    mode: 'idle', speed: 0, runPhase: 0, time: k / 60 + i * 0.9, attackPhase: 0,
    attackKind: 'light1', hurt: 0, ko: 0, blocking: false, specialSpin: 0,
  } as any);
  scene.add(rig.root);
});
renderRaycast(scene, {
  width: 620, height: 380,
  camPos: new THREE.Vector3(9.6, 3.4, 22.4),
  lookAt: new THREE.Vector3(0, 1.25, 14),
  fov: 52, bgTop: [22, 14, 34], bgBottom: [92, 62, 48], fog: 0.008,
}, 'shots/menu-scene.png');
console.log('menu scene shot done');
process.exit(0);
