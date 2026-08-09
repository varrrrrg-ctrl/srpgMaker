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
        const preset = unit.name && unit.name in PLAYER_PRESETS ? PLAYER_PRESETS[unit.name as PlayerPresetName] : undefined;
        if (!Number.isFinite(unit.maxMp)) unit.maxMp = preset?.maxMp ?? DEFAULT_MAX_MP;
        if (!Number.isFinite(unit.currentMp)) unit.currentMp = preset?.currentMp ?? DEFAULT_CURRENT_MP;
        unit.currentMp = Math.max(0, Math.min(unit.currentMp, unit.maxMp));
        if (typeof unit.guarding !== 'boolean') unit.guarding = false;
        if (!unit.skillId && preset) unit.skillId = preset.skillId;
      });
      return data;
    }
  } catch { /* invalid user json */ }
  return createStage();
};
export const stageToJson = (stage: StageData): string => JSON.stringify(stage, null, 2);
