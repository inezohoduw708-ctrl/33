/** DOM/bootstrap only (no Game) for model + scene screenshots. */
import { JSDOM } from 'jsdom';
import fs from 'node:fs';
import path from 'node:path';

const html = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');
const dom = new JSDOM(html, { pretendToBeVisual: true, url: 'http://localhost:5173/' });
const w = dom.window as any;

function make2d() {
  const grad = { addColorStop() {} };
  const ctx: any = {
    canvas: null, fillStyle: '', strokeStyle: '', lineWidth: 1, lineCap: '', font: '',
    textAlign: '', textBaseline: '', globalAlpha: 1, shadowColor: '', shadowBlur: 0,
    fillRect() {}, strokeRect() {}, clearRect() {}, fillText() {}, strokeText() {},
    beginPath() {}, moveTo() {}, lineTo() {}, quadraticCurveTo() {}, arc() {}, closePath() {},
    stroke() {}, fill() {}, save() {}, restore() {}, translate() {}, rotate() {}, scale() {},
    createRadialGradient: () => grad, createLinearGradient: () => grad,
    getImageData: (x: number, y: number, ww = 1, hh = 1) => ({ data: new Uint8ClampedArray(Math.max(1, ww * hh * 4)), width: ww, height: hh }),
    putImageData() {}, drawImage() {}, setTransform() {}, measureText: () => ({ width: 10 }),
  };
  return ctx;
}
w.HTMLCanvasElement.prototype.getContext = function (type: string) {
  if (type === '2d') { const c = make2d(); c.canvas = this; return c; }
  return null;
};

for (const k of ['window', 'document', 'localStorage', 'HTMLCanvasElement', 'HTMLElement', 'requestAnimationFrame', 'cancelAnimationFrame', 'getComputedStyle', 'Image', 'Event', 'KeyboardEvent', 'MouseEvent', 'PointerEvent', 'SVGElement', 'DocumentFragment']) {
  if (w[k] === undefined) continue;
  try { (globalThis as any)[k] = w[k]; } catch {}
}
(globalThis as any).matchMedia = (q: string) => ({ matches: false, media: q, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false });
(globalThis as any).self = w;
(globalThis as any).window = w;
(globalThis as any).requestAnimationFrame = (cb: any) => setTimeout(() => cb(performance.now()), 0);
if (!(globalThis as any).navigator) (globalThis as any).navigator = w.navigator;
