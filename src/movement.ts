import { indexOf, neighbors, type Position, type StageData, type Unit } from './types';

const key = (p: Position): string => `${p.x},${p.y}`;
const blocked = (stage: StageData, p: Position, moverId?: string): boolean => stage.terrain[indexOf(p)] === 'wall' || stage.units.some((u) => u.id !== moverId && u.x === p.x && u.y === p.y);

export const movementMap = (stage: StageData, unit: Unit): Map<string, Position | null> => {
  const start = { x: unit.x, y: unit.y };
  const came = new Map<string, Position | null>([[key(start), null]]);
  const cost = new Map<string, number>([[key(start), 0]]);
  const queue: Position[] = [start];
  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentCost = cost.get(key(current))!;
    if (currentCost >= unit.move) continue;
    for (const next of neighbors(current)) {
      const nextKey = key(next);
      if (blocked(stage, next, unit.id) || cost.has(nextKey)) continue;
      cost.set(nextKey, currentCost + 1);
      came.set(nextKey, current);
      queue.push(next);
    }
  }
  return came;
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
