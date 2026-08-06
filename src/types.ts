export const MAP_WIDTH = 10;
export const MAP_HEIGHT = 8;
export type Terrain = 'floor' | 'wall' | 'jump';
export type UnitSide = 'ally' | 'enemy';
export type Direction = 'up' | 'down' | 'left' | 'right';
export type Tool = Terrain | UnitSide | 'erase';
export type Mode = 'edit' | 'play';
export type Turn = 'ally' | 'enemy';
export type Result = 'playing' | 'victory' | 'defeat';
export interface Position { x: number; y: number }
export interface Unit { id: string; side: UnitSide; x: number; y: number; hp: number; maxHp: number; attack: number; move: number; direction: Direction; acted: boolean }
export interface StageData { version: 1; terrain: Terrain[]; units: Unit[] }
export interface PlayState { stage: StageData; turn: Turn; selectedUnitId: string | null; phase: 'select' | 'move' | 'action' | 'enemy'; result: Result; message: string }
export const defaultUnit = (side: UnitSide, x: number, y: number): Unit => ({ id: crypto.randomUUID(), side, x, y, hp: 10, maxHp: 10, attack: 3, move: 3, direction: side === 'ally' ? 'up' : 'down', acted: false });
export const indexOf = (p: Position): number => p.y * MAP_WIDTH + p.x;
export const inBounds = (p: Position): boolean => p.x >= 0 && p.x < MAP_WIDTH && p.y >= 0 && p.y < MAP_HEIGHT;
export const neighbors = (p: Position): Position[] => [{ x: p.x, y: p.y - 1 }, { x: p.x, y: p.y + 1 }, { x: p.x - 1, y: p.y }, { x: p.x + 1, y: p.y }].filter(inBounds);
export const createStage = (): StageData => ({ version: 1, terrain: Array<Terrain>(MAP_WIDTH * MAP_HEIGHT).fill('floor'), units: [] });
export const cloneStage = (stage: StageData): StageData => JSON.parse(JSON.stringify(stage)) as StageData;
