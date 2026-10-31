import * as THREE from 'three';
import { City } from '../world/city';
import { FX } from './fx';
import { Player } from './player';
import { Enemy, Boss } from './enemy';
import { PickupManager } from './pickups';
import type { CombatContext, Projectile } from './context';
import { GameCamera } from './camera';
import { WavePortal } from './portal';
import { LEVELS } from './levels';
import { Input } from '../core/input';
import { audio } from '../core/audio';
import { HUD } from '../ui/hud';
import { clamp, TURTLES, TURTLE_ORDER, rankFromScore } from '../core/utils';
import type { LevelDef, SaveData } from '../types';

export type GamePhase = 'menu' | 'playing' | 'paused' | 'clear' | 'over' | 'loading';

/** Indirection so the renderer can be swapped in headless tests. */
export const rendererFactory = {
  create: (opts: THREE.WebGLRendererParameters): THREE.WebGLRenderer => new THREE.WebGLRenderer(opts),
};

export interface GameCallbacks {
  onLevelClear(result: ClearResult): void;
  onGameOver(): void;
  onPhaseChange(phase: GamePhase): void;
  save(): SaveData;
  persist(): void;
}

export interface ClearResult {
  levelId: number;
  score: number;
  rank: string;
  timeSec: number;
  kills: number;
  maxCombo: number;
  damageTaken: number;
  noDeaths: boolean;
}

export class Game {
  scene = new THREE.Scene();
  renderer: THREE.WebGLRenderer;
  cam: GameCamera;
  city: City | null = null;
  fx: FX;
  player: Player;
  enemies: Enemy[] = [];
  projectiles: Projectile[] = [];
  pickups: PickupManager;
  hud = new HUD();
  input: Input;
  phase: GamePhase = 'menu';
  level: LevelDef = LEVELS[0];
  score = 0;
  time = 0;
  private hitStopTimer = 0;
  private clock = new THREE.Clock();
  private cb: GameCallbacks;
  private ctx: CombatContext;
  private waveIndex = 0;
  private waveQueue: { kind: any; count: number }[] = [];
  private spawnTimer = 0;
  private emptyWaveTimer = 0;
  private waveActive = false;
  private waveTransition = 0;
  private levelTime = 0;
  private boss: Boss | null = null;
  private portal: WavePortal | null = null;
  private portalHold = 0;
  private bossSpawned = false;
  private menuTurtles: THREE.Group[] = [];
  private menuGroup = new THREE.Group();
  private raf = 0;
  private running = true;
  private introFade = 0;
  private lastFrame = 0;
  private accumulator = 0;
  private pickupHintTimer = 0;
  private fps = 60;
  private lowPerfMode = false;
  private frameCount = 0;
  private fpsTimer = 0;
  private noDeathRun = true;
  private pendingLevel = 0;
  debug = false;

  constructor(private canvas: HTMLCanvasElement, cb: GameCallbacks) {
    this.cb = cb;
    this.renderer = rendererFactory.create({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
      alpha: false,
      stencil: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.85));
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene.background = new THREE.Color(0x0a1018);
    this.cam = new GameCamera(window.innerWidth / window.innerHeight);
    this.fx = new FX(this.scene);
    this.input = new Input(canvas);

    // bootstrap a player instance on a temporary menu arena
    this.city = new City(this.scene, {
      ...LEVELS[0],
      timeOfDay: 'night',
    });
    this.ctx = {
      scene: this.scene,
      fx: this.fx,
      audio,
      city: this.city,
      player: null as unknown as Player,
      enemies: this.enemies,
      projectiles: this.projectiles,
      time: 0,
      shake: (a) => this.cam.shake(a),
      hitStop: (s) => this.hitStop(s),
      addScore: (n) => {
        this.score += n;
      },
      notify: (t) => this.hud.toast(t),
      spawnPickup: (x, z, kind) => this.pickups.spawn(x, z, kind),
    };
    this.player = new Player(this.ctx);
    this.ctx.player = this.player;
    this.pickups = new PickupManager(this.ctx);
    this.buildMenuSet();

    this.debug = new URLSearchParams(window.location.search).has('debug');
    // a lost GPU context (tab slept, driver reset) must not leave a dead black canvas
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.hud.toast('Графика перезагружается…', 3000);
    });
    canvas.addEventListener('webglcontextrestored', () => {
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.85));
      this.hud.toast('Готово, продолжаем', 1500);
    });
    window.addEventListener('resize', this.onResize);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.phase === 'playing') this.setPaused(true);
    });
  }

  private buildMenuSet() {
    this.menuGroup.clear();
    this.menuTurtles = [];
    TURTLE_ORDER.forEach((id, i) => {
      const rig = this.player.rigs[id];
      rig.root.visible = true;
      const x = -3.6 + i * 2.4;
      rig.root.position.set(0, 0, 0);
      const holder = new THREE.Group();
      holder.position.set(x, 0, 0);
      holder.rotation.y = -0.35 + i * 0.2;
      this.menuGroup.add(holder);
      this.menuGroup.add(this.scene.children.length ? new THREE.Object3D() : new THREE.Object3D());
      // Reparent rigs into the menu lineup (no clones needed for perf)
      holder.add(rig.root);
      this.menuTurtles.push(holder as unknown as THREE.Group);
    });
    this.menuGroup.position.set(0, 0, 14);
    this.scene.add(this.menuGroup);
    this.player.root.visible = false;
  }

  private enterGameplayRigs() {
    // pull the turtle rigs back under the player controller
    TURTLE_ORDER.forEach((id) => {
      const rig = this.player.rigs[id];
      this.player.root.add(rig.root);
      rig.root.position.set(0, 0, 0);
      rig.root.rotation.set(0, 0, 0);
      rig.root.visible = id === this.player.activeId;
    });
    this.menuGroup.visible = false;
    this.player.root.visible = true;
  }

  private enterMenuRigs() {
    this.player.root.visible = false;
    TURTLE_ORDER.forEach((id, i) => {
      const rig = this.player.rigs[id];
      const holder = this.menuTurtles[i];
      holder.add(rig.root);
      rig.root.visible = true;
      rig.root.position.set(0, 0, 0);
      rig.root.rotation.set(0, 0, 0);
      rig.clearFlash();
    });
    this.menuGroup.visible = true;
  }

  /* ------------------------------------------------------------------ */
  /* Level lifecycle                                                     */
  /* ------------------------------------------------------------------ */
  loadLevel(levelId: number) {
    this.setPhase('loading');
    this.level = LEVELS[clamp(levelId, 0, LEVELS.length - 1)];
    this.cleanupWorld();
    this.city = new City(this.scene, this.level);
    this.ctx.city = this.city;
    this.ctx.levelMods = this.level.mods;
    this.pickups.reset();
    this.enemies.length = 0;
    this.projectiles.length = 0;
    this.score = 0;
    this.levelTime = 0;
    this.waveIndex = 0;
    this.waveQueue = [];
    this.waveActive = false;
    this.waveTransition = 0.6;
    this.boss = null;
    this.bossSpawned = false;
    this.noDeathRun = true;
    this.player.reset(true);
    this.enterGameplayRigs();
    if (!this.portal) {
      this.portal = new WavePortal(this.scene);
      this.portal.ctxFx = this.fx;
    }
    this.portal.hide();
    this.player.setTurtle(this.cb.save().selected || 'leo', true);
    for (const id of TURTLE_ORDER) this.player.hp[TURTLE_ORDER.indexOf(id)] = TURTLES[id].maxHp;
    this.cam.yaw = Math.PI;
    this.cam.snap(this.player.pos);
    this.cam.setFocus(null);
    this.introFade = 1;
    this.hud.show(true);
    this.hud.setBoss(false);
    this.setPhase('playing');
    this.showLevelIntro();
    audio.startMusic();
    this.updateObjective();
  }

  private showLevelIntro() {
    const el = document.getElementById('level-intro');
    if (!el) return;
    (document.getElementById('li-kicker') as HTMLElement).textContent = this.level.kicker;
    (document.getElementById('li-title') as HTMLElement).textContent = this.level.name;
    (document.getElementById('li-desc') as HTMLElement).textContent = this.level.desc;
    el.classList.remove('hidden', 'out');
    el.style.opacity = '1';
    window.clearTimeout((this as any)._introT1);
    window.clearTimeout((this as any)._introT2);
    (this as any)._introT1 = window.setTimeout(() => {
      el.classList.add('out');
      (this as any)._introT2 = window.setTimeout(() => {
        el.classList.add('hidden');
        el.classList.remove('out');
      }, 620);
    }, 2300);
  }

  private cleanupWorld() {
    for (const e of this.enemies) e.dispose();
    this.enemies.length = 0;
    for (const p of this.projectiles) {
      this.scene.remove(p.mesh);
    }
    this.projectiles.length = 0;
    this.pickups.reset();
    if (this.city) {
      this.city.dispose();
      this.city = null;
    }
  }

  restartLevel() {
    this.loadLevel(this.level.id);
    this.setPaused(false);
  }

  setPhase(p: GamePhase) {
    this.phase = p;
    this.cb.onPhaseChange(p);
  }

  setPaused(v: boolean) {
    if (v && this.phase === 'playing') {
      this.hideIntro();
      this.setPhase('paused');
      audio.stopMusic();
    } else if (!v && this.phase === 'paused') {
      this.setPhase('playing');
      audio.startMusic();
    }
  }

  /* ------------------------------------------------------------------ */
  /* Waves                                                               */
  /* ------------------------------------------------------------------ */
  private startWave(index: number) {
    const wave = this.level.waves[index];
    if (!wave) return;
    this.waveActive = true;
    this.waveQueue = [];
    for (const e of wave.enemies) {
      for (let i = 0; i < e.count; i++) this.waveQueue.push({ kind: e.kind, count: 1 });
    }
    this.spawnTimer = 0.4;
    if (wave.banner) this.hud.toast(wave.banner, 2200);
    if (this.level.boss && index === this.level.waves.length - 1) this.spawnBoss();
  }

  private showBossBanner() {
    const el = document.getElementById('boss-banner');
    if (!el) return;
    el.classList.remove('hidden', 'out');
    window.clearTimeout((this as any)._bbT1);
    window.clearTimeout((this as any)._bbT2);
    (this as any)._bbT1 = window.setTimeout(() => {
      el.classList.add('out');
      (this as any)._bbT2 = window.setTimeout(() => el.classList.add('hidden'), 520);
    }, 2000);
  }

  private spawnBoss() {
    if (this.bossSpawned) return;
    this.bossSpawned = true;
    this.showBossBanner();
    const b = new Boss(this.ctx, 0, -18);
    b.onSummon = () => {
      this.hud.toast('ШРЕДДЕР ПРИЗЫВАЕТ ПОДКРЕПЛЕНИЕ', 2200);
      for (let i = 0; i < 3; i++) {
        this.spawnEnemy('foot', true);
      }
    };
    this.enemies.push(b);
    this.boss = b;
    this.hud.setBoss(true, 1, 1);
    audio.bossRoar();
    this.cam.shake(0.5);
    this.cam.setFocus(new THREE.Vector3(b.pos.x, 1.6, b.pos.z));
    window.setTimeout(() => {
      this.cam.setFocus(null);
    }, 2400);
    this.fx.ring(b.pos.x, 0.1, b.pos.z, 0xff2a1a, 9);
    this.fx.dust(b.pos.x, 0.1, b.pos.z, 30, 0x552222);
  }

  private spawnEnemy(kind: any, near = false) {
    const p = this.player.pos;
    let x = 0;
    let z = 0;
    for (let attempt = 0; attempt < 18; attempt++) {
      if (near) {
        const ang = Math.random() * Math.PI * 2;
        const r = 4 + Math.random() * 4;
        x = clamp(p.x + Math.cos(ang) * r, -12, 12);
        z = clamp(p.z + Math.sin(ang) * r, -70, 70);
      } else {
        const ang = Math.random() * Math.PI * 2;
        const r = 13 + Math.random() * 8;
        x = clamp(p.x + Math.cos(ang) * r, -11.5, 11.5);
        z = clamp(p.z + Math.sin(ang) * r, -72, 72);
        if (Math.hypot(x - p.x, z - p.z) < 9) continue;
      }
      const e = new Enemy(this.ctx, kind, x, z);
      let bad = false;
      for (const c of this.city!.colliders) {
        if (x > c.minX - 0.8 && x < c.maxX + 0.8 && z > c.minZ - 0.8 && z < c.maxZ + 0.8) {
          bad = true;
          break;
        }
      }
      if (bad) {
        e.dispose();
        continue;
      }
      this.enemies.push(e);
      return;
    }
    const e = new Enemy(this.ctx, kind, clamp(p.x + 12, -11, 11), p.z);
    this.enemies.push(e);
  }

  private updateWaves(dt: number) {
    const totalWaves = this.level.waves.length;

    // ---- boss encounter: stays active until Shredder is down ----
    if (this.level.boss && this.waveIndex === 1) {
      if (!this.bossSpawned) this.spawnBoss();
      if (this.boss && !this.boss.alive && !this.boss.dying) this.finishLevel();
      this.updateObjective();
      return;
    }

    // ---- first wave of the chapter starts on its own ----
    if (!this.waveActive && this.waveIndex === 0 && !this.portal?.active) {
      this.startWave(0);
      this.updateObjective();
      return;
    }

    // ---- between waves: wait for the manhole gate ----
    if (!this.waveActive) {
      if (this.waveIndex < totalWaves) {
        this.portal?.update(dt);
        const inGate = this.portal?.isInside(this.player.pos.x, this.player.pos.z) ?? false;
        this.portalHold = inGate ? this.portalHold + dt : 0;
        if (this.portalHold > 0.25) {
          this.portal?.hide();
          this.portalHold = 0;
          this.waveTransition = 0;
          this.startWave(this.waveIndex);
        }
      }
      this.updateObjective();
      return;
    }

    // spawn queued enemies
    this.spawnTimer -= dt;
    const alive = this.enemies.filter((e) => e.alive && !e.isBoss).length;
    // watchdog: if the queue has been stalled with nothing alive for too long, force-spawn
    if (this.waveQueue.length > 0 && alive === 0) {
      this.emptyWaveTimer += dt;
      if (this.emptyWaveTimer > 1.2) {
        this.emptyWaveTimer = 0;
        this.spawnTimer = 0;
      }
    } else {
      this.emptyWaveTimer = 0;
    }
    if (this.spawnTimer <= 0 && this.waveQueue.length > 0 && alive < this.maxAlive) {
      const next = this.waveQueue.shift()!;
      this.spawnEnemy(next.kind);
      this.spawnTimer = 0.55 + Math.random() * 0.35;
    }

    // ---- wave cleared ----
    const stillAlive = this.enemies.filter((e) => e.alive && !e.isBoss).length;
    if (this.waveQueue.length === 0 && stillAlive === 0) {
      this.waveActive = false;
      this.waveIndex++;
      audio.waveClear();
      if (this.waveIndex >= totalWaves && !this.level.boss) {
        this.hud.toast('ВСЕ ВОЛНЫ ОТБИТЫ', 2000);
        this.finishLevel();
        return;
      }
      this.waveTransition = 1.5;
      this.hud.toast(
        this.level.boss && this.waveIndex >= totalWaves - 1
          ? 'ПОДГОТОВЬСЯ — ШРЕДДЕР ИДЁТ'
          : `ВОЛНА ${this.waveIndex} ОЧИЩЕНА`,
        2000,
      );
      // offer the manhole gate: step in when you are ready
      if (this.portal) {
        const ahead = 3.5;
        const px = clamp(this.player.pos.x + Math.sin(this.player.facing) * ahead, -10, 10);
        const pz = clamp(this.player.pos.z + Math.cos(this.player.facing) * ahead, -70, 70);
        this.portal.showAt(px, pz);
        this.hud.toast('ШАГНИ В ЛЮК, КОГДА БУДЕШЬ ГОТОВ', 2400);
      }
      this.updateObjective();
      return;
    }
    this.updateObjective();
  }

  /** Hard cap of simultaneously living enemies, relaxed further on slow machines. */
  private get maxAlive() {
    return this.lowPerfMode ? 6 : 9;
  }

  private totalEnemiesForLevel() {
    let n = 0;
    for (const w of this.level.waves) for (const e of w.enemies) n += e.count;
    if (this.level.boss) n += 1;
    return Math.max(1, n);
  }

  private updateObjective() {
    const total = this.totalEnemiesForLevel();
    const remainingTotal = this.waveQueue.length + this.enemies.filter((e) => e.alive).length;
    const defeated = clamp(total - remainingTotal, 0, total);
    let sub = `Враги: ${remainingTotal}`;
    if (this.boss && this.boss.alive) sub = `Шреддер: ${Math.ceil((this.boss.hp / this.boss.maxHp) * 100)}% жизни`;
    else if (this.level.boss && !this.bossSpawned) sub = 'Подготовься к встрече';
    this.hud.setObjective(
      this.level.kicker,
      this.level.name,
      sub,
      this.level.boss ? (this.boss ? 1 - this.boss.hp / this.boss.maxHp : defeated / total) : defeated / total,
    );
  }

  /* ------------------------------------------------------------------ */
  /* Game loop                                                           */
  /* ------------------------------------------------------------------ */
  hitStop(sec: number) {
    this.hitStopTimer = Math.max(this.hitStopTimer, sec);
  }

  start() {
    this.running = true;
    this.lastFrame = performance.now();
    const loop = (now: number) => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(loop);
      let dt = (now - this.lastFrame) / 1000;
      this.lastFrame = now;
      if (dt > 0.08) dt = 0.08;
      if (dt < 0) dt = 0;
      this.frameCount++;
      this.fpsTimer += dt;
      if (this.fpsTimer > 1) {
        this.fps = this.frameCount / this.fpsTimer;
        if (this.fps < 42 && !this.lowPerfMode && this.phase === 'playing') {
          this.lowPerfMode = true;
          this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.15));
          this.renderer.shadowMap.enabled = false;
          this.city?.setQualityLow();
        } else if (this.fps > 58 && this.lowPerfMode) {
          // recovered — allow full quality again
          this.lowPerfMode = false;
          this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.85));
          this.renderer.shadowMap.enabled = true;
          this.city?.setQualityHigh();
        }
        this.frameCount = 0;
        this.fpsTimer = 0;
      }
      this.tick(dt);
    };
    this.raf = requestAnimationFrame(loop);
  }

  private tick(dt: number) {
    const rawDt = dt;
    // hit stop
    if (this.hitStopTimer > 0) {
      this.hitStopTimer -= rawDt;
      dt *= 0.12;
    }
    this.time += rawDt;

    const inp = this.input.consume();
    this.input.sample();

    if (inp.help && (this.phase === 'playing' || this.phase === 'paused')) {
      this.onHelpToggle?.();
    }
    if (inp.pause) {
      if (this.phase === 'playing') this.setPaused(true);
      else if (this.phase === 'paused') this.setPaused(false);
    }

    if (this.phase === 'clear') {
      this.updateVictoryScene(rawDt);
      this.renderer.render(this.scene, this.cam.camera);
      return;
    }
    if (this.phase === 'menu' || this.phase === 'over') {
      this.updateMenuScene(rawDt);
      this.renderer.render(this.scene, this.cam.camera);
      return;
    }

    if (this.phase === 'loading') {
      this.cam.update(rawDt, this.player.pos, 0);
      this.renderer.render(this.scene, this.cam.camera);
      return;
    }

    if (this.phase === 'paused') {
      this.renderer.render(this.scene, this.cam.camera);
      return;
    }

    // ---- active gameplay ----
    this.levelTime += dt;
    this.ctx.time = this.time;
    this.city?.update(dt);
    this.portal?.update(dt);

    this.player.update(dt, this.cam.yaw, inp, { light: this.input.isMouseHeld(1) || inp.light });

    // enemies
    for (const e of this.enemies) e.update(dt);
    // purge finished corpses
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (!e.alive && !e.dying) {
        e.dispose();
        this.enemies.splice(i, 1);
      }
    }

    this.updateProjectiles(dt);
    this.pickups.update(dt);
    this.updateWaves(dt);

    // pickups interaction
    const near = this.pickups.nearest();
    if (near) {
      this.hud.setPickupHint(near.kind === 'pizza' ? 'E — съесть пиццу' : near.kind === 'ooze' ? 'E — взять мутаген' : 'E — подобрать кристалл');
      if (inp.interact) this.pickups.collect(near);
    } else {
      this.hud.setPickupHint(null);
    }

    // death / respawn flow
    if (this.player.state === 'ko' && this.player.koTimer <= 0) {
      const nextId = TURTLE_ORDER.find((id) => this.player.hp[TURTLE_ORDER.indexOf(id)] > 0);
      if (nextId) {
        this.noDeathRun = false;
        this.player.respawnAs(nextId);
        this.hud.toast(`${TURTLES[nextId].name.toUpperCase()} В БОЮ!`, 2000);
        // clear nearby enemies so you don't spawn-camp yourself
        for (const e of this.enemies) {
          if (e.alive && Math.hypot(e.pos.x - this.player.pos.x, e.pos.z - this.player.pos.z) < 4) {
            e.pos.x += (e.pos.x - this.player.pos.x) * 2;
            e.pos.z += (e.pos.z - this.player.pos.z) * 2;
          }
        }
      } else {
        this.setPhase('over');
        audio.stopMusic();
        audio.fail();
        this.cb.onGameOver();
        return;
      }
    }

    // camera
    this.cam.update(dt, this.player.pos, inp.camX, {
      playerFacing: this.player.facing,
      moving: Math.hypot(this.player.vel.x, this.player.vel.z) > 1.5,
      inCombat: this.enemies.some((e) => e.alive && Math.hypot(e.pos.x - this.player.pos.x, e.pos.z - this.player.pos.z) < 8),
    });

    // HUD
    this.hud.setScore(this.score);
    this.hud.setCombo(this.player.combo);
    const idx = this.player.activeIndex;
    this.hud.setTurtles(this.player.hp, this.player.energy, idx);
    this.hud.setEnergy(this.player.energy[idx], this.player.specialReady, TURTLES[this.player.activeId].special);
    if (this.boss) {
      this.hud.setBoss(this.boss.alive || this.boss.dying, this.boss.hp / this.boss.maxHp, this.boss.phase);
    }

    // low-health heartbeat vignette
    const lowHp = this.player.hp[this.player.activeIndex] / this.player.maxHp;
    const vig = document.getElementById('vignette');
    if (vig) vig.style.opacity = String(0.75 + (lowHp < 0.3 ? 0.25 * (0.6 + 0.4 * Math.sin(this.time * 6)) : 0));

    this.fx.update(dt);
    this.renderer.render(this.scene, this.cam.camera);
    this.updateDebugOverlay();
  }

  /** Slow orbit around the winning turtle for the results screen. */
  private updateVictoryScene(dt: number) {
    this.ctx.time = this.time;
    this.city?.update(dt);
    this.fx.update(dt);
    for (const e of this.enemies) e.update(dt * 0.6);
    this.pickups.update(dt);
    this.updateVictoryPose(dt);
  }

  private updateVictoryPose(dt: number) {
    // reuse the active rig's idle animation while the camera orbits
    const rig = this.player.rigs[this.player.activeId];
    rig.update(dt, {
      mode: 'victory',
      speed: 0,
      runPhase: 0,
      time: this.time,
      attackPhase: 0,
      attackKind: 'light1',
      hurt: 0,
      ko: 0,
      blocking: false,
      specialSpin: 0,
    });
    const t = this.time * 0.55;
    const c = new THREE.Vector3(this.player.pos.x, 1.35, this.player.pos.z);
    const r = 6.4;
    this.cam.camera.position.set(c.x + Math.sin(t) * r, c.y + 1.5, c.z + Math.cos(t) * r);
    this.cam.camera.lookAt(c.x, 1.25, c.z);
    if (Math.random() < 0.06) {
      this.fx.slash(
        this.player.pos.x + (Math.random() - 0.5) * 2,
        1.2 + Math.random(),
        this.player.pos.z + (Math.random() - 0.5) * 2,
        Math.random() * Math.PI * 2,
        TURTLES[this.player.activeId].color,
        0.8,
      );
    }
  }

  /** Optional diagnostics: open the game with ?debug=1 */
  private updateDebugOverlay() {
    if (!this.debug) return;
    let el = document.getElementById('debug-overlay');
    if (!el) {
      el = document.createElement('div');
      el.id = 'debug-overlay';
      el.style.cssText =
        'position:absolute;right:10px;bottom:10px;z-index:9;font:11px/1.4 monospace;color:#9fe8b0;' +
        'background:rgba(0,0,0,.6);padding:6px 8px;border-radius:6px;pointer-events:none;white-space:pre';
      document.getElementById('app')!.appendChild(el);
    }
    el.textContent = `fps ${this.stats.fps}\nenemies ${this.stats.enemies}${this.stats.lowPerf ? '\nlow-perf mode' : ''}` +
      `\npos ${this.player.pos.x.toFixed(1)} ${this.player.pos.z.toFixed(1)}\nstate ${this.player.state}`;
  }

  onHelpToggle?: () => void;

  private updateProjectiles(dt: number) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.life -= dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      const isWave = (p.mesh as THREE.Mesh).geometry?.type === 'RingGeometry';
      if (isWave) {
        (p.mesh as THREE.Mesh).scale.setScalar(1 + (1.1 - p.life) * 6);
        const spread = 1 + (1.1 - p.life) * 6;
        if (Math.hypot(p.mesh.position.x - this.player.pos.x, p.mesh.position.z - this.player.pos.z) < spread * 1.1 && spread > 1.4) {
          if (this.player.damage(p.damage, Math.atan2(p.mesh.position.x - this.player.pos.x, p.mesh.position.z - this.player.pos.z), 5)) {
            this.fx.hitSpark(this.player.pos.x, 1.2, this.player.pos.z, 0xff3a1a, 1.3);
            p.life = 0;
          }
        }
      } else {
        const d = Math.hypot(p.mesh.position.x - this.player.pos.x, p.mesh.position.z - this.player.pos.z);
        if (d < 0.85 && Math.abs(p.mesh.position.y - 1.1) < 1.5) {
          if (this.player.damage(p.damage, Math.atan2(p.vel.x, p.vel.z), 2.6)) {
            this.fx.hitSpark(p.mesh.position.x, p.mesh.position.y, p.mesh.position.z, 0x2ff0ff, 1.1);
          }
          p.life = 0;
        }
      }
      if (p.mesh.position.x < -15 || p.mesh.position.x > 15 || Math.abs(p.mesh.position.z) > 80) p.life = 0;
      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        const m = p.mesh as THREE.Mesh;
        m.geometry?.dispose();
        (m.material as THREE.Material)?.dispose();
        this.projectiles.splice(i, 1);
      }
    }
  }

  private updateMenuScene(dt: number) {
    this.city?.update(dt);
    this.fx.update(dt);
    // make the lineup breathe and strike idle poses
    this.menuTurtles.forEach((holder, i) => {
      const rig = this.player.rigs[TURTLE_ORDER[i]];
      rig.update(dt, {
        mode: 'idle',
        speed: 0,
        runPhase: 0,
        time: this.time + i * 0.9,
        attackPhase: 0,
        attackKind: 'light1',
        hurt: 0,
        ko: 0,
        blocking: false,
        specialSpin: 0,
      });
      holder.position.y = Math.sin(this.time * 1.2 + i * 0.7) * 0.04;
    });
    this.cam.menuOrbit(this.time, new THREE.Vector3(0, 1.5, 14));
  }

  private finishLevel() {
    if (this.phase !== 'playing') return;
    this.setPhase('clear');
    audio.stopMusic();
    audio.waveClear();
    // par score: what a clean, combo-heavy clear is worth (S rank needs ~par)
    const par = this.level.waves.reduce(
      (acc, w) => acc + w.enemies.reduce((a, e) => a + e.count * 235, 0),
      0,
    ) + (this.level.boss ? 6000 : 0);
    const rank = rankFromScore(this.score, Math.max(1200, par * 1.08));
    const result: ClearResult = {
      levelId: this.level.id,
      score: this.score,
      rank,
      timeSec: this.levelTime,
      kills: this.player.kills,
      maxCombo: this.player.maxCombo,
      damageTaken: Math.round(this.player.damageTakenThisRun),
      noDeaths: this.noDeathRun,
    };
    this.cb.onLevelClear(result);
  }

  hideIntro() {
    this.portal?.hide();
    const el = document.getElementById('level-intro');
    if (!el) return;
    el.classList.add('hidden');
    el.classList.remove('out');
    window.clearTimeout((this as any)._introT1);
    window.clearTimeout((this as any)._introT2);
  }

  showMenu() {
    this.hideIntro();
    this.cleanupWorld();
    this.city = new City(this.scene, { ...LEVELS[0], timeOfDay: 'dusk', seed: 777 });
    this.ctx.city = this.city;
    this.enterMenuRigs();
    this.hud.show(false);
    this.setPhase('menu');
    audio.stopMusic();
  }

  private onResize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.cam.setAspect(w / h);
  };

  get stats() {
    return {
      fps: Math.round(this.fps),
      enemies: this.enemies.length,
      lowPerf: this.lowPerfMode,
    };
  }

  dispose() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.onResize);
    this.cleanupWorld();
    this.renderer.dispose();
  }
}
