import { type PlayState, type StageData, type Unit } from './types';

export const buildActionOrder = (units: Unit[]): string[] => [...units]
  .filter((unit) => unit.hp > 0)
  .sort((a, b) => b.speed - a.speed || a.id.localeCompare(b.id))
  .map((unit) => unit.id);

const setCurrent = (state: PlayState): Unit | null => {
  while (state.actionIndex < state.actionOrder.length) {
    const unit = state.stage.units.find((candidate) => candidate.id === state.actionOrder[state.actionIndex] && candidate.hp > 0 && !candidate.acted);
    if (unit) {
      state.selectedUnitId = unit.id;
      state.turn = unit.side;
      state.phase = unit.side === 'ally' ? 'move' : 'enemy';
      return unit;
    }
    state.actionIndex += 1;
  }
  return null;
};

export const createPlayState = (stage: StageData): PlayState => {
  stage.units.forEach((unit) => { unit.acted = false; });
  const state: PlayState = { stage, turn: 'ally', selectedUnitId: null, phase: 'select', origin: null, round: 1, actionOrder: buildActionOrder(stage.units), actionIndex: 0, result: 'playing', message: '' };
  setCurrent(state);
  return state;
};

export const currentUnit = (state: PlayState): Unit | null => {
  const id = state.actionOrder[state.actionIndex];
  return state.stage.units.find((unit) => unit.id === id && unit.hp > 0) ?? null;
};

export const finishCurrentAction = (state: PlayState): Unit | null => {
  if (state.result !== 'playing') return null;
  const current = currentUnit(state);
  if (current) current.acted = true;
  state.origin = null;
  state.actionIndex += 1;
  const next = setCurrent(state);
  if (next) return next;
  state.round += 1;
  state.stage.units.forEach((unit) => { unit.acted = false; });
  state.actionOrder = buildActionOrder(state.stage.units);
  state.actionIndex = 0;
  return setCurrent(state);
};

export const remainingActionOrder = (state: PlayState): Unit[] => state.actionOrder
  .slice(state.actionIndex)
  .map((id) => state.stage.units.find((unit) => unit.id === id && unit.hp > 0 && !unit.acted))
  .filter((unit): unit is Unit => Boolean(unit));
