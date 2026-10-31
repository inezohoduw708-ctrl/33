import './style.css';
import { Game, type ClearResult } from './game/game';
import { LEVELS } from './game/levels';
import { audio } from './core/audio';
import { TURTLES, TURTLE_ORDER, STORAGE_KEY, fmt } from './core/utils';
import type { SaveData } from './types';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const defaultSave = (): SaveData => ({
  version: 1,
  unlocked: 1,
  currentLevel: 0,
  bestScore: 0,
  bestRanks: {},
  totalKills: 0,
  sound: true,
  selected: 'leo',
  playedSeconds: 0,
});

let save: SaveData = defaultSave();

function readSave() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultSave();
    const parsed = JSON.parse(raw) as Partial<SaveData>;
    return { ...defaultSave(), ...parsed, bestRanks: { ...(parsed.bestRanks ?? {}) } };
  } catch {
    return defaultSave();
  }
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(save));
  } catch {
    /* storage may be blocked (private mode) — game still runs */
  }
}

/* ---------- screen management ---------- */
const screens = ['menu', 'levels', 'help', 'pause', 'clear', 'over', 'loading'] as const;
type Screen = (typeof screens)[number];

function showScreen(name: Screen | null) {
  for (const s of screens) {
    const el = $(s);
    if (!el) continue;
    el.classList.toggle('hidden', s !== name);
  }
}

function toast(text: string, ms = 2200) {
  const el = $('toast');
  el.textContent = text;
  el.classList.remove('hidden');
  el.classList.add('show');
  window.clearTimeout((toast as any)._t);
  (toast as any)._t = window.setTimeout(() => el.classList.remove('show'), ms);
}

/* ---------- bootstrap ---------- */
const canvas = document.getElementById('game') as HTMLCanvasElement;
save = readSave();
audio.setEnabled(save.sound);

let game: Game;
let tutorialOpen = false;

const callbacks = {
  onLevelClear(result: ClearResult) {
    handleLevelClear(result);
  },
  onGameOver() {
    showScreen('over');
  },
  onPhaseChange(phase: string) {
    // keep the DOM in sync with the game phase
    if (phase === 'playing') {
      showScreen(null);
      $('hud').classList.remove('hidden');
      // remember progress the moment a chapter starts
      save.currentLevel = game.level.id;
      save.selected = game.player.activeId;
      persist();
    } else if (phase === 'paused') {
      showScreen('pause');
      renderPauseStats();
      save.selected = game.player.activeId;
      persist();
    } else if (phase === 'menu') {
      showScreen('menu');
      refreshMenu();
    } else if (phase === 'loading') {
      showScreen('loading');
      $('loader-fill').style.width = '100%';
      $('loader-text').textContent = 'Строим Нью-Йорк…';
    } else if (phase === 'clear') {
      $('hud').classList.add('hidden');
    } else if (phase === 'over') {
      $('hud').classList.add('hidden');
    }
    if (phase !== 'playing') {
      // touch UI shouldn't float over menus
      $('touch-ui').classList.toggle('hidden', true);
    } else if (matchMedia('(hover: none) and (pointer: coarse)').matches) {
      $('touch-ui').classList.remove('hidden');
    }
  },
  save: () => save,
  persist: () => persist(),
};

function init() {
  game = new Game(canvas, callbacks);
  game.onHelpToggle = () => {
    if (game.phase === 'playing') {
      game.setPaused(true);
      $('help').dataset.fromGame = '1';
      showScreen('help');
    } else if (game.phase === 'paused' && !$('help').classList.contains('hidden')) {
      $('help').dataset.fromGame = '';
      showScreen('pause');
      renderPauseStats();
    }
  };

  buildMenuCast();
  wireButtons();
  wirePointerLock();
  simulateLoading();
  game.start();
}

function buildMenuCast() {
  const cast = $('menu-cast');
  cast.innerHTML = TURTLE_ORDER.map((id) => {
    const t = TURTLES[id];
    return `<div class="cast-item" style="--accent:${t.css}"><b>${t.name}</b>${t.special} · ${t.specialDesc}</div>`;
  }).join('');
  cast.querySelectorAll<HTMLElement>('.cast-item').forEach((el, i) => {
    el.style.borderLeftColor = TURTLES[TURTLE_ORDER[i]].css;
  });
}

function refreshMenu() {
  const btnContinue = $<HTMLButtonElement>('btn-continue');
  btnContinue.disabled = save.unlocked <= 0;
  const lvl = LEVELS[Math.min(save.currentLevel, LEVELS.length - 1)];
  const started = save.unlocked > 1 || save.bestScore > 0 || save.playedSeconds > 20;
  btnContinue.textContent = started ? `ПРОДОЛЖИТЬ · ${lvl.name.toUpperCase()}` : 'НАЧАТЬ ИГРУ';
  $('menu-progress').textContent = `Глав открыто: ${save.unlocked} / ${LEVELS.length}`;
  $('menu-best').textContent = `Рекорд: ${fmt(save.bestScore)}`;
  $('btn-sound').textContent = `Звук: ${save.sound ? 'вкл' : 'выкл'}`;
}

function buildLevels() {
  const grid = $('level-grid');
  grid.innerHTML = LEVELS.map((l, i) => {
    const locked = i >= save.unlocked;
    const rank = save.bestRanks[String(i)];
    return `<button class="level-card ${locked ? 'locked' : ''}" data-level="${i}" ${locked ? 'disabled' : ''}>
      <div class="lc-num">${l.kicker}</div>
      <div class="lc-name">${l.name}</div>
      <div class="lc-desc">${l.desc}</div>
      ${rank ? `<div class="lc-rank">ЛУЧШИЙ РАНГ: ${rank}</div>` : ''}
    </button>`;
  }).join('');
  grid.querySelectorAll<HTMLButtonElement>('.level-card').forEach((card) => {
    card.addEventListener('click', () => {
      const lv = Number(card.dataset.level);
      audio.resume();
      audio.ui();
      showScreen(null);
      game.loadLevel(lv);
    });
  });
}

function renderPauseStats() {
  const s = game.player;
  $('pause-stats').innerHTML = `
    <div class="stat"><span>Очки</span><b>${fmt(game.score)}</b></div>
    <div class="stat"><span>Время</span><b>${formatTime(game.time)}</b></div>
    <div class="stat"><span>Побеждено</span><b>${s.kills}</b></div>
    <div class="stat"><span>Макс. комбо</span><b>${s.maxCombo}</b></div>
    <div class="stat"><span>Черепашка</span><b>${TURTLES[s.activeId].name}</b></div>
    <div class="stat"><span>Живых</span><b>${s.aliveCount} / 4</b></div>
  `;
}

function formatTime(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function handleLevelClear(result: ClearResult) {
  const totalScore = save.bestScore;
  if (result.score > totalScore) save.bestScore = result.score;
  save.totalKills += result.kills;
  const prevRank = save.bestRanks[String(result.levelId)];
  const order = 'DCBAS';
  const better = !prevRank || order.indexOf(result.rank) > order.indexOf(prevRank);
  if (better) save.bestRanks[String(result.levelId)] = result.rank;
  const nextLevel = result.levelId + 1;
  let unlockedNew = false;
  if (nextLevel < LEVELS.length && save.unlocked < nextLevel + 1) {
    save.unlocked = nextLevel + 1;
    unlockedNew = true;
  }
  save.currentLevel = Math.min(nextLevel, LEVELS.length - 1);
  save.selected = game.player.activeId;
  persist();

  $('clear-rank').textContent = result.rank;
  $('clear-title').textContent =
    result.levelId === LEVELS.length - 1 ? 'ШРЕДДЕР ПОВЕРЖЕН' : 'ГЛАВА ПРОЙДЕНА';
  $('clear-stats').innerHTML = `
    <div class="stat"><span>Очки</span><b>${fmt(result.score)}</b></div>
    <div class="stat"><span>Время</span><b>${formatTime(result.timeSec)}</b></div>
    <div class="stat"><span>Побеждено</span><b>${result.kills}</b></div>
    <div class="stat"><span>Макс. комбо</span><b>${result.maxCombo}</b></div>
    <div class="stat"><span>Урона получено</span><b>${result.damageTaken}</b></div>
    <div class="stat"><span>Без потерь</span><b>${result.noDeaths ? 'ДА' : 'НЕТ'}</b></div>
  `;
  const unlock = $('clear-unlock');
  if (result.levelId === LEVELS.length - 1) {
    unlock.classList.remove('hidden');
    unlock.textContent = 'Клан Фут разбит. Нью-Йорк снова дышит. Спасибо за игру!';
  } else if (unlockedNew) {
    unlock.classList.remove('hidden');
    unlock.textContent = `Открыта новая глава: ${LEVELS[nextLevel].name}`;
  } else {
    unlock.classList.add('hidden');
  }
  const btnNext = $<HTMLButtonElement>('btn-next');
  btnNext.disabled = result.levelId === LEVELS.length - 1;
  btnNext.textContent = result.levelId === LEVELS.length - 1 ? 'ФИНАЛ' : 'СЛЕДУЮЩАЯ ГЛАВА';
  showScreen('clear');
}

function wireButtons() {
  $('btn-continue').addEventListener('click', () => {
    audio.resume();
    audio.ui();
    showScreen(null);
    game.loadLevel(save.currentLevel);
  });
  $('btn-new').addEventListener('click', () => {
    audio.resume();
    audio.ui();
    const fresh = defaultSave();
    fresh.sound = save.sound;
    save = fresh;
    persist();
    showScreen(null);
    game.loadLevel(0);
  });
  $('btn-levels').addEventListener('click', () => {
    audio.ui();
    buildLevels();
    showScreen('levels');
  });
  $('btn-help').addEventListener('click', () => {
    audio.ui();
    $('help').dataset.fromGame = '';
    showScreen('help');
  });
  $('btn-sound').addEventListener('click', () => {
    save.sound = !save.sound;
    audio.setEnabled(save.sound);
    audio.resume();
    audio.ui();
    persist();
    refreshMenu();
  });
  document.querySelectorAll<HTMLElement>('[data-back]').forEach((btn) => {
    btn.addEventListener('click', () => {
      audio.ui();
      const fromGame = $('help').dataset.fromGame === '1';
      $('help').dataset.fromGame = '';
      if (fromGame) {
        game.setPaused(true);
        showScreen('pause');
        renderPauseStats();
      } else {
        showScreen('menu');
      }
      if (tutorialOpen) {
        tutorialOpen = false;
        try {
          localStorage.setItem(STORAGE_KEY + ':onboarded', '1');
        } catch {}
      }
    });
  });

  $('btn-resume').addEventListener('click', () => {
    audio.ui();
    game.setPaused(false);
  });
  $('btn-restart').addEventListener('click', () => {
    audio.ui();
    game.restartLevel();
  });
  $('btn-quit').addEventListener('click', () => {
    audio.ui();
    save.selected = game.player.activeId;
    persist();
    game.showMenu();
  });
  $('btn-next').addEventListener('click', () => {
    audio.ui();
    const next = Math.min(game.level.id + 1, LEVELS.length - 1);
    showScreen(null);
    game.loadLevel(next);
  });
  $('btn-clear-menu').addEventListener('click', () => {
    audio.ui();
    game.showMenu();
  });
  $('btn-retry').addEventListener('click', () => {
    audio.ui();
    showScreen(null);
    game.loadLevel(game.level.id);
  });
  $('btn-over-menu').addEventListener('click', () => {
    audio.ui();
    game.showMenu();
  });

  // keyboard shortcuts for menus
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape') {
      if (!$('levels').classList.contains('hidden') || !$('help').classList.contains('hidden')) {
        const fromGame = $('help').dataset.fromGame === '1';
        $('help').dataset.fromGame = '';
        showScreen(fromGame ? 'pause' : 'menu');
      }
    }
  });

  // resume audio context on any interaction (browser policy)
  const unlockAudio = () => {
    audio.resume();
    if (save.sound) audio.startMusic();
  };
  window.addEventListener('pointerdown', unlockAudio, { once: true });
  window.addEventListener('keydown', unlockAudio, { once: true });
}

function wirePointerLock() {
  // keep the cursor visible; right-drag / arrow keys orbit the camera
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('pointerdown', (e) => {
    if (game.phase === 'playing' && e.button === 0) {
      const el = document.getElementById('hint-chips');
      if (el) el.style.opacity = '0.45';
    }
  });
}

function simulateLoading() {
  showScreen('loading');
  const fill = $('loader-fill');
  const text = $('loader-text');
  const steps = [
    'Собираем крыши Нью-Йорка…',
    'Замешиваем мутаген…',
    'Точим катаны…',
    'Готовим пиццу…',
    'Прячемся в тенях…',
  ];
  let p = 0;
  const timer = window.setInterval(() => {
    p += 12 + Math.random() * 18;
    fill.style.width = `${Math.min(100, p)}%`;
    text.textContent = steps[Math.min(steps.length - 1, Math.floor((p / 100) * steps.length))];
    if (p >= 100) {
      window.clearInterval(timer);
      window.setTimeout(() => {
        showScreen('menu');
        game.showMenu();
        refreshMenu();
        if (!save.playedSeconds && !localStorage.getItem(STORAGE_KEY + ':onboarded')) {
          tutorialOpen = true;
          $('help').dataset.fromGame = '';
          showScreen('help');
        }
      }, 320);
    }
  }, 170);
}

function fatal(message: string) {
  const loading = document.getElementById('loading');
  if (loading) {
    loading.classList.remove('hidden');
    loading.innerHTML = `<div class="loader"><div class="loader-logo">TMNT</div>
      <div class="loader-text" style="margin-top:14px">${message}</div></div>`;
  }
}

try {
  init();
} catch (err) {
  console.error(err);
  fatal('Не удалось запустить 3D. Включите аппаратное ускорение в Яндекс Браузере и обновите страницу.');
}

// never leave the player on a silent black screen
window.addEventListener('error', (ev) => {
  console.error('runtime error', ev.error ?? ev.message);
  const el = document.getElementById('toast');
  if (el) {
    el.textContent = 'Сбой в игре — нажмите F5, чтобы перезапустить';
    el.classList.remove('hidden');
    el.classList.add('show');
  }
});

// track play time
window.setInterval(() => {
  if (game && game.phase === 'playing') {
    save.playedSeconds += 1;
    if (save.playedSeconds % 15 === 0) persist();
  }
}, 1000);

window.addEventListener('beforeunload', persist);
