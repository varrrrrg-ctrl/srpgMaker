import { attackableTargets, attackUnit, resetActed, updateResult } from './combat';
import { directionBetween, reachablePositions, shortestPath } from './movement';
import { positionInDirection, type Direction, type PlayState, type Position } from './types';
const dist = (a: Position, b: Position): number => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const directions: Direction[] = ['up', 'down', 'left', 'right'];
export const runEnemyTurn = (state: PlayState): void => {
  state.phase = 'enemy';
  for (const enemy of [...state.stage.units.filter((u) => u.side === 'enemy')]) {
    if (state.result !== 'playing') break;
    const live = state.stage.units.find((u) => u.id === enemy.id); if (!live) continue;
    const allies = state.stage.units.filter((u) => u.side === 'ally'); if (allies.length === 0) break;
    const positions = reachablePositions(state.stage, live);
    const attackOptions = positions.flatMap((position) => directions.flatMap((direction) => {
      const front = positionInDirection(position, direction);
      const target = allies.find((ally) => ally.x === front.x && ally.y === front.y);
      return target ? [{ position, direction, target }] : [];
    }));
    const nearest = [...allies].sort((a, b) => dist(live, a) - dist(live, b))[0];
    const option = attackOptions.sort((a, b) => dist(live, a.position) - dist(live, b.position))[0];
    const destination = option?.position ?? positions.sort((a, b) => dist(a, nearest) - dist(b, nearest))[0];
    const path = shortestPath(state.stage, live, destination);
    const end = path.at(-1); const previous = path.at(-2);
    if (end) { if (previous) live.direction = directionBetween(previous, end) ?? live.direction; live.x = end.x; live.y = end.y; }
    if (option) live.direction = option.direction;
    const victim = attackableTargets(state.stage.units, live)[0];
    if (victim) attackUnit(state, live.id, victim.id); else live.acted = true;
  }
  updateResult(state);
  if (state.result === 'playing') { resetActed(state, 'ally'); state.turn = 'ally'; state.phase = 'select'; state.origin = null; state.message = '味方ターンです。味方を選択してください。'; }
};
