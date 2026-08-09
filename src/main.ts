import './style.css';
import { runEnemyAction } from './ai';
import { attackableTargets, performFrontAttack, updateResult } from './combat';
import { changeDirection, flickDirection, movementStep, reachablePositions } from './movement';
import { draw, CANVAS_HEIGHT, CANVAS_WIDTH } from './render';
import { loadStage, parseStage, saveStage, stageToJson } from './storage';
import { createPlayState, currentUnit, finishCurrentAction, remainingActionOrder } from './turn';
import { cloneStage, createStage, defaultUnit, indexOf, type Direction, type PlayState, type Position, type StageData, type Tool } from './types';

let editStage: StageData = createStage(); let playState: PlayState | null = null; let tool: Tool = 'floor';
let pointerStart: { x: number; y: number; unitGesture: boolean } | null = null;
const app = document.querySelector<HTMLDivElement>('#app')!; app.className = 'app';
app.innerHTML = `<div class="toolbar"><button id="edit">編集</button><button id="play">テストプレイ</button><button id="save">保存</button><label class="file-label">読込<input id="file" type="file" accept="application/json,.json"></label><button id="jsonBtn">JSON出力</button><button id="reset">リセット</button></div><div class="battle-info hidden"><strong class="round"></strong><span class="order"></span></div><div class="canvas-wrap"><canvas width="${CANVAS_WIDTH}" height="${CANVAS_HEIGHT}"></canvas></div><div class="actions hidden"><button id="attack">攻撃</button><button id="direction">向き変更</button><button id="return">開始位置へ戻る</button><button id="cancel">キャンセル</button><button id="end">行動終了</button><button id="back">編集へ戻る</button><div class="direction-pad hidden"><button data-direction="up">↑</button><button data-direction="left">←</button><button data-direction="down">↓</button><button data-direction="right">→</button></div></div><div class="palette"></div><div class="status"></div><textarea class="json" readonly placeholder="JSON出力はここに表示されます"></textarea>`;
const canvas = app.querySelector('canvas')!; const ctx = canvas.getContext('2d')!; const status = app.querySelector<HTMLDivElement>('.status')!; const palette = app.querySelector<HTMLDivElement>('.palette')!; const actions = app.querySelector<HTMLDivElement>('.actions')!; const directionPad = app.querySelector<HTMLDivElement>('.direction-pad')!; const battleInfo = app.querySelector<HTMLDivElement>('.battle-info')!; const json = app.querySelector<HTMLTextAreaElement>('.json')!;
const labels: Record<Tool, string> = { floor: '床', wall: '壁', jump: 'ジャンプ障害物', ally: '味方', enemy: '敵', erase: '消去' };
for (const t of Object.keys(labels) as Tool[]) { const button = document.createElement('button'); button.textContent = labels[t]; button.addEventListener('click', () => { tool = t; render(); }); palette.append(button); }
const currentStage = (): StageData => playState?.stage ?? editStage;
const selectedUnit = () => playState ? currentUnit(playState) : null;
const unitLabel = (unit: NonNullable<ReturnType<typeof selectedUnit>>): string => `${unit.side === 'ally' ? '味方' : '敵'}(${unit.id.slice(0, 4)})`;
const render = (): void => {
  draw(ctx, currentStage(), playState, tool); palette.querySelectorAll('button').forEach((button) => button.classList.toggle('active', button.textContent === labels[tool]));
  const unit = selectedUnit(); const active = Boolean(playState?.result === 'playing' && unit?.side === 'ally' && !unit.acted);
  actions.classList.toggle('hidden', !playState); battleInfo.classList.toggle('hidden', !playState); directionPad.classList.toggle('hidden', playState?.phase !== 'direction');
  actions.querySelectorAll<HTMLButtonElement>('button:not(#back)').forEach((button) => { button.disabled = !active; });
  app.querySelector<HTMLButtonElement>('#attack')!.disabled = !active || !unit || attackableTargets(currentStage().units, unit).length === 0;
  if (playState) {
    app.querySelector<HTMLElement>('.round')!.textContent = `ラウンド ${playState.round}`;
    app.querySelector<HTMLElement>('.order')!.textContent = `残り行動順：${remainingActionOrder(playState).map(unitLabel).join(' → ') || 'なし'}`;
  }
  status.textContent = playState ? `${playState.message}${unit ? ` 現在の向き：${unit.direction}` : ''}` : `選択中：${labels[tool]}。パレットを選び、マスをタップして配置します。`;
};
const cellAt = (clientX: number, clientY: number): Position => { const rect = canvas.getBoundingClientRect(); return { x: Math.floor((clientX - rect.left) / (rect.width / 10)), y: Math.floor((clientY - rect.top) / (rect.height / 8)) }; };
const editTap = ({ x, y }: Position): void => { editStage.units = editStage.units.filter((unit) => !(unit.x === x && unit.y === y)); if (tool === 'erase') editStage.terrain[indexOf({ x, y })] = 'floor'; else if (tool === 'ally' || tool === 'enemy') editStage.units.push(defaultUnit(tool, x, y)); else editStage.terrain[indexOf({ x, y })] = tool; };
const prepareActiveUnit = (): void => {
  if (!playState || playState.result !== 'playing') return;
  const unit = currentUnit(playState); if (!unit) return;
  playState.selectedUnitId = unit.id;
  if (unit.side === 'ally') {
    playState.turn = 'ally'; playState.phase = 'move'; playState.origin = { unitId: unit.id, position: { x: unit.x, y: unit.y }, direction: unit.direction, reachable: reachablePositions(playState.stage, unit) };
    playState.message = `ラウンド${playState.round}：${unitLabel(unit)}の行動です。自由移動、フリック、攻撃、行動終了ができます。`;
  } else {
    playState.turn = 'enemy'; playState.phase = 'enemy'; playState.origin = null; playState.message = `ラウンド${playState.round}：${unitLabel(unit)}が行動中です。`; render();
    setTimeout(() => { if (!playState || playState.result !== 'playing') return; const acting = currentUnit(playState); if (!acting || acting.id !== unit.id) return; runEnemyAction(playState, unit.id); updateResult(playState); if (playState.result === 'playing') { finishCurrentAction(playState); prepareActiveUnit(); } render(); }, 250);
  }
};
const completePlayerAction = (): void => { if (!playState || playState.result !== 'playing' || currentUnit(playState)?.side !== 'ally') return; finishCurrentAction(playState); prepareActiveUnit(); render(); };
const setDirection = (direction: Direction): void => { const unit = selectedUnit(); if (!playState || !unit || unit.side !== 'ally' || unit.acted) return; changeDirection(unit, direction); playState.message = `${unitLabel(unit)}：向き ${direction}`; };
const playTap = (position: Position): void => { const unit = selectedUnit(); if (!playState || !unit || unit.side !== 'ally' || unit.acted || playState.result !== 'playing') return; if (playState.phase === 'move' && playState.origin && movementStep(playState.stage, unit, playState.origin.reachable, position)) playState.message = `${unitLabel(unit)}：自由移動中（向き ${unit.direction}）`; };
canvas.addEventListener('pointerdown', (event) => { const cell = cellAt(event.clientX, event.clientY); const unit = selectedUnit(); pointerStart = { x: event.clientX, y: event.clientY, unitGesture: Boolean(playState && unit?.side === 'ally' && cell.x === unit.x && cell.y === unit.y) }; });
canvas.addEventListener('pointerup', (event) => {
  if (!pointerStart) return; const start = pointerStart; pointerStart = null; const dx = event.clientX - start.x; const dy = event.clientY - start.y; const direction = start.unitGesture ? flickDirection(dx, dy) : null;
  if (direction) { setDirection(direction); render(); return; }
  if (Math.hypot(dx, dy) >= 8) return;
  const cell = cellAt(event.clientX, event.clientY); if (cell.x < 0 || cell.x >= 10 || cell.y < 0 || cell.y >= 8) return; playState ? playTap(cell) : editTap(cell); render();
});
canvas.addEventListener('pointercancel', () => { pointerStart = null; });
app.querySelector('#edit')!.addEventListener('click', () => { playState = null; render(); });
app.querySelector('#play')!.addEventListener('click', () => { playState = createPlayState(cloneStage(editStage)); updateResult(playState); prepareActiveUnit(); render(); });
app.querySelector('#save')!.addEventListener('click', () => { saveStage(editStage); status.textContent = 'localStorageへ保存しました。'; });
app.querySelector('#jsonBtn')!.addEventListener('click', () => { json.value = stageToJson(editStage); });
app.querySelector('#reset')!.addEventListener('click', () => { editStage = createStage(); playState = null; render(); });
app.querySelector('#end')!.addEventListener('click', completePlayerAction);
app.querySelector('#attack')!.addEventListener('click', () => { const unit = selectedUnit(); if (!playState || !unit || !performFrontAttack(playState, unit.id)) return; updateResult(playState); if (playState.result === 'playing') completePlayerAction(); else render(); });
app.querySelector('#direction')!.addEventListener('click', () => { if (playState && selectedUnit()?.side === 'ally') { playState.phase = playState.phase === 'direction' ? 'move' : 'direction'; render(); } });
directionPad.querySelectorAll<HTMLButtonElement>('button').forEach((button) => button.addEventListener('click', () => { setDirection(button.dataset.direction as Direction); render(); }));
app.querySelector('#cancel')!.addEventListener('click', () => { if (playState?.phase === 'direction') { playState.phase = 'move'; render(); } });
app.querySelector('#return')!.addEventListener('click', () => { const unit = selectedUnit(); if (playState?.origin && unit?.side === 'ally' && !unit.acted) { unit.x = playState.origin.position.x; unit.y = playState.origin.position.y; playState.phase = 'move'; playState.message = 'ターン開始位置へ戻りました。'; render(); } });
app.querySelector('#back')!.addEventListener('click', () => { playState = null; render(); });
app.querySelector<HTMLInputElement>('#file')!.addEventListener('change', async (event) => { const file = (event.target as HTMLInputElement).files?.[0]; if (file) { editStage = parseStage(await file.text()); playState = null; render(); } });
try { editStage = loadStage(); } catch { editStage = createStage(); }
render();
