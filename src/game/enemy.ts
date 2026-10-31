import * as THREE from 'three';
import { EnemyRig, ShredderRig, type EnemyLook, type CharacterRig } from './models';
import { clamp, damp, angleLerp, angleDiff, rand, pick } from '../core/utils';
import { STREET, resolveCircleColliders } from '../world/city';
import type { EnemyKind } from '../types';
import type { CombatContext } from './context';

let nextId = 1;

const LOOKS: Record<EnemyKind, EnemyLook> = {
  foot: { skin: 0xc28f66, cloth: 0x363c4b, accent: 0xff3b30, scale: 1.0 },
  foot_heavy: { skin: 0xb08052, cloth: 0x453a52, accent: 0xff8a1f, scale: 1.08 },
  brute: { skin: 0xa57852, cloth: 0x2f3542, accent: 0xffd23b, scale: 1.34, heavy: true },
  shooter: { skin: 0xc9996f, cloth: 0x2f4450, accent: 0x2ff0ff, scale: 1.0, gun: true },
  boss: { skin: 0x000000, cloth: 0x000000, accent: 0xff2a1a, scale: 1.0 },
};

export interface EnemyStats {
  hp: number;
  speed: number;
  damage: number;
  range: number;
  attackCooldown: number;
  radius: number;
  score: number;
}

const STATS: Record<EnemyKind, EnemyStats> = {
  foot: { hp: 55, speed: 3.5, damage: 8, range: 1.9, attackCooldown: 1.7, radius: 0.55, score: 100 },
  foot_heavy: { hp: 80, speed: 3.2, damage: 11, range: 2.0, attackCooldown: 2.0, radius: 0.6, score: 150 },
  brute: { hp: 175, speed: 2.5, damage: 17, range: 2.3, attackCooldown: 2.6, radius: 0.85, score: 300 },
  shooter: { hp: 45, speed: 2.9, damage: 7, range: 11, attackCooldown: 2.4, radius: 0.5, score: 180 },
  boss: { hp: 640, speed: 3.6, damage: 13, range: 2.6, attackCooldown: 1.5, radius: 0.95, score: 5000 },
};

type EnemyState = 'spawn' | 'chase' | 'strafe' | 'windup' | 'attack' | 'recover' | 'stagger' | 'dead';

export class Enemy {
  id = nextId++;
  root = new THREE.Group();
  rig: CharacterRig;
  kind: EnemyKind;
  stats: EnemyStats;
  hp: number;
  maxHp: number;
  pos = new THREE.Vector3();
  vel = new THREE.Vector3();
  radius: number;
  alive = true;
  dying = false;
  state: EnemyState = 'spawn';
  facing = 0;
  private stateTime = 0;
  private attackCd = 0;
  private hitFlash = 0;
  private staggerTime = 0;
  private runPhase = 0;
  private koAmount = 0;
  private strafeDir = 1;
  private strafeTimer = 0;
  private spawnTime = 0.6;
  private teleTimer = 0;
  private flankTimer = 2;
  private lastX = 0;
  private lastZ = 0;
  private stuckTime = 0;
  protected ctx: CombatContext;
  private label: THREE.Sprite | null = null;
  private labelHp = 1;
  private deathTimer = 0;
  aimY = 1;

  constructor(ctx: CombatContext, kind: EnemyKind, x: number, z: number) {
    this.ctx = ctx;
    this.kind = kind;
    this.stats = { ...STATS[kind] };
    const mods = ctx.levelMods;
    if (mods) {
      this.stats.damage *= mods.damage ?? 1;
      this.stats.speed *= mods.speed ?? 1;
      this.stats.hp *= mods.hp ?? 1;
    }
    this.stats.hp = Math.round(this.stats.hp);
    this.maxHp = this.stats.hp;
    this.hp = this.maxHp;
    this.radius = this.stats.radius;
    this.pos.set(x, 0, z);
    this.rig = this.createRig();
    this.root.add(this.rig.root);
    this.root.position.copy(this.pos);
    ctx.scene.add(this.root);
    this.facing = Math.atan2(ctx.player.pos.x - x, ctx.player.pos.z - z);
    // spawn poof
    ctx.fx.dust(x, 0.1, z, 14, LOOKS[kind].cloth);
    ctx.fx.ring(x, 0.05, z, LOOKS[kind].accent, 1.4);
    if (kind === 'brute' || kind === 'foot_heavy') {
      this.label = makeHpSprite();
      this.label.visible = false;
      this.root.add(this.label);
      this.label.position.y = 2.6;
    }
  }

  protected createRig(): CharacterRig {
    return new EnemyRig(LOOKS[this.kind]);
  }

  protected rigUpdate(dt: number, opts: Record<string, number>) {
    (this.rig as EnemyRig).update(dt, {
      speed: opts.speed,
      phase: opts.phase,
      attack: opts.attack,
      hurt: opts.hurt,
      ko: opts.ko,
      time: opts.time,
    });
  }

  get isBoss() {
    return this.kind === 'boss';
  }

  takeDamage(amount: number, fromAngle: number, knock: number, special = false): number {
    if (!this.alive) return 0;
    if (this.isBoss) {
      // front hits are slightly reduced, back hits rewarded, finishers hit hardest
      const facingPlayer = Math.abs(angleDiff(this.facing, fromAngle + Math.PI)) < 0.7;
      if (facingPlayer && !special) amount *= 0.85;
      else if (!facingPlayer) amount *= 1.25;
      if (special) amount *= 1.15;
    }
    this.hp -= amount;
    this.hitFlash = 0.12;
    this.rig.flash?.(0xffffff);
    this.ctx.fx.hitSpark(this.pos.x, this.aimYForHit(), this.pos.z, special ? 0xffd166 : 0xfff2c4, special ? 1.5 : 1);
    this.ctx.fx.damageNumber(this.pos.x, this.aimYForHit() + 0.5, this.pos.z, Math.round(amount), special ? '#ffd166' : '#ffffff', special);
    this.ctx.audio.enemyHit();
    if (this.label) this.label.visible = true;
    // knockback
    const kb = this.isBoss ? knock * 0.3 : knock * (this.kind === 'brute' ? 0.5 : 1);
    this.vel.x += Math.sin(fromAngle) * kb;
    this.vel.z += Math.cos(fromAngle) * kb;
    this.strafeDir = Math.random() < 0.5 ? 1 : -1;
    if (this.hp <= 0) {
      this.die(fromAngle);
      return amount;
    }
    if (this.stats.hp > 0 && this.kind !== 'boss') {
      this.state = 'stagger';
      this.staggerTime = this.kind === 'brute' ? 0.18 : 0.26;
      this.stateTime = 0;
    }
    return amount;
  }

  private aimYForHit() {
    return this.kind === 'brute' ? 1.6 : 1.25;
  }

  die(fromAngle: number) {
    this.alive = false;
    this.dying = true;
    this.state = 'dead';
    this.stateTime = 0;
    this.hp = 0;
    this.ctx.audio.enemyDie();
    this.ctx.fx.burst(this.pos.x, 1.1, this.pos.z, 0xffc86b);
    this.ctx.fx.text(this.pos.x, 2.2, this.pos.z, '+' + this.stats.score, '#7ee04a', false);
    this.ctx.addScore(this.stats.score);
    this.ctx.player.kills++;
    this.vel.x += Math.sin(fromAngle) * 4;
    this.vel.z += Math.cos(fromAngle) * 4;
    if (this.label) this.label.visible = false;
    // drop chance
    const r = Math.random();
    if (this.kind === 'brute' || r < 0.14) this.ctx.spawnPickup(this.pos.x, this.pos.z, r < 0.06 ? 'ooze' : 'pizza');
    else if (r < 0.3) this.ctx.spawnPickup(this.pos.x, this.pos.z, 'shard');
    if (this.kind === 'boss') {
      this.ctx.spawnPickup(this.pos.x, this.pos.z, 'pizza');
    }
  }

  private tryAttack(distToPlayer: number) {
    if (this.attackCd > 0) return;
    if (this.kind === 'shooter') {
      if (distToPlayer < this.stats.range && distToPlayer > 4 && Math.random() < 0.6) {
        this.state = 'windup';
        this.stateTime = 0;
      }
      return;
    }
    if (distToPlayer <= this.stats.range) {
      this.state = 'windup';
      this.stateTime = 0;
    }
  }

  update(dt: number) {
    const p = this.ctx.player;
    this.stateTime += dt;
    if (this.attackCd > 0) this.attackCd -= dt;
    if (this.hitFlash > 0) {
      this.hitFlash -= dt;
      if (this.hitFlash <= 0) this.rig.flash?.(0x000000);
    }

    const toPlayerX = p.pos.x - this.pos.x;
    const toPlayerZ = p.pos.z - this.pos.z;
    const dist = Math.hypot(toPlayerX, toPlayerZ);
    const angToPlayer = Math.atan2(toPlayerX, toPlayerZ);

    if (this.state === 'dead') {
      this.deathTimer += dt;
      this.koAmount = clamp(this.deathTimer / 0.5, 0, 1);
      this.pos.x += this.vel.x * dt;
      this.pos.z += this.vel.z * dt;
      this.vel.multiplyScalar(1 - 5 * dt);
      if (this.deathTimer > 1.4) {
        const fade = clamp(1 - (this.deathTimer - 1.4) / 0.5, 0, 1);
        this.rig.root.traverse((o) => {
          const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
          if (m && 'opacity' in m) {
            m.transparent = true;
            m.opacity = fade;
          }
        });
        this.root.scale.setScalar(clamp(fade, 0.001, 1));
        if (fade <= 0.01) this.dying = false; // fully done
      }
      this.rigUpdate(dt, {
        speed: 0,
        phase: this.runPhase,
        attack: 0,
        hurt: 0,
        ko: this.koAmount,
        time: this.ctx.time + this.id,
      });
      this.root.position.set(this.pos.x, 0, this.pos.z);
      this.root.rotation.y = this.facing;
      return;
    }

    if (this.state === 'spawn') {
      this.spawnTime -= dt;
      this.root.scale.setScalar(clamp(1 - this.spawnTime / 0.6, 0.05, 1));
      if (this.spawnTime <= 0) this.state = 'chase';
      this.root.position.set(this.pos.x, 0, this.pos.z);
      this.rigUpdate(dt, {
        speed: 0,
        phase: 0,
        attack: 0,
        hurt: 0,
        ko: 0,
        time: this.ctx.time + this.id,
      });
      this.root.rotation.y = this.facing;
      return;
    }

    let wishX = 0;
    let wishZ = 0;
    let attackPhase = 0;
    let speedForAnim = 0;

    const playerDown = p.state === 'ko';

    switch (this.state) {
      case 'chase': {
        // approach the player, keep a little distance ring; now and then circle for openings
        const goal = this.kind === 'shooter' ? 6.5 : this.stats.range * 0.72;
        this.flankTimer -= dt;
        if (this.flankTimer <= 0) {
          this.flankTimer = rand(2.5, 5.5);
          if (dist < 6 && dist > 2.4 && Math.random() < 0.45 && this.kind !== 'brute') {
            this.state = 'strafe';
            this.stateTime = 0;
            this.strafeDir = Math.random() < 0.5 ? 1 : -1;
            this.strafeTimer = rand(0.5, 1.1);
            break;
          }
        }
        if (playerDown) {
          this.state = 'strafe';
          this.stateTime = 0;
          break;
        }
        if (dist > goal) {
          wishX = (toPlayerX / dist) * this.stats.speed;
          wishZ = (toPlayerZ / dist) * this.stats.speed;
          speedForAnim = 1;
        }
        // separation from other enemies
        this.separate();
        this.facing = angleLerp(this.facing, angToPlayer, 1 - Math.exp(-9 * dt));
        this.tryAttack(dist);
        if (this.kind === 'shooter' && dist < 5.0) {
          // back off
          wishX = -(toPlayerX / Math.max(dist, 0.1)) * this.stats.speed * 0.8;
          wishZ = -(toPlayerZ / Math.max(dist, 0.1)) * this.stats.speed * 0.8;
          speedForAnim = 1;
        }
        break;
      }
      case 'windup': {
        this.facing = angleLerp(this.facing, angToPlayer, 1 - Math.exp(-12 * dt));
        const windup = this.kind === 'brute' ? 0.7 : this.kind === 'shooter' ? 0.55 : 0.45;
        attackPhase = clamp(this.stateTime / windup, 0, 1);
        speedForAnim = 0;
        // telegraph: a red ring tightens under the attacker right before the blow lands
        this.teleTimer -= dt;
        if (this.teleTimer <= 0 && this.stateTime > windup * 0.35) {
          this.teleTimer = 0.5;
          this.ctx.fx.warnRing(this.pos.x, this.pos.z, this.kind === 'brute' ? 2.6 : 1.9, windup * 0.7);
        }
        if (this.stateTime >= windup) {
          this.state = 'attack';
          this.stateTime = 0;
          if (this.kind === 'shooter') {
            this.fireProjectile(angToPlayer);
          } else {
            this.strikeMelee(dist, angToPlayer);
          }
        }
        break;
      }
      case 'attack': {
        attackPhase = 1;
        if (this.stateTime > 0.25) {
          this.state = 'recover';
          this.stateTime = 0;
        }
        break;
      }
      case 'recover': {
        this.teleTimer = 0;
        if (this.stateTime > (this.kind === 'brute' ? 0.55 : 0.35)) {
          this.state = 'chase';
          this.stateTime = 0;
        }
        break;
      }
      case 'stagger': {
        if (this.stateTime > this.staggerTime) {
          this.state = 'chase';
          this.stateTime = 0;
        }
        break;
      }
      case 'strafe': {
        if (dist > 9 && this.kind !== 'shooter') {
          this.state = 'chase';
          this.stateTime = 0;
          break;
        }
        this.strafeTimer -= dt;
        if (this.strafeTimer <= 0) {
          this.strafeDir *= -1;
          this.strafeTimer = rand(1, 2.4);
        }
        const tangent = angToPlayer + Math.PI / 2 * this.strafeDir;
        wishX = Math.sin(tangent) * this.stats.speed * 0.55;
        wishZ = Math.cos(tangent) * this.stats.speed * 0.55;
        speedForAnim = 0.5;
        this.facing = angleLerp(this.facing, angToPlayer, 1 - Math.exp(-6 * dt));
        if (this.stateTime > 1.8 && !playerDown) {
          this.state = 'chase';
          this.stateTime = 0;
        }
        break;
      }
    }

    // apply movement
    const accel = 12;
    this.vel.x = damp(this.vel.x, wishX, accel, dt);
    this.vel.z = damp(this.vel.z, wishZ, accel, dt);
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.pos.x = clamp(this.pos.x, -STREET.walkOuter + 1, STREET.walkOuter - 1);
    this.pos.z = clamp(this.pos.z, STREET.minZ + 3, STREET.maxZ - 3);
    resolveCircleColliders(this.pos, this.vel, this.radius, this.ctx.city.colliders);
    this.checkStuck(dt);

    const speed01 = clamp(Math.hypot(this.vel.x, this.vel.z) / this.stats.speed, 0, 1.3);
    this.runPhase += dt * (5 + speed01 * 8);

    this.rigUpdate(dt, {
      speed: speedForAnim * clamp(speed01 + 0.2, 0, 1),
      phase: this.runPhase,
      attack: attackPhase,
      hurt: this.state === 'stagger' ? 1 : 0,
      ko: 0,
      time: this.ctx.time + this.id * 0.7,
    });
    this.root.position.set(this.pos.x, 0, this.pos.z);
    this.root.rotation.y = this.facing;
    this.aimY = 1.25;

    // health label
    if (this.label && !this.isBoss) {
      const hpFrac = this.hp / this.maxHp;
      if (Math.abs(hpFrac - this.labelHp) > 0.01) {
        this.labelHp = hpFrac;
        this.updateLabel(hpFrac);
      }
    }
  }

  private separate() {
    for (const o of this.ctx.enemies) {
      if (o === this || !o.alive) continue;
      const dx = this.pos.x - o.pos.x;
      const dz = this.pos.z - o.pos.z;
      const d = Math.hypot(dx, dz);
      const min = this.radius + o.radius + 0.15;
      if (d < min && d > 0.001) {
        const push = ((min - d) / d) * 0.5;
        this.pos.x += dx * push;
        this.pos.z += dz * push;
      }
    }
  }

  /** If an enemy has been pressed against geometry for a while, slide it aside. */
  private checkStuck(dt: number) {
    const moved = Math.hypot(this.pos.x - this.lastX, this.pos.z - this.lastZ);
    this.lastX = this.pos.x;
    this.lastZ = this.pos.z;
    const wantsToMove = this.state === 'chase' || this.state === 'strafe';
    if (wantsToMove && moved < 0.012) {
      this.stuckTime += dt;
      if (this.stuckTime > 0.7) {
        this.stuckTime = 0;
        // sidestep perpendicular to the player direction
        const ang = Math.atan2(this.ctx.player.pos.x - this.pos.x, this.ctx.player.pos.z - this.pos.z);
        const side = Math.random() < 0.5 ? 1 : -1;
        this.pos.x += Math.cos(ang) * side * 0.9;
        this.pos.z -= Math.sin(ang) * side * 0.9;
        this.strafeDir = side;
        this.state = 'strafe';
        this.stateTime = 0;
        this.strafeTimer = 0.8;
      }
    } else {
      this.stuckTime = Math.max(0, this.stuckTime - dt * 2);
    }
  }

  private strikeMelee(dist: number, angToPlayer: number) {
    this.attackCd = this.stats.attackCooldown * (0.85 + Math.random() * 0.3);
    const p = this.ctx.player;
    if (dist > this.stats.range + 0.9) return;
    if (Math.abs(angleDiff(this.facing, angToPlayer)) > 1.1) return;
    const ok = p.damage(this.stats.damage * (0.9 + Math.random() * 0.25), angToPlayer + Math.PI, 3.4);
    if (ok) {
      this.ctx.fx.hitSpark(p.pos.x, 1.3, p.pos.z, 0xff5a3a, 1.2);
      this.ctx.audio.block();
    }
  }

  private fireProjectile(ang: number) {
    this.attackCd = this.stats.attackCooldown * (1 + Math.random() * 0.3);
    const p = this.ctx.player;
    const geo = new THREE.SphereGeometry(0.14, 10, 8);
    const mat = new THREE.MeshBasicMaterial({ color: 0x2ff0ff });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(this.pos.x + Math.sin(ang) * 0.6, 1.25, this.pos.z + Math.cos(ang) * 0.6);
    this.ctx.scene.add(mesh);
    const speed = 15;
    this.ctx.projectiles.push({
      mesh,
      vel: new THREE.Vector3(Math.sin(ang) * speed, 0, Math.cos(ang) * speed),
      life: 1.6,
      damage: this.stats.damage,
      fromEnemy: true,
    });
    this.ctx.audio.swing();
    void p;
  }

  private updateLabel(frac: number) {
    if (!this.label) return;
    const canvas = (this.label.material as THREE.SpriteMaterial).map?.image as HTMLCanvasElement;
    if (!canvas) return;
    const ctx2 = canvas.getContext('2d')!;
    ctx2.clearRect(0, 0, canvas.width, canvas.height);
    ctx2.fillStyle = 'rgba(0,0,0,0.65)';
    ctx2.fillRect(24, 26, 208, 14);
    const col = frac > 0.5 ? '#7ee04a' : frac > 0.25 ? '#ffd23b' : '#ff3b30';
    ctx2.fillStyle = col;
    ctx2.fillRect(26, 28, 204 * frac, 10);
    const tex = (this.label.material as THREE.SpriteMaterial).map;
    if (tex) tex.needsUpdate = true;
  }

  dispose() {
    this.ctx.scene.remove(this.root);
    // geometry is cached and shared between enemies — only per-instance materials are freed
    this.root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if ((o as any).isSprite || !mesh.isMesh) return;
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else if (mat) mat.dispose();
    });
  }
}

function makeHpSprite(): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  ctx.fillRect(24, 26, 208, 14);
  ctx.fillStyle = '#7ee04a';
  ctx.fillRect(26, 28, 204, 10);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: true }),
  );
  sprite.scale.set(2.2, 0.55, 1);
  return sprite;
}

/** Boss logic layered on the enemy base — phases, charge and ranged shockwaves. */
export class Boss extends Enemy {
  phase = 1;
  private chargeTimer = 0;
  private chargeActive = 0;
  private shockCooldown = 3;
  private spawnedMinions = false;
  onPhaseChange?: (phase: number) => void;
  onSummon?: () => void;

  constructor(ctx: CombatContext, x: number, z: number) {
    super(ctx, 'boss', x, z);
    this.radius = 0.95;
    this.aimY = 1.6;
    // Shredder is already tuned for the final chapter; keep him consistent
    this.stats.speed = 3.9;
    this.stats.damage = STATS.boss.damage;
    this.maxHp = STATS.boss.hp;
    this.hp = this.maxHp;
  }

  protected createRig(): CharacterRig {
    return new ShredderRig();
  }

  protected rigUpdate(dt: number, opts: Record<string, number>) {
    (this.rig as ShredderRig).update(dt, {
      speed: opts.speed,
      phase: opts.phase,
      attack: opts.attack,
      hurt: opts.hurt,
      rage: 0.4 + this.phase * 0.2,
      time: this.ctx.time,
      dead: opts.ko,
    });
  }

  takeDamage(amount: number, fromAngle: number, knock: number, special = false): number {
    const dealt = super.takeDamage(amount, fromAngle, knock * 0.35, special);
    if (!this.alive) return dealt;
    const frac = this.hp / this.maxHp;
    const newPhase = frac > 0.66 ? 1 : frac > 0.33 ? 2 : 3;
    if (newPhase !== this.phase) {
      this.phase = newPhase;
      this.ctx.audio.bossRoar();
      this.ctx.shake(0.5);
      this.ctx.fx.ring(this.pos.x, 0.1, this.pos.z, 0xff2a1a, 6);
      this.ctx.notify(`ШРЕДДЕР: ФАЗА ${newPhase}`);
      this.onPhaseChange?.(newPhase);
      if (newPhase === 2 && !this.spawnedMinions) {
        this.spawnedMinions = true;
        this.onSummon?.();
      }
      this.stats.speed = 3.6 + newPhase * 0.5;
      this.stats.attackCooldown = Math.max(0.7, 1.5 - newPhase * 0.22);
    }
    return dealt;
  }

  update(dt: number) {
    if (this.shockCooldown > 0) this.shockCooldown -= dt;
    if (this.chargeTimer > 0) this.chargeTimer -= dt;
    if (this.chargeActive > 0) {
      this.chargeActive -= dt;
      const p = this.ctx.player;
      const ang = Math.atan2(p.pos.x - this.pos.x, p.pos.z - this.pos.z);
      this.pos.x += Math.sin(ang) * 13 * dt;
      this.pos.z += Math.cos(ang) * 13 * dt;
      this.pos.x = clamp(this.pos.x, -STREET.walkOuter + 1, STREET.walkOuter - 1);
      this.pos.z = clamp(this.pos.z, STREET.minZ + 3, STREET.maxZ - 3);
      this.facing = ang;
      if (Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z) < 1.9) {
        p.damage(18, ang, 7);
        this.chargeActive = 0;
      }
      this.ctx.fx.dust(this.pos.x, 0.1, this.pos.z, 3, 0xff3a1a);
      this.rigUpdate(dt, {
        speed: 1.4,
        phase: this.ctx.time * 14,
        attack: 1,
        hurt: 0,
        ko: 0,
        time: this.ctx.time,
      });
      this.root.position.set(this.pos.x, 0, this.pos.z);
      this.root.rotation.y = this.facing;
      return;
    }

    // shockwave attack at range
    if (this.shockCooldown <= 0 && this.alive) {
      const p = this.ctx.player;
      const d = Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z);
      if (d > 3 && d < 16) {
        this.shockCooldown = 7 - this.phase;
        this.ctx.fx.ring(this.pos.x, 0.1, this.pos.z, 0xff2a1a, 7);
        this.ctx.audio.special(0.7);
        this.ctx.shake(0.4);
        this.ctx.projectiles.push({
          mesh: (() => {
            const m = new THREE.Mesh(
              new THREE.RingGeometry(0.6, 1.1, 24),
              new THREE.MeshBasicMaterial({
                color: 0xff3a1a,
                transparent: true,
                opacity: 0.9,
                side: THREE.DoubleSide,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
              }),
            );
            m.rotation.x = -Math.PI / 2;
            m.position.set(this.pos.x, 0.14, this.pos.z);
            this.ctx.scene.add(m);
            return m;
          })(),
          vel: new THREE.Vector3(0, 0, 0),
          life: 1.1,
          damage: 11,
          fromEnemy: true,
        });
        // dash charge after shockwave
        this.chargeTimer = 1.2;
      }
    }
    if (this.chargeTimer > 0 && this.chargeTimer < 0.1) {
      this.chargeActive = 0.55;
      this.ctx.audio.bossRoar();
    }

    super.update(dt);
    // rage aura tracks phase
    const rigAny = this.rig as any;
    if (rigAny.update) {
      // already updated in super
    }
    this.root.rotation.y = this.facing;
  }
}

export { LOOKS as ENEMY_LOOKS };
