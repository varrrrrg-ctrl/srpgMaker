import { directionBetween } from './movement';
import { neighbors, positionInDirection, type Direction, type PlayState, type Unit, type UnitSide } from './types';

export type AttackDirection = 'front' | 'side' | 'back';
export interface DirectionalModifier { direction: AttackDirection; multiplier: number }
const opposite: Record<Direction, Direction> = { up: 'down', down: 'up', left: 'right', right: 'left' };

export const directionalAttackModifier = (attacker: Unit, defender: Unit): DirectionalModifier => {
  const attackerPosition = directionBetween(defender, attacker);
  if (attackerPosition === defender.direction) return { direction: 'front', multiplier: 1 };
  if (attackerPosition === opposite[defender.direction]) return { direction: 'back', multiplier: 1.3 };
  return { direction: 'side', multiplier: 1.1 };
};

export const applyDirectionalModifier = (baseDamage: number, attacker: Unit, defender: Unit): number => Math.round(baseDamage * directionalAttackModifier(attacker, defender).multiplier);
export const adjacentEnemies = (units: Unit[], unit: Unit): Unit[] => units.filter((u) => u.side !== unit.side && neighbors(unit).some((p) => p.x === u.x && p.y === u.y));
export const attackableTargets = (units: Unit[], unit: Unit): Unit[] => {
  const target = positionInDirection(unit, unit.direction);
  return units.filter((u) => u.side !== unit.side && u.x === target.x && u.y === target.y);
};
export const attackUnit = (state: PlayState, attackerId: string, targetId: string): void => {
  const attacker = state.stage.units.find((u) => u.id === attackerId);
  const target = state.stage.units.find((u) => u.id === targetId);
  if (!attacker || !target || !attackableTargets(state.stage.units, attacker).some((u) => u.id === targetId) || attacker.acted) return;
  const modifier = directionalAttackModifier(attacker, target);
  const damage = applyDirectionalModifier(attacker.attack, attacker, target);
  target.hp -= damage;
  const labels: Record<AttackDirection, string> = { front: '正面', side: '側面', back: '背後' };
  state.message = `${labels[modifier.direction]}攻撃！ ${damage}ダメージ。`;
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
