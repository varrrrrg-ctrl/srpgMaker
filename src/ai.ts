import { attackableTargets, attackUnit, calculateAttackDamage, updateResult } from './combat';
import { directionBetween, reachablePositions, shortestPath } from './movement';
import { canUseSkill, estimateSkillDamage, selectableSkillTargets, skillsForUnit, useUnitSkill } from './skills';
import { type Direction, type PlayState, type Position, type SkillId, type Unit } from './types';

const dist = (a: Position, b: Position): number => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const directions: Direction[] = ['up', 'down', 'left', 'right'];
export interface AiChoice { position: Position; direction: Direction; target?: Unit; targetPosition?: Position; skillId?: SkillId; score?: number }

const scoreDamage = (damage: number, targets: Unit[]): number => damage + targets.reduce((score, target) => score + (damage >= target.hp ? 100 : 0), 0) + Math.max(0, targets.length - 1) * 25;
export const chooseEnemyAction = (state: PlayState, enemy: Unit): AiChoice => {
  const opponents = state.stage.units.filter((unit) => unit.side !== enemy.side);
  const positions = reachablePositions(state.stage, enemy); const original = { x: enemy.x, y: enemy.y, direction: enemy.direction };
  const choices: AiChoice[] = [];
  for (const position of positions) {
    enemy.x = position.x; enemy.y = position.y;
    for (const direction of directions) {
      enemy.direction = direction; const target = attackableTargets(state.stage.units, enemy)[0];
      if (target) { const attack = calculateAttackDamage(enemy, target); choices.push({ position, direction, target, score: scoreDamage(attack.damage, [target]) }); }
    }
    for (const skill of skillsForUnit(enemy)) {
      if (!canUseSkill(state.stage, enemy, skill)) continue;
      if (skill.effect === 'guard') {
        if (enemy.hp <= enemy.maxHp / 2) choices.push({ position, direction: enemy.direction, skillId: skill.id, targetPosition: position, score: 35 });
        continue;
      }
      for (const center of selectableSkillTargets(state.stage, enemy, skill)) {
        if (skill.effect === 'protect') {
          const target = state.stage.units.find((unit) => unit.side === enemy.side && unit.id !== enemy.id && unit.x === center.x && unit.y === center.y);
          if (target) choices.push({ position, direction: enemy.direction, target, skillId: skill.id, targetPosition: center, score: 18 + (target.maxHp - target.hp) + Math.max(0, 20 - target.defense) });
          continue;
        }
        const targets = opponents.filter((target) => Math.abs(target.x - center.x) + Math.abs(target.y - center.y) <= skill.area);
        const damage = estimateSkillDamage(state.stage, enemy, skill, center);
        let score = scoreDamage(damage, targets) - skill.mpCost * 0.2;
        if (skill.effect === 'knockback') score += 3;
        choices.push({ position, direction: directionBetween(position, center) ?? enemy.direction, target: targets[0], skillId: skill.id, targetPosition: center, score });
      }
    }
  }
  enemy.x = original.x; enemy.y = original.y; enemy.direction = original.direction;
  const best = choices.sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || dist(enemy, a.position) - dist(enemy, b.position))[0];
  if (best) return best;
  const nearest = [...opponents].sort((a, b) => dist(enemy, a) - dist(enemy, b) || a.id.localeCompare(b.id))[0];
  const position = nearest ? positions.sort((a, b) => dist(a, nearest) - dist(b, nearest) || a.y - b.y || a.x - b.x)[0] ?? enemy : enemy;
  return { position, direction: nearest ? directionBetween(position, nearest) ?? enemy.direction : enemy.direction };
};

export const runEnemyAction = (state: PlayState, enemyId: string): void => {
  if (state.result !== 'playing') return;
  const enemy = state.stage.units.find((unit) => unit.id === enemyId && unit.side === 'enemy' && !unit.acted); if (!enemy) return;
  const choice = chooseEnemyAction(state, enemy); const path = shortestPath(state.stage, enemy, choice.position); const end = path.at(-1); const previous = path.at(-2);
  if (end) { if (previous) enemy.direction = directionBetween(previous, end) ?? enemy.direction; enemy.x = end.x; enemy.y = end.y; }
  enemy.direction = choice.direction;
  if (choice.skillId) useUnitSkill(state, enemy.id, choice.skillId, choice.targetPosition);
  else { const victim = attackableTargets(state.stage.units, enemy)[0]; if (victim) attackUnit(state, enemy.id, victim.id); }
  updateResult(state);
};
