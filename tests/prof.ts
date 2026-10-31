import './harness-noaudio';
import { Game, rendererFactory } from '../src/game/game';
rendererFactory.create = () => ({ domElement: document.createElement('canvas'), shadowMap: { enabled: false, type: 0 }, outputColorSpace: '', toneMapping: 0, toneMappingExposure: 1, setPixelRatio() {}, setSize() {}, render() {}, dispose() {} }) as any;
const game = new Game(document.getElementById('game') as HTMLCanvasElement, {
  onLevelClear: () => {}, onGameOver: () => {}, onPhaseChange: () => {},
  save: () => ({ selected: 'leo' } as any), persist: () => {},
});
game.loadLevel(0);
const p = game.player;
const st: any = (game as any).input.state;
const t0 = performance.now();
let worst = 0;
for (let i = 0; i < 60 * 12; i++) {
  const alive = game.enemies.filter((e) => e.alive);
  let best: any = null; let bd = Infinity;
  for (const e of alive) { const d = Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z); if (d < bd) { bd = d; best = e; } }
  if (best) {
    (game as any).cam.yaw = Math.atan2(best.pos.x - p.pos.x, best.pos.z - p.pos.z);
    st.moveZ = bd > 2.2 ? 1 : 0;
    st.light = bd < 3.2;
  }
  const s = performance.now();
  (game as any).tick(1 / 60);
  const el = performance.now() - s;
  if (i > 30) worst = Math.max(worst, el);
}
const total = performance.now() - t0;
console.log(`sim 720 frames in ${(total / 1000).toFixed(1)}s → ${(total / 720).toFixed(2)} ms/frame, worst ${worst.toFixed(1)}ms`);
process.exit(0);
console.log(`kills=${p.kills} enemies=${game.enemies.length} phase=${game.phase} tick=${(game as any).waveIndex}`);
