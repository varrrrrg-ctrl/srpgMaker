import { createStage, type StageData } from './types';
const KEY = 'srpg-maker-stage-v1';
export const saveStage = (stage: StageData): void => localStorage.setItem(KEY, JSON.stringify(stage));
export const loadStage = (): StageData => parseStage(localStorage.getItem(KEY) ?? '');
export const parseStage = (text: string): StageData => {
  try {
    const data = JSON.parse(text) as StageData;
    if (data.version === 1 && Array.isArray(data.terrain) && Array.isArray(data.units)) {
      data.units.forEach((unit) => { if (typeof unit.speed !== 'number') unit.speed = 10; });
      return data;
    }
  } catch { /* invalid user json */ }
  return createStage();
};
export const stageToJson = (stage: StageData): string => JSON.stringify(stage, null, 2);
