import type { TurtleDef, TurtleId } from '../types';

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const damp = (a: number, b: number, lambda: number, dt: number) =>
  lerp(a, b, 1 - Math.exp(-lambda * dt));
export const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
export const randInt = (a: number, b: number) => Math.floor(rand(a, b + 1));
export const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];
export const smoothstep = (t: number) => t * t * (3 - 2 * t);
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
export const easeInCubic = (t: number) => t * t * t;
export const easeOutBack = (t: number) => 1 + 2.2 * Math.pow(t - 1, 3) + 1.4 * Math.pow(t - 1, 2);

export const vecLen = (x: number, z: number) => Math.hypot(x, z);
export const angleLerp = (a: number, b: number, t: number) => {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
};
export const angleDiff = (a: number, b: number) => {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
};

/** Deterministic pseudo-random generator so the city layout is stable per level. */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const TURTLES: Record<TurtleId, TurtleDef> = {
  leo: {
    id: 'leo',
    name: 'Леонардо',
    short: 'ЛЕО',
    color: 0x2f6fe0,
    css: '#4d8dff',
    weapon: 'katana',
    maxHp: 110,
    speed: 6.4,
    damage: 13,
    range: 2.35,
    special: 'Вихрь катаны',
    specialDesc: 'Круговой разворот с двумя клинками бьёт всех вокруг.',
    quote: 'Дисциплина — моё оружие.',
  },
  raph: {
    id: 'raph',
    name: 'Рафаэль',
    short: 'РАФ',
    color: 0xe0312d,
    css: '#ff5a4d',
    weapon: 'sai',
    maxHp: 135,
    speed: 6.0,
    damage: 15,
    range: 2.0,
    special: 'Ярость кулака',
    specialDesc: 'Рывок вперёд с сокрушительным ударом, сносит врагов с ног.',
    quote: 'Не зли меня. Поздно.',
  },
  don: {
    id: 'don',
    name: 'Донателло',
    short: 'ДОН',
    color: 0x9146d8,
    css: '#b76bff',
    weapon: 'bo',
    maxHp: 105,
    speed: 6.2,
    damage: 12,
    range: 2.9,
    special: 'Удар посохом',
    specialDesc: 'Сотрясающий землю удар посохом — волна по всей улице.',
    quote: 'Я думаю, поэтому бью точно.',
  },
  mikey: {
    id: 'mikey',
    name: 'Микеланджело',
    short: 'МАЙКИ',
    color: 0xf08a13,
    css: '#ffab3d',
    weapon: 'nunchaku',
    maxHp: 100,
    speed: 7.0,
    damage: 11,
    range: 2.2,
    special: 'Нунчаку-смерч',
    specialDesc: 'Стремительный вихрь, что движется вместе с Майки.',
    quote: 'Пицца и победа — идеальная пара!',
  },
};

export const TURTLE_ORDER: TurtleId[] = ['leo', 'raph', 'don', 'mikey'];

export const STORAGE_KEY = 'tmnt-shadows-ny-v1';

export function loadSave(defaultSave: () => any): any {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultSave();
    const parsed = JSON.parse(raw);
    return { ...defaultSave(), ...parsed };
  } catch {
    return defaultSave();
  }
}

export function writeSave(data: unknown) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function fmt(n: number): string {
  return n.toLocaleString('ru-RU');
}

export function rankFromScore(score: number, maxScore: number): string {
  const r = score / Math.max(1, maxScore);
  if (r >= 1.0) return 'S';
  if (r >= 0.78) return 'A';
  if (r >= 0.55) return 'B';
  if (r >= 0.32) return 'C';
  return 'D';
}
