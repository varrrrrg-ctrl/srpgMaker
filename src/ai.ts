import { attackableTargets, attackUnit } from './combat';
import { directionBetween, reachablePositions, shortestPath } from './movement';
import { positionInDirection, type Direction, type PlayState, type Position } from './types';

const dist = (a: Position, b: Position): number => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const directions: Direction[] = ['up', 'down', 'left', 'right'];

export const runEnemyAction = (state: PlayState, enemyId: string): void => {
  const enemy = state.stage.units.find((unit) => unit.id === enemyId && unit.side === 'enemy' && !unit.acted);
  const allies = state.stage.units.filter((unit) => unit.side === 'ally');
  if (!enemy || allies.length === 0 || state.result !== 'playing') return;
  const positions = reachablePositions(state.stage, enemy);
  const attackOptions = positions.flatMap((position) => directions.flatMap((direction) => {
    const front = positionInDirection(position, direction);
    const target = allies.find((ally) => ally.x === front.x && ally.y === front.y);
    return target ? [{ position, direction }] : [];
  }));
  const nearest = [...allies].sort((a, b) => dist(enemy, a) - dist(enemy, b) || a.id.localeCompare(b.id))[0];
  const option = attackOptions.sort((a, b) => dist(enemy, a.position) - dist(enemy, b.position))[0];
  const destination = option?.position ?? positions.sort((a, b) => dist(a, nearest) - dist(b, nearest))[0];
  const path = shortestPath(state.stage, enemy, destination);
  const end = path.at(-1); const previous = path.at(-2);
  if (end) { if (previous) enemy.direction = directionBetween(previous, end) ?? enemy.direction; enemy.x = end.x; enemy.y = end.y; }
  if (option) enemy.direction = option.direction;
  const victim = attackableTargets(state.stage.units, enemy)[0];
  if (victim) attackUnit(state, enemy.id, victim.id);
};
