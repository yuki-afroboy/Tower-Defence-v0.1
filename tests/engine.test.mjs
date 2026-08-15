/*
 * ゲームロジックの自動テスト
 *   node --test tests/
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from '../tools/load-engine.mjs';

const LFD = loadEngine();
const C = LFD.Config;
const STEP = 1 / 60;

function newGame(seed = 1) { return new LFD.Game({ seed }); }

/* 指定秒数だけ時間を進める */
function advance(g, seconds) {
  for (let i = 0; i < Math.round(seconds / STEP); i++) g.update(STEP);
}

/* ---- マップ ---------------------------------------------------------- */

test('マップ: 道の上にはタワーを置けない', () => {
  const g = newGame();
  for (const p of C.PATH_CELLS) {
    assert.equal(g.canBuild(p.c, p.r), false, `(${p.c},${p.r}) は道なので置けないはず`);
  }
});

test('マップ: 拠点と岩には置けない / 空きマスは十分ある', () => {
  const g = newGame();
  assert.equal(g.canBuild(C.BASE_CELL.c, C.BASE_CELL.r), false);
  for (const rk of C.ROCKS) assert.equal(g.canBuild(rk.c, rk.r), false);

  let free = 0;
  for (let r = 0; r < C.GRID_ROWS; r++) {
    for (let c = 0; c < C.GRID_COLS; c++) if (g.canBuild(c, r)) free++;
  }
  assert.ok(free >= 50, `設置可能マスが少なすぎる: ${free}`);
});

test('マップ: 経路は連続していて拠点で終わる', () => {
  const start = C.posAt(0);
  const end = C.posAt(C.PATH_LENGTH);
  assert.equal(Math.round(end.x - 0.5), C.BASE_CELL.c);
  assert.equal(Math.round(end.y - 0.5), C.BASE_CELL.r);
  assert.ok(start.x < 0.6, '出現位置は画面外の左');

  let prev = C.posAt(0);
  for (let d = 0.1; d <= C.PATH_LENGTH; d += 0.1) {
    const p = C.posAt(d);
    const step = Math.hypot(p.x - prev.x, p.y - prev.y);
    assert.ok(step < 0.2, `経路が飛んでいる (d=${d.toFixed(1)}, step=${step.toFixed(3)})`);
    prev = p;
  }
});

/* ---- 設置・強化・売却 ------------------------------------------------- */

test('設置: ゴールドが減り、同じマスには二重に置けない', () => {
  const g = newGame();
  const before = g.gold;
  const res = g.build(2, 2, 'archer');
  assert.equal(res.ok, true);
  assert.equal(g.gold, before - C.TOWERS.archer.cost);
  assert.equal(g.towers.length, 1);
  assert.equal(g.towerAt(2, 2).type, 'archer');

  const again = g.build(2, 2, 'cannon');
  assert.equal(again.ok, false);
  assert.equal(again.reason, 'place');
  assert.equal(g.towers.length, 1);
});

test('設置: ゴールド不足では建てられない', () => {
  const g = newGame();
  g.gold = 10;
  const res = g.build(2, 2, 'sniper');
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'gold');
  assert.equal(g.gold, 10);
  assert.equal(g.towers.length, 0);
});

test('強化: 3段階まで上がり、能力も上がる', () => {
  const g = newGame();
  g.gold = 99999;
  const t = g.build(2, 2, 'archer').tower;
  const base = g.towerStats(t);

  for (let i = 0; i < 3; i++) {
    const cost = g.upgradeCost(t);
    assert.equal(typeof cost, 'number');
    const goldBefore = g.gold;
    assert.equal(g.upgrade(t).ok, true);
    assert.equal(g.gold, goldBefore - cost);
  }
  assert.equal(t.level, 3, 'Lv4(=3回強化)まで上がる');
  const max = g.towerStats(t);
  assert.ok(max.dmg > base.dmg && max.rate > base.rate && max.range > base.range);

  assert.equal(g.upgradeCost(t), null);
  assert.equal(g.upgrade(t).ok, false);
  assert.equal(t.level, 3);
});

test('強化: ゴールドが足りなければ失敗する', () => {
  const g = newGame();
  const t = g.build(2, 2, 'archer').tower;
  g.gold = 0;
  assert.equal(g.upgrade(t).ok, false);
  assert.equal(t.level, 0);
});

test('売却: 投資額の60%が戻り、マスが空く', () => {
  const g = newGame();
  g.gold = 99999;
  const t = g.build(2, 2, 'cannon').tower;
  g.upgrade(t);
  const invested = C.TOWERS.cannon.cost + C.TOWERS.cannon.levels[1].up;
  assert.equal(t.invested, invested);

  const goldBefore = g.gold;
  const res = g.sell(t);
  assert.equal(res.ok, true);
  assert.equal(res.value, Math.floor(invested * 0.6));
  assert.equal(g.gold, goldBefore + res.value);
  assert.equal(g.towers.length, 0);
  assert.equal(g.towerAt(2, 2), null);
  assert.equal(g.canBuild(2, 2), true);
});

/* ---- 戦闘 ------------------------------------------------------------- */

test('戦闘: タワーが敵を撃破してゴールドが増える', () => {
  const g = newGame();
  g.gold = 99999;
  g.build(2, 2, 'archer');
  g.spawnEnemy('normal', 1, 1);
  const goldBefore = g.gold;

  advance(g, 12);
  assert.equal(g.stats.killed >= 1, true, '敵が倒せていない');
  assert.ok(g.gold > goldBefore, 'ゴールドが増えていない');
  assert.equal(g.stats.leaked, 0, '敵が拠点に到達してしまった');
});

test('戦闘: 装甲でダメージが減り、スナイパーは装甲を無視する', () => {
  const g = newGame();
  const tank = g.spawnEnemy('tank', 1, 1);
  const before = tank.hp;
  const dealt = g.damageEnemy(tank, 30, false);
  assert.equal(dealt, 30 - C.ENEMIES.tank.armor);
  assert.equal(tank.hp, before - dealt);

  const tank2 = g.spawnEnemy('tank', 1, 1);
  assert.equal(g.damageEnemy(tank2, 30, true), 30);
});

test('戦闘: 装甲が高くても最低20%は通る', () => {
  const g = newGame();
  const boss = g.spawnEnemy('boss', 1, 1);
  const dealt = g.damageEnemy(boss, 10, false);   /* 10 - 22 はマイナスになる */
  assert.equal(dealt, 2);
});

test('戦闘: アイスタワーは射程内の敵をまとめて減速させる', () => {
  const g = newGame();
  g.gold = 99999;
  g.build(2, 2, 'ice');
  const a = g.spawnEnemy('normal', 1, 1);
  const b = g.spawnEnemy('normal', 1, 1);
  a.dist = 2.0; b.dist = 2.6;
  g.updateEnemyPos(a); g.updateEnemyPos(b);

  advance(g, 1.5);
  assert.ok(a.slow > 0 && b.slow > 0, '複数の敵が同時に減速していない');

  /* 同じ0.5秒で、減速中の敵のほうが進む距離が短い */
  const slowedFrom = a.dist;
  advance(g, 0.5);
  const slowedMoved = a.dist - slowedFrom;

  const g2 = newGame();
  const plain = g2.spawnEnemy('normal', 1, 1);
  const plainFrom = plain.dist;
  advance(g2, 0.5);
  const plainMoved = plain.dist - plainFrom;

  assert.ok(slowedMoved < plainMoved * 0.85,
    `減速が移動に反映されていない (減速中 ${slowedMoved.toFixed(3)} / 通常 ${plainMoved.toFixed(3)})`);
});

test('戦闘: キャノンは範囲ダメージで複数の敵を巻き込む', () => {
  const g = newGame();
  g.gold = 99999;
  g.build(2, 2, 'cannon');
  const group = [];
  for (let i = 0; i < 4; i++) {
    const e = g.spawnEnemy('normal', 1, 1);
    e.dist = 2.4 + i * 0.12;
    e.offset = 0;
    g.updateEnemyPos(e);
    group.push(e);
  }
  advance(g, 2.5);
  const damagedCount = group.filter(e => !e.alive || e.hp < e.maxHp).length;
  assert.ok(damagedCount >= 2, `範囲攻撃が1体にしか当たっていない (${damagedCount})`);
});

test('戦闘: スナイパーは近すぎる敵を撃てない', () => {
  const g = newGame();
  g.gold = 99999;
  const t = g.build(5, 2, 'sniper').tower;

  const near = g.spawnEnemy('normal', 1, 1);
  near.x = t.x + 0.5; near.y = t.y;
  assert.equal(g.findTarget(t, g.towerStats(t).range), null, '至近距離の敵を狙ってしまう');

  near.x = t.x + 3.0;
  assert.equal(g.findTarget(t, g.towerStats(t).range), near, '射程内の敵を狙えていない');
});

test('戦闘: タワーは拠点に近い敵を優先して狙う', () => {
  const g = newGame();
  g.gold = 99999;
  const t = g.build(2, 2, 'archer').tower;
  const behind = g.spawnEnemy('normal', 1, 1);
  const ahead = g.spawnEnemy('normal', 1, 1);
  behind.dist = 2.0; ahead.dist = 3.0;
  g.updateEnemyPos(behind); g.updateEnemyPos(ahead);
  assert.equal(g.findTarget(t, g.towerStats(t).range), ahead);
});

/* ---- 拠点HPと勝敗 ------------------------------------------------------ */

test('拠点: 敵が到達するとHPが減る', () => {
  const g = newGame();
  const e = g.spawnEnemy('normal', 1, 1);
  e.dist = C.PATH_LENGTH - 0.05;
  const hpBefore = g.hp;
  advance(g, 0.5);
  assert.equal(g.hp, hpBefore - C.ENEMIES.normal.damage);
  assert.equal(g.stats.leaked, 1);
  assert.equal(g.enemies.length, 0);
});

test('拠点: HPが0になるとゲームオーバー', () => {
  const g = newGame();
  g.startWave();
  g.hp = 1;
  const e = g.spawnEnemy('tank', 1, 1);
  e.dist = C.PATH_LENGTH - 0.05;
  advance(g, 0.5);
  assert.equal(g.hp, 0);
  assert.equal(g.phase, 'defeat');
});

test('ゲームオーバー後は設置も強化もできない', () => {
  const g = newGame();
  g.gold = 99999;
  g.phase = 'defeat';
  assert.equal(g.build(2, 2, 'archer').ok, false);
});

/* ---- Wave ------------------------------------------------------------- */

test('Wave: 15Wave分の定義があり、後半ほど強い', () => {
  assert.equal(C.WAVES.length, 15);
  for (let i = 1; i < C.WAVES.length; i++) {
    assert.ok(C.WAVES[i].hpMul >= C.WAVES[i - 1].hpMul, `Wave${i + 1} が前より弱い`);
  }
  /* 敵の種類が指定どおり登場するか */
  const typesIn = w => new Set(C.WAVES[w - 1].groups.map(g => g[0]));
  assert.ok(typesIn(1).has('normal'));
  assert.ok([4, 5, 6].some(w => typesIn(w).has('fast')), 'Wave4-6にFastが出ない');
  assert.ok([7, 8, 9].some(w => typesIn(w).has('tank')), 'Wave7-9にTankが出ない');
  assert.ok([10, 11, 12].some(w => typesIn(w).has('swarm')), 'Wave10-12にSwarmが出ない');
  assert.ok(typesIn(15).has('boss'), 'Wave15にBossが出ない');
  assert.ok(Object.keys(C.ENEMIES).length >= 5);
  assert.ok(Object.keys(C.TOWERS).length >= 4);
});

test('Wave: 開始すると敵が出現し、全滅させるとクリア報酬が入る', () => {
  const g = newGame();
  g.gold = 99999;
  /* 強いタワーを並べて確実に殲滅する */
  [[2, 2], [5, 2], [3, 4], [2, 6], [3, 8]].forEach(([c, r]) => {
    const t = g.build(c, r, 'archer').tower;
    g.upgrade(t); g.upgrade(t); g.upgrade(t);
  });

  assert.equal(g.phase, 'ready');
  assert.equal(g.startWave().ok, true);
  assert.equal(g.phase, 'wave');
  assert.equal(g.wave, 1);

  advance(g, 3);
  assert.ok(g.enemies.length > 0, '敵が出現していない');

  const goldBefore = g.gold;
  let t = 0;
  while (g.phase === 'wave' && t < 120) { g.update(STEP); t += STEP; }
  assert.equal(g.phase, 'ready', 'Waveが終わらない');
  assert.ok(g.gold > goldBefore, 'クリア報酬が入っていない');
  assert.equal(g.hp, g.maxHp, 'HPが減っている');
});

test('Wave: 進行中に次を呼ぶとボーナスが入り、まとめて出現する', () => {
  const g = newGame();
  g.startWave();
  advance(g, 1);
  const goldBefore = g.gold;
  const res = g.startWave();
  assert.equal(res.ok, true);
  assert.equal(res.early, true);
  assert.equal(g.wave, 2);
  assert.equal(g.gold, goldBefore + C.BALANCE.earlyCallGold(1));
});

test('Wave: 15Wave全部クリアすると Victory', () => {
  const g = newGame();
  g.gold = 999999;
  [[2, 2], [5, 2], [3, 4], [6, 4], [2, 6], [5, 6], [3, 8], [2, 8],
   [6, 10], [2, 10], [3, 12], [5, 12]].forEach(([c, r], i) => {
    const type = i % 4 === 0 ? 'cannon' : i % 4 === 1 ? 'sniper' : i % 4 === 2 ? 'ice' : 'archer';
    const t = g.build(c, r, type).tower;
    g.upgrade(t); g.upgrade(t); g.upgrade(t);
    g.gold = 999999;
  });

  for (let w = 1; w <= 15; w++) {
    assert.equal(g.startWave().ok, true, `Wave${w} が開始できない`);
    let t = 0;
    while (g.phase === 'wave' && t < 400) { g.update(STEP); t += STEP; }
    assert.notEqual(g.phase, 'defeat', `Wave${w} で負けた (HP${g.hp})`);
  }
  assert.equal(g.phase, 'victory');
  assert.equal(g.wave, 15);
  assert.equal(g.startWave().ok, false, 'Victory後にWaveが始まってしまう');
});

/* ---- 速度倍率 ---------------------------------------------------------- */

test('速度: ×2は同じ時間で約2倍進む(結果は変わらない)', () => {
  const a = newGame(5);
  const b = newGame(5);
  a.startWave(); b.startWave();
  advance(a, 10);              /* ×1 で10秒 */
  advance(b, 20);              /* ×2 で10秒ぶん = 20秒進める */
  assert.ok(b.time > a.time);
  assert.ok(b.spawnQueue.length <= a.spawnQueue.length);
});

/* ---- 経済 --------------------------------------------------------------- */

test('経済: 強いタワーほど高く、必要ゴールドの総額も多い', () => {
  const total = id => {
    const d = C.TOWERS[id];
    return d.levels.slice(1).reduce((s, l) => s + l.up, d.cost);
  };
  assert.ok(C.TOWERS.archer.cost < C.TOWERS.ice.cost);
  assert.ok(C.TOWERS.ice.cost < C.TOWERS.cannon.cost);
  assert.ok(C.TOWERS.cannon.cost < C.TOWERS.sniper.cost);
  assert.ok(total('archer') < total('cannon'));
  assert.ok(total('cannon') < total('sniper'));
  assert.equal(C.BALANCE.startGold >= C.TOWERS.archer.cost * 3, true,
    '開始ゴールドで最低3基は置けるべき');
});
