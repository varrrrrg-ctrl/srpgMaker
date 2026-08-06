import './style.css';
import { applyEditTool, createDefaultPlayableStage, createPlayState, endAllyAction, handlePlayTap, performAttackCommand, resolveEnemyTurn } from './game';
import { bindGridTap } from './input';
import { draw, CANVAS_HEIGHT, CANVAS_WIDTH } from './render';
import { hasSavedStage, loadStage, parseStage, saveStage, stageToJson } from './storage';
import { type PlayState, type StageData, type Tool } from './types';

const ENEMY_TURN_DELAY_MS = 300;
const toolLabels: Record<Tool, string> = {
  floor: '床',
  wall: '壁',
  jump: 'ジャンプ障害物',
  ally: '味方',
  enemy: '敵',
  erase: '消去',
};

let editStage: StageData = createDefaultPlayableStage();
let playState: PlayState | null = null;
let selectedTool: Tool = 'floor';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('#app is missing');

app.className = 'app';
app.innerHTML = `
  <div class="toolbar" aria-label="メイン操作">
    <button id="edit" type="button">編集</button>
    <button id="play" type="button">テストプレイ</button>
    <button id="save" type="button">保存</button>
    <button id="load" type="button">読込</button>
    <button id="jsonBtn" type="button">JSON出力</button>
    <button id="reset" type="button">リセット</button>
  </div>
  <div class="canvas-wrap">
    <canvas width="${CANVAS_WIDTH}" height="${CANVAS_HEIGHT}" aria-label="10列8行のSRPGマップ"></canvas>
  </div>
  <div class="actions hidden" aria-label="戦闘操作">
    <button id="attack" type="button">攻撃</button>
    <button id="wait" type="button">待機</button>
    <button id="back" type="button">編集へ戻る</button>
  </div>
  <div class="palette" aria-label="編集パレット"></div>
  <div class="status" role="status"></div>
  <textarea class="json" readonly placeholder="JSON出力はここに表示されます"></textarea>
  <label class="file-label json-import">JSON読込<input id="file" type="file" accept="application/json,.json"></label>
`;

const canvas = app.querySelector<HTMLCanvasElement>('canvas');
const context = canvas?.getContext('2d');
const status = app.querySelector<HTMLDivElement>('.status');
const palette = app.querySelector<HTMLDivElement>('.palette');
const actions = app.querySelector<HTMLDivElement>('.actions');
const jsonOutput = app.querySelector<HTMLTextAreaElement>('.json');

if (!canvas || !context || !status || !palette || !actions || !jsonOutput) {
  throw new Error('Application UI failed to initialize');
}

const activeStage = (): StageData => playState?.stage ?? editStage;

const updateActionButtons = (): void => {
  const showActions = playState?.phase === 'action' || playState?.result !== 'playing';
  actions.classList.toggle('hidden', !showActions);
};

const updateStatus = (): void => {
  if (!playState) {
    status.textContent = `選択中：${toolLabels[selectedTool]}。パレットを選び、マスをタップして配置します。保存/読込は端末内localStorageを使います。`;
    return;
  }

  const turnLabel = playState.turn === 'ally' ? '味方' : '敵';
  const resultLabel = playState.result === 'victory' ? '勝利！編集へ戻れます。' : playState.result === 'defeat' ? '敗北...編集へ戻れます。' : playState.message;
  status.textContent = `${turnLabel}ターン：${resultLabel}`;
};

const render = (): void => {
  draw(context, activeStage(), playState, selectedTool);
  palette.querySelectorAll('button').forEach((button) => {
    button.classList.toggle('active', button.dataset.tool === selectedTool);
  });
  updateActionButtons();
  updateStatus();
};

const scheduleEnemyTurnIfNeeded = (): void => {
  if (!playState || playState.turn !== 'enemy' || playState.result !== 'playing') return;
  window.setTimeout(() => {
    if (!playState || playState.turn !== 'enemy' || playState.result !== 'playing') return;
    resolveEnemyTurn(playState);
    render();
  }, ENEMY_TURN_DELAY_MS);
};

const finishAllyAction = (): void => {
  if (!playState) return;
  endAllyAction(playState);
  render();
  scheduleEnemyTurnIfNeeded();
};

for (const [tool, label] of Object.entries(toolLabels) as Array<[Tool, string]>) {
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.tool = tool;
  button.textContent = label;
  button.addEventListener('click', () => {
    selectedTool = tool;
    render();
  });
  palette.append(button);
}

bindGridTap(canvas, (position) => {
  if (playState) {
    handlePlayTap(playState, position);
    render();
    scheduleEnemyTurnIfNeeded();
    return;
  }

  editStage = applyEditTool(editStage, selectedTool, position);
  render();
});

app.querySelector<HTMLButtonElement>('#edit')?.addEventListener('click', () => {
  playState = null;
  render();
});

app.querySelector<HTMLButtonElement>('#play')?.addEventListener('click', () => {
  playState = createPlayState(editStage);
  render();
});

app.querySelector<HTMLButtonElement>('#save')?.addEventListener('click', () => {
  saveStage(editStage);
  status.textContent = 'localStorageへ保存しました。';
});

app.querySelector<HTMLButtonElement>('#load')?.addEventListener('click', () => {
  if (!hasSavedStage()) {
    status.textContent = '保存データがありません。まず保存してください。';
    return;
  }

  editStage = loadStage();
  playState = null;
  render();
  status.textContent = 'localStorageから読み込みました。';
});

app.querySelector<HTMLButtonElement>('#jsonBtn')?.addEventListener('click', () => {
  jsonOutput.value = stageToJson(editStage);
});

app.querySelector<HTMLButtonElement>('#reset')?.addEventListener('click', () => {
  editStage = createDefaultPlayableStage();
  playState = null;
  jsonOutput.value = '';
  render();
});

app.querySelector<HTMLButtonElement>('#wait')?.addEventListener('click', () => {
  finishAllyAction();
});

app.querySelector<HTMLButtonElement>('#attack')?.addEventListener('click', () => {
  if (!playState) return;
  performAttackCommand(playState);
  render();
  scheduleEnemyTurnIfNeeded();
});

app.querySelector<HTMLButtonElement>('#back')?.addEventListener('click', () => {
  playState = null;
  render();
});

app.querySelector<HTMLInputElement>('#file')?.addEventListener('change', async (event) => {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;

  editStage = parseStage(await file.text());
  playState = null;
  render();
});

try {
  if (hasSavedStage()) editStage = loadStage();
} catch {
  editStage = createDefaultPlayableStage();
}

render();
