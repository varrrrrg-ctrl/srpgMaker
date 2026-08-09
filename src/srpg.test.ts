import { describe, expect, it } from 'vitest';
import { runEnemyAction } from './ai';
import { attackableTargets, attackUnit, performFrontAttack, updateResult } from './combat';
import { changeDirection, flickDirection, movementCosts, movementMap, movementStep, reachablePositions, shortestPath } from './movement';
import { parseStage, stageToJson } from './storage';
import { buildActionOrder, createPlayState, currentUnit, finishCurrentAction } from './turn';
import { createStage, defaultUnit, indexOf, type PlayState } from './types';

const play = (): PlayState => ({ stage: createStage(), turn: 'ally', selectedUnitId: null, phase: 'select', origin: null, round: 1, actionOrder: [], actionIndex: 0, result: 'playing', message: '' });

describe('speed round order', () => {
  it('speed降順、同速なら固定unit id順で並ぶ', () => {
    const stage = createStage(); const slow = defaultUnit('ally', 0, 0); slow.id = 'b'; slow.speed = 8; const fastB = defaultUnit('enemy', 1, 0); fastB.id = 'c'; fastB.speed = 15; const fastA = defaultUnit('ally', 2, 0); fastA.id = 'a'; fastA.speed = 15;
    stage.units.push(slow, fastB, fastA); expect(buildActionOrder(stage.units)).toEqual(['a', 'c', 'b']);
  });
  it('各ユニットが1回行動すると次ラウンドへ進みactedがリセットされる', () => {
    const stage = createStage(); const a = defaultUnit('ally', 0, 0); a.id = 'a'; const b = defaultUnit('enemy', 1, 0); b.id = 'b'; stage.units.push(a, b); const state = createPlayState(stage);
    expect(currentUnit(state)?.id).toBe('a'); finishCurrentAction(state); expect(a.acted).toBe(true); expect(currentUnit(state)?.id).toBe('b'); finishCurrentAction(state);
    expect(state.round).toBe(2); expect(currentUnit(state)?.id).toBe('a'); expect(a.acted).toBe(false); expect(b.acted).toBe(false);
  });
  it('撃破された未行動ユニットを飛ばす', () => {
    const stage = createStage(); const a = defaultUnit('ally', 0, 0); a.id = 'a'; a.speed = 3; const dead = defaultUnit('enemy', 1, 0); dead.id = 'b'; dead.speed = 2; const c = defaultUnit('ally', 2, 0); c.id = 'c'; c.speed = 1; stage.units.push(a, dead, c); const state = createPlayState(stage);
    state.stage.units = state.stage.units.filter((unit) => unit.id !== dead.id); finishCurrentAction(state); expect(currentUnit(state)?.id).toBe('c');
  });
  it('ラウンド途中のspeed変更は次ラウンドから反映する', () => {
    const stage = createStage(); const a = defaultUnit('ally', 0, 0); a.id = 'a'; a.speed = 20; const b = defaultUnit('enemy', 1, 0); b.id = 'b'; b.speed = 10; stage.units.push(a, b); const state = createPlayState(stage);
    b.speed = 30; finishCurrentAction(state); expect(currentUnit(state)?.id).toBe('b'); finishCurrentAction(state); expect(state.round).toBe(2); expect(currentUnit(state)?.id).toBe('b');
  });
  it('勝敗確定後は行動順を進めない', () => {
    const stage = createStage(); const a = defaultUnit('ally', 0, 0); const b = defaultUnit('enemy', 1, 0); stage.units.push(a, b); const state = createPlayState(stage); const index = state.actionIndex; state.result = 'victory';
    expect(finishCurrentAction(state)).toBeNull(); expect(state.actionIndex).toBe(index);
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
  it('20px以上のフリックは大きい軸の上下左右を返す', () => {
    expect(flickDirection(5, -21)).toBe('up'); expect(flickDirection(2, 25)).toBe('down'); expect(flickDirection(-30, 12)).toBe('left'); expect(flickDirection(40, -8)).toBe('right'); expect(flickDirection(19, 0)).toBeNull();
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
    expect(movementCosts(stage, unit).get('2,0')).toBe(2);
    expect(movementStep(stage, unit, reach, { x: 2, y: 0 })).toBe(true);
  });
  it('移動力が2未満ならジャンプできない', () => {
    const stage = createStage(); const unit = defaultUnit('ally', 0, 0); unit.move = 1; stage.units.push(unit); stage.terrain[indexOf({ x: 1, y: 0 })] = 'jump';
    expect(reachablePositions(stage, unit)).not.toContainEqual({ x: 2, y: 0 });
  });
  it('ユニットを飛び越え、着地点が塞がれていれば飛べない', () => {
    const stage = createStage(); const unit = defaultUnit('ally', 0, 0); unit.move = 2; stage.units.push(unit, defaultUnit('enemy', 1, 0));
    expect(reachablePositions(stage, unit)).toContainEqual({ x: 2, y: 0 });
    stage.units.push(defaultUnit('ally', 2, 0));
    expect(reachablePositions(stage, unit)).not.toContainEqual({ x: 2, y: 0 });
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
  it('向いている方向の敵だけが攻撃対象になり、自動選択しない', () => {
    const state = play(); const a = defaultUnit('ally', 1, 1); const up = defaultUnit('enemy', 1, 0); const right = defaultUnit('enemy', 2, 1); state.stage.units.push(a, up, right);
    a.direction = 'up'; expect(attackableTargets(state.stage.units, a).map((u) => u.id)).toEqual([up.id]);
    attackUnit(state, a.id, right.id); expect(right.hp).toBe(right.maxHp); expect(a.acted).toBe(false);
    a.direction = 'right'; attackUnit(state, a.id, right.id); expect(a.acted).toBe(true);
    attackUnit(state, a.id, up.id); expect(up.hp).toBe(up.maxHp);
  });
  it('攻撃操作は再タップなしで正面の敵へ即攻撃する', () => {
    const state = play(); const ally = defaultUnit('ally', 1, 1); ally.direction = 'up'; const enemy = defaultUnit('enemy', 1, 0); state.stage.units.push(ally, enemy);
    expect(performFrontAttack(state, ally.id)).toBe(true); expect(enemy.hp).toBe(7); expect(ally.acted).toBe(true); expect(performFrontAttack(state, ally.id)).toBe(false);
  });
  it('敵AIもジャンプをコスト2として評価する', () => {
    const state = play(); const enemy = defaultUnit('enemy', 0, 0); enemy.move = 1; enemy.direction = 'right'; const ally = defaultUnit('ally', 3, 0); state.stage.units.push(enemy, ally); state.stage.terrain[indexOf({ x: 1, y: 0 })] = 'jump';
    runEnemyAction(state, enemy.id); expect({ x: enemy.x, y: enemy.y }).toEqual({ x: 0, y: 0 }); expect(ally.hp).toBe(ally.maxHp);
  });
  it('speedがない旧保存データへデフォルト値を補う', () => {
    const stage = createStage(); const unit = defaultUnit('ally', 0, 0); stage.units.push(unit); const legacy = JSON.parse(stageToJson(stage)) as { units: Array<{ speed?: number }> }; delete legacy.units[0].speed;
    expect(parseStage(JSON.stringify(legacy)).units[0].speed).toBe(10);
  });
});
