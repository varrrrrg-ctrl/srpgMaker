export const MAP_WIDTH = 10;
export const MAP_HEIGHT = 8;
export type Terrain = 'floor' | 'wall' | 'jump';
export type UnitSide = 'ally' | 'enemy';
export type Direction = 'up' | 'down' | 'left' | 'right';
export type Tool = Terrain | UnitSide | 'erase';
export type Mode = 'edit' | 'play';
export type Turn = 'ally' | 'enemy';
export type Result = 'playing' | 'victory' | 'defeat';
export type PlayPhase = 'select' | 'move' | 'attack' | 'direction' | 'enemy';
export interface Position { x: number; y: number }
export interface Unit { id: string; name?: string; side: UnitSide; x: number; y: number; hp: number; maxHp: number; attack: number; defense: number; move: number; speed: number; direction: Direction; acted: boolean }
export interface StageData { version: 1; terrain: Terrain[]; units: Unit[] }
export interface TurnOrigin { unitId: string; position: Position; direction: Direction; reachable: Position[] }
export interface PlayState { stage: StageData; turn: Turn; round: number; actionOrder: string[]; currentActionIndex: number; selectedUnitId: string | null; phase: PlayPhase; origin: TurnOrigin | null; result: Result; message: string }
export const DEFAULT_SPEED = 10;
export const DEFAULT_DEFENSE = 20;
export const defaultUnit = (side: UnitSide, x: number, y: number): Unit => ({ id: crypto.randomUUID(), side, x, y, hp: 50, maxHp: 50, attack: 20, defense: DEFAULT_DEFENSE, move: 3, speed: DEFAULT_SPEED, direction: side === 'ally' ? 'up' : 'down', acted: false });

export const PLAYER_PRESETS = {
  Balance: { hp: 50, attack: 20, defense: 20 },
  Attacker: { hp: 42, attack: 26, defense: 14 },
  Tank: { hp: 70, attack: 14, defense: 32 },
  Assault: { hp: 47, attack: 24, defense: 18 },
  Defender: { hp: 60, attack: 18, defense: 26 },
} as const;
export type PlayerPresetName = keyof typeof PLAYER_PRESETS;
export const playerUnit = (name: PlayerPresetName, x: number, y: number): Unit => {
  const preset = PLAYER_PRESETS[name];
  return { ...defaultUnit('ally', x, y), id: `ally-${name.toLowerCase()}`, name, hp: preset.hp, maxHp: preset.hp, attack: preset.attack, defense: preset.defense };
};
export const indexOf = (p: Position): number => p.y * MAP_WIDTH + p.x;
export const inBounds = (p: Position): boolean => p.x >= 0 && p.x < MAP_WIDTH && p.y >= 0 && p.y < MAP_HEIGHT;
export const neighbors = (p: Position): Position[] => [{ x: p.x, y: p.y - 1 }, { x: p.x, y: p.y + 1 }, { x: p.x - 1, y: p.y }, { x: p.x + 1, y: p.y }].filter(inBounds);
export const positionInDirection = (p: Position, direction: Direction, distance = 1): Position => {
  const delta: Record<Direction, Position> = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };
  return { x: p.x + delta[direction].x * distance, y: p.y + delta[direction].y * distance };
};
export const createStage = (): StageData => ({ version: 1, terrain: Array<Terrain>(MAP_WIDTH * MAP_HEIGHT).fill('floor'), units: [] });
export const createTestStage = (): StageData => {
  const stage = createStage();
  stage.units.push(
    playerUnit('Balance', 2, 6), playerUnit('Attacker', 3, 6), playerUnit('Tank', 4, 6),
    playerUnit('Assault', 5, 6), playerUnit('Defender', 6, 6),
  );
  const enemyA = defaultUnit('enemy', 3, 1); enemyA.id = 'enemy-1';
  const enemyB = defaultUnit('enemy', 6, 1); enemyB.id = 'enemy-2';
  stage.units.push(enemyA, enemyB);
  return stage;
};
export const cloneStage = (stage: StageData): StageData => JSON.parse(JSON.stringify(stage)) as StageData;
