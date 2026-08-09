import { describe, expect, it } from 'vitest';
import { chooseEnemyAction } from './ai';
import { attackableTargets, attackUnit, updateResult } from './combat';
import { changeDirection, directionFromFlick, movementMap, movementStep, reachablePositions, shortestPath } from './movement';
import { parseStage, stageToJson } from './storage';
import { buildActionOrder, currentUnit, finishCurrentAction, startRound } from './turn';
import { createStage, defaultUnit, indexOf, type PlayState } from './types';

const play = (): PlayState => ({ stage: createStage(), turn: 'ally', round: 1, actionOrder: [], currentActionIndex: 0, selectedUnitId: null, phase: 'select', origin: null, result: 'playing', message: '' });

describe('speed round order', () => {
  it('敵味方を区別せずspeed降順、同値は固定id順になる', () => {
    const slow = defaultUnit('ally', 0, 0); slow.id = 'b'; slow.speed = 8;
    const fastB = defaultUnit('enemy', 1, 0); fastB.id = 'z'; fastB.speed = 15;
    const fastA = defaultUnit('ally', 2, 0); fastA.id = 'a'; fastA.speed = 15;
    expect(buildActionOrder([slow, fastB, fastA])).toEqual(['a', 'z', 'b']);
  });
  it('各ユニットは1回だけ行動し、全員終了後に次ラウンドでリセットされる', () => {
    const state = play(); const a = defaultUnit('ally', 0, 0); const b = defaultUnit('enemy', 2, 0); a.id = 'a'; b.id = 'b'; state.stage.units.push(a, b);
    startRound(state); expect(currentUnit(state)?.id).toBe('a');
    finishCurrentAction(state); expect(a.acted).toBe(true); expect(currentUnit(state)?.id).toBe('b');
    finishCurrentAction(state); expect(state.round).toBe(2); expect(a.acted).toBe(false); expect(b.acted).toBe(false); expect(currentUnit(state)?.id).toBe('a');
  });
  it('撃破された未行動ユニットを飛ばす', () => {
    const state = play(); const a = defaultUnit('ally', 0, 0); const dead = defaultUnit('enemy', 2, 0); a.id = 'a'; dead.id = 'b'; state.stage.units.push(a, dead); startRound(state);
    state.stage.units = state.stage.units.filter((unit) => unit.id !== dead.id);
    finishCurrentAction(state); expect(state.round).toBe(2); expect(currentUnit(state)?.id).toBe('a');
  });
  it('ラウンド途中のspeed変更は次ラウンドから反映される', () => {
    const state = play(); const a = defaultUnit('ally', 0, 0); const b = defaultUnit('enemy', 2, 0); a.id = 'a'; b.id = 'b'; a.speed = 20; b.speed = 10; state.stage.units.push(a, b); startRound(state);
    b.speed = 30; expect(state.actionOrder).toEqual(['a', 'b']); finishCurrentAction(state); finishCurrentAction(state); expect(state.actionOrder).toEqual(['b', 'a']);
  });
});

describe('movement', () => {
  it('壁を越えて移動範囲が広がらない', () => {
    const stage = createStage();
    const unit = defaultUnit('ally', 0, 0); unit.move = 5; stage.units.push(unit);
    for (let y = 0; y < 8; y++) stage.terrain[indexOf({ x: 1, y })] = 'wall';
    expect(reachablePositions(stage, unit).some((p) => p.x > 1)).toBe(false);
  });
  it('他ユニットには停止せず、条件を満たせばジャンプできる', () => {
    const stage = createStage();
    const unit = defaultUnit('ally', 0, 0); unit.move = 3;
    stage.units.push(unit, defaultUnit('ally', 1, 0));
    const reach = reachablePositions(stage, unit);
    expect(reach.some((p) => p.x === 1 && p.y === 0)).toBe(false);
    expect(reach.some((p) => p.x === 2 && p.y === 0)).toBe(true);
  });
  it('移動力を超えない', () => {
    const stage = createStage();
    const unit = defaultUnit('ally', 5, 4); unit.move = 3; stage.units.push(unit);
    expect(reachablePositions(stage, unit).every((p) => Math.abs(p.x - 5) + Math.abs(p.y - 4) <= 3)).toBe(true);
  });
  it('最短経路が取得できる', () => {
    const stage = createStage();
    const unit = defaultUnit('ally', 0, 0); unit.move = 4; stage.units.push(unit);
    expect(shortestPath(stage, unit, { x: 2, y: 1 }).map((p) => `${p.x},${p.y}`)).toEqual(['0,0', '0,1', '1,1', '2,1']);
    expect(movementMap(stage, unit).has('2,1')).toBe(true);
  });
  it('ターン開始時の範囲を使って往復しても範囲が縮まらない', () => {
    const stage = createStage(); const unit = defaultUnit('ally', 3, 3); unit.move = 2; stage.units.push(unit);
    const reach = reachablePositions(stage, unit);
    expect(movementStep(stage, unit, reach, { x: 4, y: 3 })).toBe(true);
    expect(movementStep(stage, unit, reach, { x: 3, y: 3 })).toBe(true);
    expect(movementStep(stage, unit, reach, { x: 2, y: 3 })).toBe(true);
    expect(reach).toContainEqual({ x: 5, y: 3 });
    expect(unit.direction).toBe('left');
  });
  it('移動せずに向きだけを変更できる', () => {
    const unit = defaultUnit('ally', 3, 3); const position = { x: unit.x, y: unit.y };
    changeDirection(unit, 'right');
    expect(unit.direction).toBe('right'); expect({ x: unit.x, y: unit.y }).toEqual(position); expect(unit.acted).toBe(false);
  });
  it('行動終了後は再び移動できない', () => {
    const stage = createStage(); const unit = defaultUnit('ally', 0, 0); stage.units.push(unit); const reach = reachablePositions(stage, unit);
    unit.acted = true;
    expect(movementStep(stage, unit, reach, { x: 1, y: 0 })).toBe(false); expect({ x: unit.x, y: unit.y }).toEqual({ x: 0, y: 0 });
  });
  it('jump_blockを飛び越えるが上には停止しない', () => {
    const stage = createStage(); const unit = defaultUnit('ally', 0, 0); unit.move = 2; stage.units.push(unit); stage.terrain[indexOf({ x: 1, y: 0 })] = 'jump';
    const reach = reachablePositions(stage, unit);
    expect(reach).not.toContainEqual({ x: 1, y: 0 });
    expect(reach).toContainEqual({ x: 2, y: 0 });
    expect(movementStep(stage, unit, reach, { x: 2, y: 0 })).toBe(true);
  });
  it('ジャンプはコスト2なので移動力1では到達できない', () => {
    const stage = createStage(); const unit = defaultUnit('ally', 0, 0); unit.move = 1; stage.units.push(unit); stage.terrain[indexOf({ x: 1, y: 0 })] = 'jump';
    expect(reachablePositions(stage, unit)).not.toContainEqual({ x: 2, y: 0 });
  });
  it('ユニットを飛び越え、着地点が塞がれていれば飛べない', () => {
    const stage = createStage(); const unit = defaultUnit('ally', 0, 0); unit.move = 2; stage.units.push(unit, defaultUnit('enemy', 1, 0));
    expect(reachablePositions(stage, unit)).toContainEqual({ x: 2, y: 0 });
    stage.units.push(defaultUnit('ally', 2, 0));
    expect(reachablePositions(stage, unit)).not.toContainEqual({ x: 2, y: 0 });
  });
  it('20px以上のフリックは大きい軸の方向になり、位置や行動状態を変えない', () => {
    const unit = defaultUnit('ally', 3, 3); const before = { x: unit.x, y: unit.y, acted: unit.acted };
    expect(directionFromFlick(25, 10)).toBe('right'); expect(directionFromFlick(-25, 3)).toBe('left'); expect(directionFromFlick(2, -21)).toBe('up'); expect(directionFromFlick(8, 22)).toBe('down'); expect(directionFromFlick(19, 0)).toBeNull();
    changeDirection(unit, directionFromFlick(25, 0)!); expect({ x: unit.x, y: unit.y, acted: unit.acted }).toEqual(before);
  });
});

describe('combat/result/storage', () => {
  it('攻撃でHPが減る', () => {
    const state = play(); const a = defaultUnit('ally', 0, 0); a.direction = 'down'; const e = defaultUnit('enemy', 0, 1); state.stage.units.push(a, e);
    attackUnit(state, a.id, e.id);
    expect(state.stage.units.find((u) => u.id === e.id)?.hp).toBe(7);
  });
  it('HPが0以下のユニットが除去される', () => {
    const state = play(); const a = defaultUnit('ally', 0, 0); a.direction = 'down'; const e = defaultUnit('enemy', 0, 1); e.hp = 3; state.stage.units.push(a, e);
    attackUnit(state, a.id, e.id);
    expect(state.stage.units.some((u) => u.id === e.id)).toBe(false);
  });
  it('敵全滅で勝利になる', () => {
    const state = play(); state.stage.units.push(defaultUnit('ally', 0, 0)); updateResult(state); expect(state.result).toBe('victory');
  });
  it('味方全滅で敗北になる', () => {
    const state = play(); state.stage.units.push(defaultUnit('enemy', 0, 0)); updateResult(state); expect(state.result).toBe('defeat');
  });
  it('保存データを読み戻せる', () => {
    const stage = createStage(); stage.terrain[0] = 'wall'; stage.units.push(defaultUnit('enemy', 2, 3));
    expect(parseStage(stageToJson(stage))).toEqual(stage);
  });
  it('旧保存データにspeedのデフォルト値を補う', () => {
    const unit = defaultUnit('enemy', 2, 3); const oldUnit = { ...unit } as Partial<typeof unit>; delete oldUnit.speed;
    const loaded = parseStage(JSON.stringify({ version: 1, terrain: createStage().terrain, units: [oldUnit] })); expect(loaded.units[0].speed).toBe(10);
  });
  it('向いている方向の敵だけが攻撃対象になり、自動選択しない', () => {
    const state = play(); const a = defaultUnit('ally', 1, 1); const up = defaultUnit('enemy', 1, 0); const right = defaultUnit('enemy', 2, 1); state.stage.units.push(a, up, right);
    a.direction = 'up'; expect(attackableTargets(state.stage.units, a).map((u) => u.id)).toEqual([up.id]);
    attackUnit(state, a.id, right.id); expect(right.hp).toBe(right.maxHp); expect(a.acted).toBe(false);
    a.direction = 'right'; attackUnit(state, a.id, right.id); expect(a.acted).toBe(true);
    attackUnit(state, a.id, up.id); expect(up.hp).toBe(up.maxHp);
  });
  it('勝敗確定後は行動順を進めない', () => {
    const state = play(); const ally = defaultUnit('ally', 0, 0); state.stage.units.push(ally); startRound(state); state.result = 'victory'; finishCurrentAction(state); expect(state.currentActionIndex).toBe(0);
  });
  it('敵AIもジャンプをコスト2として評価する', () => {
    const state = play(); const enemy = defaultUnit('enemy', 0, 0); enemy.move = 1; const ally = defaultUnit('ally', 3, 0); state.stage.units.push(enemy, ally); state.stage.terrain[indexOf({ x: 1, y: 0 })] = 'jump';
    expect(chooseEnemyAction(state, enemy).position).toEqual({ x: 0, y: 0 });
  });
});
