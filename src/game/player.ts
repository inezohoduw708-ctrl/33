import * as THREE from 'three';
import { TurtleRig } from './models';
import {
  TURTLES,
  TURTLE_ORDER,
  clamp,
  damp,
  angleLerp,
  angleDiff,
  lerp,
} from '../core/utils';
import type { TurtleId, TurtleDef } from '../types';
import type { CombatContext } from './context';
import type { Collider } from '../world/city';
import { STREET, resolveCircleColliders } from '../world/city';

interface AttackDef {
  kind: 'light1' | 'light2' | 'light3' | 'heavy' | 'special';
  windup: number;
  active: number;
  recovery: number;
  damageMul: number;
  rangeMul: number;
  arc: number;
  knock: number;
  advance: number;
}

const ATTACKS: Record<'light1' | 'light2' | 'light3' | 'heavy', AttackDef> = {
  light1: { kind: 'light1', windup: 0.09, active: 0.09, recovery: 0.16, damageMul: 1, rangeMul: 1, arc: 1.5, knock: 2.4, advance: 1.1 },
  light2: { kind: 'light2', windup: 0.08, active: 0.09, recovery: 0.15, damageMul: 1.1, rangeMul: 1, arc: 1.6, knock: 2.6, advance: 1.3 },
  light3: { kind: 'light3', windup: 0.12, active: 0.14, recovery: 0.28, damageMul: 1.55, rangeMul: 1.25, arc: Math.PI * 1.6, knock: 5.2, advance: 2.2 },
  heavy: { kind: 'heavy', windup: 0.22, active: 0.12, recovery: 0.28, damageMul: 2.1, rangeMul: 1.2, arc: 1.9, knock: 6.5, advance: 2.6 },
};

const SPECIAL_TIME = 0.95;

interface FloatTurtle {
  id: TurtleId;
  rig: TurtleRig;
  hp: number;
  energy: number;
  cooldown: number;
}

export class Player {
  root = new THREE.Group();
  rigs: Record<TurtleId, TurtleRig>;
  activeId: TurtleId;
  hp: number[] = [];
  energy: number[] = [];
  pos = new THREE.Vector3(0, 0, 22);
  vel = new THREE.Vector3();
  facing = Math.PI;
  y = 0;
  yVel = 0;
  grounded = true;
  state: 'idle' | 'run' | 'attack' | 'air' | 'hurt' | 'special' | 'ko' | 'victory' = 'idle';
  private attack: AttackDef | null = null;
  private attackTime = 0;
  private attackHit = false;
  private comboStep = 0;
  private comboWindow = 0;
  private specialTime = 0;
  private specialHitTick = 0;
  private hurtTime = 0;
  private invuln = 0;
  private dashTime = 0;
  private dashIFrames = 0;
  private dashCooldown = 0;
  private runPhase = 0;
  private swapFlash = 0;
  private flashTimer = 0;
  koTimer = 0;
  private blockStun = 0;
  private rig: TurtleRig;
  combo = 0;
  comboTimer = 0;
  maxCombo = 0;
  damageTakenThisRun = 0;
  kills = 0;
  private ctx: CombatContext;
  private hitEnemies = new Set<number>();

  constructor(ctx: CombatContext) {
    this.ctx = ctx;
    const mk = (id: TurtleId) => {
      const r = new TurtleRig(TURTLES[id]);
      r.root.visible = false;
      this.root.add(r.root);
      return r;
    };
    this.rigs = {
      leo: mk('leo'),
      raph: mk('raph'),
      don: mk('don'),
      mikey: mk('mikey'),
    };
    for (const id of TURTLE_ORDER) {
      this.hp.push(TURTLES[id].maxHp);
      this.energy.push(0);
    }
    this.activeId = 'leo';
    this.rigs.leo.root.visible = true;
    this.rig = this.rigs.leo;
    this.root.position.copy(this.pos);
    ctx.scene.add(this.root);
  }

  get def(): TurtleDef {
    return TURTLES[this.activeId];
  }

  get activeIndex() {
    return TURTLE_ORDER.indexOf(this.activeId);
  }

  get maxHp() {
    return this.def.maxHp;
  }

  get specialReady() {
    return this.energy[this.activeIndex] >= 100;
  }

  reset(keepTurtle = true) {
    for (let i = 0; i < 4; i++) {
      this.hp[i] = TURTLES[TURTLE_ORDER[i]].maxHp;
      this.energy[i] = 0;
    }
    this.pos.set(0, 0, 22);
    this.vel.set(0, 0, 0);
    this.y = 0;
    this.yVel = 0;
    this.facing = Math.PI;
    this.state = 'idle';
    this.attack = null;
    this.attackTime = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.maxCombo = 0;
    this.comboStep = 0;
    this.hurtTime = 0;
    this.invuln = 0;
    this.dashTime = 0;
    this.dashIFrames = 0;
    this.koTimer = 0;
    this.specialTime = 0;
    this.damageTakenThisRun = 0;
    this.kills = 0;
    if (!keepTurtle) this.setTurtle('leo', true);
    for (const id of TURTLE_ORDER) {
      this.rigs[id].root.rotation.set(0, 0, 0);
      this.rigs[id].clearFlash();
    }
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.facing;
  }

  setTurtle(id: TurtleId, silent = false) {
    if (this.activeId === id) return;
    const prev = this.rigs[this.activeId];
    this.rig = this.rigs[id];
    this.activeId = id;
    prev.root.visible = false;
    this.rig.root.visible = true;
    this.rig.root.position.set(0, 0, 0);
    this.rig.root.rotation.set(0, 0, 0);
    this.swapFlash = 0.55;
    this.attack = null;
    this.state = 'idle';
    this.combo = 0;
    this.comboTimer = 0;
    this.comboStep = 0;
    if (!silent) {
      this.ctx.audio.select();
      this.ctx.fx.ring(this.pos.x, 0.08, this.pos.z, this.def.color, 2.2);
      this.ctx.fx.dust(this.pos.x, 0.1, this.pos.z, 14, 0x88ffbb);
    }
  }

  cycleTurtle() {
    const i = this.activeIndex;
    this.setTurtle(TURTLE_ORDER[(i + 1) % 4]);
  }

  private canAct() {
    return this.state !== 'ko' && this.state !== 'hurt' && this.hurtTime <= 0 && this.specialTime <= 0;
  }

  private startAttack(def: AttackDef) {
    this.attack = def;
    this.attackTime = 0;
    this.attackHit = false;
    this.hitEnemies.clear();
    this.state = 'attack';
    this.ctx.audio.swing();
    this.spawnSlash(def);
    // advance input leniency: snap to nearest enemy in front
    const target = this.nearestEnemy(3.4);
    if (target) {
      const ang = Math.atan2(target.pos.x - this.pos.x, target.pos.z - this.pos.z);
      this.facing = angleLerp(this.facing, ang, 0.55);
    }
    // refund a bit of energy on hit later
  }

  private spawnSlash(def: AttackDef) {
    const col = this.def.color;
    const heavy = def.kind === 'heavy';
    const spin = def.kind === 'light3';
    const fwd = 0.95;
    const x = this.pos.x + Math.sin(this.facing) * fwd;
    const z = this.pos.z + Math.cos(this.facing) * fwd;
    const y = 1.18 + this.y;
    if (spin) {
      for (let i = 0; i < 3; i++) {
        const a = this.facing + (i * Math.PI * 2) / 3;
        this.ctx.fx.slash(
          this.pos.x + Math.sin(a) * 0.7,
          y,
          this.pos.z + Math.cos(a) * 0.7,
          a,
          i === 0 ? 0xffffff : col,
          1.15,
          { heavy: true },
        );
      }
      this.ctx.fx.ring(this.pos.x, 0.1 + this.y, this.pos.z, col, 2.6);
    } else {
      this.ctx.fx.slash(x, y, z, this.facing, heavy ? 0xffd28a : col, heavy ? 1.6 : 1.3, {
        flip: def.kind === 'light2',
        heavy,
      });
    }
  }

  private nearestEnemy(maxDist: number) {
    let best: { pos: THREE.Vector3; dist: number } | null = null;
    for (const e of this.ctx.enemies) {
      if (!e.alive) continue;
      const d = Math.hypot(e.pos.x - this.pos.x, e.pos.z - this.pos.z);
      if (d < maxDist) {
        const ang = Math.atan2(e.pos.x - this.pos.x, e.pos.z - this.pos.z);
        const diff = Math.abs(angleDiff(this.facing, ang));
        if (diff > 1.35) continue;
        if (!best || d < best.dist) best = { pos: e.pos as THREE.Vector3, dist: d };
      }
    }
    return best;
  }

  trySpecial() {
    if (!this.canAct()) return;
    if (!this.specialReady) {
      this.ctx.notify('Энергия не набрана — бей врагов без пропусков');
      return;
    }
    this.energy[this.activeIndex] = 0;
    this.specialTime = SPECIAL_TIME;
    this.specialHitTick = 0;
    this.state = 'special';
    this.attack = { kind: 'special', windup: 0, active: SPECIAL_TIME, recovery: 0, damageMul: 0, rangeMul: 0, arc: 0, knock: 0, advance: 0 };
    this.attackTime = 0;
    this.attackHit = false;
    this.hitEnemies.clear();
    this.ctx.audio.special();
    this.ctx.shake(0.35);
    this.ctx.fx.ring(this.pos.x, 0.1, this.pos.z, this.def.color, 5);
    this.ctx.fx.ring(this.pos.x, 0.5, this.pos.z, 0xffffff, 3);
    this.ctx.fx.dust(this.pos.x, 0.2, this.pos.z, 26, this.def.color);
    this.ctx.notify(TURTLES[this.activeId].special.toUpperCase());
  }

  private performSpecialTick(dt: number) {
    const d = this.def;
    this.specialHitTick -= dt;
    if (this.activeId === 'raph') {
      // dash forward
      const fx = Math.sin(this.facing);
      const fz = Math.cos(this.facing);
      this.vel.x = fx * 15;
      this.vel.z = fz * 15;
    } else if (this.activeId === 'mikey') {
      const fx = Math.sin(this.facing);
      const fz = Math.cos(this.facing);
      this.vel.x = fx * 8;
      this.vel.z = fz * 8;
    }
    if (this.specialHitTick > 0) return;
    this.specialHitTick = 0.16;
    const range = d.range * (this.activeId === 'don' ? 1.4 : 1.35) + 1.0;
    let hitAny = false;
    for (const e of this.ctx.enemies) {
      if (!e.alive) continue;
      const dx = e.pos.x - this.pos.x;
      const dz = e.pos.z - this.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > range) continue;
      const ang = Math.atan2(dx, dz);
      if (this.activeId !== 'raph' && this.activeId !== 'don' && Math.abs(angleDiff(this.facing, ang)) > 1.9) continue;
      const dmg = d.damage * 1.5;
      this.dealDamage(e, dmg, 6.5, true);
      hitAny = true;
    }
    if (this.activeId === 'don') {
      // shockwave visual
      this.ctx.fx.ring(this.pos.x, 0.1, this.pos.z, 0xb76bff, 4.5);
    }
    if (hitAny) {
      this.ctx.audio.hit(true);
      this.ctx.shake(0.22);
    }
  }

  private dealDamage(enemy: import('./enemy').Enemy, dmg: number, knock: number, special = false) {
    const angle = Math.atan2(enemy.pos.x - this.pos.x, enemy.pos.z - this.pos.z);
    const dealt = enemy.takeDamage(dmg, angle, knock, special);
    if (dealt > 0) {
      this.ctx.hitStop(special ? 0.075 : 0.045);
      this.ctx.shake(special ? 0.3 : 0.12);
      this.energy[this.activeIndex] = clamp(
        this.energy[this.activeIndex] + (special ? 0 : 7.5),
        0,
        100,
      );
      this.combo++;
      this.comboTimer = 2.4;
      this.maxCombo = Math.max(this.maxCombo, this.combo);
      this.ctx.audio.combo(this.combo);
      if (this.combo % 5 === 0) this.ctx.fx.text(this.pos.x, 2.6, this.pos.z, `${this.combo} КОМБО`, '#ffab3d', true);
      this.ctx.addScore(Math.round(dmg * (1 + this.combo * 0.06)));
    }
  }

  damage(amount: number, fromAngle: number, knockback = 3) {
    if (this.invuln > 0 || this.state === 'ko' || this.specialTime > 0) return false;
    if (this.dashIFrames > 0) return false; // dash i-frames
    const idx = this.activeIndex;
    this.hp[idx] = clamp(this.hp[idx] - amount, 0, this.maxHp);
    this.damageTakenThisRun += amount;
    this.invuln = 0.45;
    this.hurtTime = 0.3;
    this.combo = 0;
    this.comboTimer = 0;
    this.comboStep = 0;
    this.attack = null;
    this.energy[idx] = clamp(this.energy[idx] + 9, 0, 100);
    this.ctx.audio.hurt();
    this.ctx.shake(0.34);
    const flash = document.getElementById('damage-flash');
    if (flash) {
      flash.classList.add('on');
      window.setTimeout(() => flash.classList.remove('on'), 70);
    }
    this.rig.flashBody(0xff2a1a);
    this.flashTimer = 0.16;
    this.facing = fromAngle;
    this.vel.set(Math.sin(fromAngle) * knockback, 0, Math.cos(fromAngle) * knockback);
    if (this.hp[idx] <= 0) {
      this.ko();
    }
    return true;
  }

  private ko() {
    this.state = 'ko';
    this.koTimer = 0.9;
    this.ctx.audio.fail();
    this.ctx.notify(`${this.def.name.toUpperCase()} ПОВЕРЖЕН`);
    this.ctx.shake(0.6);
  }

  /** Called by the game when the active turtle is down and a switch is available. */
  respawnAs(id: TurtleId) {
    this.hp[TURTLE_ORDER.indexOf(id)] = TURTLES[id].maxHp;
    this.setTurtle(id, true);
    this.state = 'idle';
    this.koTimer = 0;
    this.invuln = 1.4;
    this.hurtTime = 0;
    this.rig.root.rotation.set(0, 0, 0);
    this.rig.clearFlash();
    this.ctx.fx.ring(this.pos.x, 0.1, this.pos.z, 0x7ee04a, 3.4);
  }

  get aliveCount() {
    return this.hp.filter((h) => h > 0).length;
  }

  get isDown() {
    return this.state === 'ko' && this.koTimer <= 0;
  }

  update(dt: number, camYaw: number, input: import('../core/input').InputState, inputHeld: { light: boolean }) {
    // timers
    if (this.invuln > 0) this.invuln -= dt;
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) this.combo = 0;
    }
    if (this.comboWindow > 0) this.comboWindow -= dt;
    if (this.dashCooldown > 0) this.dashCooldown -= dt;
    if (this.swapFlash > 0) this.swapFlash -= dt;
    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      if (this.flashTimer <= 0) this.rig.clearFlash();
    }
    if (this.blockStun > 0) this.blockStun -= dt;

    // turtle swap input
    if (input.swapIndex !== null) {
      const id = TURTLE_ORDER[input.swapIndex];
      if (this.hp[input.swapIndex] > 0) this.setTurtle(id);
    } else if (input.swap) {
      for (let i = 1; i <= 4; i++) {
        const idx = (this.activeIndex + i) % 4;
        if (this.hp[idx] > 0) {
          this.setTurtle(TURTLE_ORDER[idx]);
          break;
        }
      }
    }

    if (this.state === 'ko') {
      this.koTimer -= dt;
      this.vel.multiplyScalar(0.9);
      this.moveBy(dt);
      this.animate(dt, 0);
      return;
    }

    // input-driven movement
    const speed = this.def.speed;
    let wishX = input.moveX;
    let wishZ = input.moveZ;
    const wishLen = Math.hypot(wishX, wishZ);
    const moving = wishLen > 0.08;

    // convert camera-relative input to world
    const camF = new THREE.Vector3(Math.sin(camYaw), 0, Math.cos(camYaw));
    const camR = new THREE.Vector3(camF.z, 0, -camF.x);
    const wx = camR.x * wishX + camF.x * wishZ;
    const wz = camR.z * wishX + camF.z * wishZ;

    // dash — i-frames are granted on activation (below), not while dashing,
    // so a dash *through* an incoming hit still protects you
    if (input.dash && this.dashCooldown <= 0 && this.state !== 'attack' && this.specialTime <= 0) {
      this.dashTime = 0.2;
      this.dashIFrames = 0.24;
      this.dashCooldown = 0.55;
      this.invuln = Math.max(this.invuln, 0.22);
      const dir = moving ? new THREE.Vector2(wx, wz).normalize() : new THREE.Vector2(Math.sin(this.facing), Math.cos(this.facing));
      this.vel.x = dir.x * 19;
      this.vel.z = dir.y * 19;
      this.ctx.audio.dash();
      this.ctx.fx.dust(this.pos.x, 0.1, this.pos.z, 10, this.def.color);
      this.ctx.fx.ring(this.pos.x, 0.06, this.pos.z, this.def.color, 1.6);
    }
    if (this.dashIFrames > 0) this.dashIFrames -= dt;
    if (this.dashTime > 0) {
      this.dashTime -= dt;
      this.vel.multiplyScalar(1 - 3.2 * dt);
      if (Math.random() < 0.35) {
        this.ctx.fx.dust(this.pos.x, 0.12, this.pos.z, 1, this.def.color);
      }
    } else if (this.specialTime > 0) {
      // special movement handled in performSpecialTick
      this.vel.multiplyScalar(1 - 4 * dt);
    } else {
      const targetVX = moving ? wx * speed : 0;
      const targetVZ = moving ? wz * speed : 0;
      const accel = this.grounded ? 16 : 6;
      this.vel.x = damp(this.vel.x, targetVX, accel, dt);
      this.vel.z = damp(this.vel.z, targetVZ, accel, dt);
      if (moving && this.state !== 'attack') {
        const targetFacing = Math.atan2(wx, wz);
        this.facing = angleLerp(this.facing, targetFacing, 1 - Math.exp(-14 * dt));
      }
    }

    // jump
    if (input.jump && this.grounded && this.specialTime <= 0) {
      this.yVel = 8.2;
      this.grounded = false;
      this.ctx.audio.jump();
      this.ctx.fx.dust(this.pos.x, 0.05, this.pos.z, 8);
    }

    // attacks
    const canQueue = this.state !== 'hurt' && this.specialTime <= 0;
    if (canQueue && (input.light || inputHeld.light)) {
      if (this.state === 'attack' && this.attack) {
        const total = this.attack.windup + this.attack.active + this.attack.recovery;
        if (this.attackTime > total * 0.4 && this.comboStep < 3) {
          // queue next
          this.comboWindow = 0.5;
        }
      } else if (this.grounded) {
        this.comboStep = 0;
        this.startAttack(ATTACKS.light1);
      }
    }
    if (canQueue && input.heavy && this.grounded && this.state !== 'attack') {
      this.startAttack(ATTACKS.heavy);
    }
    if (input.special) this.trySpecial();

    // attack state machine
    if (this.state === 'attack' && this.attack) {
      const a = this.attack;
      this.attackTime += dt;
      const total = a.windup + a.active + a.recovery;
      // advance lunge during windup→active
      if (a.kind !== 'special' && this.attackTime < a.windup + a.active) {
        const fx = Math.sin(this.facing);
        const fz = Math.cos(this.facing);
        const adv = (a.advance / (a.windup + a.active)) * dt;
        this.vel.x += fx * adv * 4;
        this.vel.z += fz * adv * 4;
      }
      if (!this.attackHit && this.attackTime >= a.windup) {
        this.attackHit = true;
        this.resolveHit(a);
      }
      if (this.attackTime >= total) {
        this.attack = null;
        this.state = this.grounded ? 'idle' : 'air';
        if (this.comboWindow > 0 && this.comboStep < 2) {
          this.comboStep++;
          this.comboWindow = 0;
          const next = this.comboStep === 1 ? ATTACKS.light2 : ATTACKS.light3;
          this.startAttack(next);
        } else {
          this.comboStep = 0;
        }
      }
    }

    // special
    if (this.specialTime > 0) {
      this.specialTime -= dt;
      if (this.activeId === 'raph') {
        this.vel.x = Math.sin(this.facing) * 14;
        this.vel.z = Math.cos(this.facing) * 14;
      }
      this.performSpecialTick(dt);
      if (this.specialTime <= 0) {
        this.state = 'idle';
        this.attack = null;
      }
    }

    if (this.hurtTime > 0) {
      this.hurtTime -= dt;
      this.vel.multiplyScalar(1 - 6 * dt);
      if (this.hurtTime <= 0) this.state = this.grounded ? 'idle' : 'air';
    }

    // gravity
    if (!this.grounded) {
      this.yVel -= 26 * dt;
      this.y += this.yVel * dt;
      if (this.y <= 0) {
        this.y = 0;
        this.yVel = 0;
        this.grounded = true;
        this.ctx.fx.dust(this.pos.x, 0.05, this.pos.z, 6);
        if (this.state === 'air') this.state = 'idle';
      }
    }

    this.moveBy(dt);

    // animations / state selection
    let animState: 'idle' | 'run' | 'attack' | 'air' | 'hurt' | 'ko' | 'special' = 'idle';
    if (this.specialTime > 0) animState = 'special';
    else if (this.hurtTime > 0) animState = 'hurt';
    else if (this.state === 'attack') animState = 'attack';
    else if (!this.grounded) animState = 'air';
    else if (Math.hypot(this.vel.x, this.vel.z) > 1.2) animState = 'run';

    const speed01 = clamp(Math.hypot(this.vel.x, this.vel.z) / speed, 0, 1.6);
    this.runPhase += dt * (5 + speed01 * 9);
    this.animate(dt, speed01, animState);
  }

  private animate(dt: number, speed01: number, animState?: string) {
    const st = (animState ?? 'idle') as any;
    const a = this.attack;
    const totalP = a ? this.attackTime / Math.max(0.001, a.windup + a.active + a.recovery) : 0;
    this.rig.update(dt, {
      mode: st === 'special' ? 'attack' : (st as any),
      speed: clamp(speed01, 0, 1),
      runPhase: this.runPhase,
      time: this.ctx.time,
      attackPhase: st === 'special' ? 1 - this.specialTime / SPECIAL_TIME : clamp(totalP, 0, 1),
      attackKind: st === 'special' ? 'special' : a ? a.kind : 'light1',
      hurt: clamp(this.hurtTime / 0.3, 0, 1),
      ko: this.state === 'ko' ? clamp((0.9 - this.koTimer) / 0.6, 0, 1) : 0,
      blocking: this.blockStun > 0,
      specialSpin: this.specialTime > 0 ? this.specialTime / SPECIAL_TIME : 0,
    });
    // world transform
    this.root.position.set(this.pos.x, this.y, this.pos.z);
    this.rig.root.rotation.y = this.facing;
    if (this.swapFlash > 0) {
      this.rig.eyeGlow.intensity = 1.6;
    }
    // invulnerability blink
    this.rig.root.visible = this.invuln > 0 && this.hurtTime <= 0 ? Math.floor(this.invuln * 22) % 2 === 0 : true;
  }

  private resolveHit(a: AttackDef) {
    const d = this.def;
    const range = d.range * a.rangeMul;
    let hits = 0;
    for (const e of this.ctx.enemies) {
      if (!e.alive || this.hitEnemies.has(e.id)) continue;
      const dx = e.pos.x - this.pos.x;
      const dz = e.pos.z - this.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > range + e.radius) continue;
      if (Math.abs(e.pos.y - this.y) > 2.2) continue;
      const ang = Math.atan2(dx, dz);
      if (Math.abs(angleDiff(this.facing, ang)) > a.arc / 2 + 0.25) continue;
      this.hitEnemies.add(e.id);
      const falloff = 1 - Math.min(0.3, dist / (range * 2.2));
      const dmg = d.damage * a.damageMul * falloff * (0.92 + Math.random() * 0.16) * (1 + this.combo * 0.012);
      this.dealDamage(e, dmg, a.knock, a.kind === 'heavy' || a.kind === 'light3');
      hits++;
    }
    if (hits > 0) {
      this.ctx.audio.hit(a.kind === 'heavy' || a.kind === 'light3');
      this.ctx.fx.hitSpark(
        this.pos.x + Math.sin(this.facing) * 1.2,
        1.2 + this.y,
        this.pos.z + Math.cos(this.facing) * 1.2,
        0xfff0b0,
        a.kind === 'heavy' ? 1.5 : 1,
      );
      this.hitStopScale(a);
    }
  }

  private hitStopScale(a: AttackDef) {
    if (a.kind === 'light3' || a.kind === 'heavy') this.ctx.shake(0.18);
  }

  private moveBy(dt: number) {
    const nx = this.pos.x + this.vel.x * dt;
    const nz = this.pos.z + this.vel.z * dt;
    this.pos.x = nx;
    this.pos.z = nz;
    // bounds + colliders
    this.pos.x = clamp(this.pos.x, -STREET.walkOuter + 0.9, STREET.walkOuter - 0.9);
    this.pos.z = clamp(this.pos.z, STREET.minZ + 3, STREET.maxZ - 3);
    resolveCircleColliders(this.pos, this.vel, 0.55, this.ctx.city.colliders);
    // enemy soft collision
    for (const e of this.ctx.enemies) {
      if (!e.alive) continue;
      const dx = this.pos.x - e.pos.x;
      const dz = this.pos.z - e.pos.z;
      const d = Math.hypot(dx, dz);
      const min = 0.62 + e.radius * 0.6;
      if (d < min && d > 0.0001) {
        const push = (min - d) / d;
        this.pos.x += dx * push * 0.6;
        this.pos.z += dz * push * 0.6;
      }
    }
  }

  get isDead() {
    return this.hp.every((h) => h <= 0);
  }
}

export type { FloatTurtle, AttackDef };
