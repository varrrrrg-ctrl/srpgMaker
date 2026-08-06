import { createStage, MAP_HEIGHT, MAP_WIDTH, type StageData } from './types';

const KEY = 'srpg-maker-stage-v1';

export const saveStage = (stage: StageData): void => {
  localStorage.setItem(KEY, JSON.stringify(stage));
};

export const hasSavedStage = (): boolean => localStorage.getItem(KEY) !== null;

export const loadStage = (): StageData => parseStage(localStorage.getItem(KEY) ?? '');

export const parseStage = (text: string): StageData => {
  try {
    const data = JSON.parse(text) as StageData;
    if (
      data.version === 1
      && Array.isArray(data.terrain)
      && data.terrain.length === MAP_WIDTH * MAP_HEIGHT
      && Array.isArray(data.units)
    ) {
      return data;
    }
  } catch {
    // Invalid user-provided JSON falls back to an empty stage.
  }

  return createStage();
};

export const stageToJson = (stage: StageData): string => JSON.stringify(stage, null, 2);
