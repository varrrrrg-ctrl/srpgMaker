import { createStage, DEFAULT_CURRENT_MP, DEFAULT_DEFENSE, DEFAULT_MAX_MP, DEFAULT_SPEED, PLAYER_PRESETS, type PlayerPresetName, type StageData } from './types';
const KEY = 'srpg-maker-stage-v1';
export const saveStage = (stage: StageData): void => localStorage.setItem(KEY, JSON.stringify(stage));
export const loadStage = (): StageData => parseStage(localStorage.getItem(KEY) ?? '');
export const parseStage = (text: string): StageData => {
  try {
    const data = JSON.parse(text) as StageData;
    if (data.version === 1 && Array.isArray(data.terrain) && Array.isArray(data.units)) {
      data.units.forEach((unit) => {
        if (!Number.isFinite(unit.speed)) unit.speed = DEFAULT_SPEED;
        if (!Number.isFinite(unit.defense)) unit.defense = DEFAULT_DEFENSE;
        const unitType = unit.unitType && unit.unitType in PLAYER_PRESETS ? unit.unitType : (unit.name && unit.name in PLAYER_PRESETS ? unit.name : 'Balance');
        unit.unitType = unitType as PlayerPresetName;
        const preset = PLAYER_PRESETS[unit.unitType];
        if (!Number.isFinite(unit.maxMp)) unit.maxMp = preset?.maxMp ?? DEFAULT_MAX_MP;
        if (!Number.isFinite(unit.currentMp)) unit.currentMp = preset?.currentMp ?? DEFAULT_CURRENT_MP;
        unit.currentMp = Math.max(0, Math.min(unit.currentMp, unit.maxMp));
        if (typeof unit.guarding !== 'boolean') unit.guarding = false;
        if (typeof unit.protected !== 'boolean') unit.protected = false;
        if (!Array.isArray(unit.skillIds)) unit.skillIds = [...preset.skillIds];
        if (!unit.skillId) unit.skillId = unit.skillIds[0];
      });
      return data;
    }
  } catch { /* invalid user json */ }
  return createStage();
};
export const stageToJson = (stage: StageData): string => JSON.stringify(stage, null, 2);
