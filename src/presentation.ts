import { type SkillDefinition } from './skills';
import { type PlayerPresetName, type UnitSide } from './types';

export const UNIT_TYPE_MARKERS: Record<PlayerPresetName, string> = { Balance: 'B', Attacker: 'A', Tank: 'T', Assault: 'S', Defender: 'D' };
export const factionLabel = (side: UnitSide): string => side === 'ally' ? 'Friendly' : 'Enemy';
export const skillRangeLabel = (skill: SkillDefinition): string => skill.range === 0 ? (skill.targetType === 'self' ? '自分' : '自分中心') : skill.rangeType === 'line' ? `直線${skill.range}` : String(skill.range);
export const skillAreaLabel = (skill: SkillDefinition): string => skill.targetType === 'self' ? '自分' : skill.targetType === 'ally' ? '味方単体' : skill.area === 0 ? '単体' : `上下左右${skill.area}マス`;
export interface SkillDetails { name: string; mp: string; currentMp: string; range: string; area: string; power?: string; description: string; unavailable?: string }
export const skillDetails = (skill: SkillDefinition, currentMp: number): SkillDetails => ({
  name: skill.name,
  mp: String(skill.mpCost),
  currentMp: String(currentMp),
  range: skillRangeLabel(skill),
  area: skillAreaLabel(skill),
  power: skill.damageMultiplier > 0 ? `×${skill.damageMultiplier}` : undefined,
  description: skill.description,
  unavailable: currentMp < skill.mpCost ? 'MP不足' : undefined,
});
