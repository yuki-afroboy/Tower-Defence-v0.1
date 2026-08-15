/*
 * Last Fortress Defense - Canvas への描画担当
 * 座標は「マス単位」で持っていて、描くときに cell(1マスのピクセル数)を掛けます。
 */
(function (global) {
  'use strict';

  var C = global.LFD.Config;

  /* 古い Safari 向け: roundRect が無い場合の代替 */
  if (global.CanvasRenderingContext2D &&
      !global.CanvasRenderingContext2D.prototype.roundRect) {
    global.CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
      var rr = Math.min(r, w / 2, h / 2);
      this.moveTo(x + rr, y);
      this.arcTo(x + w, y, x + w, y + h, rr);
      this.arcTo(x + w, y + h, x, y + h, rr);
      this.arcTo(x, y + h, x, y, rr);
      this.arcTo(x, y, x + w, y, rr);
      this.closePath();
      return this;
    };
  }

  function Renderer(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.cell = 40;
    this.dpr = 1;
    this.t = 0;
    this.buildType = null;    /* 建設モードで選んでいるタワー種別 */
    this.aimAbility = null;   /* 照準中のアクティブスキル */
    this.selected = null;     /* 選択中のタワー */
    this.hoverCell = null;
  }

  /* 画面サイズに合わせてキャンバスの大きさを決める */
  Renderer.prototype.resize = function (availW, availH) {
    var cell = Math.floor(Math.min(availW / C.GRID_COLS, availH / C.GRID_ROWS));
    cell = Math.max(18, cell);
    this.cell = cell;
    var w = cell * C.GRID_COLS;
    var h = cell * C.GRID_ROWS;
    this.dpr = Math.min(global.devicePixelRatio || 1, 2.5);
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    return { w: w, h: h };
  };

  /* 画面のタッチ位置 -> マス座標 */
  Renderer.prototype.cellAt = function (clientX, clientY) {
    var rect = this.canvas.getBoundingClientRect();
    var x = (clientX - rect.left) / rect.width * C.GRID_COLS;
    var y = (clientY - rect.top) / rect.height * C.GRID_ROWS;
    return { c: Math.floor(x), r: Math.floor(y), x: x, y: y };
  };

  Renderer.prototype.draw = function (game, dt) {
    var ctx = this.ctx;
    var cell = this.cell;
    this.t += dt;

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    var W = C.GRID_COLS * cell, H = C.GRID_ROWS * cell;
    ctx.clearRect(0, 0, W, H);

    ctx.save();
    if (game.shake > 0.01) {
      var s = game.shake * cell * 0.16;
      ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
    }

    this.drawGround(ctx, W, H, cell);
    this.drawPath(ctx, cell);
    this.drawRocks(ctx, cell);
    this.drawBase(ctx, cell, game);
    this.drawBuildHints(ctx, cell, game);
    this.drawAbilityAim(ctx, cell);
    this.drawRangePreview(ctx, cell, game);
    this.drawTowers(ctx, cell, game);
    this.drawEnemies(ctx, cell, game);
    this.drawProjectiles(ctx, cell, game);
    this.drawEffects(ctx, cell, game);
    this.drawParticles(ctx, cell, game);

    ctx.restore();
  };

  /* ---- 地面と道 ------------------------------------------------------ */

  Renderer.prototype.drawGround = function (ctx, W, H, cell) {
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#1e3a2b');
    g.addColorStop(1, '#16281f');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = 'rgba(255,255,255,0.035)';
    ctx.lineWidth = 1;
    for (var c = 1; c < C.GRID_COLS; c++) {
      ctx.beginPath(); ctx.moveTo(c * cell, 0); ctx.lineTo(c * cell, H); ctx.stroke();
    }
    for (var r = 1; r < C.GRID_ROWS; r++) {
      ctx.beginPath(); ctx.moveTo(0, r * cell); ctx.lineTo(W, r * cell); ctx.stroke();
    }
  };

  Renderer.prototype.drawPath = function (ctx, cell) {
    ctx.fillStyle = '#6b563c';
    C.PATH_CELLS.forEach(function (p) {
      ctx.fillRect(p.c * cell, p.r * cell, cell, cell);
    });
    /* 道の内側に明るい帯を描いて「通り道」らしく見せる */
    ctx.fillStyle = '#8a7250';
    C.PATH_CELLS.forEach(function (p) {
      ctx.fillRect(p.c * cell + cell * 0.1, p.r * cell + cell * 0.1, cell * 0.8, cell * 0.8);
    });

    /* 進行方向の矢印 */
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    var step = 2.0;
    for (var d = 1; d < C.PATH_LENGTH - 0.5; d += step) {
      var p1 = C.posAt(d), p2 = C.posAt(d + 0.4);
      var ang = Math.atan2(p2.y - p1.y, p2.x - p1.x);
      ctx.save();
      ctx.translate(p1.x * cell, p1.y * cell);
      ctx.rotate(ang);
      var a = cell * 0.16;
      ctx.beginPath();
      ctx.moveTo(a, 0); ctx.lineTo(-a * 0.7, a * 0.65); ctx.lineTo(-a * 0.7, -a * 0.65);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }

    /* スタート地点(画面内に収まる位置に描く) */
    var first = C.PATH_CELLS[0];
    ctx.fillStyle = 'rgba(255,120,120,0.95)';
    ctx.font = 'bold ' + Math.round(cell * 0.26) + 'px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('START', (first.c + 0.7) * cell, (first.r - 0.28) * cell);
  };

  Renderer.prototype.drawRocks = function (ctx, cell) {
    C.ROCKS.forEach(function (rk) {
      var x = (rk.c + 0.5) * cell, y = (rk.r + 0.5) * cell;
      ctx.fillStyle = '#4a5560';
      ctx.beginPath();
      ctx.moveTo(x - cell * 0.3, y + cell * 0.24);
      ctx.lineTo(x - cell * 0.16, y - cell * 0.24);
      ctx.lineTo(x + cell * 0.18, y - cell * 0.28);
      ctx.lineTo(x + cell * 0.32, y + cell * 0.2);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.beginPath();
      ctx.moveTo(x - cell * 0.16, y - cell * 0.24);
      ctx.lineTo(x + cell * 0.18, y - cell * 0.28);
      ctx.lineTo(x + cell * 0.05, y - cell * 0.02);
      ctx.closePath();
      ctx.fill();
    });
  };

  Renderer.prototype.drawBase = function (ctx, cell, game) {
    var bx = (C.BASE_CELL.c + 0.5) * cell;
    var by = (C.BASE_CELL.r + 0.5) * cell;
    var ratio = Math.max(0, game.hp / game.maxHp);
    var pulse = 1 + Math.sin(this.t * 3) * 0.03;

    ctx.save();
    ctx.translate(bx, by);
    ctx.scale(pulse, pulse);
    /* 城の土台 */
    ctx.fillStyle = ratio > 0.35 ? '#3f6fd8' : '#d84f4f';
    ctx.beginPath();
    ctx.roundRect(-cell * 0.38, -cell * 0.32, cell * 0.76, cell * 0.66, cell * 0.1);
    ctx.fill();
    /* 屋根 */
    ctx.fillStyle = ratio > 0.35 ? '#9fc0ff' : '#ffb3b3';
    ctx.beginPath();
    ctx.moveTo(-cell * 0.42, -cell * 0.3);
    ctx.lineTo(0, -cell * 0.52);
    ctx.lineTo(cell * 0.42, -cell * 0.3);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = 'bold ' + Math.round(cell * 0.22) + 'px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('BASE', bx, by + cell * 0.24);
  };

  /* ---- 建設まわりの表示 ---------------------------------------------- */

  Renderer.prototype.drawBuildHints = function (ctx, cell, game) {
    if (!this.buildType) return;
    var def = C.TOWERS[this.buildType];
    var affordable = game.gold >= def.cost;
    for (var r = 0; r < C.GRID_ROWS; r++) {
      for (var c = 0; c < C.GRID_COLS; c++) {
        if (!game.canBuild(c, r)) continue;
        ctx.fillStyle = affordable ? 'rgba(120,255,160,0.16)' : 'rgba(255,255,255,0.07)';
        ctx.fillRect(c * cell + 2, r * cell + 2, cell - 4, cell - 4);
        ctx.strokeStyle = affordable ? 'rgba(150,255,180,0.5)' : 'rgba(255,255,255,0.18)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(c * cell + 2, r * cell + 2, cell - 4, cell - 4);
      }
    }
    /* 指を置いているマスのプレビュー */
    var h = this.hoverCell;
    if (h && C.inGrid(h.c, h.r)) {
      var ok = game.canBuild(h.c, h.r) && affordable;
      var cx = (h.c + 0.5) * cell, cy = (h.r + 0.5) * cell;
      var lv = def.levels[0];
      ctx.fillStyle = ok ? 'rgba(120,255,160,0.12)' : 'rgba(255,80,80,0.16)';
      ctx.beginPath();
      ctx.arc(cx, cy, lv.range * cell, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = ok ? 'rgba(150,255,180,0.75)' : 'rgba(255,110,110,0.8)';
      ctx.lineWidth = 2;
      ctx.stroke();
      if (def.minRange) {
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.arc(cx, cy, def.minRange * cell, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      if (ok) {
        ctx.globalAlpha = 0.75;
        this.drawTowerShape(ctx, cell, def, 0, cx, cy, -Math.PI / 2, 0);
        ctx.globalAlpha = 1;
      } else {
        ctx.strokeStyle = 'rgba(255,110,110,0.95)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(cx - cell * 0.22, cy - cell * 0.22);
        ctx.lineTo(cx + cell * 0.22, cy + cell * 0.22);
        ctx.moveTo(cx + cell * 0.22, cy - cell * 0.22);
        ctx.lineTo(cx - cell * 0.22, cy + cell * 0.22);
        ctx.stroke();
      }
    }
  };

  /* メテオの落下地点プレビュー */
  Renderer.prototype.drawAbilityAim = function (ctx, cell) {
    var def = this.aimAbility;
    var h = this.hoverCell;
    if (!def || !def.aimed || !h) return;
    var cx = h.x * cell, cy = h.y * cell;
    var pulse = 1 + Math.sin(this.t * 9) * 0.05;
    ctx.save();
    ctx.fillStyle = 'rgba(255,140,60,0.18)';
    ctx.beginPath();
    ctx.arc(cx, cy, def.radius * cell * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ff9a3c';
    ctx.lineWidth = 3;
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    ctx.arc(cx, cy, def.radius * cell * pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(cx - cell * 0.3, cy); ctx.lineTo(cx + cell * 0.3, cy);
    ctx.moveTo(cx, cy - cell * 0.3); ctx.lineTo(cx, cy + cell * 0.3);
    ctx.stroke();
    ctx.restore();
  };

  Renderer.prototype.drawRangePreview = function (ctx, cell, game) {
    var t = this.selected;
    if (!t || game.towers.indexOf(t) < 0) return;
    var st = game.towerStats(t);
    var cx = t.x * cell, cy = t.y * cell;
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.beginPath();
    ctx.arc(cx, cy, st.range * cell, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = t.def.color;
    ctx.lineWidth = 2;
    ctx.stroke();
    if (t.def.minRange) {
      ctx.setLineDash([5, 5]);
      ctx.strokeStyle = 'rgba(255,120,120,0.9)';
      ctx.beginPath();
      ctx.arc(cx, cy, t.def.minRange * cell, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.strokeRect(t.c * cell + 2, t.r * cell + 2, cell - 4, cell - 4);
  };

  /* ---- タワー -------------------------------------------------------- */

  Renderer.prototype.drawTowers = function (ctx, cell, game) {
    for (var i = 0; i < game.towers.length; i++) {
      var t = game.towers[i];
      this.drawTowerShape(ctx, cell, t.def, t.level, t.x * cell, t.y * cell, t.angle, t.recoil, t.branch);
    }
  };

  Renderer.prototype.drawTowerShape = function (ctx, cell, def, level, cx, cy, angle, recoil, branch) {
    var scale = 1 + level * 0.06;
    /* 土台 */
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.roundRect(cx - cell * 0.36, cy - cell * 0.33, cell * 0.72, cell * 0.72, cell * 0.12);
    ctx.fill();
    ctx.fillStyle = '#2b3444';
    ctx.beginPath();
    ctx.roundRect(cx - cell * 0.36, cy - cell * 0.36, cell * 0.72, cell * 0.72, cell * 0.12);
    ctx.fill();
    ctx.strokeStyle = def.dark;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    var back = recoil * cell * 0.09;
    var R = cell * 0.3 * scale;

    if (def.id === 'archer') {
      ctx.fillStyle = def.color;
      ctx.beginPath(); ctx.arc(0, 0, R * 0.75, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#eaffea'; ctx.lineWidth = Math.max(2, cell * 0.05);
      ctx.beginPath();
      ctx.arc(-back + R * 0.15, 0, R * 0.75, -Math.PI * 0.55, Math.PI * 0.55);
      ctx.stroke();
      ctx.strokeStyle = def.dark; ctx.lineWidth = Math.max(1.5, cell * 0.04);
      ctx.beginPath();
      ctx.moveTo(-back - R * 0.2, 0); ctx.lineTo(-back + R * 1.0, 0);
      ctx.stroke();
    } else if (def.id === 'cannon') {
      ctx.fillStyle = def.dark;
      ctx.fillRect(-back, -R * 0.34, R * 1.35, R * 0.68);
      ctx.fillStyle = def.color;
      ctx.beginPath(); ctx.arc(0, 0, R * 0.8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.beginPath(); ctx.arc(R * 1.25 - back, 0, R * 0.22, 0, Math.PI * 2); ctx.fill();
    } else if (def.id === 'ice') {
      /* 雪の結晶のような形(6方向のトゲ + 中心) */
      ctx.rotate(this.t * 0.6);
      ctx.strokeStyle = def.color;
      ctx.lineCap = 'round';
      ctx.lineWidth = Math.max(2, cell * 0.07);
      for (var k = 0; k < 6; k++) {
        var a = (k / 6) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a) * R * 0.95, Math.sin(a) * R * 0.95);
        ctx.stroke();
      }
      ctx.fillStyle = def.color;
      ctx.beginPath(); ctx.arc(0, 0, R * 0.42, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#eaffff';
      ctx.beginPath(); ctx.arc(0, 0, R * 0.2, 0, Math.PI * 2); ctx.fill();
      ctx.lineCap = 'butt';
    } else {
      /* sniper */
      ctx.fillStyle = def.dark;
      ctx.fillRect(-back, -R * 0.16, R * 1.9, R * 0.32);
      ctx.fillStyle = def.color;
      ctx.beginPath(); ctx.arc(0, 0, R * 0.72, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(R * 0.35, 0, R * 0.16, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();

    /* Lv4(進化済み)は光る枠を付ける。進化先で色が違う */
    if (branch !== null && branch !== undefined) {
      ctx.strokeStyle = branch === 0 ? '#ffd75e' : '#7fdcff';
      ctx.lineWidth = Math.max(2, cell * 0.055);
      ctx.beginPath();
      ctx.roundRect(cx - cell * 0.4, cy - cell * 0.4, cell * 0.8, cell * 0.8, cell * 0.14);
      ctx.stroke();
    }

    /* レベルの印(★の代わりの小さな点) */
    for (var p = 0; p <= level; p++) {
      ctx.fillStyle = p === 3 ? '#ffd75e' : '#ffffff';
      ctx.beginPath();
      ctx.arc(cx - cell * 0.24 + p * cell * 0.16, cy + cell * 0.27, cell * 0.045, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  /* ---- 敵 ------------------------------------------------------------ */

  /* 敵の輪郭だけを作る(塗りはしない)。ダメージ点滅を重ねるために分けている */
  Renderer.prototype.enemyPath = function (ctx, def, rad) {
    ctx.beginPath();
    var k, a, rr, px, py;
    if (def.id === 'fast') {
      ctx.moveTo(rad * 1.25, 0);
      ctx.lineTo(-rad * 0.85, rad * 0.85);
      ctx.lineTo(-rad * 0.4, 0);
      ctx.lineTo(-rad * 0.85, -rad * 0.85);
      ctx.closePath();
    } else if (def.id === 'tank') {
      ctx.roundRect(-rad, -rad * 0.85, rad * 2, rad * 1.7, rad * 0.3);
    } else if (def.id === 'swarm') {
      ctx.moveTo(rad, 0); ctx.lineTo(0, rad); ctx.lineTo(-rad, 0); ctx.lineTo(0, -rad);
      ctx.closePath();
    } else if (def.boss) {
      for (k = 0; k < 12; k++) {
        a = (k / 12) * Math.PI * 2;
        rr = k % 2 === 0 ? rad * 1.2 : rad * 0.74;
        px = Math.cos(a) * rr; py = Math.sin(a) * rr;
        if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
    } else {
      ctx.arc(0, 0, rad, 0, Math.PI * 2);
    }
  };

  Renderer.prototype.drawEnemies = function (ctx, cell, game) {
    /* ボスは一番手前に描く(小さい敵に隠れないように) */
    var list = game.enemies.slice().sort(function (a, b) {
      return (a.def.boss ? 1 : 0) - (b.def.boss ? 1 : 0);
    });
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      var def = e.def;
      var x = e.x * cell, y = e.y * cell;
      var rad = def.radius * cell;
      var ang = Math.atan2(e.dirY || 0, e.dirX || 1);

      ctx.save();
      ctx.translate(x, y);

      if (def.boss) {
        var aura = 1 + Math.sin(this.t * 5) * 0.08;
        ctx.save();
        ctx.scale(aura, aura);
        ctx.fillStyle = 'rgba(255,61,110,0.20)';
        ctx.beginPath(); ctx.arc(0, 0, rad * 1.8, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }

      ctx.rotate(ang);
      ctx.lineWidth = Math.max(1.5, cell * (def.boss ? 0.06 : 0.035));

      /* 本体 */
      ctx.fillStyle = def.color;
      this.enemyPath(ctx, def, rad);
      ctx.fill();
      /* ダメージを受けた瞬間だけ白く光らせる(薄く重ねるだけ) */
      if (e.hitFlash > 0) {
        ctx.save();
        ctx.globalAlpha = Math.min(0.65, e.hitFlash / 0.13 * 0.65);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.restore();
      }
      ctx.strokeStyle = def.boss ? '#ffd0dd' : def.dark;
      ctx.stroke();

      /* 種類ごとの飾り */
      if (def.id === 'tank') {
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.fillRect(-rad * 0.5, -rad * 0.85, rad * 0.35, rad * 1.7);
        ctx.fillRect(rad * 0.15, -rad * 0.85, rad * 0.35, rad * 1.7);
      } else if (def.boss) {
        ctx.fillStyle = '#2b0010';
        ctx.beginPath(); ctx.arc(rad * 0.3, -rad * 0.3, rad * 0.18, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(rad * 0.3, rad * 0.3, rad * 0.18, 0, Math.PI * 2); ctx.fill();
      } else if (def.id === 'normal') {
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.beginPath(); ctx.arc(rad * 0.35, -rad * 0.3, rad * 0.16, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(rad * 0.35, rad * 0.3, rad * 0.16, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();

      /* Wave特性が付いている敵の印 */
      if (e.affix) {
        ctx.strokeStyle = e.affix.color;
        ctx.globalAlpha = 0.9;
        ctx.lineWidth = Math.max(1.5, cell * 0.045);
        ctx.beginPath();
        ctx.arc(x, y, rad * 1.5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      /* 燃えている敵 */
      if (e.burn > 0) {
        ctx.fillStyle = 'rgba(255,150,50,0.55)';
        for (var fi = 0; fi < 3; fi++) {
          var fa = this.t * 6 + fi * 2.1;
          ctx.beginPath();
          ctx.arc(x + Math.cos(fa) * rad * 0.6, y - rad * 0.8 - (fi * 0.12 + (this.t * 1.5 % 0.3)) * cell,
            cell * 0.05, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      /* 凍結中の印 */
      if (e.slowTimer > 0) {
        ctx.strokeStyle = 'rgba(150,225,255,0.9)';
        ctx.lineWidth = Math.max(1.5, cell * 0.04);
        ctx.beginPath();
        ctx.arc(x, y, rad * 1.32, 0, Math.PI * 2);
        ctx.stroke();
      }

      /* HPバー */
      if (e.hp < e.maxHp || def.boss) {
        var bw = Math.max(rad * 2.2, cell * 0.4);
        var bh = Math.max(3, cell * (def.boss ? 0.1 : 0.06));
        var top = y - rad - bh - cell * 0.1;
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(x - bw / 2, top, bw, bh);
        var ratio = Math.max(0, e.hp / e.maxHp);
        ctx.fillStyle = ratio > 0.5 ? '#6bec6b' : ratio > 0.22 ? '#ffd75e' : '#ff5c5c';
        ctx.fillRect(x - bw / 2 + 1, top + 1, (bw - 2) * ratio, bh - 2);
      }
    }
  };

  /* ---- 弾とエフェクト ------------------------------------------------ */

  Renderer.prototype.drawProjectiles = function (ctx, cell, game) {
    for (var i = 0; i < game.projectiles.length; i++) {
      var p = game.projectiles[i];
      var x = p.x * cell, y = p.y * cell;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(p.angle || 0);
      if (p.kind === 'shell') {
        ctx.fillStyle = '#ffcf8b';
        ctx.beginPath(); ctx.arc(0, 0, cell * 0.11, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,150,60,0.45)';
        ctx.beginPath(); ctx.arc(-cell * 0.12, 0, cell * 0.08, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.fillStyle = '#eaffea';
        ctx.fillRect(-cell * 0.14, -cell * 0.025, cell * 0.28, cell * 0.05);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.moveTo(cell * 0.16, 0);
        ctx.lineTo(cell * 0.06, -cell * 0.05);
        ctx.lineTo(cell * 0.06, cell * 0.05);
        ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    }
  };

  Renderer.prototype.drawEffects = function (ctx, cell, game) {
    for (var i = 0; i < game.effects.length; i++) {
      var f = game.effects[i];
      var k = 1 - f.life / f.max;
      if (f.kind === 'ring') {
        var r = f.r0 + (f.r1 - f.r0) * k;
        ctx.strokeStyle = f.color;
        ctx.globalAlpha = Math.max(0, 1 - k);
        ctx.lineWidth = Math.max(2, cell * 0.07 * (1 - k));
        ctx.beginPath();
        ctx.arc(f.x * cell, f.y * cell, r * cell, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      } else if (f.kind === 'beam') {
        ctx.strokeStyle = f.color;
        ctx.globalAlpha = Math.max(0, 1 - k);
        ctx.lineWidth = Math.max(2, cell * 0.08 * (1 - k));
        ctx.beginPath();
        ctx.moveTo(f.x1 * cell, f.y1 * cell);
        ctx.lineTo(f.x2 * cell, f.y2 * cell);
        ctx.stroke();
        ctx.globalAlpha = 1;
      } else if (f.kind === 'flash') {
        ctx.save();
        ctx.globalAlpha = Math.max(0, f.life / f.max) * 0.9;
        ctx.fillStyle = f.color;
        ctx.fillRect(0, 0, C.GRID_COLS * cell, C.GRID_ROWS * cell);
        ctx.restore();
      } else if (f.kind === 'text') {
        ctx.globalAlpha = Math.max(0, Math.min(1, f.life / f.max * 1.6));
        ctx.fillStyle = f.color;
        ctx.font = 'bold ' + Math.round(cell * 0.3) + 'px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.strokeStyle = 'rgba(0,0,0,0.7)';
        ctx.lineWidth = 3;
        ctx.strokeText(f.text, f.x * cell, f.y * cell);
        ctx.fillText(f.text, f.x * cell, f.y * cell);
        ctx.globalAlpha = 1;
      }
    }
  };

  Renderer.prototype.drawParticles = function (ctx, cell, game) {
    for (var i = 0; i < game.particles.length; i++) {
      var p = game.particles[i];
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      var s = p.size * cell;
      ctx.fillRect(p.x * cell - s / 2, p.y * cell - s / 2, s, s);
    }
    ctx.globalAlpha = 1;
  };

  global.LFD.Renderer = Renderer;
})(typeof window !== 'undefined' ? window : globalThis);
