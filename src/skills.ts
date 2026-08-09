import { calculateAttackDamage, damageUnit, type AttackDamage } from './combat';
import { directionBetween, pathCost, shortestPath } from './movement';
import { inBounds, indexOf, neighbors, type PlayState, type Position, type SkillId, type StageData, type Unit } from './types';

export type SkillEffect = 'damage' | 'knockback' | 'guard' | 'protect' | 'dash';
export type SkillTarget = 'enemy' | 'ally' | 'self';
export type RangeType = 'diamond' | 'line';
export interface SkillDefinition { id: SkillId; name: string; mpCost: number; damageMultiplier: number; range: number; area: number; rangeType: RangeType; targetType: SkillTarget; effect: SkillEffect }

export const SKILLS: Record<SkillId, SkillDefinition> = {
  'power-slash': { id: 'power-slash', name: 'Power Slash', mpCost: 20, damageMultiplier: 1.5, range: 1, area: 0, rangeType: 'diamond', targetType: 'enemy', effect: 'damage' },
  'shock-wave': { id: 'shock-wave', name: 'Shock Wave', mpCost: 30, damageMultiplier: 1.4, range: 2, area: 0, rangeType: 'line', targetType: 'enemy', effect: 'damage' },
  'heavy-break': { id: 'heavy-break', name: 'Heavy Break', mpCost: 30, damageMultiplier: 1.8, range: 1, area: 0, rangeType: 'diamond', targetType: 'enemy', effect: 'damage' },
  execution: { id: 'execution', name: 'Execution', mpCost: 40, damageMultiplier: 2.2, range: 1, area: 0, rangeType: 'diamond', targetType: 'enemy', effect: 'damage' },
  'shield-bash': { id: 'shield-bash', name: 'Shield Bash', mpCost: 20, damageMultiplier: 1.3, range: 1, area: 0, rangeType: 'diamond', targetType: 'enemy', effect: 'knockback' },
  'ground-slam': { id: 'ground-slam', name: 'Ground Slam', mpCost: 30, damageMultiplier: 1.1, range: 0, area: 1, rangeType: 'diamond', targetType: 'enemy', effect: 'damage' },
  rush: { id: 'rush', name: 'Rush', mpCost: 20, damageMultiplier: 1.4, range: 1, area: 0, rangeType: 'diamond', targetType: 'enemy', effect: 'damage' },
  'dash-strike': { id: 'dash-strike', name: 'Dash Strike', mpCost: 30, damageMultiplier: 1.5, range: 2, area: 0, rangeType: 'diamond', targetType: 'enemy', effect: 'dash' },
  guard: { id: 'guard', name: 'Guard', mpCost: 20, damageMultiplier: 0, range: 0, area: 0, rangeType: 'diamond', targetType: 'self', effect: 'guard' },
  protect: { id: 'protect', name: 'Protect', mpCost: 30, damageMultiplier: 0, range: 1, area: 0, rangeType: 'diamond', targetType: 'ally', effect: 'protect' },
};

const same = (a: Position, b: Position): boolean => a.x === b.x && a.y === b.y;
const distance = (a: Position, b: Position): number => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
export const areaPositions = (center: Position, area: number): Position[] => {
  const positions: Position[] = [];
  for (let dy = -area; dy <= area; dy++) for (let dx = -area; dx <= area; dx++) if (Math.abs(dx) + Math.abs(dy) <= area) {
    const position = { x: center.x + dx, y: center.y + dy }; if (inBounds(position)) positions.push(position);
  }
  return positions;
};
const lineClear = (stage: StageData, from: Position, to: Position): boolean => {
  const direction = directionBetween(from, to); if (!direction) return false;
  for (let step = 1; step < distance(from, to); step++) {
    const position = direction === 'up' ? { x: from.x, y: from.y - step } : direction === 'down' ? { x: from.x, y: from.y + step } : direction === 'left' ? { x: from.x - step, y: from.y } : { x: from.x + step, y: from.y };
    if (stage.terrain[indexOf(position)] !== 'floor') return false;
  }
  return true;
};
export const skillRangePositions = (stage: StageData, unit: Unit, skill: SkillDefinition): Position[] => {
  if (skill.range === 0) return [{ x: unit.x, y: unit.y }];
  const positions: Position[] = [];
  for (let y = 0; y < 8; y++) for (let x = 0; x < 10; x++) {
    const position = { x, y }; const d = distance(unit, position);
    if (d < 1 || d > skill.range || (skill.rangeType === 'line' && (!directionBetween(unit, position) || !lineClear(stage, unit, position)))) continue;
    positions.push(position);
  }
  return positions;
};
const targetMatches = (unit: Unit, target: Unit, type: SkillTarget): boolean => type === 'self' ? unit.id === target.id : type === 'enemy' ? unit.side !== target.side : unit.side === target.side && unit.id !== target.id;
export const selectableSkillTargets = (stage: StageData, unit: Unit, skill: SkillDefinition): Position[] => skillRangePositions(stage, unit, skill).filter((position) => {
  if (skill.effect === 'dash') {
    const target = stage.units.find((candidate) => same(candidate, position) && targetMatches(unit, candidate, skill.targetType));
    if (!target || !neighbors(target).some((landing) => { const path = shortestPath(stage, unit, landing); return path.length > 0 && pathCost(path) <= 2; })) return false;
  }
  if (skill.range === 0 && skill.area > 0) return stage.units.some((target) => targetMatches(unit, target, skill.targetType) && areaPositions(position, skill.area).some((area) => same(area, target)));
  return stage.units.some((target) => same(position, target) && targetMatches(unit, target, skill.targetType));
});
export const skillsForUnit = (unit: Unit): SkillDefinition[] => unit.skillIds.map((id) => SKILLS[id]).filter(Boolean);
export const skillForUnit = (unit: Unit): SkillDefinition | undefined => skillsForUnit(unit)[0];
export const canUseSkill = (stage: StageData, unit: Unit, skill: SkillDefinition): boolean => !unit.acted && unit.currentMp >= skill.mpCost && selectableSkillTargets(stage, unit, skill).length > 0;

const knockBack = (state: PlayState, attacker: Unit, target: Unit): boolean => {
  if (target.hp <= 0 || !state.stage.units.some((unit) => unit.id === target.id)) return false;
  const dx = Math.sign(target.x - attacker.x); const dy = Math.sign(target.y - attacker.y);
  const destination = { x: target.x + dx, y: target.y + dy };
  if (!inBounds(destination) || state.stage.terrain[indexOf(destination)] !== 'floor' || state.stage.units.some((unit) => same(unit, destination))) return false;
  target.x = destination.x; target.y = destination.y; return true;
};
const dashToTarget = (stage: StageData, unit: Unit, target: Unit): boolean => {
  const choices = neighbors(target).map((position) => ({ position, path: shortestPath(stage, unit, position) }))
    .filter(({ path }) => path.length > 0 && pathCost(path) <= 2)
    .sort((a, b) => pathCost(a.path) - pathCost(b.path) || a.position.y - b.position.y || a.position.x - b.position.x);
  const choice = choices[0]; if (!choice) return false;
  unit.x = choice.position.x; unit.y = choice.position.y; unit.direction = directionBetween(unit, target) ?? unit.direction; return true;
};

export interface SkillResult { success: boolean; reason?: 'no-skill' | 'not-enough-mp' | 'invalid-target'; attack?: AttackDamage; attacks?: AttackDamage[]; knockedBack?: boolean }
export const useUnitSkill = (state: PlayState, unitId: string, skillId?: SkillId, targetPosition?: Position): SkillResult => {
  const unit = state.stage.units.find((candidate) => candidate.id === unitId); const skill = unit && SKILLS[skillId ?? unit.skillIds[0]];
  if (!unit || !skill || !unit.skillIds.includes(skill.id) || unit.acted) return { success: false, reason: 'no-skill' };
  if (unit.currentMp < skill.mpCost) return { success: false, reason: 'not-enough-mp' };
  const valid = selectableSkillTargets(state.stage, unit, skill); const center = targetPosition ?? (valid.length === 1 ? valid[0] : undefined);
  if (!center || !valid.some((position) => same(position, center))) return { success: false, reason: 'invalid-target' };
  if (skill.effect === 'guard') { unit.guarding = true; }
  else if (skill.effect === 'protect') {
    const target = state.stage.units.find((candidate) => same(candidate, center) && targetMatches(unit, candidate, 'ally')); if (!target) return { success: false, reason: 'invalid-target' }; target.protected = true;
  } else {
    const primary = state.stage.units.find((candidate) => same(candidate, center) && targetMatches(unit, candidate, 'enemy'));
    if (skill.effect === 'dash' && (!primary || !dashToTarget(state.stage, unit, primary))) return { success: false, reason: 'invalid-target' };
    const targets = [...state.stage.units].filter((target) => targetMatches(unit, target, skill.targetType) && areaPositions(center, skill.area).some((position) => same(position, target)));
    const attacks = targets.map((target) => damageUnit(state, unit, target, skill.damageMultiplier));
    const knockedBack = skill.effect === 'knockback' && Boolean(primary) && knockBack(state, unit, primary!);
    unit.currentMp -= skill.mpCost; unit.acted = true;
    state.message = `${skill.name}！ ${attacks.length}体に命中しました。`; return { success: true, attack: attacks[0], attacks, knockedBack };
  }
  unit.currentMp -= skill.mpCost; unit.acted = true; state.message = `${skill.name}！`; return { success: true };
};

export const estimateSkillDamage = (stage: StageData, unit: Unit, skill: SkillDefinition, center: Position): number => stage.units
  .filter((target) => targetMatches(unit, target, skill.targetType) && areaPositions(center, skill.area).some((position) => same(position, target)))
  .reduce((total, target) => total + calculateAttackDamage(unit, target, skill.damageMultiplier).damage, 0);
