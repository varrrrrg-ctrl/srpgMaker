import { inBounds, indexOf, neighbors, type Direction, type Position, type StageData, type Unit } from './types';

const key = (p: Position): string => `${p.x},${p.y}`;
const occupied = (stage: StageData, p: Position, moverId?: string): boolean => stage.units.some((u) => u.id !== moverId && u.x === p.x && u.y === p.y);
const canStop = (stage: StageData, p: Position, moverId?: string): boolean => inBounds(p) && stage.terrain[indexOf(p)] === 'floor' && !occupied(stage, p, moverId);
const canJump = (stage: StageData, p: Position, moverId?: string): boolean => inBounds(p) && (stage.terrain[indexOf(p)] === 'jump' || occupied(stage, p, moverId));

const travelEdges = (stage: StageData, current: Position, moverId?: string): Position[] => neighbors(current).flatMap((next) => {
  if (canStop(stage, next, moverId)) return [next];
  if (!canJump(stage, next, moverId)) return [];
  const landing = { x: next.x + (next.x - current.x), y: next.y + (next.y - current.y) };
  return canStop(stage, landing, moverId) ? [landing] : [];
});

export const movementMap = (stage: StageData, unit: Unit): Map<string, Position | null> => {
  const start = { x: unit.x, y: unit.y };
  const came = new Map<string, Position | null>([[key(start), null]]);
  const cost = new Map<string, number>([[key(start), 0]]);
  const queue: Position[] = [start];
  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentCost = cost.get(key(current))!;
    if (currentCost >= unit.move) continue;
    for (const next of travelEdges(stage, current, unit.id)) {
      const nextKey = key(next);
      if (cost.has(nextKey)) continue;
      cost.set(nextKey, currentCost + 1);
      came.set(nextKey, current);
      queue.push(next);
    }
  }
  return came;
};

export const directionBetween = (from: Position, to: Position): Direction | null => {
  const dx = to.x - from.x; const dy = to.y - from.y;
  if (dx === 0 && dy < 0) return 'up';
  if (dx === 0 && dy > 0) return 'down';
  if (dy === 0 && dx < 0) return 'left';
  if (dy === 0 && dx > 0) return 'right';
  return null;
};

export const changeDirection = (unit: Unit, direction: Direction): void => { unit.direction = direction; };

export const movementStep = (stage: StageData, unit: Unit, reachable: Position[], destination: Position): boolean => {
  if (unit.acted || !reachable.some((p) => p.x === destination.x && p.y === destination.y) || !canStop(stage, destination, unit.id)) return false;
  const dx = Math.abs(destination.x - unit.x); const dy = Math.abs(destination.y - unit.y);
  if (dx + dy === 1) { unit.direction = directionBetween(unit, destination)!; unit.x = destination.x; unit.y = destination.y; return true; }
  if (dx + dy === 2 && (dx === 0 || dy === 0)) {
    const middle = { x: (unit.x + destination.x) / 2, y: (unit.y + destination.y) / 2 };
    if (canJump(stage, middle, unit.id)) { unit.direction = directionBetween(unit, destination)!; unit.x = destination.x; unit.y = destination.y; return true; }
  }
  return false;
};

export const reachablePositions = (stage: StageData, unit: Unit): Position[] => [...movementMap(stage, unit).keys()].map((v) => { const [x, y] = v.split(',').map(Number); return { x, y }; });

export const shortestPath = (stage: StageData, unit: Unit, goal: Position): Position[] => {
  const came = movementMap(stage, unit);
  const goalKey = key(goal);
  if (!came.has(goalKey)) return [];
  const path: Position[] = [];
  let current: Position | null = goal;
  while (current) { path.unshift(current); current = came.get(key(current)) ?? null; }
  return path;
};
