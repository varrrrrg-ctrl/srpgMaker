import { describe, expect, it } from 'vitest';
import { chooseEnemyAction, runEnemyAction } from './ai';
import { applyDirectionalModifier, attackableTargets, attackUnit, calculateAttackDamage, calculateBaseDamage, directionalAttackModifier, updateResult } from './combat';
import { AutoMover, autoMovePath, changeDirection, directionFromFlick, isTapGesture, movementMap, movementStep, pathCost, reachablePositions, shortestPath, startAutoMove } from './movement';
import { factionLabel, skillDetails, UNIT_TYPE_MARKERS } from './presentation';
import { parseStage, stageToJson } from './storage';
import { areaPositions, selectableSkillTargets, skillRangePositions, SKILLS, useUnitSkill } from './skills';
import { buildActionOrder, currentUnit, finishCurrentAction, startRound } from './turn';
import { createStage, createTestStage, defaultUnit, indexOf, placePresetUnit, PLAYER_PRESETS, presetUnit, type PlayState } from './types';

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

describe('skill range and second skills', () => {
  it('diamond range1/2、line range2、area0/1を共通計算する', () => {
    const stage = createStage(); const unit = presetUnit('ally', 'Balance', 4, 4); stage.units.push(unit);
    expect(skillRangePositions(stage, unit, SKILLS['power-slash'])).toHaveLength(4);
    expect(skillRangePositions(stage, unit, { ...SKILLS['power-slash'], range: 2 })).toHaveLength(12);
    expect(skillRangePositions(stage, unit, SKILLS['shock-wave'])).toHaveLength(8);
    expect(areaPositions({ x: 4, y: 4 }, 0)).toEqual([{ x: 4, y: 4 }]); expect(areaPositions({ x: 4, y: 4 }, 1)).toHaveLength(5);
  });
  it('Shock Waveは直線2マス内だけを選べ、壁越しや射程外は選べない', () => {
    const stage = createStage(); const unit = presetUnit('ally', 'Balance', 2, 2); const valid = defaultUnit('enemy', 2, 4); const outside = defaultUnit('enemy', 2, 5); const diagonal = defaultUnit('enemy', 3, 3); stage.units.push(unit, valid, outside, diagonal);
    expect(selectableSkillTargets(stage, unit, SKILLS['shock-wave'])).toEqual([{ x: 2, y: 4 }]);
    stage.terrain[indexOf({ x: 2, y: 3 })] = 'wall'; expect(selectableSkillTargets(stage, unit, SKILLS['shock-wave'])).toEqual([]);
  });
  it('Ground Slamは使用者を中心に範囲内の複数敵だけへ1.1倍ダメージを与える', () => {
    const state = play(); const tank = presetUnit('ally', 'Tank', 3, 3); tank.currentMp = 30;
    const a = defaultUnit('enemy', 3, 2); const b = defaultUnit('enemy', 4, 3); const outside = defaultUnit('enemy', 5, 3); state.stage.units.push(tank, a, b, outside);
    const result = useUnitSkill(state, tank.id, 'ground-slam', tank); expect(result.attacks).toHaveLength(2);
    expect(a.hp).toBeLessThan(a.maxHp); expect(b.hp).toBeLessThan(b.maxHp); expect(outside.hp).toBe(outside.maxHp); expect(tank.currentMp).toBe(0);
  });
  it('ExecutionはMP40・2.2倍、Dash Strikeは距離2から隣接位置へ移動して1.5倍攻撃する', () => {
    expect([SKILLS.execution.mpCost, SKILLS.execution.damageMultiplier]).toEqual([40, 2.2]);
    const state = play(); const assault = presetUnit('ally', 'Assault', 2, 0); assault.currentMp = 30; const target = defaultUnit('enemy', 2, 2); state.stage.units.push(assault, target);
    expect(useUnitSkill(state, assault.id, 'dash-strike', target).success).toBe(true); expect([assault.x, assault.y]).toEqual([2, 1]); expect(target.hp).toBeLessThan(target.maxHp);
    const blocked = play(); const other = presetUnit('ally', 'Assault', 2, 0); other.currentMp = 30; const victim = defaultUnit('enemy', 2, 2); blocked.stage.units.push(other, victim, defaultUnit('ally', 2, 1), defaultUnit('ally', 1, 2), defaultUnit('ally', 3, 2), defaultUnit('ally', 2, 3));
    expect(useUnitSkill(blocked, other.id, 'dash-strike', victim).success).toBe(false); expect(other.currentMp).toBe(30);
  });
  it('Protectは隣接味方の被ダメージを0.7倍にし、次ラウンドに解除する', () => {
    const state = play(); const defender = presetUnit('ally', 'Defender', 2, 2); const ally = defaultUnit('ally', 2, 1); state.stage.units.push(defender, ally);
    expect(useUnitSkill(state, defender.id, 'protect', ally).success).toBe(true); expect(ally.protected).toBe(true); expect(defender.currentMp).toBe(0);
    const enemy = defaultUnit('enemy', 2, 0); expect(calculateAttackDamage(enemy, ally).damage).toBe(7);
    startRound(state, 2); expect(ally.protected).toBe(false);
  });
});

describe('enemy skill AI', () => {
  it('敵もMPを持ち、初回は増えず次ラウンドに10回復する', () => {
    const state = play(); const enemy = presetUnit('enemy', 'Attacker', 1, 1); enemy.currentMp = 0; state.stage.units.push(enemy); startRound(state, 1); expect(enemy.currentMp).toBe(0); startRound(state, 2); expect(enemy.currentMp).toBe(10);
  });
  it('通常攻撃より明確に強いスキルを選び、MP不足なら通常攻撃へフォールバックする', () => {
    const state = play(); const enemy = presetUnit('enemy', 'Attacker', 2, 2); const ally = defaultUnit('ally', 2, 3); state.stage.units.push(enemy, ally);
    expect(chooseEnemyAction(state, enemy).skillId).toBe('heavy-break'); runEnemyAction(state, enemy.id); expect(enemy.currentMp).toBe(0); expect(ally.hp).toBeLessThan(ally.maxHp);
    const fallback = play(); const poor = presetUnit('enemy', 'Attacker', 2, 2); poor.currentMp = 0; const victim = defaultUnit('ally', 2, 3); fallback.stage.units.push(poor, victim);
    expect(chooseEnemyAction(fallback, poor).skillId).toBeUndefined(); runEnemyAction(fallback, poor.id); expect(victim.hp).toBeLessThan(victim.maxHp);
  });
  it('Tankは複数対象へGround Slamを選び、Defenderは低HPでGuardまたは傷ついた味方へProtectを選ぶ', () => {
    const slam = play(); const tank = presetUnit('enemy', 'Tank', 3, 3); tank.currentMp = 30; slam.stage.units.push(tank, defaultUnit('ally', 3, 2), defaultUnit('ally', 4, 3)); expect(chooseEnemyAction(slam, tank).skillId).toBe('ground-slam');
    const guard = play(); const defender = presetUnit('enemy', 'Defender', 1, 1); defender.hp = 20; guard.stage.units.push(defender, defaultUnit('ally', 7, 7)); expect(chooseEnemyAction(guard, defender).skillId).toBe('guard');
    const protect = play(); const protector = presetUnit('enemy', 'Defender', 1, 1); const friend = presetUnit('enemy', 'Attacker', 1, 2); friend.hp = 10; protect.stage.units.push(protector, friend, defaultUnit('ally', 7, 7)); expect(chooseEnemyAction(protect, protector).skillId).toBe('protect');
  });
  it('Tankは単体へShield Bashを使用し、AIは高い方向補正の攻撃位置を評価する', () => {
    const state = play(); const tank = presetUnit('enemy', 'Tank', 2, 2); const ally = defaultUnit('ally', 2, 3); state.stage.units.push(tank, ally);
    expect(chooseEnemyAction(state, tank).skillId).toBe('shield-bash'); runEnemyAction(state, tank.id); expect(tank.currentMp).toBe(0);
    const directional = play(); const enemy = defaultUnit('enemy', 2, 4); enemy.move = 3; const target = defaultUnit('ally', 2, 2); target.direction = 'up'; directional.stage.units.push(enemy, target);
    const choice = chooseEnemyAction(directional, enemy); expect(choice.score).toBeGreaterThanOrEqual(calculateAttackDamage(enemy, target).damage);
  });
});

describe('typed stage placement and compatibility', () => {
  it('Friendly/Enemyそれぞれ5タイプを配置でき、重複・壁には配置しない', () => {
    for (const side of ['ally', 'enemy'] as const) for (const type of Object.keys(PLAYER_PRESETS) as Array<keyof typeof PLAYER_PRESETS>) {
      const stage = createStage(); expect(placePresetUnit(stage, side, type, { x: 1, y: 1 })).toBe(true); const unit = stage.units[0]; expect([unit.side, unit.unitType, unit.skillIds]).toEqual([side, type, [...PLAYER_PRESETS[type].skillIds]]);
      expect(placePresetUnit(stage, side, type, { x: 1, y: 1 })).toBe(false); stage.terrain[indexOf({ x: 2, y: 2 })] = 'wall'; expect(placePresetUnit(stage, side, type, { x: 2, y: 2 })).toBe(false);
    }
  });
  it('type/faction/位置/向きを保存・復元し、typeなし旧データはBalanceへ補完する', () => {
    const stage = createStage(); placePresetUnit(stage, 'enemy', 'Tank', { x: 4, y: 5 }); stage.units[0].direction = 'left'; const loaded = parseStage(stageToJson(stage)); expect([loaded.units[0].side, loaded.units[0].unitType, loaded.units[0].x, loaded.units[0].y, loaded.units[0].direction]).toEqual(['enemy', 'Tank', 4, 5, 'left']);
    const old = { ...defaultUnit('enemy', 1, 1) } as Partial<ReturnType<typeof defaultUnit>>; delete old.unitType; delete old.skillIds;
    const migrated = parseStage(JSON.stringify({ version: 1, terrain: createStage().terrain, units: [old] })); expect(migrated.units[0].unitType).toBe('Balance'); expect(migrated.units[0].skillIds).toEqual(['power-slash', 'shock-wave']);
  });
});

describe('skill and unit presentation', () => {
  it('全スキルの説明に名前・MP・射程・範囲・威力・特殊効果を表示できる', () => {
    const expected = {
      'power-slash': ['Power Slash', '20', '1', '単体', '×1.5', '隣接する敵1体'],
      'shock-wave': ['Shock Wave', '30', '直線2', '単体', '×1.4', '衝撃波'],
      'heavy-break': ['Heavy Break', '30', '1', '単体', '×1.8', '高威力'],
      execution: ['Execution', '40', '1', '単体', '×2.2', '大量のMP'],
      'shield-bash': ['Shield Bash', '20', '1', '単体', '×1.3', '押し出す'],
      'ground-slam': ['Ground Slam', '30', '自分中心', '上下左右1マス', '×1.1', '周囲'],
      rush: ['Rush', '20', '1', '単体', '×1.4', '素早い攻撃'],
      'dash-strike': ['Dash Strike', '30', '2', '単体', '×1.5', '接近'],
      guard: ['Guard', '20', '自分', '自分', undefined, '40%軽減'],
      protect: ['Protect', '30', '1', '味方単体', undefined, '30%軽減'],
    } as const;
    for (const [id, values] of Object.entries(expected) as Array<[keyof typeof expected, typeof expected[keyof typeof expected]]>) {
      const details = skillDetails(SKILLS[id], 50);
      expect([details.name, details.mp, details.range, details.area, details.power]).toEqual(values.slice(0, 5)); expect(details.description).toContain(values[5]);
    }
  });
  it('MP不足でも説明と不足理由を確認でき、表示・キャンセルだけではMPを消費しない', () => {
    const unit = presetUnit('ally', 'Attacker', 1, 1); unit.currentMp = 20; const before = unit.currentMp;
    const details = skillDetails(SKILLS['heavy-break'], unit.currentMp); expect(details.currentMp).toBe('20'); expect(details.unavailable).toBe('MP不足'); expect(details.description).toContain('高威力');
    const state = play(); state.stage.units.push(unit); state.selectedSkillId = 'heavy-break'; state.phase = 'skill'; state.selectedSkillId = undefined; state.phase = 'move'; expect(unit.currentMp).toBe(before);
  });
  it('5タイプのマーカーは一意で、陣営色とは別のB/A/T/S/Dとして保存後も維持される', () => {
    expect(UNIT_TYPE_MARKERS).toEqual({ Balance: 'B', Attacker: 'A', Tank: 'T', Assault: 'S', Defender: 'D' });
    expect(new Set(Object.values(UNIT_TYPE_MARKERS)).size).toBe(5); expect([factionLabel('ally'), factionLabel('enemy')]).toEqual(['Friendly', 'Enemy']);
    const stage = createStage(); for (const [index, type] of (Object.keys(UNIT_TYPE_MARKERS) as Array<keyof typeof UNIT_TYPE_MARKERS>).entries()) placePresetUnit(stage, index % 2 ? 'enemy' : 'ally', type, { x: index, y: 0 });
    const loaded = parseStage(stageToJson(stage)); expect(loaded.units.map((unit) => UNIT_TYPE_MARKERS[unit.unitType])).toEqual(['B', 'A', 'T', 'S', 'D']); expect(loaded.units.map((unit) => factionLabel(unit.side))).toEqual(['Friendly', 'Enemy', 'Friendly', 'Enemy', 'Friendly']);
  });
});
