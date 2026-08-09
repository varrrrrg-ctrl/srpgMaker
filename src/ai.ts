import { attackableTargets, attackUnit, updateResult } from './combat';
import { directionBetween, reachablePositions, shortestPath } from './movement';
import { positionInDirection, type Direction, type PlayState, type Position, type Unit } from './types';

const dist = (a: Position, b: Position): number => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const directions: Direction[] = ['up', 'down', 'left', 'right'];
interface AiChoice { position: Position; direction: Direction; target?: Unit }

export const chooseEnemyAction = (state: PlayState, enemy: Unit): AiChoice => {
  const allies = state.stage.units.filter((unit) => unit.side === 'ally');
  const positions = reachablePositions(state.stage, enemy);
  const attackOptions = positions.flatMap((position) => directions.flatMap((direction) => {
    const front = positionInDirection(position, direction);
    const target = allies.find((ally) => ally.x === front.x && ally.y === front.y);
    return target ? [{ position, direction, target }] : [];
  }));
  const option = attackOptions.sort((a, b) => dist(enemy, a.position) - dist(enemy, b.position)
    || a.position.y - b.position.y || a.position.x - b.position.x || a.direction.localeCompare(b.direction))[0];
  if (option) return option;
  const nearest = [...allies].sort((a, b) => dist(enemy, a) - dist(enemy, b) || a.id.localeCompare(b.id))[0];
  const position = positions.sort((a, b) => dist(a, nearest) - dist(b, nearest) || a.y - b.y || a.x - b.x)[0] ?? enemy;
  return { position, direction: directionBetween(position, nearest) ?? enemy.direction };
};

export const runEnemyAction = (state: PlayState, enemyId: string): void => {
  if (state.result !== 'playing') return;
  const enemy = state.stage.units.find((unit) => unit.id === enemyId && unit.side === 'enemy' && !unit.acted);
  if (!enemy) return;
  const choice = chooseEnemyAction(state, enemy);
  const path = shortestPath(state.stage, enemy, choice.position);
  const end = path.at(-1); const previous = path.at(-2);
  if (end) {
    if (previous) enemy.direction = directionBetween(previous, end) ?? enemy.direction;
    enemy.x = end.x; enemy.y = end.y;
  }
  enemy.direction = choice.direction;
  const victim = attackableTargets(state.stage.units, enemy)[0];
  if (victim) attackUnit(state, enemy.id, victim.id);
  updateResult(state);
};
