export const MAP_WIDTH = 10;
export const MAP_HEIGHT = 8;
export type Terrain = 'floor' | 'wall' | 'jump';
export type UnitSide = 'ally' | 'enemy';
export type Direction = 'up' | 'down' | 'left' | 'right';
export type SkillId = 'power-slash' | 'shock-wave' | 'heavy-break' | 'execution' | 'shield-bash' | 'ground-slam' | 'rush' | 'dash-strike' | 'guard' | 'protect';
export type Tool = Terrain | UnitSide | 'erase';
export type Mode = 'edit' | 'play';
export type Turn = 'ally' | 'enemy';
export type Result = 'playing' | 'victory' | 'defeat';
export type PlayPhase = 'select' | 'move' | 'attack' | 'skill' | 'direction' | 'enemy';
export interface Position { x: number; y: number }
export interface Unit { id: string; name?: string; unitType: PlayerPresetName; skillId?: SkillId; skillIds: SkillId[]; side: UnitSide; x: number; y: number; hp: number; maxHp: number; attack: number; defense: number; currentMp: number; maxMp: number; guarding: boolean; protected: boolean; move: number; speed: number; direction: Direction; acted: boolean }
export interface StageData { version: 1; terrain: Terrain[]; units: Unit[] }
export interface TurnOrigin { unitId: string; position: Position; direction: Direction; reachable: Position[] }
export interface PlayState { stage: StageData; turn: Turn; round: number; actionOrder: string[]; currentActionIndex: number; selectedUnitId: string | null; selectedSkillId?: SkillId; skillTargets?: Position[]; phase: PlayPhase; origin: TurnOrigin | null; result: Result; message: string }
export const DEFAULT_SPEED = 10;
export const DEFAULT_DEFENSE = 20;
export const DEFAULT_CURRENT_MP = 30;
export const DEFAULT_MAX_MP = 50;
export const defaultUnit = (side: UnitSide, x: number, y: number): Unit => ({ id: crypto.randomUUID(), unitType: 'Balance', skillIds: [], side, x, y, hp: 50, maxHp: 50, attack: 20, defense: DEFAULT_DEFENSE, currentMp: DEFAULT_CURRENT_MP, maxMp: DEFAULT_MAX_MP, guarding: false, protected: false, move: 3, speed: DEFAULT_SPEED, direction: side === 'ally' ? 'up' : 'down', acted: false });

export const PLAYER_PRESETS = {
  Balance: { hp: 50, attack: 20, defense: 20, currentMp: 30, maxMp: 50, skillIds: ['power-slash', 'shock-wave'] },
  Attacker: { hp: 42, attack: 26, defense: 14, currentMp: 30, maxMp: 40, skillIds: ['heavy-break', 'execution'] },
  Tank: { hp: 70, attack: 14, defense: 32, currentMp: 20, maxMp: 40, skillIds: ['shield-bash', 'ground-slam'] },
  Assault: { hp: 47, attack: 24, defense: 18, currentMp: 40, maxMp: 50, skillIds: ['rush', 'dash-strike'] },
  Defender: { hp: 60, attack: 18, defense: 26, currentMp: 30, maxMp: 60, skillIds: ['guard', 'protect'] },
} as const;
export type PlayerPresetName = keyof typeof PLAYER_PRESETS;
export const presetUnit = (side: UnitSide, name: PlayerPresetName, x: number, y: number): Unit => {
  const preset = PLAYER_PRESETS[name];
  return { ...defaultUnit(side, x, y), id: `${side}-${name.toLowerCase()}-${crypto.randomUUID()}`, unitType: name, name, hp: preset.hp, maxHp: preset.hp, attack: preset.attack, defense: preset.defense, currentMp: preset.currentMp, maxMp: preset.maxMp, skillIds: [...preset.skillIds], skillId: preset.skillIds[0] };
};
export const playerUnit = (name: PlayerPresetName, x: number, y: number): Unit => presetUnit('ally', name, x, y);
export const placePresetUnit = (stage: StageData, side: UnitSide, name: PlayerPresetName, position: Position): boolean => {
  if (!inBounds(position) || stage.terrain[indexOf(position)] !== 'floor' || stage.units.some((unit) => unit.x === position.x && unit.y === position.y)) return false;
  stage.units.push(presetUnit(side, name, position.x, position.y)); return true;
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
  const enemyA = presetUnit('enemy', 'Balance', 3, 1); enemyA.id = 'enemy-1';
  const enemyB = presetUnit('enemy', 'Tank', 6, 1); enemyB.id = 'enemy-2';
  stage.units.push(enemyA, enemyB);
  return stage;
};
export const cloneStage = (stage: StageData): StageData => JSON.parse(JSON.stringify(stage)) as StageData;
