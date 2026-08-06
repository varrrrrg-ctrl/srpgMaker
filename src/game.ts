import { runEnemyTurn } from './ai';
import { adjacentEnemies, attackUnit, resetActed, updateResult } from './combat';
import { shortestPath } from './movement';
import { cloneStage, createStage, defaultUnit, indexOf, type PlayState, type Position, type StageData, type Tool, type Unit } from './types';

export const createPlayState = (stage: StageData): PlayState => {
  const playState: PlayState = {
    stage: cloneStage(stage),
    turn: 'ally',
    selectedUnitId: null,
    phase: 'select',
    result: 'playing',
    message: '味方を選択してください。',
  };
  resetActed(playState, 'ally');
  resetActed(playState, 'enemy');
  updateResult(playState);
  return playState;
};

export const applyEditTool = (stage: StageData, tool: Tool, position: Position): StageData => {
  const nextStage = cloneStage(stage);
  nextStage.units = nextStage.units.filter((unit) => unit.x !== position.x || unit.y !== position.y);

  if (tool === 'erase') {
    nextStage.terrain[indexOf(position)] = 'floor';
    return nextStage;
  }

  if (tool === 'ally' || tool === 'enemy') {
    nextStage.units.push(defaultUnit(tool, position.x, position.y));
    return nextStage;
  }

  nextStage.terrain[indexOf(position)] = tool;
  return nextStage;
};

export const selectedUnit = (state: PlayState): Unit | undefined => (
  state.selectedUnitId ? state.stage.units.find((unit) => unit.id === state.selectedUnitId) : undefined
);

export const endAllyAction = (state: PlayState): void => {
  const unit = selectedUnit(state);
  if (unit) unit.acted = true;
  updateResult(state);
  if (state.result !== 'playing') return;

  const allAlliesActed = state.stage.units.filter((candidate) => candidate.side === 'ally').every((candidate) => candidate.acted);
  if (allAlliesActed) {
    state.turn = 'enemy';
    state.phase = 'enemy';
    state.selectedUnitId = null;
    state.message = '敵ターンです。敵が行動しています。';
    return;
  }

  state.selectedUnitId = null;
  state.phase = 'select';
  state.message = '次の味方を選択してください。';
};

export const resolveEnemyTurn = (state: PlayState): void => {
  runEnemyTurn(state);
  updateResult(state);
};

export const handlePlayTap = (state: PlayState, position: Position): void => {
  if (state.result !== 'playing' || state.turn !== 'ally') return;

  const unitAtPosition = state.stage.units.find((unit) => unit.x === position.x && unit.y === position.y);
  const activeUnit = selectedUnit(state);

  if (state.phase === 'select') {
    if (unitAtPosition?.side === 'ally' && !unitAtPosition.acted) {
      state.selectedUnitId = unitAtPosition.id;
      state.phase = 'move';
      state.message = '青い範囲内の移動先を選択してください。';
    } else {
      state.message = '未行動の味方を選択してください。';
    }
    return;
  }

  if (state.phase === 'move' && activeUnit) {
    const path = shortestPath(state.stage, activeUnit, position);
    if (path.length === 0) {
      state.message = 'そのマスへは移動できません。';
      return;
    }

    const destination = path[path.length - 1];
    activeUnit.x = destination.x;
    activeUnit.y = destination.y;
    state.phase = 'action';
    state.message = adjacentEnemies(state.stage.units, activeUnit).length > 0
      ? '隣接する敵をタップするか、攻撃/待機を選んでください。'
      : '攻撃できる敵がいません。待機を選んでください。';
    return;
  }

  if (state.phase === 'action' && activeUnit && unitAtPosition) {
    const target = adjacentEnemies(state.stage.units, activeUnit).find((enemy) => enemy.id === unitAtPosition.id);
    if (!target) {
      state.message = '隣接する敵だけ攻撃できます。';
      return;
    }

    attackUnit(state, activeUnit.id, target.id);
    if (state.result === 'playing') endAllyAction(state);
  }
};

export const performAttackCommand = (state: PlayState): void => {
  const activeUnit = selectedUnit(state);
  if (!activeUnit || state.phase !== 'action') return;

  const target = adjacentEnemies(state.stage.units, activeUnit)[0];
  if (!target) {
    state.message = '攻撃できる敵がいません。待機してください。';
    return;
  }

  attackUnit(state, activeUnit.id, target.id);
  if (state.result === 'playing') endAllyAction(state);
};

export const createDefaultPlayableStage = (): StageData => {
  const stage = createStage();
  stage.units.push(defaultUnit('ally', 1, 6));
  stage.units.push(defaultUnit('enemy', 8, 1));
  stage.terrain[indexOf({ x: 4, y: 2 })] = 'wall';
  stage.terrain[indexOf({ x: 4, y: 3 })] = 'wall';
  stage.terrain[indexOf({ x: 5, y: 5 })] = 'jump';
  return stage;
};
