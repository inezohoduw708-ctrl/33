import type { LevelDef } from '../types';

export const LEVELS: LevelDef[] = [
  {
    id: 0,
    name: 'Переулок Клинка',
    kicker: 'ГЛАВА 1',
    desc: 'Первые разведчики Клана Фут прочёсывают переулок. Покажи им, чей это город.',
    objective: 'Очисти переулок',
    timeOfDay: 'night',
    seed: 1337,
    mods: { damage: 1, speed: 1, hp: 1 },
    waves: [
      { enemies: [{ kind: 'foot', count: 4 }], banner: 'ВОЛНА 1 — ПАТРУЛЬ ФУТ' },
      { enemies: [{ kind: 'foot', count: 5 }, { kind: 'shooter', count: 1 }], banner: 'ВОЛНА 2 — ПОДКРЕПЛЕНИЕ' },
      { enemies: [{ kind: 'foot', count: 4 }, { kind: 'foot_heavy', count: 2 }], banner: 'ВОЛНА 3 — СТРАЖА' },
    ],
  },
  {
    id: 1,
    name: 'Неоновый рынок',
    kicker: 'ГЛАВА 2',
    desc: 'Под неоновыми вывесками Клан Фут торгует не пиццей. Разгони этот базар.',
    objective: 'Отбей рынок',
    timeOfDay: 'dusk',
    seed: 4242,
    mods: { damage: 1.1, speed: 1.05, hp: 1.1, shooters: true },
    waves: [
      { enemies: [{ kind: 'foot', count: 5 }, { kind: 'shooter', count: 2 }], banner: 'ВОЛНА 1 — ТОРГОВЦЫ СМЕРТИ' },
      { enemies: [{ kind: 'foot_heavy', count: 3 }, { kind: 'foot', count: 3 }], banner: 'ВОЛНА 2 — МЯСНИКИ' },
      { enemies: [{ kind: 'brute', count: 1 }, { kind: 'foot', count: 5 }], banner: 'ВОЛНА 3 — ГРОМИЛА' },
    ],
  },
  {
    id: 2,
    name: 'Крыши и дождь',
    kicker: 'ГЛАВА 3',
    desc: 'Гроза над Манхэттеном. Клан Фут стягивает силы к логову Шреддера.',
    objective: 'Пробейся сквозь засаду',
    timeOfDay: 'storm',
    seed: 9001,
    mods: { damage: 1.22, speed: 1.12, hp: 1.25, shooters: true },
    waves: [
      { enemies: [{ kind: 'foot', count: 6 }, { kind: 'shooter', count: 2 }], banner: 'ВОЛНА 1 — ЗАСАДА' },
      { enemies: [{ kind: 'brute', count: 2 }, { kind: 'foot_heavy', count: 2 }], banner: 'ВОЛНА 2 — ТЯЖЁЛЫЙ ОТРЯД' },
      { enemies: [{ kind: 'foot', count: 4 }, { kind: 'foot_heavy', count: 3 }, { kind: 'shooter', count: 2 }], banner: 'ВОЛНА 3 — ПОСЛЕДНИЙ ЗАСЛОН' },
    ],
  },
  {
    id: 3,
    name: 'Тень Шреддера',
    kicker: 'ФИНАЛ',
    desc: 'Он ждал вас лично. Один клан, четыре черепашки и стальные когти.',
    objective: 'Победи Шреддера',
    timeOfDay: 'night',
    seed: 66613,
    mods: { damage: 1.35, speed: 1.18, hp: 1.35 },
    boss: true,
    waves: [
      { enemies: [{ kind: 'foot', count: 4 }, { kind: 'foot_heavy', count: 2 }], banner: 'СТРАЖА ШРЕДДЕРА' },
      { enemies: [], banner: 'ШРЕДДЕР ВЫХОДИТ НА СЦЕНУ' },
    ],
  },
];
