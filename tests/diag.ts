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
for (let i = 0; i < 60 * 20; i++) {
  const alive = game.enemies.filter((e) => e.alive);
  let best: any = null; let bd = Infinity;
  for (const e of alive) { const d = Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z); if (d < bd) { bd = d; best = e; } }
  if (best) {
    (game as any).cam.yaw = Math.atan2(best.pos.x - p.pos.x, best.pos.z - p.pos.z) + Math.PI;
    st.moveZ = bd > 2.2 ? 1 : 0;
    st.moveX = 0;
    st.light = bd < 3.2;
  }
  (game as any).tick(1 / 60);
  if (i % 120 === 0) {
    console.log(`t=${(i / 60).toFixed(0)}s pos=(p ${p.pos.x.toFixed(1)},${p.pos.z.toFixed(1)}) enemies=${alive.length} nearest=${bd.toFixed(2)} ` +
      `enemyPos=${best ? best.pos.x.toFixed(1) + ',' + best.pos.z.toFixed(1) : '-'} enemyHp=${best ? Math.round(best.hp) : '-'} ` +
      `state=${best ? (best as any).state : '-'} kills=${p.kills} combo=${p.combo} pState=${p.state}`);
  }
}
