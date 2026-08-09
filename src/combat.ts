import { directionBetween } from './movement';
import { neighbors, positionInDirection, type Direction, type PlayState, type Unit, type UnitSide } from './types';

export type AttackDirection = 'front' | 'side' | 'back';
export interface DirectionalModifier { direction: AttackDirection; multiplier: number }
export interface AttackDamage extends DirectionalModifier { damage: number }
const opposite: Record<Direction, Direction> = { up: 'down', down: 'up', left: 'right', right: 'left' };

export const directionalAttackModifier = (attacker: Unit, defender: Unit): DirectionalModifier => {
  const attackerPosition = directionBetween(defender, attacker);
  if (attackerPosition === defender.direction) return { direction: 'front', multiplier: 1 };
  if (attackerPosition === opposite[defender.direction]) return { direction: 'back', multiplier: 1.3 };
  return { direction: 'side', multiplier: 1.1 };
};

export const applyDirectionalModifier = (baseDamage: number, attacker: Unit, defender: Unit): number => Math.round(baseDamage * directionalAttackModifier(attacker, defender).multiplier);
export const calculateBaseDamage = (attack: number, defense: number): number => {
  const safeAttack = Math.max(0, attack);
  const safeDefense = defense > 0 ? defense : 1;
  return 0.5 * safeAttack * Math.sqrt(safeAttack / safeDefense);
};
export const calculateAttackDamage = (attacker: Unit, defender: Unit, skillMultiplier = 1): AttackDamage => {
  const modifier = directionalAttackModifier(attacker, defender);
  const baseDamage = calculateBaseDamage(attacker.attack, defender.defense);
  const guardMultiplier = defender.guarding ? 0.6 : 1;
  return { ...modifier, damage: Math.max(1, Math.round(baseDamage * skillMultiplier * modifier.multiplier * guardMultiplier)) };
};
export const adjacentEnemies = (units: Unit[], unit: Unit): Unit[] => units.filter((u) => u.side !== unit.side && neighbors(unit).some((p) => p.x === u.x && p.y === u.y));
export const attackableTargets = (units: Unit[], unit: Unit): Unit[] => {
  const target = positionInDirection(unit, unit.direction);
  return units.filter((u) => u.side !== unit.side && u.x === target.x && u.y === target.y);
};
export const attackUnit = (state: PlayState, attackerId: string, targetId: string, skillMultiplier = 1): AttackDamage | null => {
  const attacker = state.stage.units.find((u) => u.id === attackerId);
  const target = state.stage.units.find((u) => u.id === targetId);
  if (!attacker || !target || !attackableTargets(state.stage.units, attacker).some((u) => u.id === targetId) || attacker.acted) return null;
  const attack = calculateAttackDamage(attacker, target, skillMultiplier);
  target.hp -= attack.damage;
  const labels: Record<AttackDirection, string> = { front: '正面', side: '側面', back: '背後' };
  state.message = `${labels[attack.direction]}攻撃！ ${attack.damage}ダメージ。`;
  state.stage.units = state.stage.units.filter((u) => u.hp > 0);
  attacker.acted = true;
  updateResult(state);
  return attack;
};
export const updateResult = (state: PlayState): void => {
  const hasAlly = state.stage.units.some((u) => u.side === 'ally');
  const hasEnemy = state.stage.units.some((u) => u.side === 'enemy');
  state.result = !hasEnemy ? 'victory' : !hasAlly ? 'defeat' : 'playing';
};
export const resetActed = (state: PlayState, side: UnitSide): void => { state.stage.units.filter((u) => u.side === side).forEach((u) => { u.acted = false; }); };
