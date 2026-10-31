/** Bot playthrough: proves every chapter (incl. Shredder) can be finished. */
import './harness-noaudio';
import { Game, rendererFactory } from '../src/game/game';
import type { ClearResult } from '../src/game/game';
import { LEVELS } from '../src/game/levels';
import { TURTLE_ORDER } from '../src/core/utils';

rendererFactory.create = () =>
  ({
    domElement: document.createElement('canvas'),
    shadowMap: { enabled: false, type: 0 },
    outputColorSpace: '', toneMapping: 0, toneMappingExposure: 1,
    setPixelRatio() {}, setSize() {}, render() {}, dispose() {},
  }) as any;

const canvas = document.getElementById('game') as HTMLCanvasElement;
const results: ClearResult[] = [];
let over = false;
const save: any = { version: 1, unlocked: 4, currentLevel: 0, bestScore: 0, bestRanks: {}, totalKills: 0, sound: false, selected: 'leo', playedSeconds: 0 };

const game = new Game(canvas, {
  onLevelClear: (r) => results.push(r),
  onGameOver: () => { over = true; },
  onPhaseChange: () => {},
  save: () => save,
  persist: () => {},
});

const bot = (t: number) => {
  const st: any = (game as any).input.state;
  const p = game.player;
  const alive = game.enemies.filter((e) => e.alive);
  // presses are consumed by the game each frame, so clear movement but re-raise actions
  st.moveX = 0; st.moveZ = 0; st.light = false; st.heavy = false;
  if (!alive.length) {
    // head to the manhole gate to start the next wave
    const gate: any = (game as any).portal;
    if (gate && gate.active) {
      (game as any).cam.yaw = Math.atan2(gate.pos.x - p.pos.x, gate.pos.z - p.pos.z);
      st.moveZ = 1;
    }
    return;
  }
  let best = alive[0];
  let bd = Infinity;
  for (const e of alive) {
    const d = Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z);
    if (d < bd) { bd = d; best = e; }
  }
  // camera sits opposite the enemy so camera-forward (W) points at the target
  (game as any).cam.yaw = Math.atan2(best.pos.x - p.pos.x, best.pos.z - p.pos.z);
  if (bd > 2.2) { st.moveX = 0; st.moveZ = 1; }
  if (bd < 3.2) st.light = Math.random() < 0.8;
  if (bd < 3.0 && Math.random() < 0.02) st.heavy = true;
  if (p.specialReady && Math.random() < 0.06) st.special = true;
  // defensive: dash when a telegraph is coming
  const threatened = alive.some((e) => Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z) < 2.8 && (e as any).state === 'windup');
  if (threatened && Math.random() < 0.6) st.dash = true;
  // heal when low: grab pizza if any is nearby
  if (p.hp[p.activeIndex] < p.maxHp * 0.5) {
    const near = game.pickups.nearest();
    if (near) st.interact = true;
  }
  // rotate turtles when badly hurt
  if (p.hp[p.activeIndex] < p.maxHp * 0.3 && Math.random() < 0.08) st.swap = true;
  void t;
};

const step = (seconds: number) => {
  const n = Math.round(seconds * 60);
  for (let i = 0; i < n; i++) {
    if (game.phase !== 'playing') return;
    bot(i / 60);
    (game as any).tick(1 / 60);
  }
};

for (const level of LEVELS) {
  over = false;
  game.loadLevel(level.id);
  let elapsed = 0;
  const limit = level.boss ? 240 : 120;
  while (game.phase === 'playing' && elapsed < limit) {
    step(2);
    elapsed += 2;
  }
  const r = results[results.length - 1];
  console.log(
    `${level.kicker} ${level.name}: phase=${game.phase} elapsed=${elapsed}s ` +
      `score=${r?.score ?? game.score} rank=${r?.rank ?? '-'} kills=${game.player.kills} combo=${game.player.maxCombo} ` +
      `hp=${game.player.hp.map((x: number) => Math.round(x)).join('/')} gameOver=${over}`,
  );
  if (!r) {
    const wave = (game as any);
    console.log('  DEBUG waveIndex=' + wave.waveIndex + ' queue=' + wave.waveQueue.length +
      ' waveActive=' + wave.waveActive + ' transition=' + wave.waveTransition +
      ' aliveEnemies=' + game.enemies.filter((e) => e.alive).length +
      ' allEnemies=' + game.enemies.length +
      ' playerState=' + game.player.state + ' hp=' + game.player.hp.join('/') +
      ' bossSpawned=' + wave.bossSpawned);
    throw new Error(`chapter ${level.id} did not finish (phase=${game.phase})`);
  }
}

if (results.length !== LEVELS.length) throw new Error('not every chapter produced a result');
console.log('\nall chapters cleared:', results.map((r) => `${r.rank}(${r.score})`).join(' '));
console.log('PLAYTHROUGH PASSED');
process.exit(0);
