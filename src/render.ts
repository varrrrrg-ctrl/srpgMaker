import { MAP_HEIGHT, MAP_WIDTH, indexOf, type PlayState, type StageData, type Tool } from './types';
import { areaPositions, SKILLS, selectableSkillTargets, skillRangePositions } from './skills';
import { UNIT_TYPE_MARKERS } from './presentation';
export const CELL = 36;
export const CANVAS_WIDTH = CELL * MAP_WIDTH;
export const CANVAS_HEIGHT = CELL * MAP_HEIGHT;
export const draw = (ctx: CanvasRenderingContext2D, stage: StageData, play: PlayState | null, selectedTool: Tool): void => {
  ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  const selected = play?.selectedUnitId ? play.stage.units.find((u) => u.id === play.selectedUnitId) : null;
  const reach = play?.origin && play.origin.unitId === selected?.id ? play.origin.reachable : [];
  const selectedSkill = play?.selectedSkillId ? SKILLS[play.selectedSkillId] : undefined;
  const skillRange = selected && selectedSkill ? skillRangePositions(stage, selected, selectedSkill) : [];
  const skillTargets = selected && selectedSkill ? selectableSkillTargets(stage, selected, selectedSkill) : [];
  const skillArea = selectedSkill ? skillTargets.flatMap((position) => areaPositions(position, selectedSkill.area)) : [];
  for (let y = 0; y < MAP_HEIGHT; y++) for (let x = 0; x < MAP_WIDTH; x++) {
    const terrain = stage.terrain[indexOf({ x, y })];
    ctx.fillStyle = terrain === 'wall' ? '#8d99a6' : terrain === 'jump' ? '#9a6334' : '#dcecc8';
    ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
    if (reach.some((p) => p.x === x && p.y === y)) { ctx.fillStyle = 'rgba(60,140,255,.35)'; ctx.fillRect(x * CELL, y * CELL, CELL, CELL); }
    if (skillRange.some((p) => p.x === x && p.y === y)) { ctx.fillStyle = 'rgba(150,70,220,.28)'; ctx.fillRect(x * CELL, y * CELL, CELL, CELL); }
    if (skillArea.some((p) => p.x === x && p.y === y)) { ctx.fillStyle = 'rgba(255,190,40,.25)'; ctx.fillRect(x * CELL, y * CELL, CELL, CELL); }
    if (skillTargets.some((p) => p.x === x && p.y === y)) { ctx.fillStyle = 'rgba(255,70,70,.38)'; ctx.fillRect(x * CELL, y * CELL, CELL, CELL); }
    ctx.strokeStyle = '#4e5a4e'; ctx.strokeRect(x * CELL, y * CELL, CELL, CELL);
  }
  for (const u of stage.units) {
    ctx.fillStyle = u.side === 'ally' ? '#1b67d8' : '#d92d2d';
    ctx.beginPath(); ctx.arc(u.x * CELL + CELL / 2, u.y * CELL + CELL / 2, 12, 0, Math.PI * 2); ctx.fill();
    if (u.acted) { ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(u.x * CELL + 6, u.y * CELL + 6, CELL - 12, CELL - 12); }
    ctx.fillStyle = '#fff'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(String(u.hp), u.x * CELL + CELL / 2, u.y * CELL + CELL / 2 + 4);
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#172017'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(u.x * CELL + CELL - 7, u.y * CELL + CELL - 7, 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#172017'; ctx.font = 'bold 10px sans-serif'; ctx.fillText(UNIT_TYPE_MARKERS[u.unitType], u.x * CELL + CELL - 7, u.y * CELL + CELL - 3);
    const arrows = { up: '↑', down: '↓', left: '←', right: '→' } as const;
    ctx.fillStyle = '#fff'; ctx.font = 'bold 15px sans-serif'; ctx.fillText(arrows[u.direction], u.x * CELL + CELL / 2, u.y * CELL + CELL / 2 - 10);
  }
  if (selected) { ctx.strokeStyle = '#ffe66d'; ctx.lineWidth = 3; ctx.strokeRect(selected.x * CELL + 2, selected.y * CELL + 2, CELL - 4, CELL - 4); ctx.lineWidth = 1; }
  if (play && play.result !== 'playing') { ctx.fillStyle = 'rgba(0,0,0,.65)'; ctx.fillRect(20, 90, CANVAS_WIDTH - 40, 100); ctx.fillStyle = '#fff'; ctx.font = '28px sans-serif'; ctx.fillText(play.result === 'victory' ? '勝利！' : '敗北...', CANVAS_WIDTH / 2, 150); }
  void selectedTool;
};
