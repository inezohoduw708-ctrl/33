import './harness-noaudio';
import { Game, rendererFactory } from '../src/game/game';
rendererFactory.create = () => ({ domElement: document.createElement('canvas'), shadowMap: { enabled: false, type: 0 }, outputColorSpace: '', toneMapping: 0, toneMappingExposure: 1, setPixelRatio() {}, setSize() {}, render() {}, dispose() {} }) as any;
const game = new Game(document.getElementById('game') as HTMLCanvasElement, {
  onLevelClear: () => {}, onGameOver: () => {}, onPhaseChange: () => {},
  save: () => ({ selected: 'leo' } as any), persist: () => {},
});
const g: any = game;
game.loadLevel(0);
for (let i = 0; i < 60 * 6; i++) g.tick(1 / 60);
console.log('after 6s: portalExists=', !!g.portal, 'active=', g.portal?.active, 'groupVisible=', g.portal?.group.visible,
  'waveIndex=', g.waveIndex, 'waveActive=', g.waveActive, 'queue=', g.waveQueue.length, 'enemies=', game.enemies.length);
process.exit(0);
