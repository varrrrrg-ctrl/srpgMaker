import './style.css';
import { runEnemyTurn } from './ai';
import { attackableTargets, attackUnit, resetActed, updateResult } from './combat';
import { changeDirection, directionBetween, movementStep, reachablePositions } from './movement';
import { draw, CANVAS_HEIGHT, CANVAS_WIDTH } from './render';
import { loadStage, parseStage, saveStage, stageToJson } from './storage';
import { cloneStage, createStage, defaultUnit, indexOf, type Direction, type PlayState, type StageData, type Tool } from './types';

let editStage: StageData = createStage();
let playState: PlayState | null = null;
let tool: Tool = 'floor';
let pointerStart: { x: number; y: number } | null = null;
const app = document.querySelector<HTMLDivElement>('#app')!;
app.className = 'app';
app.innerHTML = `<div class="toolbar"><button id="edit">編集</button><button id="play">テストプレイ</button><button id="save">保存</button><label class="file-label">読込<input id="file" type="file" accept="application/json,.json"></label><button id="jsonBtn">JSON出力</button><button id="reset">リセット</button></div><div class="canvas-wrap"><canvas width="${CANVAS_WIDTH}" height="${CANVAS_HEIGHT}"></canvas></div><div class="actions hidden"><button id="attack">攻撃</button><button id="direction">向き変更</button><button id="return">開始位置へ戻る</button><button id="cancel">キャンセル</button><button id="end">行動終了</button><button id="back">編集へ戻る</button><div class="direction-pad hidden"><button data-direction="up">↑</button><button data-direction="left">←</button><button data-direction="down">↓</button><button data-direction="right">→</button></div></div><div class="palette"></div><div class="status"></div><textarea class="json" readonly placeholder="JSON出力はここに表示されます"></textarea>`;
const canvas = app.querySelector('canvas')!; const ctx = canvas.getContext('2d')!; const status = app.querySelector<HTMLDivElement>('.status')!; const palette = app.querySelector<HTMLDivElement>('.palette')!; const actions = app.querySelector<HTMLDivElement>('.actions')!; const directionPad = app.querySelector<HTMLDivElement>('.direction-pad')!; const json = app.querySelector<HTMLTextAreaElement>('.json')!;
const labels: Record<Tool, string> = { floor: '床', wall: '壁', jump: 'ジャンプ障害物', ally: '味方', enemy: '敵', erase: '消去' };
for (const t of Object.keys(labels) as Tool[]) { const b = document.createElement('button'); b.textContent = labels[t]; b.addEventListener('click', () => { tool = t; render(); }); palette.append(b); }
const currentStage = (): StageData => playState?.stage ?? editStage;
const selectedUnit = () => playState?.stage.units.find((u) => u.id === playState?.selectedUnitId);
const render = (): void => {
  draw(ctx, currentStage(), playState, tool);
  palette.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.textContent === labels[tool]));
  const active = Boolean(playState && playState.turn === 'ally' && playState.selectedUnitId && playState.result === 'playing');
  actions.classList.toggle('hidden', !playState);
  directionPad.classList.toggle('hidden', playState?.phase !== 'direction');
  actions.querySelectorAll<HTMLButtonElement>('button:not(#back)').forEach((button) => { button.disabled = !active; });
  const attacker = selectedUnit(); const attack = app.querySelector<HTMLButtonElement>('#attack')!;
  attack.disabled = !active || !attacker || attackableTargets(currentStage().units, attacker).length === 0;
  status.textContent = playState ? `${playState.turn === 'ally' ? '味方' : '敵'}ターン：${playState.message}` : `選択中：${labels[tool]}。パレットを選び、マスをタップして配置します。`;
};
const cellFromEvent = (e: PointerEvent) => { const r = canvas.getBoundingClientRect(); return { x: Math.floor((e.clientX - r.left) / (r.width / 10)), y: Math.floor((e.clientY - r.top) / (r.height / 8)) }; };
const editTap = (x: number, y: number): void => { editStage.units = editStage.units.filter((u) => !(u.x === x && u.y === y)); if (tool === 'erase') editStage.terrain[indexOf({ x, y })] = 'floor'; else if (tool === 'ally' || tool === 'enemy') editStage.units.push(defaultUnit(tool, x, y)); else editStage.terrain[indexOf({ x, y })] = tool; };
const endAllyAction = (): void => {
  if (!playState) return;
  const unit = selectedUnit(); if (unit) unit.acted = true;
  playState.origin = null;
  if (playState.stage.units.filter((u) => u.side === 'ally').every((u) => u.acted)) { playState.turn = 'enemy'; playState.phase = 'enemy'; render(); setTimeout(() => { if (playState) { runEnemyTurn(playState); render(); } }, 250); }
  else { playState.selectedUnitId = null; playState.phase = 'select'; playState.message = '次の味方を選択してください。'; }
};
const setDirection = (direction: Direction): void => { const unit = selectedUnit(); if (!playState || !unit || playState.phase !== 'direction') return; changeDirection(unit, direction); playState.message = '向きを変更しました。移動、攻撃、行動終了を選べます。'; };
const playTap = (x: number, y: number): void => {
  if (!playState || playState.result !== 'playing' || playState.turn !== 'ally') return;
  const hit = playState.stage.units.find((u) => u.x === x && u.y === y); const selected = selectedUnit();
  if (playState.phase === 'select' && hit?.side === 'ally' && !hit.acted) {
    const reachable = reachablePositions(playState.stage, hit);
    playState.selectedUnitId = hit.id; playState.origin = { unitId: hit.id, position: { x: hit.x, y: hit.y }, direction: hit.direction, reachable }; playState.phase = 'move'; playState.message = '青い範囲内の隣接マスを1マスずつタップして移動します。';
  } else if (playState.phase === 'move' && selected && playState.origin) {
    if (movementStep(playState.stage, selected, playState.origin.reachable, { x, y })) playState.message = '自由移動中です。攻撃、向き変更、行動終了を選べます。';
  } else if (playState.phase === 'direction' && selected) {
    const direction = directionBetween(selected, { x, y }); if (direction && Math.abs(selected.x - x) + Math.abs(selected.y - y) === 1) setDirection(direction);
  } else if (playState.phase === 'attack' && selected && hit && attackableTargets(playState.stage.units, selected).some((u) => u.id === hit.id)) {
    attackUnit(playState, selected.id, hit.id); if (playState.result === 'playing') endAllyAction();
  }
  updateResult(playState);
};
canvas.addEventListener('pointerdown', (e) => { pointerStart = { x: e.clientX, y: e.clientY }; });
canvas.addEventListener('pointerup', (e) => { if (!pointerStart) return; const moved = Math.hypot(e.clientX - pointerStart.x, e.clientY - pointerStart.y); pointerStart = null; if (moved >= 8) return; const c = cellFromEvent(e); if (c.x < 0 || c.x >= 10 || c.y < 0 || c.y >= 8) return; playState ? playTap(c.x, c.y) : editTap(c.x, c.y); render(); });
canvas.addEventListener('pointercancel', () => { pointerStart = null; });
app.querySelector('#edit')!.addEventListener('click', () => { playState = null; render(); });
app.querySelector('#play')!.addEventListener('click', () => { playState = { stage: cloneStage(editStage), turn: 'ally', selectedUnitId: null, phase: 'select', origin: null, result: 'playing', message: '味方を選択してください。' }; resetActed(playState, 'ally'); resetActed(playState, 'enemy'); updateResult(playState); render(); });
app.querySelector('#save')!.addEventListener('click', () => { saveStage(editStage); status.textContent = 'localStorageへ保存しました。'; });
app.querySelector('#jsonBtn')!.addEventListener('click', () => { json.value = stageToJson(editStage); });
app.querySelector('#reset')!.addEventListener('click', () => { editStage = createStage(); playState = null; render(); });
app.querySelector('#end')!.addEventListener('click', () => { endAllyAction(); render(); });
app.querySelector('#attack')!.addEventListener('click', () => { if (playState && selectedUnit() && attackableTargets(playState.stage.units, selectedUnit()!).length > 0) { playState.phase = 'attack'; playState.message = 'ハイライトされた攻撃対象をタップしてください。'; render(); } });
app.querySelector('#direction')!.addEventListener('click', () => { if (playState && selectedUnit()) { playState.phase = 'direction'; playState.message = '上下左右のマスか方向ボタンをタップしてください。'; render(); } });
directionPad.querySelectorAll<HTMLButtonElement>('button').forEach((button) => button.addEventListener('click', () => { setDirection(button.dataset.direction as Direction); render(); }));
app.querySelector('#cancel')!.addEventListener('click', () => { if (playState?.phase === 'attack' || playState?.phase === 'direction') { playState.phase = 'move'; playState.message = '操作をキャンセルしました。自由移動を続けられます。'; render(); } });
app.querySelector('#return')!.addEventListener('click', () => { const unit = selectedUnit(); if (playState?.origin && unit && !unit.acted) { unit.x = playState.origin.position.x; unit.y = playState.origin.position.y; playState.phase = 'move'; playState.message = 'ターン開始位置へ戻りました。'; render(); } });
app.querySelector('#back')!.addEventListener('click', () => { playState = null; render(); });
app.querySelector<HTMLInputElement>('#file')!.addEventListener('change', async (e) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) { editStage = parseStage(await f.text()); playState = null; render(); } });
try { editStage = loadStage(); } catch { editStage = createStage(); }
render();
