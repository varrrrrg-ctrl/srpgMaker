import './style.css';
import { runEnemyTurn } from './ai';
import { adjacentEnemies, attackUnit, resetActed, updateResult } from './combat';
import { shortestPath } from './movement';
import { draw, CANVAS_HEIGHT, CANVAS_WIDTH } from './render';
import { loadStage, parseStage, saveStage, stageToJson } from './storage';
import { cloneStage, createStage, defaultUnit, indexOf, type PlayState, type StageData, type Tool } from './types';

let editStage: StageData = createStage();
let playState: PlayState | null = null;
let tool: Tool = 'floor';
let pointerStart: { x: number; y: number } | null = null;
const app = document.querySelector<HTMLDivElement>('#app')!;
app.className = 'app';
app.innerHTML = `<div class="toolbar"><button id="edit">編集</button><button id="play">テストプレイ</button><button id="save">保存</button><label class="file-label">読込<input id="file" type="file" accept="application/json,.json"></label><button id="jsonBtn">JSON出力</button><button id="reset">リセット</button></div><div class="canvas-wrap"><canvas width="${CANVAS_WIDTH}" height="${CANVAS_HEIGHT}"></canvas></div><div class="actions hidden"><button id="attack">攻撃</button><button id="wait">待機</button><button id="back">編集へ戻る</button></div><div class="palette"></div><div class="status"></div><textarea class="json" readonly placeholder="JSON出力はここに表示されます"></textarea>`;
const canvas = app.querySelector('canvas')!; const ctx = canvas.getContext('2d')!; const status = app.querySelector<HTMLDivElement>('.status')!; const palette = app.querySelector<HTMLDivElement>('.palette')!; const actions = app.querySelector<HTMLDivElement>('.actions')!; const json = app.querySelector<HTMLTextAreaElement>('.json')!;
const labels: Record<Tool, string> = { floor: '床', wall: '壁', jump: 'ジャンプ障害物', ally: '味方', enemy: '敵', erase: '消去' };
for (const t of Object.keys(labels) as Tool[]) { const b = document.createElement('button'); b.textContent = labels[t]; b.addEventListener('click', () => { tool = t; render(); }); palette.append(b); }
const currentStage = (): StageData => playState?.stage ?? editStage;
const render = (): void => { draw(ctx, currentStage(), playState, tool); palette.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.textContent === labels[tool])); actions.classList.toggle('hidden', !(playState?.phase === 'action' || playState?.result !== 'playing')); status.textContent = playState ? `${playState.turn === 'ally' ? '味方' : '敵'}ターン：${playState.message}` : `選択中：${labels[tool]}。パレットを選び、マスをタップして配置します。`; };
const cellFromEvent = (e: PointerEvent) => { const r = canvas.getBoundingClientRect(); return { x: Math.floor((e.clientX - r.left) / (r.width / 10)), y: Math.floor((e.clientY - r.top) / (r.height / 8)) }; };
const editTap = (x: number, y: number): void => { editStage.units = editStage.units.filter((u) => !(u.x === x && u.y === y)); if (tool === 'erase') editStage.terrain[indexOf({ x, y })] = 'floor'; else if (tool === 'ally' || tool === 'enemy') editStage.units.push(defaultUnit(tool, x, y)); else editStage.terrain[indexOf({ x, y })] = tool; };
const endAllyAction = (): void => { const unit = playState?.stage.units.find((u) => u.id === playState?.selectedUnitId); if (unit) unit.acted = true; if (playState && playState.stage.units.filter((u) => u.side === 'ally').every((u) => u.acted)) { playState.turn = 'enemy'; render(); setTimeout(() => { if (playState) { runEnemyTurn(playState); render(); } }, 250); } else if (playState) { playState.selectedUnitId = null; playState.phase = 'select'; playState.message = '次の味方を選択してください。'; } };
const playTap = (x: number, y: number): void => { if (!playState || playState.result !== 'playing' || playState.turn !== 'ally') return; const hit = playState.stage.units.find((u) => u.x === x && u.y === y); const selected = playState.stage.units.find((u) => u.id === playState?.selectedUnitId); if (playState.phase === 'select' && hit?.side === 'ally' && !hit.acted) { playState.selectedUnitId = hit.id; playState.phase = 'move'; playState.message = '移動先を選択してください。'; } else if (playState.phase === 'move' && selected) { const path = shortestPath(playState.stage, selected, { x, y }); if (path.length > 0) { const end = path.at(-1)!; selected.x = end.x; selected.y = end.y; playState.phase = 'action'; playState.message = '攻撃または待機を選択してください。'; } } else if (playState.phase === 'action' && selected && hit && adjacentEnemies(playState.stage.units, selected).some((u) => u.id === hit.id)) { attackUnit(playState, selected.id, hit.id); if (playState.result === 'playing') endAllyAction(); } updateResult(playState); };
canvas.addEventListener('pointerdown', (e) => { pointerStart = { x: e.clientX, y: e.clientY }; });
canvas.addEventListener('pointerup', (e) => { if (!pointerStart) return; const moved = Math.hypot(e.clientX - pointerStart.x, e.clientY - pointerStart.y); pointerStart = null; if (moved >= 8) return; const c = cellFromEvent(e); if (c.x < 0 || c.x >= 10 || c.y < 0 || c.y >= 8) return; playState ? playTap(c.x, c.y) : editTap(c.x, c.y); render(); });
canvas.addEventListener('pointercancel', () => { pointerStart = null; });
app.querySelector('#edit')!.addEventListener('click', () => { playState = null; render(); });
app.querySelector('#play')!.addEventListener('click', () => { playState = { stage: cloneStage(editStage), turn: 'ally', selectedUnitId: null, phase: 'select', result: 'playing', message: '味方を選択してください。' }; resetActed(playState, 'ally'); resetActed(playState, 'enemy'); updateResult(playState); render(); });
app.querySelector('#save')!.addEventListener('click', () => { saveStage(editStage); status.textContent = 'localStorageへ保存しました。'; });
app.querySelector('#jsonBtn')!.addEventListener('click', () => { json.value = stageToJson(editStage); });
app.querySelector('#reset')!.addEventListener('click', () => { editStage = createStage(); playState = null; render(); });
app.querySelector('#wait')!.addEventListener('click', () => { endAllyAction(); render(); });
app.querySelector('#attack')!.addEventListener('click', () => { const selected = playState?.stage.units.find((u) => u.id === playState?.selectedUnitId); const target = selected ? adjacentEnemies(playState!.stage.units, selected)[0] : undefined; if (playState && selected && target) attackUnit(playState, selected.id, target.id); if (playState?.result === 'playing') endAllyAction(); render(); });
app.querySelector('#back')!.addEventListener('click', () => { playState = null; render(); });
app.querySelector<HTMLInputElement>('#file')!.addEventListener('change', async (e) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) { editStage = parseStage(await f.text()); playState = null; render(); } });
try { editStage = loadStage(); } catch { editStage = createStage(); }
render();
