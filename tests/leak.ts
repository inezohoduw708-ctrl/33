import './harness-noaudio';
import { Game, rendererFactory } from '../src/game/game';
rendererFactory.create = () => ({ domElement: document.createElement('canvas'), shadowMap: { enabled: false, type: 0 }, outputColorSpace: '', toneMapping: 0, toneMappingExposure: 1, setPixelRatio() {}, setSize() {}, render() {}, dispose() {} }) as any;
const game = new Game(document.getElementById('game') as HTMLCanvasElement, {
  onLevelClear: () => {}, onGameOver: () => {}, onPhaseChange: () => {},
  save: () => ({ selected: 'raph' } as any), persist: () => {},
});
const g: any = game;
const counts: number[] = [];
for (let i = 0; i < 8; i++) {
  game.loadLevel(i % 4);
  for (let k = 0; k < 120; k++) g.tick(1 / 60);
  counts.push(game.scene.children.length);
}
console.log('scene children per load:', counts.join(' '));
const worst = Math.max(...counts);
if (worst > counts[0] + 12) throw new Error('scene growth detected: ' + JSON.stringify(counts));
// long simulated fight for stability
game.loadLevel(1);
const p = game.player;
const st: any = g.input.state;
for (let i = 0; i < 60 * 90; i++) {
  const alive = game.enemies.filter((e) => e.alive);
  let best: any = null, bd = Infinity;
  for (const e of alive) { const d = Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z); if (d < bd) { bd = d; best = e; } }
  if (best) {
    g.cam.yaw = Math.atan2(best.pos.x - p.pos.x, best.pos.z - p.pos.z);
    st.moveZ = bd > 2.3 ? 1 : 0;
    st.light = bd < 3.2;
    if (Math.random() < 0.03) st.heavy = true;
    if (Math.random() < 0.03) st.dash = true;
    if (Math.random() < 0.02) st.jump = true;
    if (Math.random() < 0.03) st.swap = true;
    if (p.specialReady && Math.random() < 0.1) st.special = true;
    if (Math.random() < 0.05) st.swapIndex = Math.floor(Math.random() * 4);
  } else {
    const gate = g.portal;
    if (gate?.active) { g.cam.yaw = Math.atan2(gate.pos.x - p.pos.x, gate.pos.z - p.pos.z); st.moveZ = 1; }
  }
  g.tick(1 / 60);
}
console.log('90s random-input run ok: phase=' + game.phase + ' score=' + game.score +
  ' hp=' + p.hp.map((x: number) => Math.round(x)).join('/') + ' enemies=' + game.enemies.length +
  ' particles=' + g.fx.particles.length + ' projectiles=' + game.projectiles.length +
  ' pickups=' + game.pickups.list.length);
console.log('LEAK/STABILITY PASSED');
process.exit(0);
