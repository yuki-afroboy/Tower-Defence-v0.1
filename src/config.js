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
        { dmg: 21, rate: 2.1, range: 2.9, up: 90 }
      ],
      /* Lv4は2つの進化先から選ぶ */
      branches: [
        {
          key: 'rapid', label: '連射',
          note: '手数で押す。数の多い敵に強い',
          dmg: 26, rate: 3.4, range: 3.0, up: 150
        },
        {
          key: 'pierce', label: '貫通',
          note: '装甲を無視する。Tank対策になる',
          dmg: 40, rate: 2.0, range: 3.4, pierce: true, up: 170
        }
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
        { dmg: 60, rate: 0.7, range: 2.5, splash: 1.2, up: 180 }
      ],
      branches: [
        {
          key: 'heavy', label: '重砲',
          note: '一撃が重く、爆発範囲も広い',
          dmg: 100, rate: 0.75, range: 2.9, splash: 1.5, up: 300
        },
        {
          key: 'burn', label: '焼夷',
          note: '着弾後も燃え続ける。装甲を無視して削る',
          dmg: 62, rate: 0.85, range: 2.8, splash: 1.6,
          burn: { dps: 26, dur: 3 }, up: 300
        }
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
        { dmg: 9, rate: 1.1, range: 2.6, slow: 0.46, slowDur: 2.0, up: 130 }
      ],
      branches: [
        {
          key: 'zero', label: '絶対零度',
          note: '減速をさらに強化。足止め特化',
          dmg: 16, rate: 1.2, range: 2.9, slow: 0.68, slowDur: 2.6, up: 210
        },
        {
          key: 'blizzard', label: '氷嵐',
          note: '減速は控えめだが、広範囲に大ダメージ',
          dmg: 30, rate: 1.3, range: 3.3, slow: 0.40, slowDur: 2.0, up: 230
        }
      ]
    },
    sniper: {
      id: 'sniper',
      name: 'Sniper',
      nameJa: 'スナイパー',
      desc: '長射程・単体高火力・装甲無視。足元(2.1マス以内)は撃てないので置き場所が重要。',
      color: '#c792ff',
      dark: '#6a3fa0',
      shot: 'beam',
      cost: 220,
      pierce: true,
      minRange: 2.1,
      levels: [
        { dmg: 70, rate: 0.35, range: 3.6 },
        { dmg: 110, rate: 0.38, range: 4.0, up: 200 },
        { dmg: 175, rate: 0.42, range: 4.4, up: 340 }
      ],
      branches: [
        {
          key: 'deadeye', label: '必中',
          note: '一撃特化。ボスに最も効く',
          dmg: 280, rate: 0.44, range: 4.9, up: 580
        },
        {
          key: 'burst', label: '速射',
          note: '一撃は落ちるが手数が3倍近い',
          dmg: 150, rate: 0.95, range: 4.4, up: 600
        }
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

  /* ---- Wave特性 ------------------------------------------------------
     一部のWaveに付く「特殊条件」。同じ敵でも戦い方を変える必要が出ます。 */
  var AFFIXES = {
    armored: {
      key: 'armored', name: '重装', icon: '🛡',
      desc: '敵の装甲+6。装甲無視の攻撃が有効', short: '装甲+6',
      color: '#9fb4d8', armorAdd: 6
    },
    swift: {
      key: 'swift', name: '疾走', icon: '💨',
      desc: '敵の移動速度+35%。減速が重要', short: '速度+35%',
      color: '#ffe066', speedMul: 1.35
    },
    regen: {
      key: 'regen', name: '再生', icon: '✚',
      desc: '敵が毎秒HPの2%を回復。一気に削る必要あり', short: 'HP自動回復',
      color: '#7dff9f', regenPct: 0.02
    }
  };

  /* ---- Wave ---------------------------------------------------------- */
  /* groups: [敵タイプ, 数, 出現間隔(秒), 開始までの遅延(秒)] */
  function W(hpMul, groups, affix) {
    return { hpMul: hpMul, groups: groups, affix: affix || null };
  }
  var WAVES = [
    /*  1 */ W(1.00, [['normal', 6, 1.2, 0]]),
    /*  2 */ W(1.20, [['normal', 9, 1.0, 0]]),
    /*  3 */ W(1.45, [['normal', 12, 0.85, 0]]),
    /*  4 */ W(1.70, [['fast', 8, 0.7, 0], ['normal', 6, 1.0, 5]]),
    /*  5 */ W(1.95, [['normal', 10, 0.8, 0], ['fast', 8, 0.55, 6]], 'swift'),
    /*  6 */ W(2.20, [['fast', 16, 0.45, 0], ['normal', 6, 1.0, 4]]),
    /*  7 */ W(2.50, [['tank', 2, 3.0, 0], ['normal', 10, 0.8, 2]]),
    /*  8 */ W(2.85, [['tank', 3, 2.6, 0], ['fast', 12, 0.5, 3]], 'armored'),
    /*  9 */ W(3.25, [['tank', 4, 2.4, 0], ['normal', 14, 0.7, 2]]),
    /* 10 */ W(4.00, [['swarm', 30, 0.26, 0], ['normal', 8, 0.9, 8]], 'regen'),
    /* 11 */ W(4.70, [['swarm', 26, 0.28, 0], ['fast', 14, 0.42, 5]]),
    /* 12 */ W(5.40, [['tank', 4, 2.2, 0], ['swarm', 30, 0.26, 3]], 'swift'),
    /* 13 */ W(6.30, [['tank', 5, 2.0, 0], ['fast', 16, 0.4, 2], ['normal', 14, 0.6, 8]], 'armored'),
    /* 14 */ W(7.40, [['tank', 6, 1.9, 0], ['swarm', 34, 0.24, 2], ['fast', 14, 0.42, 10]], 'regen'),
    /* 15 */ W(8.00, [['boss', 1, 1, 0], ['tank', 4, 2.4, 6], ['swarm', 26, 0.28, 12]])
  ];

  /* ---- アクティブスキル ----------------------------------------------
     ゴールドを使わず、時間で回復する必殺技。Wave中に自分で撃ちます。 */
  var ABILITIES = {
    meteor: {
      key: 'meteor', name: 'メテオ', icon: '☄',
      desc: '狙った場所に隕石。装甲を無視した大ダメージ',
      cooldown: 30,
      radius: 1.35,
      aimed: true,
      slow: 0.4,
      slowDur: 1.5,
      damage: function (wave) { return 100 + wave * 25; }
    },
    freeze: {
      key: 'freeze', name: '氷結', icon: '❄',
      desc: '画面上のすべての敵を一時停止レベルまで減速',
      cooldown: 36,
      aimed: false,
      slow: 0.65,
      duration: 2.5
    }
  };
  var ABILITY_ORDER = ['meteor', 'freeze'];

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
    AFFIXES: AFFIXES,
    ABILITIES: ABILITIES,
    ABILITY_ORDER: ABILITY_ORDER,
    ENEMIES: ENEMIES,
    WAVES: WAVES,
    BALANCE: BALANCE,
    TOTAL_WAVES: WAVES.length
  };
})(typeof window !== 'undefined' ? window : globalThis);
