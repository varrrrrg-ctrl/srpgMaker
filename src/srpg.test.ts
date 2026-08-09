import { describe, expect, it } from 'vitest';
import { chooseEnemyAction, runEnemyAction } from './ai';
import { applyDirectionalModifier, attackableTargets, attackUnit, calculateAttackDamage, calculateBaseDamage, directionalAttackModifier, updateResult } from './combat';
import { AutoMover, autoMovePath, changeDirection, directionFromFlick, isTapGesture, movementMap, movementStep, pathCost, reachablePositions, shortestPath, startAutoMove } from './movement';
import { parseStage, stageToJson } from './storage';
import { SKILLS, useUnitSkill } from './skills';
import { buildActionOrder, currentUnit, finishCurrentAction, startRound } from './turn';
import { createStage, createTestStage, defaultUnit, indexOf, PLAYER_PRESETS, type PlayState } from './types';

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
  it('範囲内の離れたマスへ決定的な最短経路で自動移動する', () => {
    const stage = createStage(); const unit = defaultUnit('ally', 0, 0); unit.move = 4; stage.units.push(unit); const reachable = reachablePositions(stage, unit);
    const path = autoMovePath(stage, unit, reachable, { x: 2, y: 1 }); expect(path).toEqual([{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }]);
    const mover = new AutoMover(); expect(startAutoMove(stage, unit, reachable, { x: 2, y: 1 }, mover)).toBe(true); expect(mover.start(path)).toBe(false);
    while (mover.active) mover.advance(unit); expect({ x: unit.x, y: unit.y }).toEqual({ x: 2, y: 1 }); expect(unit.direction).toBe('right');
  });
  it('自動移動は壁やユニットを通常通過せず、到達不能なら開始しない', () => {
    const stage = createStage(); const unit = defaultUnit('ally', 0, 0); unit.move = 4; stage.units.push(unit, defaultUnit('ally', 1, 0)); stage.terrain[indexOf({ x: 0, y: 1 })] = 'wall';
    const reachable = reachablePositions(stage, unit); expect(autoMovePath(stage, unit, reachable, { x: 1, y: 0 })).toEqual([]); expect(autoMovePath(stage, unit, reachable, { x: 0, y: 2 })).toEqual([]);
  });
  it('ジャンプを経路上の1アクションかつコスト2として自動移動する', () => {
    const stage = createStage(); const unit = defaultUnit('ally', 0, 0); unit.move = 3; stage.units.push(unit); stage.terrain[indexOf({ x: 1, y: 0 })] = 'jump';
    const path = autoMovePath(stage, unit, reachablePositions(stage, unit), { x: 3, y: 0 }); expect(path).toEqual([{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }]); expect(pathCost(path)).toBe(3);
  });
  it('自動移動後もターン開始時の固定範囲内へ再移動できる', () => {
    const stage = createStage(); const unit = defaultUnit('ally', 2, 2); unit.move = 2; stage.units.push(unit); const reachable = reachablePositions(stage, unit); const mover = new AutoMover();
    mover.start(autoMovePath(stage, unit, reachable, { x: 4, y: 2 })); while (mover.active) mover.advance(unit);
    const returnPath = autoMovePath(stage, unit, reachable, { x: 0, y: 2 }); expect(returnPath.length).toBeGreaterThan(1); mover.start(returnPath); while (mover.active) mover.advance(unit); expect({ x: unit.x, y: unit.y }).toEqual({ x: 0, y: 2 });
  });
  it('20px未満の通常タップをフリックやドラッグとして無視しない', () => {
    expect(directionFromFlick(12, 8)).toBeNull(); expect(isTapGesture(12, 8)).toBe(true); expect(isTapGesture(20, 0)).toBe(false);
  });
});

describe('directional damage', () => {
  const relative = (direction: 'up' | 'down' | 'left' | 'right', attackerPosition: { x: number; y: number }) => {
    const defender = defaultUnit('enemy', 2, 2); defender.direction = direction; const attacker = defaultUnit('ally', attackerPosition.x, attackerPosition.y); return directionalAttackModifier(attacker, defender);
  };
  it('正面1.0倍、側面1.1倍、背後1.3倍をMath.roundする', () => {
    const defender = defaultUnit('enemy', 2, 2); defender.direction = 'up';
    expect(applyDirectionalModifier(10, defaultUnit('ally', 2, 1), defender)).toBe(10);
    expect(applyDirectionalModifier(10, defaultUnit('ally', 1, 2), defender)).toBe(11);
    expect(applyDirectionalModifier(10, defaultUnit('ally', 2, 3), defender)).toBe(13);
    expect(applyDirectionalModifier(3, defaultUnit('ally', 1, 2), defender)).toBe(3);
  });
  it('up/down/left/rightの全方向を防御側基準で判定する', () => {
    expect(relative('up', { x: 2, y: 1 }).direction).toBe('front'); expect(relative('up', { x: 2, y: 3 }).direction).toBe('back');
    expect(relative('down', { x: 2, y: 3 }).direction).toBe('front'); expect(relative('down', { x: 2, y: 1 }).direction).toBe('back');
    expect(relative('left', { x: 1, y: 2 }).direction).toBe('front'); expect(relative('left', { x: 3, y: 2 }).direction).toBe('back');
    expect(relative('right', { x: 3, y: 2 }).direction).toBe('front'); expect(relative('right', { x: 1, y: 2 }).direction).toBe('back');
    expect(relative('right', { x: 2, y: 1 }).direction).toBe('side');
  });
  it('敵AIの通常攻撃にも背後補正を適用する', () => {
    const state = play(); const ally = defaultUnit('ally', 1, 1); ally.direction = 'up'; const enemy = defaultUnit('enemy', 1, 2); enemy.direction = 'up'; state.stage.units.push(ally, enemy);
    runEnemyAction(state, enemy.id); expect(ally.hp).toBe(37); expect(state.message).toContain('背後攻撃');
  });
  it.each([
    ['正面', 'down', { x: 1, y: 0 }, 1],
    ['側面', 'left', { x: 1, y: 0 }, 1],
    ['背後', 'up', { x: 1, y: 0 }, 1],
  ] as const)('%s攻撃の補正後ダメージを実際のHP減少へ使う', (_label, defenderDirection, defenderPosition, expectedDamage) => {
    const state = play(); const attacker = defaultUnit('ally', 1, 1); attacker.direction = 'up'; attacker.attack = 3; const defender = defaultUnit('enemy', defenderPosition.x, defenderPosition.y); defender.direction = defenderDirection; state.stage.units.push(attacker, defender);
    attackUnit(state, attacker.id, defender.id); expect(defender.hp).toBe(defender.maxHp - expectedDamage);
  });
});

describe('combat/result/storage', () => {
  it('攻撃でHPが減る', () => {
    const state = play(); const a = defaultUnit('ally', 0, 0); a.direction = 'down'; const e = defaultUnit('enemy', 0, 1); e.direction = 'up'; state.stage.units.push(a, e);
    attackUnit(state, a.id, e.id);
    expect(state.stage.units.find((u) => u.id === e.id)?.hp).toBe(40);
  });
  it('HPが0以下のユニットが除去される', () => {
    const state = play(); const a = defaultUnit('ally', 0, 0); a.direction = 'down'; const e = defaultUnit('enemy', 0, 1); e.direction = 'up'; e.hp = 3; state.stage.units.push(a, e);
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
  it('旧保存データにDEFのデフォルト値20を補う', () => {
    const unit = defaultUnit('enemy', 2, 3); const oldUnit = { ...unit } as Partial<typeof unit>; delete oldUnit.defense;
    const loaded = parseStage(JSON.stringify({ version: 1, terrain: createStage().terrain, units: [oldUnit] })); expect(loaded.units[0].defense).toBe(20);
  });
  it('旧保存データのMPをプリセット別または安全な標準値で補う', () => {
    const balance = { ...createTestStage().units.find((unit) => unit.name === 'Balance')! } as Partial<ReturnType<typeof defaultUnit>>;
    delete balance.currentMp; delete balance.maxMp; delete balance.skillId; delete balance.guarding;
    const unknown = { ...defaultUnit('ally', 1, 1) } as Partial<ReturnType<typeof defaultUnit>>;
    delete unknown.currentMp; delete unknown.maxMp; delete unknown.guarding;
    const loaded = parseStage(JSON.stringify({ version: 1, terrain: createStage().terrain, units: [balance, unknown] }));
    expect([loaded.units[0].currentMp, loaded.units[0].maxMp, loaded.units[0].skillId, loaded.units[0].guarding]).toEqual([30, 50, 'power-slash', false]);
    expect([loaded.units[1].currentMp, loaded.units[1].maxMp]).toEqual([30, 50]);
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

describe('DEF damage formula', () => {
  const damageFrom = (attack: number, defense: number, attackerPosition: { x: number; y: number }, defenderDirection: 'up' | 'down' | 'left' | 'right' = 'up'): number => {
    const attacker = defaultUnit('ally', attackerPosition.x, attackerPosition.y); attacker.attack = attack;
    const defender = defaultUnit('enemy', 2, 2); defender.defense = defense; defender.direction = defenderDirection;
    return calculateAttackDamage(attacker, defender).damage;
  };
  it('ATK20 / DEF20は正面10、側面11、背後13になる', () => {
    expect(damageFrom(20, 20, { x: 2, y: 1 })).toBe(10);
    expect(damageFrom(20, 20, { x: 1, y: 2 })).toBe(11);
    expect(damageFrom(20, 20, { x: 2, y: 3 })).toBe(13);
  });
  it.each([
    [26, 20, 15, 16, 19], [26, 32, 12, 13, 15], [14, 14, 7, 8, 9],
    [20, 32, 8, 9, 10], [20, 14, 12, 13, 16],
  ])('ATK %i / DEF %i の代表値が正面%i、側面%i、背後%iになる', (attack, defense, front, side, back) => {
    expect(damageFrom(attack, defense, { x: 2, y: 1 })).toBe(front);
    expect(damageFrom(attack, defense, { x: 1, y: 2 })).toBe(side);
    expect(damageFrom(attack, defense, { x: 2, y: 3 })).toBe(back);
  });
  it('基礎値を丸めず方向補正後だけ丸め、最低1かつ不正DEFにも安全である', () => {
    expect(calculateBaseDamage(20, 14)).toBeCloseTo(11.952286, 5);
    expect(damageFrom(20, 14, { x: 1, y: 2 })).toBe(13);
    expect(damageFrom(0, 20, { x: 2, y: 1 })).toBe(1);
    expect(Number.isFinite(damageFrom(20, 0, { x: 2, y: 1 }))).toBe(true);
  });
  it('ATK増加で増え、DEF増加で減る', () => {
    expect(damageFrom(26, 20, { x: 2, y: 1 })).toBeGreaterThan(damageFrom(20, 20, { x: 2, y: 1 }));
    expect(damageFrom(20, 32, { x: 2, y: 1 })).toBeLessThan(damageFrom(20, 14, { x: 2, y: 1 }));
  });
});

describe('five player test stage', () => {
  it('再利用可能な5プリセットと配置のHP・ATK・DEFが正しい', () => {
    expect(Object.values(PLAYER_PRESETS).map(({ hp, attack, defense }) => ({ hp, attack, defense }))).toEqual([
      { hp: 50, attack: 20, defense: 20 }, { hp: 42, attack: 26, defense: 14 }, { hp: 70, attack: 14, defense: 32 },
      { hp: 47, attack: 24, defense: 18 }, { hp: 60, attack: 18, defense: 26 },
    ]);
    const allies = createTestStage().units.filter((unit) => unit.side === 'ally');
    expect(allies.map((unit) => [unit.name, unit.hp, unit.attack, unit.defense])).toEqual([
      ['Balance', 50, 20, 20], ['Attacker', 42, 26, 14], ['Tank', 70, 14, 32], ['Assault', 47, 24, 18], ['Defender', 60, 18, 26],
    ]);
    expect(new Set(allies.map((unit) => `${unit.x},${unit.y}`)).size).toBe(5);
    expect(allies.map((unit) => [unit.x, unit.y])).toEqual([[2, 6], [3, 6], [4, 6], [5, 6], [6, 6]]);
  });
  it('5体が順に行動し、全員終了後も既存順序で敵が行動して次ラウンドに全員リセットされる', () => {
    const state = play(); state.stage = createTestStage(); startRound(state);
    for (let i = 0; i < 5; i++) { expect(currentUnit(state)?.side).toBe('ally'); finishCurrentAction(state); }
    expect(currentUnit(state)?.side).toBe('enemy');
    finishCurrentAction(state); finishCurrentAction(state);
    expect(state.round).toBe(2); expect(state.stage.units.every((unit) => !unit.acted)).toBe(true); expect(currentUnit(state)?.side).toBe('ally');
  });
});

describe('MP and unique skills', () => {
  const skillBattle = (name: 'Balance' | 'Attacker' | 'Tank' | 'Assault', defenderDirection: 'up' | 'left' = 'up') => {
    const state = play(); const unit = createTestStage().units.find((candidate) => candidate.name === name)!;
    unit.x = 2; unit.y = 1; unit.direction = 'down';
    const target = defaultUnit('enemy', 2, 2); target.hp = 200; target.maxHp = 200; target.direction = defenderDirection;
    state.stage.units.push(unit, target); return { state, unit, target };
  };
  it('5人の初期MP・最大MP・固有スキルが正しい', () => {
    const allies = createTestStage().units.filter((unit) => unit.side === 'ally');
    expect(allies.map((unit) => [unit.name, unit.currentMp, unit.maxMp, unit.skillId])).toEqual([
      ['Balance', 30, 50, 'power-slash'], ['Attacker', 30, 40, 'heavy-break'], ['Tank', 20, 40, 'shield-bash'],
      ['Assault', 40, 50, 'rush'], ['Defender', 30, 60, 'guard'],
    ]);
  });
  it('初回ラウンドでは回復せず、次ラウンドに生存味方だけ10回復して最大値を超えない', () => {
    const state = play(); const balance = createTestStage().units.find((unit) => unit.name === 'Balance')!;
    const full = createTestStage().units.find((unit) => unit.name === 'Assault')!; full.currentMp = full.maxMp;
    const dead = createTestStage().units.find((unit) => unit.name === 'Tank')!; dead.hp = 0;
    state.stage.units.push(balance, full, dead); startRound(state, 1);
    expect(balance.currentMp).toBe(30); startRound(state, 2);
    expect(balance.currentMp).toBe(40); expect(full.currentMp).toBe(full.maxMp); expect(dead.currentMp).toBe(20);
  });
  it.each([
    ['Balance', 'power-slash', 20, 1.5, 15, 17], ['Attacker', 'heavy-break', 30, 1.8, 27, 29],
    ['Assault', 'rush', 20, 1.4, 18, 20],
  ] as const)('%sの%sはMP%i、倍率%fで方向補正される', (name, skillId, cost, multiplier, front, side) => {
    expect(SKILLS[skillId].damageMultiplier).toBe(multiplier);
    const battle = skillBattle(name); const beforeMp = battle.unit.currentMp;
    expect(useUnitSkill(battle.state, battle.unit.id).attack?.damage).toBe(front); expect(battle.unit.currentMp).toBe(beforeMp - cost); expect(battle.unit.acted).toBe(true);
    const directional = skillBattle(name, 'left'); expect(useUnitSkill(directional.state, directional.unit.id).attack?.damage).toBe(side);
  });
  it('MP不足・無効対象ではMPも行動状態も変えない', () => {
    const state = play(); const attacker = createTestStage().units.find((unit) => unit.name === 'Attacker')!; attacker.currentMp = 20; state.stage.units.push(attacker);
    expect(useUnitSkill(state, attacker.id).reason).toBe('not-enough-mp'); expect(attacker.currentMp).toBe(20); expect(attacker.acted).toBe(false);
    attacker.currentMp = 30; expect(useUnitSkill(state, attacker.id).reason).toBe('invalid-target'); expect(attacker.currentMp).toBe(30); expect(attacker.acted).toBe(false);
  });
  it('Shield Bashは空き床へ押し、壁・ユニット・マップ外ならダメージだけ与える', () => {
    const open = skillBattle('Tank'); const openHp = open.target.hp; const openResult = useUnitSkill(open.state, open.unit.id);
    expect(openResult.knockedBack).toBe(true); expect([open.target.x, open.target.y]).toEqual([2, 3]); expect(open.target.hp).toBeLessThan(openHp); expect(open.unit.currentMp).toBe(0);
    for (const blockedBy of ['wall', 'unit', 'edge'] as const) {
      const battle = skillBattle('Tank');
      if (blockedBy === 'wall') battle.state.stage.terrain[indexOf({ x: 2, y: 3 })] = 'wall';
      if (blockedBy === 'unit') battle.state.stage.units.push(defaultUnit('ally', 2, 3));
      if (blockedBy === 'edge') { battle.unit.y = 6; battle.target.y = 7; }
      const hp = battle.target.hp; expect(useUnitSkill(battle.state, battle.unit.id).knockedBack).toBe(false);
      expect(battle.target.hp).toBeLessThan(hp); expect([battle.target.x, battle.target.y]).toEqual([2, blockedBy === 'edge' ? 7 : 2]);
    }
  });
  it('Shield Bashで撃破した対象はノックバックしない', () => {
    const battle = skillBattle('Tank'); battle.target.hp = 1;
    const result = useUnitSkill(battle.state, battle.unit.id); expect(result.knockedBack).toBe(false); expect(battle.state.stage.units).not.toContain(battle.target);
  });
  it('Guardは即時有効になり、全倍率の最後に0.6を掛け、次ラウンド開始で解除する', () => {
    const state = play(); const defender = createTestStage().units.find((unit) => unit.name === 'Defender')!; state.stage.units.push(defender);
    expect(useUnitSkill(state, defender.id).success).toBe(true); expect(defender.currentMp).toBe(10); expect(defender.guarding).toBe(true); expect(defender.acted).toBe(true);
    const enemy = defaultUnit('enemy', defender.x, defender.y - 1); enemy.direction = 'down';
    expect(calculateAttackDamage(enemy, defender).damage).toBe(5);
    enemy.attack = 1; expect(calculateAttackDamage(enemy, defender).damage).toBe(1);
    startRound(state, 2); expect(defender.guarding).toBe(false); expect(defender.currentMp).toBe(20);
  });
});
