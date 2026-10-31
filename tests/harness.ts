/**
 * Headless smoke test harness for the game logic.
 * jsdom provides DOM + canvas, WebGLRenderer & AudioContext are stubbed,
 * so the real simulation (waves, combat, boss, saves) is exercised for real.
 */
import { JSDOM } from 'jsdom';
import fs from 'node:fs';
import path from 'node:path';

const html = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');
const dom = new JSDOM(html, { pretendToBeVisual: true, url: 'http://localhost:5173/' });
const w = dom.window as any;

/* ---------- canvas 2d stub (real enough for our procedural textures) ---------- */
function make2d() {
  const grad = { addColorStop() {} };
  const ctx: any = {
    canvas: null,
    fillStyle: '', strokeStyle: '', lineWidth: 1, lineCap: '', font: '', textAlign: '',
    textBaseline: '', globalAlpha: 1, shadowColor: '', shadowBlur: 0,
    fillRect() {}, strokeRect() {}, clearRect() {}, fillText() {}, strokeText() {},
    beginPath() {}, moveTo() {}, lineTo() {}, quadraticCurveTo() {}, arc() {}, closePath() {},
    stroke() {}, fill() {}, save() {}, restore() {}, translate() {}, rotate() {}, scale() {},
    createRadialGradient: () => grad,
    createLinearGradient: () => grad,
    getImageData: (x: number, y: number, ww = 1, hh = 1) => ({
      data: new Uint8ClampedArray(Math.max(1, ww * hh * 4)),
      width: ww, height: hh,
    }),
    putImageData() {}, drawImage() {}, setTransform() {}, measureText: () => ({ width: 10 }),
  };
  return ctx;
}
w.HTMLCanvasElement.prototype.getContext = function (type: string) {
  if (type === '2d') {
    const c = make2d();
    c.canvas = this;
    return c;
  }
  return null; // no WebGL — renderer is stubbed
};

/* ---------- globals the bundle expects ---------- */
for (const k of [
  'window', 'document', 'localStorage', 'HTMLCanvasElement', 'HTMLElement',
  'requestAnimationFrame', 'cancelAnimationFrame', 'matchMedia', 'getComputedStyle',
  'Image', 'Audio', 'Event', 'KeyboardEvent', 'MouseEvent', 'PointerEvent', 'CanvasTexture',
  'WebGLRenderingContext', 'WebGL2RenderingContext', 'SVGElement', 'DocumentFragment',
]) {
  if (w[k] === undefined) continue;
  try {
    (globalThis as any)[k] = w[k];
  } catch {
    /* read-only globals (navigator) are fine on Node 22 */
  }
}
(globalThis as any).matchMedia = (q: string) => ({
  matches: false,
  media: q,
  onchange: null,
  addListener() {},
  removeListener() {},
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent: () => false,
});
(globalThis as any).self = w;
(globalThis as any).window = w;
(globalThis as any).requestAnimationFrame = (cb: any) => setTimeout(() => cb(performance.now()), 0);
(globalThis as any).cancelAnimationFrame = (id: any) => clearTimeout(id);
if (!(globalThis as any).navigator) (globalThis as any).navigator = w.navigator;
try {
  Object.defineProperty(globalThis.navigator, 'userAgent', { value: 'node', configurable: true });
} catch {}

/* ---------- stub the renderer + audio so headless runs ---------- */
import { Game, rendererFactory } from '../src/game/game';
import { audio } from '../src/core/audio';


// stub the renderer factory before Game is constructed
rendererFactory.create = () =>
  ({
    domElement: document.createElement('canvas'),
    shadowMap: { enabled: false, type: 0 },
    outputColorSpace: '',
    toneMapping: 0,
    toneMappingExposure: 1,
    capabilities: { isWebGL2: true, maxTextureSize: 4096 },
    setPixelRatio() {},
    setSize() {},
    render() {},
    dispose() {},
    getContext() { return null; },
  }) as any;

(audio as any).init = () => {};
(audio as any).resume = () => {};
(audio as any).startMusic = () => {};
(audio as any).dispose = () => {};
for (const fn of ['swing','hit','block','jump','dash','pickup','select','enemyHit','enemyDie','hurt','combo','special','bossRoar','waveClear','fail','ui']) {
  (audio as any)[fn] = () => {};
}

export { Game, dom, w };
