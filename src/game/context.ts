import type * as THREE from 'three';
import type { FX } from './fx';
import type { AudioKit } from '../core/audio';
import type { City } from '../world/city';
import type { Player } from './player';
import type { Enemy } from './enemy';

export interface Projectile {
  mesh: THREE.Object3D;
  vel: THREE.Vector3;
  life: number;
  damage: number;
  fromEnemy: boolean;
}

export interface CombatContext {
  scene: THREE.Scene;
  fx: FX;
  audio: AudioKit;
  city: City;
  player: Player;
  enemies: Enemy[];
  projectiles: Projectile[];
  time: number;
  levelMods?: import('../types').LevelModifiers;
  shake(amount: number): void;
  hitStop(sec: number): void;
  addScore(n: number): void;
  notify(text: string): void;
  spawnPickup(x: number, z: number, kind: 'pizza' | 'ooze' | 'shard'): void;
}
