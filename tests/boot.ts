/** Boot the real entry point (main.ts) in jsdom and click through the UI. */
import './harness-noaudio';
import { rendererFactory } from '../src/game/game';

rendererFactory.create = () =>
  ({
    domElement: document.createElement('canvas'),
    shadowMap: { enabled: false, type: 0 },
    outputColorSpace: '',
    toneMapping: 0,
    toneMappingExposure: 1,
    setPixelRatio() {},
    setSize() {},
    render() {},
    dispose() {},
  }) as any;

// AudioContext stub so AudioKit.init() succeeds with a no-op graph
const node = () => ({
  connect: (x: any) => x,
  disconnect() {},
  gain: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {} },
  frequency: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} },
  Q: { value: 0 },
  threshold: { value: 0 },
  ratio: { value: 0 },
  playbackRate: { value: 1 },
  start() {},
  stop() {},
  buffer: null,
  type: '',
});
(globalThis as any).AudioContext = class {
  currentTime = 0;
  state = 'running';
  destination = node();
  sampleRate = 44100;
  createGain() { return node(); }
  createDynamicsCompressor() { return node(); }
  createBiquadFilter() { return node(); }
  createBufferSource() { return node(); }
  createOscillator() { return node(); }
  createBuffer() { return { getChannelData: () => new Float32Array(44100) }; }
  resume() { return Promise.resolve(); }
  close() { return Promise.resolve(); }
};
(globalThis as any).webkitAudioContext = (globalThis as any).AudioContext;

const errors: string[] = [];
const origError = console.error;
console.error = (...a: any[]) => {
  const parts = a.map((x) => (x && x.stack ? x.stack : String(x)));
  errors.push(parts.join(' '));
  origError(...parts);
};

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function click(id: string) {
  const el = document.getElementById(id) as HTMLElement;
  if (!el) throw new Error('missing element #' + id);
  el.dispatchEvent(new (window as any).MouseEvent('click', { bubbles: true }));
}

function visible(id: string) {
  const el = document.getElementById(id)!;
  return !el.classList.contains('hidden');
}

async function main() {
  // boot the real app
  await import('../src/main');
  await wait(60);
  console.log('errors after boot:', errors.length, errors.slice(0, 3));

  const assert = (c: any, m: string) => {
    if (!c) throw new Error('ASSERT: ' + m);
    console.log('ok  ' + m);
  };

  assert(visible('loading') || visible('menu') || visible('help'), 'an initial screen is visible');

  // let the fake loader finish
  await wait(2600);
  assert(visible('menu') || visible('help'), 'menu reached after loading');

  // close onboarding help if it opened
  if (visible('help')) {
    const back = document.querySelector('#help [data-back]') as HTMLElement;
    back.dispatchEvent(new (window as any).MouseEvent('click', { bubbles: true }));
    await wait(50);
  }
  assert(visible('menu'), 'menu visible after closing tutorial');

  // open levels panel, start chapter 1
  click('btn-levels');
  await wait(30);
  assert(visible('levels'), 'levels screen opens');
  const cards = document.querySelectorAll('#level-grid .level-card');
  assert(cards.length === 4, 'four chapter cards rendered');
  (cards[0] as HTMLElement).dispatchEvent(new (window as any).MouseEvent('click', { bubbles: true }));
  await wait(700);
  assert(!visible('levels'), 'level select closes on pick');
  assert(!document.getElementById('hud')!.classList.contains('hidden'), 'HUD visible during play');
  assert(document.getElementById('level-intro') !== null, 'level intro overlay exists');

  // keyboard: walk forward & attack via real events
  for (let i = 0; i < 20; i++) {
    window.dispatchEvent(new (window as any).KeyboardEvent('keydown', { code: 'KeyW' }));
    await wait(16);
  }
  window.dispatchEvent(new (window as any).KeyboardEvent('keyup', { code: 'KeyW' }));
  window.dispatchEvent(new (window as any).KeyboardEvent('keydown', { code: 'KeyJ' }));
  await wait(400);

  // pause / resume through the DOM
  window.dispatchEvent(new (window as any).KeyboardEvent('keydown', { code: 'Escape' }));
  await wait(120);
  assert(visible('pause'), 'pause screen opens with Esc');
  click('btn-resume');
  await wait(80);
  assert(!visible('pause'), 'resume closes pause');

  // progression: fresh save exposes exactly one unlocked chapter
  click('btn-levels');
  await wait(40);
  const gridNow = document.getElementById('level-grid')!;
  const cardsAfter = gridNow.querySelectorAll('.level-card');
  const unlockedCount = Array.from(cardsAfter).filter((c) => !c.classList.contains('locked')).length;
  assert(unlockedCount === 1, `fresh save unlocks exactly 1 chapter (got ${unlockedCount})`);

  // let the game simulate ~4s of real frames
  await wait(4000);

  // back to menu via pause
  window.dispatchEvent(new (window as any).KeyboardEvent('keydown', { code: 'Escape' }));
  await wait(150);
  if (visible('pause')) {
    click('btn-quit');
    await wait(300);
  }
  assert(visible('menu'), 'quit returns to the menu');

  // persistence: localStorage should hold a save
  const raw = localStorage.getItem('tmnt-shadows-ny-v1');
  assert(!!raw, 'save written to localStorage');
  console.log('save:', raw?.slice(0, 160));

  console.log('uncaught console errors:', errors.length);
  if (errors.length) console.log(errors.join('\n---\n').slice(0, 4000));
  console.log('\nBOOT TEST PASSED');
  process.exit(0);
}

main().catch((e) => {
  console.error('BOOT TEST FAILED', e);
  console.log(errors.join('\n---\n').slice(0, 3000));
  process.exit(1);
});
