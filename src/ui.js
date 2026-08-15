/*
 * Last Fortress Defense - 画面(DOM)とゲーム本体をつなぐ部分
 * ・タッチ操作の受付
 * ・HUD / タワーパネル / オーバーレイの更新
 * ・ゲームループ
 */
(function (global) {
  'use strict';

  var C = global.LFD.Config;
  var Sfx = global.LFD.Sfx;
  var doc = global.document;
  var $ = function (id) { return doc.getElementById(id); };

  var game = new global.LFD.Game({ seed: Date.now() % 100000 });
  var canvas = $('game');
  var renderer = new global.LFD.Renderer(canvas);

  var state = {
    paused: false,
    speed: 1,
    started: false,
    overlay: 'start',
    buildType: null,
    selected: null,
    pointerDown: false,
    lastPanelUpdate: 0
  };

  /* ---- トースト表示 --------------------------------------------------- */
  var toastEl = $('toast');
  var toastTimer = null;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 1400);
  }

  var bannerEl = $('wave-banner');
  var bannerTimer = null;
  function banner(msg, isBoss) {
    bannerEl.textContent = msg;
    bannerEl.classList.toggle('boss', !!isBoss);
    bannerEl.classList.add('show');
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(function () { bannerEl.classList.remove('show'); }, 1500);
  }

  var lastHud = {};

  /* ---- タワー選択パレット --------------------------------------------- */
  var paletteEl = $('palette');
  var cards = {};

  function buildPalette() {
    paletteEl.innerHTML = '';
    C.TOWER_ORDER.forEach(function (id) {
      var def = C.TOWERS[id];
      var card = doc.createElement('div');
      card.className = 'tw-card';
      card.dataset.type = id;
      card.setAttribute('role', 'button');
      card.innerHTML = '<canvas width="68" height="68"></canvas>' +
        '<span class="nm">' + def.name + '</span>' +
        '<span class="cs">' + def.cost + '</span>';
      paletteEl.appendChild(card);
      var mini = card.querySelector('canvas');
      drawMiniTower(mini, def, 0);
      card.addEventListener('click', function () { selectBuildType(id); });
      cards[id] = card;
    });
  }

  function drawMiniTower(cv, def, level) {
    var ctx = cv.getContext('2d');
    var size = cv.width;
    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.scale(size / 44, size / 44);
    renderer.drawTowerShape(ctx, 44, def, level, 22, 22, -Math.PI / 2, 0);
    ctx.restore();
  }

  function selectBuildType(id) {
    closePanel();
    if (state.buildType === id) { cancelBuild(); return; }
    state.buildType = id;
    renderer.buildType = id;
    renderer.hoverCell = null;
    Object.keys(cards).forEach(function (k) {
      cards[k].classList.toggle('selected', k === id);
    });
    $('btn-wave').hidden = true;
    $('btn-cancel-build').hidden = false;
    var pv = $('wave-preview');
    pv.classList.add('building');
    pv.textContent = C.TOWERS[id].name + ' を置く場所をタップ';
    lastHud.pv = null;
    Sfx.unlock();
  }

  function cancelBuild() {
    state.buildType = null;
    renderer.buildType = null;
    renderer.hoverCell = null;
    Object.keys(cards).forEach(function (k) { cards[k].classList.remove('selected'); });
    $('btn-wave').hidden = false;
    $('btn-cancel-build').hidden = true;
    $('wave-preview').classList.remove('building');
    lastHud.pv = null;
  }

  /* ---- タワー詳細パネル ----------------------------------------------- */
  var panelEl = $('tower-panel');

  function openPanel(t) {
    state.selected = t;
    renderer.selected = t;
    panelEl.hidden = false;
    paletteEl.style.visibility = 'hidden';
    cancelBuild();
    updatePanel(true);
  }

  function closePanel() {
    state.selected = null;
    renderer.selected = null;
    panelEl.hidden = true;
    paletteEl.style.visibility = '';
  }

  function fmt(n) {
    return Math.round(n * 100) / 100;
  }

  function updatePanel(force) {
    var t = state.selected;
    if (!t) return;
    if (game.towers.indexOf(t) < 0) { closePanel(); return; }
    var now = performance.now();
    if (!force && now - state.lastPanelUpdate < 180) return;
    state.lastPanelUpdate = now;

    var def = t.def;
    var st = game.towerStats(t);
    var next = def.levels[t.level + 1] || null;

    drawMiniTower(panelEl.querySelector('.tp-icon'), def, t.level);
    $('tp-name').textContent = def.name;
    $('tp-level').textContent = 'Lv' + (t.level + 1) + (next ? '' : ' (MAX)');

    var rows = [
      ['攻撃力', st.dmg, next && next.dmg],
      ['攻撃速度', fmt(st.rate) + '/秒', next && (fmt(next.rate) + '/秒')],
      ['射程', fmt(st.range), next && fmt(next.range)],
      ['秒間火力', Math.round(st.dmg * st.rate), next && Math.round(next.dmg * next.rate)]
    ];
    if (st.splash) rows.push(['範囲', fmt(st.splash), next && fmt(next.splash)]);
    if (st.slow) {
      rows.push(['減速', Math.round(st.slow * 100) + '%', next && (Math.round(next.slow * 100) + '%')]);
      rows.push(['減速時間', fmt(st.slowDur) + '秒', next && (fmt(next.slowDur) + '秒')]);
    }
    if (def.pierce) rows.push(['装甲', '無視', null]);
    if (def.minRange) rows.push(['最低射程', fmt(def.minRange), null]);

    $('tp-stats').innerHTML = rows.map(function (r) {
      var nextTxt = (r[2] !== null && r[2] !== undefined && String(r[2]) !== String(r[1]))
        ? ' <span class="up">→ ' + r[2] + '</span>' : '';
      return '<div class="row"><span class="k">' + r[0] + '</span>' +
        '<span class="v">' + r[1] + nextTxt + '</span></div>';
    }).join('');

    var upBtn = $('btn-upgrade');
    var cost = game.upgradeCost(t);
    if (cost === null) {
      upBtn.disabled = true;
      $('up-cost').textContent = 'MAX';
    } else {
      upBtn.disabled = game.gold < cost;
      $('up-cost').textContent = cost;
    }
    $('sell-val').textContent = '+' + game.sellValue(t);
  }

  /* ---- HUD ------------------------------------------------------------ */
  function updateHud() {
    var hp = Math.max(0, game.hp);
    if (lastHud.hp !== hp) {
      $('hp-val').textContent = hp;
      $('hp-bar').style.width = (hp / game.maxHp * 100) + '%';
      lastHud.hp = hp;
    }
    var gold = Math.floor(game.gold);
    if (lastHud.gold !== gold) {
      $('gold-val').textContent = gold;
      lastHud.gold = gold;
      Object.keys(cards).forEach(function (k) {
        cards[k].classList.toggle('poor', gold < C.TOWERS[k].cost);
      });
    }
    if (lastHud.wave !== game.wave) {
      $('wave-val').textContent = game.wave;
      lastHud.wave = game.wave;
    }

    var btn = $('btn-wave');
    var label, disabled = false;
    if (game.phase === 'ready') {
      if (game.wave >= C.TOTAL_WAVES) {
        label = '全Wave終了'; disabled = true;
      } else {
        label = 'WAVE ' + (game.wave + 1) + ' を開始';
      }
    } else if (game.phase === 'wave') {
      if (game.wave >= C.TOTAL_WAVES) {
        label = '最終WAVE 進行中'; disabled = true;
      } else {
        label = '次を呼ぶ +' + C.BALANCE.earlyCallGold(game.wave);
      }
    } else {
      label = '終了'; disabled = true;
    }
    if (lastHud.btn !== label || lastHud.btnDis !== disabled) {
      btn.textContent = label;
      btn.disabled = disabled;
      lastHud.btn = label; lastHud.btnDis = disabled;
    }

    var previewWave = game.phase === 'wave' ? game.wave + 1 : game.wave + 1;
    var pv;
    if (previewWave > C.TOTAL_WAVES) {
      pv = '次のWave: なし(最終Wave)';
    } else {
      var def = C.WAVES[previewWave - 1];
      var parts = {};
      def.groups.forEach(function (g) { parts[g[0]] = (parts[g[0]] || 0) + g[1]; });
      pv = 'Wave ' + previewWave + ': ' + Object.keys(parts).map(function (k) {
        return C.ENEMIES[k].name + '×' + parts[k];
      }).join(' / ');
    }
    if (!state.buildType && lastHud.pv !== pv) {
      $('wave-preview').textContent = pv;
      lastHud.pv = pv;
    }
  }

  /* ---- ボスHPバー ------------------------------------------------------ */
  var bossBar = $('boss-hp');
  function updateBossBar() {
    var boss = null;
    for (var i = 0; i < game.enemies.length; i++) {
      if (game.enemies[i].def.boss) { boss = game.enemies[i]; break; }
    }
    if (!boss) {
      if (!bossBar.hidden) bossBar.hidden = true;
      return;
    }
    bossBar.hidden = false;
    var pct = Math.max(0, boss.hp / boss.maxHp) * 100;
    bossBar.querySelector('i').style.width = pct.toFixed(1) + '%';
    bossBar.querySelector('span').textContent = 'BOSS  ' + Math.ceil(Math.max(0, boss.hp));
  }

  /* ---- オーバーレイ ---------------------------------------------------- */
  function showOverlay(kind) {
    state.overlay = kind;
    var ov = $('overlay');
    var title = $('ov-title'), sub = $('ov-sub'), body = $('ov-body');
    var btn = $('ov-btn'), btn2 = $('ov-btn2');
    btn2.hidden = true;
    ov.hidden = false;

    if (kind === 'start') {
      title.textContent = 'LAST FORTRESS DEFENSE';
      sub.textContent = '全15Wave。最後のボスから拠点を守れ';
      body.innerHTML = '<div class="rules">' +
        '① 下の4つから<b>タワーを選ぶ</b><br>' +
        '② 地図の<b>光ったマス</b>をタップして設置<br>' +
        '③ <b>WAVE開始</b>を押すと敵が出現<br>' +
        '④ 敵を倒すと<b>ゴールド</b>が増える<br>' +
        '⑤ 置いたタワーをタップで<b>強化 / 売却</b><br><br>' +
        '<b>コツ:</b> アイスで足を止めてキャノンで巻き込み、ボスにはスナイパー。' +
        '同じタワーばかりでは後半は勝てません。' +
        '</div>';
      btn.textContent = 'スタート';
    } else if (kind === 'pause') {
      title.textContent = 'PAUSE';
      sub.textContent = '一時停止中';
      body.innerHTML = scoreHtml();
      btn.textContent = '再開する';
      btn2.hidden = false;
      btn2.textContent = '最初からやり直す';
    } else if (kind === 'victory') {
      title.textContent = '🏆 VICTORY';
      sub.textContent = '全15Waveを防衛しきりました！';
      body.innerHTML = scoreHtml();
      btn.textContent = 'もう一度あそぶ';
    } else if (kind === 'defeat') {
      title.textContent = '💀 GAME OVER';
      sub.textContent = 'Wave ' + game.wave + ' で拠点が陥落…';
      body.innerHTML = scoreHtml();
      btn.textContent = 'もう一度あそぶ';
    }
  }

  function scoreHtml() {
    return '<div class="score">' +
      '<div><div class="k">到達Wave</div><div class="v">' + game.wave + '/15</div></div>' +
      '<div><div class="k">残りHP</div><div class="v">' + Math.max(0, game.hp) + '</div></div>' +
      '<div><div class="k">撃破数</div><div class="v">' + game.stats.killed + '</div></div>' +
      '<div><div class="k">獲得Gold</div><div class="v">' + game.stats.goldEarned + '</div></div>' +
      '</div>';
  }

  function hideOverlay() {
    $('overlay').hidden = true;
    state.overlay = null;
  }

  function restart() {
    game.reset();
    lastHud = {};
    cancelBuild();
    closePanel();
    state.paused = false;
    state.speed = 1;
    $('btn-speed').textContent = '×1';
    $('btn-speed').classList.remove('on');
    $('btn-pause').classList.remove('on');
    hideOverlay();
    updateHud();
  }

  /* ---- 入力 ------------------------------------------------------------ */
  function onPointerDown(ev) {
    Sfx.unlock();
    state.pointerDown = true;
    if (state.buildType) {
      renderer.hoverCell = renderer.cellAt(ev.clientX, ev.clientY);
    }
    ev.preventDefault();
  }

  function onPointerMove(ev) {
    if (!state.pointerDown || !state.buildType) return;
    renderer.hoverCell = renderer.cellAt(ev.clientX, ev.clientY);
    ev.preventDefault();
  }

  function onPointerUp(ev) {
    if (!state.pointerDown) return;
    state.pointerDown = false;
    var cellPos = renderer.cellAt(ev.clientX, ev.clientY);
    renderer.hoverCell = null;

    if (game.phase === 'victory' || game.phase === 'defeat') return;

    if (state.buildType) {
      var res = game.build(cellPos.c, cellPos.r, state.buildType);
      if (res.ok) {
        Sfx.build();
        toast(res.tower.def.name + ' を設置');
        /* 置いたら選択を解除する(続けてタップしても誤設置しないように) */
        cancelBuild();
      } else {
        Sfx.error();
        toast(res.reason === 'gold' ? 'ゴールドが足りません' : 'ここには置けません');
      }
      return;
    }

    var t = game.towerAt(cellPos.c, cellPos.r);
    if (t) {
      openPanel(t);
    } else if (state.selected) {
      closePanel();
    }
  }

  /* ---- ゲームループ ---------------------------------------------------- */
  var STEP = 1 / 60;
  var acc = 0;
  var lastTs = 0;

  function frame(ts) {
    var dt = lastTs ? Math.min((ts - lastTs) / 1000, 0.1) : 0;
    lastTs = ts;

    if (state.started && !state.paused) {
      acc += dt * state.speed;
      var guard = 0;
      while (acc >= STEP && guard++ < 12) {
        game.update(STEP);
        acc -= STEP;
      }
      handleEvents();
    }

    renderer.draw(game, dt);
    updateHud();
    updateBossBar();
    if (state.selected) updatePanel(false);
    global.requestAnimationFrame(frame);
  }

  function handleEvents() {
    var evs = game.drainEvents();
    for (var i = 0; i < evs.length; i++) {
      var e = evs[i];
      switch (e.type) {
        case 'kill': Sfx.kill(); break;
        case 'leak': Sfx.leak(); break;
        case 'bossSpawn': Sfx.boss(); banner('BOSS 出現!', true); break;
        case 'waveClear':
          toast('Wave クリア! +' + e.data.gold + 'G');
          break;
        case 'victory':
          Sfx.win(); showOverlay('victory'); break;
        case 'defeat':
          Sfx.lose(); showOverlay('defeat'); break;
      }
    }
  }

  /* 攻撃音は毎フレーム鳴らすとうるさいので、発射数を見て間引く */
  var lastProjCount = 0;
  setInterval(function () {
    if (!state.started || state.paused) return;
    var n = game.projectiles.length;
    if (n > lastProjCount) Sfx.shoot();
    lastProjCount = n;
  }, 140);

  /* ---- サイズ調整 ------------------------------------------------------ */
  function fit() {
    var stage = $('stage');
    var w = stage.clientWidth - 8;
    var h = stage.clientHeight - 8;
    if (w <= 0 || h <= 0) return;
    renderer.resize(w, h);
  }

  /* ---- 起動 ------------------------------------------------------------ */
  function init() {
    buildPalette();
    fit();
    updateHud();
    showOverlay('start');

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', function () {
      state.pointerDown = false; renderer.hoverCell = null;
    });

    $('btn-cancel-build').addEventListener('click', cancelBuild);
    $('btn-close-panel').addEventListener('click', closePanel);

    $('btn-upgrade').addEventListener('click', function () {
      var t = state.selected;
      if (!t) return;
      var res = game.upgrade(t);
      if (res.ok) { Sfx.upgrade(); toast(t.def.name + ' Lv' + (t.level + 1) + ' に強化'); updatePanel(true); }
      else { Sfx.error(); toast(res.reason === 'gold' ? 'ゴールドが足りません' : 'これ以上強化できません'); }
    });

    $('btn-sell').addEventListener('click', function () {
      var t = state.selected;
      if (!t) return;
      var res = game.sell(t);
      if (res.ok) { Sfx.sell(); toast('+' + res.value + 'G で売却'); closePanel(); }
    });

    $('btn-wave').addEventListener('click', function () {
      if (!state.started) return;
      var res = game.startWave();
      if (res.ok) {
        var isBoss = game.wave === C.TOTAL_WAVES;
        banner(isBoss ? 'FINAL WAVE' : 'WAVE ' + game.wave, isBoss);
        if (!isBoss) Sfx.build();
        updateHud();
      }
    });

    $('btn-speed').addEventListener('click', function () {
      state.speed = state.speed === 1 ? 2 : 1;
      this.textContent = '×' + state.speed;
      this.classList.toggle('on', state.speed === 2);
    });

    $('btn-pause').addEventListener('click', function () {
      if (!state.started) return;
      if (state.paused) { state.paused = false; hideOverlay(); this.classList.remove('on'); }
      else { state.paused = true; showOverlay('pause'); this.classList.add('on'); }
    });

    $('btn-sound').addEventListener('click', function () {
      var on = !Sfx.isEnabled();
      Sfx.setEnabled(on);
      this.classList.toggle('muted', !on);
      this.setAttribute('aria-label', on ? '音を消す' : '音を出す');
    });

    $('ov-btn').addEventListener('click', function () {
      Sfx.unlock();
      if (state.overlay === 'start') {
        state.started = true;
        hideOverlay();
      } else if (state.overlay === 'pause') {
        state.paused = false;
        $('btn-pause').classList.remove('on');
        hideOverlay();
      } else {
        restart();
        state.started = true;
      }
    });

    $('ov-btn2').addEventListener('click', function () {
      restart();
      state.started = true;
    });

    global.addEventListener('resize', fit);
    global.addEventListener('orientationchange', function () { setTimeout(fit, 150); });
    if (global.ResizeObserver) {
      new global.ResizeObserver(fit).observe($('stage'));
    }

    /* パソコンで確認するとき用のショートカット */
    doc.addEventListener('keydown', function (ev) {
      if (ev.key === ' ') { ev.preventDefault(); $('btn-wave').click(); }
      else if (ev.key === 'p') $('btn-pause').click();
      else if (ev.key >= '1' && ev.key <= '4') {
        selectBuildType(C.TOWER_ORDER[Number(ev.key) - 1]);
      } else if (ev.key === 'Escape') { cancelBuild(); closePanel(); }
    });

    global.requestAnimationFrame(frame);
  }

  /* テストから触れるように公開しておく */
  global.LFD.app = {
    game: game,
    renderer: renderer,
    state: state,
    toast: toast,
    restart: restart,
    selectBuildType: selectBuildType,
    openPanel: openPanel,
    fit: fit
  };

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init);
  else init();
})(typeof window !== 'undefined' ? window : globalThis);
