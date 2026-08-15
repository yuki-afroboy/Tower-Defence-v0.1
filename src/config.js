/*
 * Last Fortress Defense - ゲーム全体の設定データ
 * ここの数値を変えるとゲームバランスが変わります。
 * (このファイルは DOM を使わないので Node.js のテストからも読み込めます)
 */
(function (global) {
  'use strict';

  var GRID_COLS = 9;
  var GRID_ROWS = 13;

  /* 敵が通る道の折れ点。 c = 列(0..8), r = 行(0..12)
     -1 は画面外(出現位置)です。 */
  var WAYPOINTS = [
    { c: -1, r: 1 },
    { c: 7, r: 1 },
    { c: 7, r: 3 },
    { c: 1, r: 3 },
    { c: 1, r: 5 },
    { c: 7, r: 5 },
    { c: 7, r: 7 },
    { c: 1, r: 7 },
    { c: 1, r: 9 },
    { c: 4, r: 9 },
    { c: 4, r: 12 }
  ];

  var BASE_CELL = { c: 4, r: 12 };

  /* 装飾の岩。道ではないがタワーも置けないマス */
  var ROCKS = [
    { c: 0, r: 6 },
    { c: 8, r: 8 },
    { c: 2, r: 11 },
    { c: 6, r: 11 }
  ];

  /* ---- 経路の計算 ---------------------------------------------------- */
  var segments = [];
  var totalLength = 0;
  for (var i = 0; i < WAYPOINTS.length - 1; i++) {
    var a = WAYPOINTS[i];
    var b = WAYPOINTS[i + 1];
    var len = Math.abs(b.c - a.c) + Math.abs(b.r - a.r); // 経路は必ず縦か横
    segments.push({ a: a, b: b, len: len, start: totalLength });
    totalLength += len;
  }

  /* 進んだ距離(マス単位)から座標(マス単位・中心基準)を求める */
  function posAt(dist) {
    if (dist <= 0) {
      return { x: WAYPOINTS[0].c + 0.5, y: WAYPOINTS[0].r + 0.5 };
    }
    for (var i = 0; i < segments.length; i++) {
      var s = segments[i];
      if (dist <= s.start + s.len || i === segments.length - 1) {
        var t = s.len === 0 ? 0 : Math.min(1, (dist - s.start) / s.len);
        return {
          x: s.a.c + (s.b.c - s.a.c) * t + 0.5,
          y: s.a.r + (s.b.r - s.a.r) * t + 0.5
        };
      }
    }
    var last = WAYPOINTS[WAYPOINTS.length - 1];
    return { x: last.c + 0.5, y: last.r + 0.5 };
  }

  /* 道になっているマスの一覧 */
  var pathCells = [];
  var pathKeys = Object.create(null);
  function addCell(c, r) {
    if (c < 0 || r < 0 || c >= GRID_COLS || r >= GRID_ROWS) return;
    var key = c + ',' + r;
    if (pathKeys[key]) return;
    pathKeys[key] = true;
    pathCells.push({ c: c, r: r });
  }
  for (var w = 0; w < WAYPOINTS.length - 1; w++) {
    var p = WAYPOINTS[w];
    var q = WAYPOINTS[w + 1];
    var dc = Math.sign(q.c - p.c);
    var dr = Math.sign(q.r - p.r);
    var cc = p.c;
    var rr = p.r;
    addCell(cc, rr);
    while (cc !== q.c || rr !== q.r) {
      cc += dc;
      rr += dr;
      addCell(cc, rr);
    }
  }

  var rockKeys = Object.create(null);
  ROCKS.forEach(function (rk) { rockKeys[rk.c + ',' + rk.r] = true; });

  function isPath(c, r) { return !!pathKeys[c + ',' + r]; }
  function isRock(c, r) { return !!rockKeys[c + ',' + r]; }
  function inGrid(c, r) { return c >= 0 && r >= 0 && c < GRID_COLS && r < GRID_ROWS; }
  function isBuildable(c, r) {
    return inGrid(c, r) && !isPath(c, r) && !isRock(c, r);
  }

  /* ---- タワー -------------------------------------------------------- */
  /* range / splash はマス単位。 rate は1秒あたりの攻撃回数。 */
  var TOWERS = {
    archer: {
      id: 'archer',
      name: 'Archer',
      nameJa: 'アーチャー',
      desc: '安価で連射が速い基本タワー。単体攻撃。',
      color: '#5bd66d',
      dark: '#2f8f43',
      shot: 'arrow',
      cost: 60,
      levels: [
        { dmg: 9, rate: 1.7, range: 2.5 },
        { dmg: 14, rate: 1.9, range: 2.7, up: 55 },
        { dmg: 21, rate: 2.1, range: 2.9, up: 90 },
        { dmg: 32, rate: 2.4, range: 3.2, up: 150 }
      ]
    },
    cannon: {
      id: 'cannon',
      name: 'Cannon',
      nameJa: 'キャノン',
      desc: '発射は遅いが高威力の範囲攻撃。集団に強い。',
      color: '#ff9f43',
      dark: '#b35c00',
      shot: 'shell',
      cost: 120,
      levels: [
        { dmg: 26, rate: 0.6, range: 2.3, splash: 0.9 },
        { dmg: 40, rate: 0.65, range: 2.4, splash: 1.1, up: 110 },
        { dmg: 60, rate: 0.7, range: 2.5, splash: 1.2, up: 180 },
        { dmg: 92, rate: 0.78, range: 2.8, splash: 1.4, up: 300 }
      ]
    },
    ice: {
      id: 'ice',
      name: 'Ice',
      nameJa: 'アイス',
      desc: '射程内の敵全員を減速。ダメージは低いが必須級。',
      color: '#5ec8ff',
      dark: '#1c6fa8',
      shot: 'pulse',
      cost: 90,
      levels: [
        { dmg: 4, rate: 0.9, range: 2.2, slow: 0.30, slowDur: 1.6 },
        { dmg: 6, rate: 1.0, range: 2.4, slow: 0.38, slowDur: 1.8, up: 80 },
        { dmg: 9, rate: 1.1, range: 2.6, slow: 0.46, slowDur: 2.0, up: 130 },
        { dmg: 14, rate: 1.2, range: 2.9, slow: 0.55, slowDur: 2.4, up: 210 }
      ]
    },
    sniper: {
      id: 'sniper',
      name: 'Sniper',
      nameJa: 'スナイパー',
      desc: '長射程・単体高火力・装甲無視。ただし近すぎる敵は撃てない。',
      color: '#c792ff',
      dark: '#6a3fa0',
      shot: 'beam',
      cost: 220,
      pierce: true,
      minRange: 1.5,
      levels: [
        { dmg: 70, rate: 0.35, range: 3.6 },
        { dmg: 110, rate: 0.38, range: 4.0, up: 200 },
        { dmg: 175, rate: 0.42, range: 4.4, up: 340 },
        { dmg: 265, rate: 0.45, range: 4.9, up: 580 }
      ]
    }
  };

  var TOWER_ORDER = ['archer', 'cannon', 'ice', 'sniper'];

  /* ---- 敵 ------------------------------------------------------------ */
  /* speed はマス/秒。 armor はダメージの固定軽減。 */
  var ENEMIES = {
    normal: {
      id: 'normal', name: 'Normal', hp: 55, speed: 1.15, armor: 0,
      gold: 11, damage: 1, radius: 0.3, color: '#ff6b6b', dark: '#8f2f2f'
    },
    fast: {
      id: 'fast', name: 'Fast', hp: 40, speed: 2.3, armor: 0,
      gold: 12, damage: 1, radius: 0.24, color: '#ffe066', dark: '#a08800'
    },
    tank: {
      id: 'tank', name: 'Tank', hp: 260, speed: 0.62, armor: 12,
      gold: 45, damage: 3, radius: 0.42, color: '#8d9db6', dark: '#3d4c63'
    },
    swarm: {
      id: 'swarm', name: 'Swarm', hp: 22, speed: 1.5, armor: 0,
      gold: 4, damage: 1, radius: 0.19, color: '#b6ff7a', dark: '#4f8f28'
    },
    boss: {
      id: 'boss', name: 'BOSS', hp: 1600, speed: 0.45, armor: 22,
      gold: 500, damage: 15, radius: 0.75, color: '#ff3d6e', dark: '#7a0026', boss: true
    }
  };

  /* ---- Wave ---------------------------------------------------------- */
  /* groups: [敵タイプ, 数, 出現間隔(秒), 開始までの遅延(秒)] */
  function W(hpMul, groups) { return { hpMul: hpMul, groups: groups }; }
  var WAVES = [
    /*  1 */ W(1.00, [['normal', 6, 1.2, 0]]),
    /*  2 */ W(1.20, [['normal', 9, 1.0, 0]]),
    /*  3 */ W(1.45, [['normal', 12, 0.85, 0]]),
    /*  4 */ W(1.70, [['fast', 8, 0.7, 0], ['normal', 6, 1.0, 5]]),
    /*  5 */ W(1.95, [['normal', 10, 0.8, 0], ['fast', 8, 0.55, 6]]),
    /*  6 */ W(2.20, [['fast', 16, 0.45, 0], ['normal', 6, 1.0, 4]]),
    /*  7 */ W(2.50, [['tank', 2, 3.0, 0], ['normal', 10, 0.8, 2]]),
    /*  8 */ W(2.85, [['tank', 3, 2.6, 0], ['fast', 12, 0.5, 3]]),
    /*  9 */ W(3.25, [['tank', 4, 2.4, 0], ['normal', 14, 0.7, 2]]),
    /* 10 */ W(4.00, [['swarm', 30, 0.26, 0], ['normal', 8, 0.9, 8]]),
    /* 11 */ W(4.70, [['swarm', 26, 0.28, 0], ['fast', 14, 0.42, 5]]),
    /* 12 */ W(5.40, [['tank', 4, 2.2, 0], ['swarm', 30, 0.26, 3]]),
    /* 13 */ W(6.30, [['tank', 5, 2.0, 0], ['fast', 16, 0.4, 2], ['normal', 14, 0.6, 8]]),
    /* 14 */ W(7.40, [['tank', 6, 1.9, 0], ['swarm', 34, 0.24, 2], ['fast', 14, 0.42, 10]]),
    /* 15 */ W(8.00, [['boss', 1, 1, 0], ['tank', 4, 2.4, 6], ['swarm', 26, 0.28, 12]])
  ];

  var BALANCE = {
    startGold: 250,
    startHp: 20,
    waveClearGold: function (wave) { return 40 + wave * 10; },
    earlyCallGold: function (wave) { return 10 + wave * 3; },
    sellRate: 0.6,
    minDamageRatio: 0.2 /* 装甲でどれだけ減っても元の20%は通る */
  };

  global.LFD = global.LFD || {};
  global.LFD.Config = {
    GRID_COLS: GRID_COLS,
    GRID_ROWS: GRID_ROWS,
    WAYPOINTS: WAYPOINTS,
    BASE_CELL: BASE_CELL,
    ROCKS: ROCKS,
    PATH_CELLS: pathCells,
    PATH_LENGTH: totalLength,
    posAt: posAt,
    isPath: isPath,
    isRock: isRock,
    inGrid: inGrid,
    isBuildable: isBuildable,
    TOWERS: TOWERS,
    TOWER_ORDER: TOWER_ORDER,
    ENEMIES: ENEMIES,
    WAVES: WAVES,
    BALANCE: BALANCE,
    TOTAL_WAVES: WAVES.length
  };
})(typeof window !== 'undefined' ? window : globalThis);
