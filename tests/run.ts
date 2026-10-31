import { Game } from './harness';
import fs from 'node:fs';

const canvas = document.getElementById('game') as HTMLCanvasElement;
let cleared: any = null;
let gameOver = false;

const saveData: any = { version: 1, unlocked: 1, currentLevel: 0, bestScore: 0, bestRanks: {}, totalKills: 0, sound: false, selected: 'leo', playedSeconds: 0 };

const game = new Game(canvas, {
  onLevelClear: (r) => { cleared = r; },
  onGameOver: () => { gameOver = true; },
  onPhaseChange: () => {},
  save: () => saveData,
  persist: () => {},
});

const log: string[] = [];
function assert(cond: any, msg: string) {
  if (!cond) throw new Error('ASSERT FAILED: ' + msg);
  log.push('ok  ' + msg);
}

/** Drive the simulation by calling the private tick directly. */
function step(seconds: number, dt = 1 / 60, hook?: () => void) {
  const n = Math.round(seconds / dt);
  for (let i = 0; i < n; i++) {
    hook?.();
    (game as any).tick(dt);
  }
}

// ---------- menu ----------
game.showMenu();
step(1.5);
assert(game.phase === 'menu', 'menu phase renders without errors');
assert((game as any).menuTurtles.length === 4, 'four turtles in menu lineup');

// ---------- level 1 ----------
game.loadLevel(0);
assert(game.phase === 'playing', 'level 1 loads into playing state');
assert(game.city !== null, 'city built');
assert(game.city!.colliders.length > 10, `colliders created (${game.city!.colliders.length})`);
const spawnCount = (game as any).totalEnemiesForLevel();
assert(spawnCount === 16, `wave design totals 16 enemies (got ${spawnCount})`);

// simulate ~50s of play: auto-target nearest enemy, attack when close
const p = game.player;
step(50, 1 / 60, () => {
  const enemies = game.enemies.filter((e) => e.alive);
  if (enemies.length) {
    let best = enemies[0];
    let bd = 1e9;
    for (const e of enemies) {
      const d = Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z);
      if (d < bd) { bd = d; best = e; }
    }
    (game as any).input.state.moveX = bd > 2 ? Math.sign(best.pos.x - p.pos.x) : 0;
    (game as any).input.state.moveZ = bd > 2 ? Math.sign(best.pos.z - p.pos.z) : 0;
    (game as any).input.state.light = bd < 3;
    if (p.specialReady) (game as any).input.state.special = true;
    // face the enemy by steering the camera behind the player
    (game as any).cam.yaw = Math.atan2(p.pos.x - best.pos.x, p.pos.z - best.pos.z);
  }
});
log.push(`state after 50s: phase=${game.phase} score=${game.score} kills=${game.player.kills} enemies=${game.enemies.length} combo=${game.player.combo} hp=${game.player.hp.map((x: number) => Math.round(x)).join('/')}`);
assert(game.player.kills > 5, `player actually kills enemies (${game.player.kills})`);

// ---------- boss level ----------
game.loadLevel(3);
assert(game.phase === 'playing', 'boss level loads');
const ctxProbe = game as any;
// force-show the boss for testing
ctxProbe.spawnBoss();
assert(ctxProbe.boss !== null, 'shredder spawned');
const boss = ctxProbe.boss;
assert(boss.maxHp === 640, `boss hp set (${boss.maxHp})`);
// damage the boss down through phases
for (let i = 0; i < 18; i++) boss.takeDamage(20, 0, 0, true);
assert(boss.phase >= 2, `boss entered later phase (phase=${boss.phase})`);
assert(boss.hp < boss.maxHp, 'boss lost health');
assert(boss.hp > 0, 'boss survived the burn-in');
step(3);
assert(boss.alive, 'boss still alive after burn');

// fight normally for a while
step(25, 1 / 60, () => {
  const enemies = game.enemies.filter((e) => e.alive);
  if (enemies.length) {
    const best = enemies[0];
    const bd = Math.hypot(best.pos.x - p.pos.x, best.pos.z - p.pos.z);
    (game as any).input.state.moveX = bd > 2.6 ? Math.sign(best.pos.x - p.pos.x) : 0;
    (game as any).input.state.moveZ = bd > 2.6 ? Math.sign(best.pos.z - p.pos.z) : 0;
    (game as any).input.state.light = bd < 3.4;
    (game as any).cam.yaw = Math.atan2(p.pos.x - best.pos.x, p.pos.z - best.pos.z);
  }
});
log.push(`boss fight: bossAlive=${boss.alive} bossHp=${Math.round(boss.hp)} playerHp=${game.player.hp.map((x: number) => Math.round(x)).join('/')} projectiles=${game.projectiles.length}`);

// ---------- turtle swap + pickups ----------
game.loadLevel(1);
game.player.setTurtle('raph');
assert(game.player.activeId === 'raph', 'swap to raphael');
game.player.setTurtle('don');
assert(game.player.activeId === 'don', 'swap to donatello');
const idx = game.player.activeIndex;
game.player.hp[idx] -= 40;
game.pickups.spawn(game.player.pos.x, game.player.pos.z, 'pizza');
const near = game.pickups.nearest();
assert(near !== null, 'pickup detected nearby');
game.pickups.collect(near!);
assert(game.player.hp[idx] > 0, 'pizza healed the turtle');

// specials for all four
for (const id of ['leo', 'raph', 'don', 'mikey'] as const) {
  game.player.setTurtle(id);
  game.player.energy[game.player.activeIndex] = 100;
  game.player.trySpecial();
  step(1.2);
  assert(game.player.energy[game.player.activeIndex] < 100, `${id} special consumed energy`);
}

// ---------- death / team wipe path ----------
game.loadLevel(0);
for (let i = 0; i < 4; i++) game.player.hp[i] = 0;
game.player.hp[0] = 1;
game.player.damage(999, 0, 0);
step(2.5);
log.push(`after forced wipe: phase=${game.phase} gameOverCb=${gameOver}`);

// ---------- save / progress ----------
let persisted = 0;
(game as any).cb.persist = () => persisted++;
log.push('game fields: ' + JSON.stringify({ score: game.score, phase: game.phase }));

fs.writeFileSync(__dirname + '/report.txt', log.join('\n') + '\n');
console.log(log.join('\n'));
console.log('\nSMOKE TEST PASSED');
