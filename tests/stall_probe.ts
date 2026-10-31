import './harness-noaudio';
import { Game, rendererFactory } from '../src/game/game';
rendererFactory.create = () => ({ domElement: document.createElement('canvas'), shadowMap: { enabled: false, type: 0 }, outputColorSpace: '', toneMapping: 0, toneMappingExposure: 1, setPixelRatio() {}, setSize() {}, render() {}, dispose() {} }) as any;
const game = new Game(document.getElementById('game') as HTMLCanvasElement, {
  onLevelClear: () => {}, onGameOver: () => {}, onPhaseChange: () => {},
  save: () => ({ selected: 'leo' } as any), persist: () => {},
});
const g: any = game;
game.loadLevel(2);
const p = game.player;
const st: any = g.input.state;
for (let i = 0; i < 60 * 100; i++) {
  const alive = game.enemies.filter((e) => e.alive);
  let best: any = null; let bd = Infinity;
  for (const e of alive) { const d = Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z); if (d < bd) { bd = d; best = e; } }
  if (best) {
    g.cam.yaw = Math.atan2(best.pos.x - p.pos.x, best.pos.z - p.pos.z);
    st.moveZ = bd > 2.3 ? 1 : 0;
    st.light = bd < 3.2;
  }
  g.tick(1 / 60);
  if (i % 300 === 0) {
    console.log(`t=${(i/60)|0}s wave=${g.waveIndex} queue=${g.waveQueue.length} active=${g.waveActive} trans=${g.waveTransition} ` +
      `enemies=${game.enemies.map((e) => `${e.kind}@${e.pos.x.toFixed(0)},${e.pos.z.toFixed(0)}:${e.state}:${Math.round(e.hp)}`).join(' | ')} ` +
      `player=${p.pos.x.toFixed(0)},${p.pos.z.toFixed(0)}:${p.state} bd=${bd.toFixed(1)}`);
  }
}
process.exit(0);
