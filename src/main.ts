import './style.css';
import { runEnemyAction } from './ai';
import { attackableTargets, attackUnit, updateResult } from './combat';
import { changeDirection, directionFromFlick, movementStep } from './movement';
import { draw, CANVAS_HEIGHT, CANVAS_WIDTH } from './render';
import { loadStage, parseStage, saveStage, stageToJson } from './storage';
import { currentUnit, finishCurrentAction, remainingActionOrder, startRound } from './turn';
import { cloneStage, createStage, defaultUnit, indexOf, type Direction, type PlayState, type StageData, type Tool } from './types';

let editStage: StageData = createStage();
let playState: PlayState | null = null;
let tool: Tool = 'floor';
let pointerStart: { x: number; y: number; onActiveUnit: boolean } | null = null;
let enemyTimer: number | null = null;
const app = document.querySelector<HTMLDivElement>('#app')!;
app.className = 'app';
app.innerHTML = `<div class="toolbar"><button id="edit">編集</button><button id="play">テストプレイ</button><button id="save">保存</button><label class="file-label">読込<input id="file" type="file" accept="application/json,.json"></label><button id="jsonBtn">JSON出力</button><button id="reset">リセット</button></div><div class="battle-info hidden"><strong class="round"></strong><span class="current"></span><span class="order"></span></div><div class="canvas-wrap"><canvas width="${CANVAS_WIDTH}" height="${CANVAS_HEIGHT}"></canvas></div><div class="actions hidden"><button id="attack">攻撃</button><button id="direction">向き変更</button><button id="return">開始位置へ戻る</button><button id="cancel">キャンセル</button><button id="end">行動終了</button><button id="back">編集へ戻る</button><div class="direction-pad hidden"><button data-direction="up">↑</button><button data-direction="left">←</button><button data-direction="down">↓</button><button data-direction="right">→</button></div></div><div class="palette"></div><div class="status"></div><textarea class="json" readonly placeholder="JSON出力はここに表示されます"></textarea>`;
const canvas = app.querySelector('canvas')!; const ctx = canvas.getContext('2d')!; const status = app.querySelector<HTMLDivElement>('.status')!; const palette = app.querySelector<HTMLDivElement>('.palette')!; const actions = app.querySelector<HTMLDivElement>('.actions')!; const directionPad = app.querySelector<HTMLDivElement>('.direction-pad')!; const battleInfo = app.querySelector<HTMLDivElement>('.battle-info')!; const json = app.querySelector<HTMLTextAreaElement>('.json')!;
const labels: Record<Tool, string> = { floor: '床', wall: '壁', jump: 'ジャンプ障害物', ally: '味方', enemy: '敵', erase: '消去' };
const directionLabels: Record<Direction, string> = { up: '上', down: '下', left: '左', right: '右' };
for (const t of Object.keys(labels) as Tool[]) { const button = document.createElement('button'); button.textContent = labels[t]; button.addEventListener('click', () => { tool = t; render(); }); palette.append(button); }
const currentStage = (): StageData => playState?.stage ?? editStage;
const selectedUnit = () => playState?.stage.units.find((unit) => unit.id === playState?.selectedUnitId);
const unitLabel = (id: string): string => { const unit = playState?.stage.units.find((candidate) => candidate.id === id); return unit ? `${unit.side === 'ally' ? '味方' : '敵'}(${unit.id.slice(0, 6)})` : id.slice(0, 6); };
const render = (): void => {
  draw(ctx, currentStage(), playState, tool);
  palette.querySelectorAll('button').forEach((button) => button.classList.toggle('active', button.textContent === labels[tool]));
  const activeUnit = playState ? currentUnit(playState) : undefined;
  const active = Boolean(playState && activeUnit?.side === 'ally' && playState.result === 'playing');
  actions.classList.toggle('hidden', !playState); battleInfo.classList.toggle('hidden', !playState); canvas.classList.toggle('playing', Boolean(playState));
  directionPad.classList.toggle('hidden', playState?.phase !== 'direction');
  actions.querySelectorAll<HTMLButtonElement>('button:not(#back)').forEach((button) => { button.disabled = !active; });
  const attack = app.querySelector<HTMLButtonElement>('#attack')!;
  attack.disabled = !active || !activeUnit || attackableTargets(currentStage().units, activeUnit).length === 0;
  if (playState) {
    battleInfo.querySelector('.round')!.textContent = `ラウンド ${playState.round}`;
    battleInfo.querySelector('.current')!.textContent = activeUnit ? `行動中: ${unitLabel(activeUnit.id)} / 向き: ${directionLabels[activeUnit.direction]}` : '';
    battleInfo.querySelector('.order')!.textContent = `残り: ${remainingActionOrder(playState).map((unit) => unitLabel(unit.id)).join(' → ') || 'なし'}`;
  }
  status.textContent = playState ? playState.message : `選択中：${labels[tool]}。パレットを選び、マスをタップして配置します。`;
};
const cellFromEvent = (event: PointerEvent) => { const rect = canvas.getBoundingClientRect(); return { x: Math.floor((event.clientX - rect.left) / (rect.width / 10)), y: Math.floor((event.clientY - rect.top) / (rect.height / 8)) }; };
const editTap = (x: number, y: number): void => { editStage.units = editStage.units.filter((unit) => !(unit.x === x && unit.y === y)); if (tool === 'erase') editStage.terrain[indexOf({ x, y })] = 'floor'; else if (tool === 'ally' || tool === 'enemy') editStage.units.push(defaultUnit(tool, x, y)); else editStage.terrain[indexOf({ x, y })] = tool; };
const scheduleEnemy = (): void => {
  if (!playState || playState.result !== 'playing' || currentUnit(playState)?.side !== 'enemy' || enemyTimer !== null) return;
  enemyTimer = window.setTimeout(() => {
    enemyTimer = null; if (!playState) return;
    const enemy = currentUnit(playState); if (!enemy || enemy.side !== 'enemy') return;
    runEnemyAction(playState, enemy.id);
    if (playState.result === 'playing') finishCurrentAction(playState);
    render(); scheduleEnemy();
  }, 250);
};
const finishAction = (): void => { if (!playState || selectedUnit()?.side !== 'ally' || playState.result !== 'playing') return; finishCurrentAction(playState); render(); scheduleEnemy(); };
const setDirection = (direction: Direction): void => { const unit = selectedUnit(); if (!playState || !unit || currentUnit(playState)?.id !== unit.id || unit.side !== 'ally') return; changeDirection(unit, direction); playState.phase = 'move'; playState.message = `向きを${directionLabels[direction]}に変更しました。`; };
const playTap = (x: number, y: number): void => {
  if (!playState || playState.result !== 'playing') return;
  const selected = selectedUnit(); if (!selected || currentUnit(playState)?.id !== selected.id || selected.side !== 'ally') return;
  if ((playState.phase === 'move' || playState.phase === 'direction') && playState.origin && movementStep(playState.stage, selected, playState.origin.reachable, { x, y })) { playState.phase = 'move'; playState.message = '自由移動中です。攻撃または行動終了を選べます。'; }
};
canvas.addEventListener('pointerdown', (event) => { const cell = cellFromEvent(event); const unit = selectedUnit(); pointerStart = { x: event.clientX, y: event.clientY, onActiveUnit: Boolean(unit && unit.x === cell.x && unit.y === cell.y && unit.side === 'ally') }; if (playState) canvas.setPointerCapture(event.pointerId); });
canvas.addEventListener('pointerup', (event) => {
  if (!pointerStart) return;
  const dx = event.clientX - pointerStart.x; const dy = event.clientY - pointerStart.y; const flickDirection = pointerStart.onActiveUnit ? directionFromFlick(dx, dy) : null;
  pointerStart = null;
  if (flickDirection) { setDirection(flickDirection); render(); return; }
  if (Math.hypot(dx, dy) >= 8) return;
  const cell = cellFromEvent(event); if (cell.x < 0 || cell.x >= 10 || cell.y < 0 || cell.y >= 8) return;
  playState ? playTap(cell.x, cell.y) : editTap(cell.x, cell.y); render();
});
canvas.addEventListener('pointercancel', () => { pointerStart = null; });
app.querySelector('#edit')!.addEventListener('click', () => { playState = null; render(); });
app.querySelector('#play')!.addEventListener('click', () => {
  playState = { stage: cloneStage(editStage), turn: 'ally', round: 1, actionOrder: [], currentActionIndex: 0, selectedUnitId: null, phase: 'select', origin: null, result: 'playing', message: '' };
  updateResult(playState); if (playState.result === 'playing') startRound(playState, 1); render(); scheduleEnemy();
});
app.querySelector('#save')!.addEventListener('click', () => { saveStage(editStage); status.textContent = 'localStorageへ保存しました。'; });
app.querySelector('#jsonBtn')!.addEventListener('click', () => { json.value = stageToJson(editStage); });
app.querySelector('#reset')!.addEventListener('click', () => { editStage = createStage(); playState = null; render(); });
app.querySelector('#end')!.addEventListener('click', finishAction);
app.querySelector('#attack')!.addEventListener('click', () => { if (!playState) return; const attacker = currentUnit(playState); const target = attacker && attackableTargets(playState.stage.units, attacker)[0]; if (!attacker || attacker.side !== 'ally' || !target) return; attackUnit(playState, attacker.id, target.id); if (playState.result === 'playing') finishAction(); else render(); });
app.querySelector('#direction')!.addEventListener('click', () => { if (playState && selectedUnit()) { playState.phase = 'direction'; playState.message = '方向ボタンまたはユニット上のフリックで向きを変更できます。'; render(); } });
directionPad.querySelectorAll<HTMLButtonElement>('button').forEach((button) => button.addEventListener('click', () => { setDirection(button.dataset.direction as Direction); render(); }));
app.querySelector('#cancel')!.addEventListener('click', () => { if (playState?.phase === 'direction') { playState.phase = 'move'; playState.message = '自由移動を続けられます。'; render(); } });
app.querySelector('#return')!.addEventListener('click', () => { const unit = selectedUnit(); if (playState?.origin && unit && !unit.acted) { unit.x = playState.origin.position.x; unit.y = playState.origin.position.y; unit.direction = playState.origin.direction; playState.phase = 'move'; playState.message = 'ターン開始位置と向きへ戻りました。'; render(); } });
app.querySelector('#back')!.addEventListener('click', () => { playState = null; render(); });
app.querySelector<HTMLInputElement>('#file')!.addEventListener('change', async (event) => { const file = (event.target as HTMLInputElement).files?.[0]; if (file) { editStage = parseStage(await file.text()); playState = null; render(); } });
try { editStage = loadStage(); } catch { editStage = createStage(); }
render();
