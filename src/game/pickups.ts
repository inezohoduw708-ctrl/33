import * as THREE from 'three';
import { radialTexture } from '../core/assets';
import type { CombatContext } from './context';

export type PickupKind = 'pizza' | 'ooze' | 'shard';

export interface Pickup {
  kind: PickupKind;
  mesh: THREE.Group;
  pos: THREE.Vector3;
  life: number;
  spin: number;
  bob: number;
}

function buildPizza(): THREE.Group {
  const g = new THREE.Group();
  const crust = new THREE.Mesh(
    new THREE.CylinderGeometry(0.36, 0.36, 0.07, 20),
    new THREE.MeshStandardMaterial({ color: 0xdba45a, roughness: 0.85 }),
  );
  crust.rotation.x = Math.PI / 2;
  g.add(crust);
  const cheese = new THREE.Mesh(
    new THREE.CylinderGeometry(0.31, 0.31, 0.045, 20),
    new THREE.MeshStandardMaterial({
      color: 0xffc93c,
      roughness: 0.6,
      emissive: 0xff9800,
      emissiveIntensity: 0.35,
    }),
  );
  cheese.rotation.x = Math.PI / 2;
  cheese.position.z = 0.02;
  g.add(cheese);
  for (let i = 0; i < 5; i++) {
    const pep = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, 0.02, 8),
      new THREE.MeshStandardMaterial({ color: 0xa83a22, roughness: 0.7 }),
    );
    const a = (i / 5) * Math.PI * 2;
    pep.rotation.x = Math.PI / 2;
    pep.position.set(Math.cos(a) * 0.18, Math.sin(a) * 0.18, 0.045);
    g.add(pep);
  }
  // slice cut lines
  const glow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: radialTexture('rgba(255,200,80,0.9)', 'rgba(255,140,0,0)'),
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
      opacity: 0.7,
    }),
  );
  glow.scale.setScalar(2.2);
  g.add(glow);
  return g;
}

function buildOoze(): THREE.Group {
  const g = new THREE.Group();
  const jar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.17, 0.17, 0.42, 12, 1, true),
    new THREE.MeshStandardMaterial({
      color: 0x7ef04a,
      emissive: 0x3aff2a,
      emissiveIntensity: 1.5,
      transparent: true,
      opacity: 0.75,
      roughness: 0.2,
    }),
  );
  g.add(jar);
  const cap = new THREE.Mesh(
    new THREE.CylinderGeometry(0.1, 0.12, 0.1, 10),
    new THREE.MeshStandardMaterial({ color: 0x2a2a30, metalness: 0.8, roughness: 0.3 }),
  );
  cap.position.y = 0.25;
  g.add(cap);
  const glow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: radialTexture('rgba(126,240,74,0.9)', 'rgba(40,255,60,0)'),
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    }),
  );
  glow.scale.setScalar(1.7);
  g.add(glow);
  return g;
}

function buildShard(): THREE.Group {
  const g = new THREE.Group();
  const gem = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.2, 0),
    new THREE.MeshStandardMaterial({
      color: 0x2fe0ff,
      emissive: 0x14c0e0,
      emissiveIntensity: 1.4,
      metalness: 0.4,
      roughness: 0.2,
    }),
  );
  g.add(gem);
  const glow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: radialTexture('rgba(80,240,255,0.9)', 'rgba(0,180,255,0)'),
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    }),
  );
  glow.scale.setScalar(1.4);
  g.add(glow);
  return g;
}

export class PickupManager {
  list: Pickup[] = [];
  private ctx: CombatContext;

  constructor(ctx: CombatContext) {
    this.ctx = ctx;
  }

  spawn(x: number, z: number, kind: PickupKind) {
    const mesh = kind === 'pizza' ? buildPizza() : kind === 'ooze' ? buildOoze() : buildShard();
    mesh.position.set(x, 0.9, z);
    this.ctx.scene.add(mesh);
    this.list.push({
      kind,
      mesh,
      pos: mesh.position.clone(),
      life: kind === 'shard' ? 9 : 16,
      spin: 1.4 + Math.random(),
      bob: Math.random() * Math.PI * 2,
    });
    this.ctx.fx.ring(x, 0.06, z, kind === 'pizza' ? 0xffb347 : kind === 'ooze' ? 0x7ef04a : 0x2fe0ff, 1.1);
  }

  /** Returns the closest pickup within range for the HUD prompt. */
  nearest() {
    let best: Pickup | null = null;
    let bestD = 1e9;
    for (const p of this.list) {
      const d = Math.hypot(p.pos.x - this.ctx.player.pos.x, p.pos.z - this.ctx.player.pos.z);
      if (d < 2.6 && d < bestD) {
        best = p;
        bestD = d;
      }
    }
    return best;
  }

  collect(p: Pickup) {
    const player = this.ctx.player;
    const idx = player.activeIndex;
    if (p.kind === 'pizza') {
      player.hp[idx] = Math.min(player.maxHp, player.hp[idx] + 30);
      this.ctx.fx.text(p.pos.x, 1.8, p.pos.z, '+30 HP', '#7ee04a', false);
      this.ctx.notify('Пицца! Здоровье восстановлено');
    } else if (p.kind === 'ooze') {
      // mutagen: heals the whole team a bit
      for (let i = 0; i < 4; i++) {
        const max = [110, 135, 105, 100][i];
        player.hp[i] = Math.min(max, player.hp[i] + 18);
      }
      this.ctx.fx.text(p.pos.x, 1.8, p.pos.z, 'МУТАГЕН', '#7ef04a', true);
      this.ctx.notify('Мутаген: вся команда восстановлена');
    } else {
      player.energy[idx] = Math.min(100, player.energy[idx] + 35);
      this.ctx.fx.text(p.pos.x, 1.8, p.pos.z, '+ЭНЕРГИЯ', '#2fe0ff', false);
      this.ctx.audio.pickup();
    }
    this.ctx.audio.pickup();
    this.ctx.addScore(40);
    this.ctx.fx.burst(p.pos.x, 1.1, p.pos.z, p.kind === 'pizza' ? 0xffb347 : 0x2fe0ff);
    this.remove(p);
  }

  private remove(p: Pickup) {
    const i = this.list.indexOf(p);
    if (i >= 0) this.list.splice(i, 1);
    this.ctx.scene.remove(p.mesh);
    p.mesh.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
    });
  }

  reset() {
    for (const p of [...this.list]) this.remove(p);
    this.list.length = 0;
  }

  update(dt: number) {
    const player = this.ctx.player;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.life -= dt;
      p.bob += dt * 2.4;
      p.mesh.rotation.y += dt * p.spin;
      p.mesh.position.y = 0.85 + Math.sin(p.bob) * 0.13;
      if (p.kind === 'ooze') {
        p.mesh.children.forEach((c) => {
          if ((c as THREE.Mesh).isMesh) c.rotation.y -= dt * 0.6;
        });
      }
      // magnet toward player when close
      const d = Math.hypot(p.pos.x - player.pos.x, p.pos.z - player.pos.z);
      if (d < 3.4 && p.kind !== 'shard') {
        const k = (1 - d / 3.4) * 4.5 * dt;
        p.mesh.position.x += (player.pos.x - p.mesh.position.x) * k;
        p.mesh.position.z += (player.pos.z - p.mesh.position.z) * k;
        p.pos.x = p.mesh.position.x;
        p.pos.z = p.mesh.position.z;
      }
      if (p.life <= 0) {
        this.remove(p);
      }
    }
  }
}
