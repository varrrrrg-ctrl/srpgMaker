import { attackableTargets, attackUnit, type AttackDamage } from './combat';
import { inBounds, indexOf, positionInDirection, type PlayState, type SkillId, type Unit } from './types';

export type SkillEffect = 'damage' | 'knockback' | 'guard';
export interface SkillDefinition {
  id: SkillId;
  name: string;
  mpCost: number;
  damageMultiplier: number;
  effect: SkillEffect;
}

export const SKILLS: Record<SkillId, SkillDefinition> = {
  'power-slash': { id: 'power-slash', name: 'Power Slash', mpCost: 20, damageMultiplier: 1.5, effect: 'damage' },
  'heavy-break': { id: 'heavy-break', name: 'Heavy Break', mpCost: 30, damageMultiplier: 1.8, effect: 'damage' },
  'shield-bash': { id: 'shield-bash', name: 'Shield Bash', mpCost: 20, damageMultiplier: 1.3, effect: 'knockback' },
  rush: { id: 'rush', name: 'Rush', mpCost: 20, damageMultiplier: 1.4, effect: 'damage' },
  guard: { id: 'guard', name: 'Guard', mpCost: 20, damageMultiplier: 0, effect: 'guard' },
};

export interface SkillResult { success: boolean; reason?: 'no-skill' | 'not-enough-mp' | 'invalid-target'; attack?: AttackDamage; knockedBack?: boolean }

export const skillForUnit = (unit: Unit): SkillDefinition | undefined => unit.skillId ? SKILLS[unit.skillId] : undefined;

const knockBack = (state: PlayState, attacker: Unit, target: Unit): boolean => {
  if (target.hp <= 0 || !state.stage.units.some((unit) => unit.id === target.id)) return false;
  const destination = positionInDirection(target, attacker.direction);
  if (!inBounds(destination) || state.stage.terrain[indexOf(destination)] !== 'floor'
    || state.stage.units.some((unit) => unit.x === destination.x && unit.y === destination.y)) return false;
  target.x = destination.x;
  target.y = destination.y;
  return true;
};

export const useUnitSkill = (state: PlayState, unitId: string): SkillResult => {
  const unit = state.stage.units.find((candidate) => candidate.id === unitId);
  const skill = unit && skillForUnit(unit);
  if (!unit || !skill || unit.acted) return { success: false, reason: 'no-skill' };
  if (unit.currentMp < skill.mpCost) return { success: false, reason: 'not-enough-mp' };
  if (skill.effect === 'guard') {
    unit.currentMp -= skill.mpCost;
    unit.guarding = true;
    unit.acted = true;
    state.message = `${skill.name}！ 受けるダメージを軽減します。`;
    return { success: true };
  }
  const target = attackableTargets(state.stage.units, unit)[0];
  if (!target) return { success: false, reason: 'invalid-target' };
  const attack = attackUnit(state, unit.id, target.id, skill.damageMultiplier);
  if (!attack) return { success: false, reason: 'invalid-target' };
  unit.currentMp -= skill.mpCost;
  const knockedBack = skill.effect === 'knockback' && knockBack(state, unit, target);
  state.message = `${skill.name}！ ${attack.damage}ダメージ${knockedBack ? '、1マス押し出しました。' : '。'}`;
  return { success: true, attack, knockedBack };
};
