import './harness-noaudio';
import { Game, rendererFactory } from '../src/game/game';
rendererFactory.create = () => ({ domElement: document.createElement('canvas'), shadowMap: { enabled: false, type: 0 }, outputColorSpace: '', toneMapping: 0, toneMappingExposure: 1, setPixelRatio() {}, setSize() {}, render() {}, dispose() {} }) as any;
const game = new Game(document.getElementById('game') as HTMLCanvasElement, {
  onLevelClear: () => {}, onGameOver: () => { console.log('GAME OVER'); }, onPhaseChange: () => {},
  save: () => ({ selected: 'leo' } as any), persist: () => {},
});
game.loadLevel(3);
const p = game.player;
const st: any = (game as any).input.state;
const g: any = game;
for (let i = 0; i < 60 * 40; i++) {
  const boss = g.boss;
  const alive = game.enemies.filter((e) => e.alive);
  const target = boss && boss.alive ? boss : alive[0];
  if (target) {
    const bd = Math.hypot(target.pos.x - p.pos.x, target.pos.z - p.pos.z);
    g.cam.yaw = Math.atan2(target.pos.x - p.pos.x, target.pos.z - p.pos.z);
    st.moveZ = bd > 2.4 ? 1 : 0;
    st.light = bd < 3.4;
  }
  g.tick(1 / 60);
  if (i % 180 === 0) {
    console.log(`t=${(i/60)|0}s phase=${game.phase} wave=${g.waveIndex} queue=${g.waveQueue.length} active=${g.waveActive} ` +
      `boss=${boss ? `alive=${boss.alive} hp=${Math.round(boss.hp)} state=${(boss as any).state} dying=${boss.dying}` : 'none'} ` +
      `enemies=${game.enemies.length} pState=${p.state} hp=${p.hp.map((x: number) => Math.round(x)).join('/')} pos=${p.pos.x.toFixed(0)},${p.pos.z.toFixed(0)}`);
  }
}
process.exit(0);
