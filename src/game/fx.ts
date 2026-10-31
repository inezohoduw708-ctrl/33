import * as THREE from 'three';
import { radialTexture } from '../core/assets';
import { rand, pick } from '../core/utils';

interface Particle {
  mesh: THREE.Object3D;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
  grav: number;
  spin: number;
  kind: 'spark' | 'smoke' | 'shard' | 'ring' | 'text' | 'slash';
  baseScale: number;
}

const textTexCache = new Map<string, THREE.Texture>();

function textTexture(text: string, color: string, big = false): THREE.Texture {
  const key = `${text}|${color}|${big}`;
  if (textTexCache.has(key)) return textTexCache.get(key)!;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, 256, 128);
  ctx.font = `bold ${big ? 84 : 64}px Impact, "Arial Black", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 10;
  ctx.strokeStyle = 'rgba(0,0,0,0.9)';
  ctx.strokeText(text, 128, 66);
  const grad = ctx.createLinearGradient(0, 20, 0, 110);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(1, color);
  ctx.fillStyle = grad;
  ctx.fillText(text, 128, 66);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (textTexCache.size > 120) {
    const first = textTexCache.keys().next().value;
    if (first) {
      textTexCache.get(first)?.dispose();
      textTexCache.delete(first);
    }
  }
  textTexCache.set(key, t);
  return t;
}

/**
 * Pooled VFX: sparks, dust, shards, shockwave rings and floating damage numbers.
 * Everything is billboarded and additive where it matters, no external assets.
 */
export class FX {
  private particles: Particle[] = [];
  private pool: Particle[] = [];
  group = new THREE.Group();

  private sparkGeo = new THREE.PlaneGeometry(0.26, 0.26);
  private shardGeo = new THREE.BoxGeometry(0.14, 0.14, 0.14);
  private ringGeo = new THREE.RingGeometry(0.6, 1, 32);
  private slashGeo = new THREE.RingGeometry(0.9, 1.0, 20, 1, Math.PI * 0.2, Math.PI * 0.6);
  private smokeGeo = new THREE.PlaneGeometry(1, 1);

  constructor(scene: THREE.Scene) {
    scene.add(this.group);
  }

  private acquire(kind: Particle['kind']): Particle {
    const found = this.pool.pop();
    if (found) {
      found.kind = kind;
      return found;
    }
    return {
      mesh: new THREE.Object3D(),
      vel: new THREE.Vector3(),
      life: 0,
      maxLife: 1,
      grav: 0,
      spin: 0,
      kind,
      baseScale: 1,
    };
  }

  private spawn(p: Particle) {
    this.particles.push(p);
    this.group.add(p.mesh);
  }

  hitSpark(x: number, y: number, z: number, color = 0xfff2b0, strength = 1) {
    for (let i = 0; i < Math.round(8 * strength); i++) {
      const p = this.acquire('spark');
      const mat = new THREE.SpriteMaterial({
        map: radialTexture('rgba(255,255,255,1)', 'rgba(255,200,120,0)'),
        color,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
      });
      const sprite = new THREE.Sprite(mat);
      p.mesh = sprite;
      sprite.position.set(x, y, z);
      sprite.scale.setScalar(rand(0.5, 1.1) * strength);
      p.vel.set(rand(-1, 1), rand(-0.2, 1), rand(-1, 1)).normalize().multiplyScalar(rand(4, 9) * strength);
      p.life = rand(0.16, 0.36);
      p.maxLife = p.life;
      p.grav = -6;
      p.baseScale = 0.85;
      this.spawn(p);
    }
    this.ring(x, y, z, color, 1.1 * strength);
  }

  /**
   * Combo slash arc: a thin additive crescent that sweeps with the weapon.
   * `flip` mirrors the arc for alternating strikes, `spin` rotates it for spins.
   */
  slash(
    x: number,
    y: number,
    z: number,
    facing: number,
    color = 0x9fe8ff,
    scale = 1,
    opts: { flip?: boolean; heavy?: boolean; vertical?: boolean } = {},
  ) {
    const p = this.acquire('slash');
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.6,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const mesh = new THREE.Mesh(this.slashGeo, mat);
    mesh.position.set(x, y, z);
    // face the arc away from the attacker, standing upright like a blade sweep
    mesh.rotation.order = 'YZX';
    mesh.rotation.y = facing - Math.PI / 2;
    mesh.rotation.z = opts.vertical ? -Math.PI * 0.5 : 0;
    if (opts.flip) mesh.scale.y = -1;
    mesh.scale.multiplyScalar(scale * (opts.heavy ? 1.22 : 1));
    p.mesh = mesh;
    p.life = opts.heavy ? 0.26 : 0.18;
    p.maxLife = p.life;
    p.grav = 0;
    p.baseScale = scale * (opts.heavy ? 1.22 : 1);
    p.vel.set(Math.sin(facing) * 1.2, 0.4, Math.cos(facing) * 1.2);
    this.spawn(p);
  }

  /** Ground telegraph that shrinks inward, telegraphing an incoming enemy attack. */
  warnRing(x: number, z: number, radius = 2, duration = 0.4) {
    const p = this.acquire('ring');
    const mat = new THREE.MeshBasicMaterial({
      color: 0xff3b30,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const mesh = new THREE.Mesh(this.ringGeo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.08, z);
    p.mesh = mesh;
    p.life = duration;
    p.maxLife = duration;
    p.grav = 0;
    p.baseScale = radius;
    p.vel.set(0, 0, 0);
    mesh.scale.setScalar(radius);
    this.spawn(p);
    // shrink instead of grow: mark it via negative growth in the update loop
    (mesh as any).__shrink = true;
  }

  ring(x: number, y: number, z: number, color = 0xffffff, size = 1) {
    const p = this.acquire('ring');
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const mesh = new THREE.Mesh(this.ringGeo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, y, z);
    p.mesh = mesh;
    p.life = 0.34;
    p.maxLife = 0.34;
    p.grav = 0;
    p.baseScale = size;
    mesh.scale.setScalar(size);
    this.spawn(p);
  }

  dust(x: number, y: number, z: number, count = 8, color = 0x9a8f7c) {
    for (let i = 0; i < count; i++) {
      const p = this.acquire('smoke');
      const mat = new THREE.SpriteMaterial({
        map: radialTexture('rgba(255,255,255,0.8)', 'rgba(255,255,255,0)'),
        color,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
      });
      const sprite = new THREE.Sprite(mat);
      p.mesh = sprite;
      sprite.position.set(x + rand(-0.5, 0.5), y + rand(0, 0.4), z + rand(-0.5, 0.5));
      sprite.scale.setScalar(rand(0.6, 1.4));
      p.vel.set(rand(-1.4, 1.4), rand(0.6, 2.2), rand(-1.4, 1.4));
      p.life = rand(0.4, 0.9);
      p.maxLife = p.life;
      p.grav = -0.6;
      p.baseScale = 1.6;
      this.spawn(p);
    }
  }

  shards(x: number, y: number, z: number, color = 0x8899aa, count = 10) {
    for (let i = 0; i < count; i++) {
      const p = this.acquire('shard');
      const mesh = new THREE.Mesh(this.shardGeo, new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.5 }));
      p.mesh = mesh;
      mesh.position.set(x, y, z);
      p.vel.set(rand(-4, 4), rand(2, 7), rand(-4, 4));
      p.life = rand(0.6, 1.2);
      p.maxLife = p.life;
      p.grav = -14;
      p.spin = rand(-10, 10);
      p.baseScale = 1;
      this.spawn(p);
    }
  }

  damageNumber(x: number, y: number, z: number, value: number | string, color = '#ffe27a', big = false) {
    const p = this.acquire('text');
    const mat = new THREE.SpriteMaterial({
      map: textTexture(String(value), color, big),
      transparent: true,
      depthWrite: false,
      depthTest: false,
    });
    const sprite = new THREE.Sprite(mat);
    p.mesh = sprite;
    sprite.position.set(x + rand(-0.25, 0.25), y, z + rand(-0.25, 0.25));
    const s = big ? 1.9 : 1.15;
    sprite.scale.set(s * 2, s, 1);
    p.vel.set(rand(-0.8, 0.8), 3.2, rand(-0.8, 0.8));
    p.life = 0.85;
    p.maxLife = 0.85;
    p.grav = -3.4;
    p.baseScale = s;
    this.spawn(p);
  }

  text(x: number, y: number, z: number, str: string, color = '#7ee04a', big = true) {
    this.damageNumber(x, y, z, str, color, big);
  }

  burst(x: number, y: number, z: number, color: number) {
    this.hitSpark(x, y, z, color, 1.6);
    this.shards(x, y, z, color, 14);
    this.dust(x, y, z + 0.2, 12);
  }

  update(dt: number) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      const t = 1 - Math.max(0, p.life) / p.maxLife;
      if (p.life <= 0) {
        this.group.remove(p.mesh);
        const mesh = p.mesh as THREE.Mesh;
        const mat = mesh.material as THREE.Material | undefined;
        if (mat) mat.dispose();
        if (p.kind === 'smoke' || p.kind === 'text') {
          if (p.kind === 'smoke') (p.mesh as THREE.Sprite).material.dispose();
        }
        // only reuse structural objects, dispose transient geometry-free stuff
        if (p.kind === 'ring') (p.mesh as THREE.Mesh).geometry = this.ringGeo;
        this.pool.push(p);
        this.particles.splice(i, 1);
        continue;
      }
      p.vel.y += p.grav * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      if (p.kind === 'ring') {
        const mesh = p.mesh as THREE.Mesh;
        if ((mesh as any).__shrink) {
          mesh.scale.setScalar(p.baseScale * (1.15 - t * 0.5));
          (mesh.material as THREE.MeshBasicMaterial).opacity = 0.75 * (0.4 + t * 0.8);
        } else {
          mesh.scale.setScalar(p.baseScale * (0.4 + t * 2.1));
          (mesh.material as THREE.MeshBasicMaterial).opacity = 0.85 * (1 - t);
        }
      } else if (p.kind === 'spark') {
        const sprite = p.mesh as THREE.Sprite;
        (sprite.material as THREE.SpriteMaterial).opacity = 1 - t;
        sprite.scale.setScalar(p.baseScale * (1 - t * 0.6));
      } else if (p.kind === 'smoke') {
        const sprite = p.mesh as THREE.Sprite;
        (sprite.material as THREE.SpriteMaterial).opacity = 0.5 * (1 - t);
        sprite.scale.setScalar(p.baseScale * (0.5 + t * 1.4));
      } else if (p.kind === 'shard') {
        const mesh = p.mesh as THREE.Mesh;
        mesh.rotation.x += p.spin * dt;
        mesh.rotation.z += p.spin * 0.7 * dt;
        mesh.scale.setScalar(1 - t * 0.7);
      } else if (p.kind === 'slash') {
        const mesh = p.mesh as THREE.Mesh;
        const mat = mesh.material as THREE.MeshBasicMaterial;
        mat.opacity = 0.6 * Math.pow(1 - t, 1.5);
        mesh.scale.multiplyScalar(1 + dt * 3.2);
        mesh.rotation.z += dt * 1.4;
      } else if (p.kind === 'text') {
        const sprite = p.mesh as THREE.Sprite;
        (sprite.material as THREE.SpriteMaterial).opacity = t < 0.65 ? 1 : 1 - (t - 0.65) / 0.35;
        const pop = 1 + Math.sin(Math.min(1, t * 4) * Math.PI) * 0.25;
        sprite.scale.set(p.baseScale * 2 * pop, p.baseScale * pop, 1);
      }
    }
  }
}

/** Floating billboarded health/name label. */
export function makeLabel(text: string, color = '#ffffff', scale = 1): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.font = 'bold 40px Impact, "Arial Black", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.strokeStyle = 'rgba(0,0,0,0.85)';
  ctx.lineWidth = 8;
  ctx.strokeText(text, 128, 34);
  ctx.fillStyle = color;
  ctx.fillText(text, 128, 34);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.9 }),
  );
  sprite.scale.set(2.4 * scale, 0.6 * scale, 1);
  return sprite;
}

export function randomPick<T>(arr: T[]): T {
  return pick(arr);
}
