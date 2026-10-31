export type TurtleId = 'leo' | 'raph' | 'don' | 'mikey';

export interface Vec2 {
  x: number;
  z: number;
}

export interface TurtleDef {
  id: TurtleId;
  name: string;
  short: string;
  color: number;
  css: string;
  weapon: 'katana' | 'sai' | 'bo' | 'nunchaku';
  maxHp: number;
  speed: number;
  damage: number;
  range: number;
  special: string;
  specialDesc: string;
  quote: string;
}

export interface SaveData {
  version: number;
  unlocked: number;
  currentLevel: number;
  bestScore: number;
  bestRanks: Record<string, string>;
  totalKills: number;
  sound: boolean;
  selected: TurtleId;
  playedSeconds: number;
}

export type EnemyKind = 'foot' | 'foot_heavy' | 'brute' | 'shooter' | 'boss';

export interface SpawnDef {
  kind: EnemyKind;
  count: number;
}

export interface WaveDef {
  enemies: SpawnDef[];
  banner?: string;
}

export interface LevelModifiers {
  /** enemy damage multiplier */
  damage?: number;
  /** enemy move speed multiplier */
  speed?: number;
  /** enemy hit-point multiplier */
  hp?: number;
  /** chance an enemy spawns as a ranged shooter */
  shooters?: boolean;
  /** adds an extra wave behind the listed ones */
  extraWave?: WaveDef;
}

export interface LevelDef {
  id: number;
  name: string;
  kicker: string;
  desc: string;
  objective: string;
  timeOfDay: 'night' | 'dusk' | 'storm';
  waves: WaveDef[];
  boss?: boolean;
  seed: number;
  mods?: LevelModifiers;
}
