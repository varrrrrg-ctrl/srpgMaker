import { reachablePositions } from './movement';
import { type PlayState, type Unit } from './types';

export const buildActionOrder = (units: Unit[]): string[] => units
  .filter((unit) => unit.hp > 0)
  .sort((a, b) => b.speed - a.speed || a.id.localeCompare(b.id))
  .map((unit) => unit.id);

export const currentUnit = (state: PlayState): Unit | undefined => {
  while (state.currentActionIndex < state.actionOrder.length) {
    const unit = state.stage.units.find((candidate) => candidate.id === state.actionOrder[state.currentActionIndex] && candidate.hp > 0);
    if (unit && !unit.acted) return unit;
    state.currentActionIndex += 1;
  }
  return undefined;
};

const prepareCurrentUnit = (state: PlayState): Unit | undefined => {
  const unit = currentUnit(state);
  if (!unit) return undefined;
  state.turn = unit.side;
  state.selectedUnitId = unit.id;
  state.origin = unit.side === 'ally' ? {
    unitId: unit.id,
    position: { x: unit.x, y: unit.y },
    direction: unit.direction,
    reachable: reachablePositions(state.stage, unit),
  } : null;
  state.phase = unit.side === 'ally' ? 'move' : 'enemy';
  state.message = unit.side === 'ally' ? `${unit.id} の行動です。自由に移動できます。` : `${unit.id} が行動中です。`;
  return unit;
};

export const startRound = (state: PlayState, round = state.round): Unit | undefined => {
  state.round = round;
  state.stage.units.forEach((unit) => {
    unit.acted = false;
    if (round > 1 && unit.hp > 0) {
      unit.currentMp = Math.min(unit.currentMp + 10, unit.maxMp);
      unit.guarding = false;
      unit.protected = false;
    }
  });
  state.actionOrder = buildActionOrder(state.stage.units);
  state.currentActionIndex = 0;
  return prepareCurrentUnit(state);
};

export const finishCurrentAction = (state: PlayState): Unit | undefined => {
  if (state.result !== 'playing') return undefined;
  const id = state.actionOrder[state.currentActionIndex];
  const unit = state.stage.units.find((candidate) => candidate.id === id);
  if (unit) unit.acted = true;
  state.currentActionIndex += 1;
  state.origin = null;
  state.selectedUnitId = null;
  if (!currentUnit(state)) return startRound(state, state.round + 1);
  return prepareCurrentUnit(state);
};

export const remainingActionOrder = (state: PlayState): Unit[] => state.actionOrder
  .slice(state.currentActionIndex)
  .map((id) => state.stage.units.find((unit) => unit.id === id && unit.hp > 0 && !unit.acted))
  .filter((unit): unit is Unit => Boolean(unit));
