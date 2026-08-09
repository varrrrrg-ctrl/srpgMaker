import { neighbors, positionInDirection, type PlayState, type Unit, type UnitSide } from './types';
export const adjacentEnemies = (units: Unit[], unit: Unit): Unit[] => units.filter((u) => u.side !== unit.side && neighbors(unit).some((p) => p.x === u.x && p.y === u.y));
export const attackableTargets = (units: Unit[], unit: Unit): Unit[] => {
  const target = positionInDirection(unit, unit.direction);
  return units.filter((u) => u.side !== unit.side && u.x === target.x && u.y === target.y);
};
export const attackUnit = (state: PlayState, attackerId: string, targetId: string): void => {
  const attacker = state.stage.units.find((u) => u.id === attackerId);
  const target = state.stage.units.find((u) => u.id === targetId);
  if (!attacker || !target || !attackableTargets(state.stage.units, attacker).some((u) => u.id === targetId) || attacker.acted) return;
  target.hp -= attacker.attack;
  state.stage.units = state.stage.units.filter((u) => u.hp > 0);
  attacker.acted = true;
  updateResult(state);
};
export const updateResult = (state: PlayState): void => {
  const hasAlly = state.stage.units.some((u) => u.side === 'ally');
  const hasEnemy = state.stage.units.some((u) => u.side === 'enemy');
  state.result = !hasEnemy ? 'victory' : !hasAlly ? 'defeat' : 'playing';
};
export const resetActed = (state: PlayState, side: UnitSide): void => { state.stage.units.filter((u) => u.side === side).forEach((u) => { u.acted = false; }); };
