import { adjacentEnemies, attackUnit, resetActed, updateResult } from './combat';
import { reachablePositions, shortestPath } from './movement';
import { type PlayState, type Position, neighbors } from './types';
const dist = (a: Position, b: Position): number => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
export const runEnemyTurn = (state: PlayState): void => {
  state.phase = 'enemy';
  for (const enemy of [...state.stage.units.filter((u) => u.side === 'enemy')]) {
    if (state.result !== 'playing') break;
    const live = state.stage.units.find((u) => u.id === enemy.id); if (!live) continue;
    const allies = state.stage.units.filter((u) => u.side === 'ally'); if (allies.length === 0) break;
    let target = [...allies].sort((a, b) => dist(live, a) - dist(live, b))[0];
    const positions = reachablePositions(state.stage, live);
    const attackSquares = positions.filter((p) => neighbors(p).some((n) => n.x === target.x && n.y === target.y));
    const destination = (attackSquares.length ? attackSquares : positions).sort((a, b) => dist(a, target) - dist(b, target))[0];
    const path = shortestPath(state.stage, live, destination);
    const end = path.at(-1); if (end) { live.x = end.x; live.y = end.y; }
    target = state.stage.units.filter((u) => u.side === 'ally').sort((a, b) => dist(live, a) - dist(live, b))[0];
    const victim = adjacentEnemies(state.stage.units, live).find((u) => u.id === target.id) ?? adjacentEnemies(state.stage.units, live)[0];
    if (victim) attackUnit(state, live.id, victim.id); else live.acted = true;
  }
  updateResult(state);
  if (state.result === 'playing') { resetActed(state, 'ally'); state.turn = 'ally'; state.phase = 'select'; state.message = '味方ターンです。味方を選択してください。'; }
};
