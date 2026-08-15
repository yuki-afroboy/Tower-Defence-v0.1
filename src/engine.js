/*
 * Last Fortress Defense - ゲーム本体のロジック(描画なし)
 * DOM を一切使わないので、Node.js のテストからそのまま動かせます。
 */
(function (global) {
  'use strict';

  var C = global.LFD.Config;

  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function dist2(ax, ay, bx, by) {
    var dx = ax - bx, dy = ay - by;
    return dx * dx + dy * dy;
  }

  /* ------------------------------------------------------------------ */

  function Game(options) {
    options = options || {};
    this.rng = mulberry32(options.seed === undefined ? 12345 : options.seed);
    this.reset();
  }

  Game.prototype.reset = function () {
    var B = C.BALANCE;
    var self = this;
    this.time = 0;
    this.gold = B.startGold;
    this.hp = B.startHp;
    this.maxHp = B.startHp;
    this.wave = 0;
    this.phase = 'ready';          /* ready | wave | victory | defeat */
    this.towers = [];
    this.enemies = [];
    this.projectiles = [];
    this.effects = [];
    this.particles = [];
    this.spawnQueue = [];
    this.pendingWaves = [];
    this.grid = Object.create(null);
    this.nextId = 1;
    this.shake = 0;
    this.stats = { killed: 0, leaked: 0, goldEarned: 0, spent: 0, abilitiesUsed: 0 };
    this.abilities = {};
    C.ABILITY_ORDER.forEach(function (k) { self.abilities[k] = { cd: 0 }; });
    this.events = [];              /* UI に伝えるための出来事 */
  };

  Game.prototype.emit = function (type, data) {
    this.events.push({ type: type, data: data || null });
  };

  Game.prototype.drainEvents = function () {
    var e = this.events;
    this.events = [];
    return e;
  };

  /* ---- タワー -------------------------------------------------------- */

  Game.prototype.towerAt = function (c, r) {
    return this.grid[c + ',' + r] || null;
  };

  Game.prototype.canBuild = function (c, r) {
    if (!C.isBuildable(c, r)) return false;
    if (c === C.BASE_CELL.c && r === C.BASE_CELL.r) return false;
    return !this.towerAt(c, r);
  };

  Game.prototype.build = function (c, r, typeId) {
    var def = C.TOWERS[typeId];
    if (!def) return { ok: false, reason: 'type' };
    if (this.phase === 'victory' || this.phase === 'defeat') return { ok: false, reason: 'over' };
    if (!this.canBuild(c, r)) return { ok: false, reason: 'place' };
    if (this.gold < def.cost) return { ok: false, reason: 'gold' };

    this.gold -= def.cost;
    this.stats.spent += def.cost;
    var t = {
      id: this.nextId++,
      type: typeId,
      def: def,
      c: c, r: r,
      x: c + 0.5, y: r + 0.5,
      level: 0,                    /* 0 が Lv1 */
      branch: null,                /* Lv4で選んだ進化先 */
      invested: def.cost,
      cooldown: 0,
      angle: -Math.PI / 2,
      recoil: 0,
      kills: 0,
      damageDone: 0,
      builtAt: this.time
    };
    this.towers.push(t);
    this.grid[c + ',' + r] = t;
    this.spawnParticles(t.x, t.y, 12, def.color, 2.2);
    this.emit('build', t);
    return { ok: true, tower: t };
  };

  /* Lv1..Lv3 は levels[]、Lv4 は選んだ branch の性能を使う */
  Game.prototype.towerStats = function (t) {
    if (t.branch !== null && t.branch !== undefined) return t.def.branches[t.branch];
    return t.def.levels[t.level];
  };

  Game.prototype.isMaxLevel = function (t) {
    return t.branch !== null && t.branch !== undefined;
  };

  /* 次の強化の選択肢。Lv3のときは2つ返る(分岐) */
  Game.prototype.upgradeOptions = function (t) {
    if (this.isMaxLevel(t)) return [];
    var next = t.def.levels[t.level + 1];
    if (next) return [{ index: null, cost: next.up, stats: next }];
    return t.def.branches.map(function (b, i) {
      return { index: i, cost: b.up, stats: b, label: b.label, note: b.note };
    });
  };

  Game.prototype.upgradeCost = function (t, branchIndex) {
    var opts = this.upgradeOptions(t);
    if (!opts.length) return null;
    if (branchIndex === undefined || branchIndex === null) return opts[0].cost;
    var found = null;
    opts.forEach(function (o) { if (o.index === branchIndex) found = o; });
    return found ? found.cost : null;
  };

  Game.prototype.upgrade = function (t, branchIndex) {
    if (!t || this.phase === 'victory' || this.phase === 'defeat') return { ok: false, reason: 'over' };
    var opts = this.upgradeOptions(t);
    if (!opts.length) return { ok: false, reason: 'max' };
    var choice = opts[0];
    if (branchIndex !== undefined && branchIndex !== null) {
      opts.forEach(function (o) { if (o.index === branchIndex) choice = o; });
    }
    var cost = choice.cost;
    if (this.gold < cost) return { ok: false, reason: 'gold' };
    this.gold -= cost;
    this.stats.spent += cost;
    t.invested += cost;
    t.level++;
    if (choice.index !== null && choice.index !== undefined) t.branch = choice.index;
    this.spawnParticles(t.x, t.y, 18, '#ffe066', 3);
    this.addEffect({ kind: 'ring', x: t.x, y: t.y, r0: 0.2, r1: 1.3, life: 0.45, max: 0.45, color: '#ffe066' });
    this.emit('upgrade', t);
    return { ok: true, tower: t };
  };

  Game.prototype.sellValue = function (t) {
    return Math.floor(t.invested * C.BALANCE.sellRate);
  };

  Game.prototype.sell = function (t) {
    if (!t) return { ok: false };
    var idx = this.towers.indexOf(t);
    if (idx < 0) return { ok: false };
    var value = this.sellValue(t);
    this.towers.splice(idx, 1);
    delete this.grid[t.c + ',' + t.r];
    this.gold += value;
    this.spawnParticles(t.x, t.y, 14, '#cfd8e3', 2.4);
    this.floatText(t.x, t.y, '+' + value, '#ffd75e');
    this.emit('sell', { tower: t, value: value });
    return { ok: true, value: value };
  };

  /* ---- Wave ---------------------------------------------------------- */

  Game.prototype.canStartWave = function () {
    return (this.phase === 'ready' || this.phase === 'wave') && this.wave < C.TOTAL_WAVES;
  };

  Game.prototype.startWave = function () {
    if (!this.canStartWave()) return { ok: false };
    var early = this.phase === 'wave';
    if (early) {
      var bonus = C.BALANCE.earlyCallGold(this.wave);
      this.gold += bonus;
      this.stats.goldEarned += bonus;
      this.floatText(C.BASE_CELL.c + 0.5, C.BASE_CELL.r - 0.2, '+' + bonus, '#ffd75e');
    }
    this.wave++;
    var waveNo = this.wave;
    var def = C.WAVES[waveNo - 1];
    var base = this.time;
    var self = this;
    def.groups.forEach(function (g) {
      var type = g[0], count = g[1], gap = g[2], delay = g[3] || 0;
      for (var i = 0; i < count; i++) {
        self.spawnQueue.push({
          t: base + delay + i * gap,
          type: type,
          hpMul: def.hpMul,
          wave: waveNo,
          affix: def.affix
        });
      }
    });
    this.spawnQueue.sort(function (a, b) { return a.t - b.t; });
    this.pendingWaves.push(waveNo);
    this.phase = 'wave';
    this.emit('waveStart', { wave: waveNo, early: early, affix: def.affix });
    return { ok: true, early: early };
  };

  /* ---- 敵 ------------------------------------------------------------ */

  Game.prototype.spawnEnemy = function (typeId, hpMul, waveNo, affixKey) {
    var def = C.ENEMIES[typeId];
    var hp = Math.round(def.hp * hpMul);
    var affix = affixKey ? C.AFFIXES[affixKey] : null;
    var e = {
      id: this.nextId++,
      type: typeId,
      def: def,
      hp: hp,
      maxHp: hp,
      affix: affix,
      armor: def.armor + (affix && affix.armorAdd ? affix.armorAdd : 0),
      regenPct: affix && affix.regenPct ? affix.regenPct : 0,
      burn: 0,
      burnDps: 0,
      baseSpeed: def.speed * (affix && affix.speedMul ? affix.speedMul : 1),
      dist: 0,
      x: 0, y: 0,
      offset: (this.rng() - 0.5) * 0.34,
      slow: 0,
      slowTimer: 0,
      hitFlash: 0,
      wave: waveNo,
      alive: true,
      wobble: this.rng() * Math.PI * 2
    };
    this.updateEnemyPos(e);
    this.enemies.push(e);
    if (def.boss) {
      this.shake = Math.max(this.shake, 1.0);
      this.addEffect({ kind: 'ring', x: e.x, y: e.y, r0: 0.3, r1: 4, life: 0.9, max: 0.9, color: '#ff3d6e' });
      this.emit('bossSpawn', e);
    }
    return e;
  };

  Game.prototype.updateEnemyPos = function (e) {
    var p = C.posAt(e.dist);
    var p2 = C.posAt(e.dist + 0.05);
    var dx = p2.x - p.x, dy = p2.y - p.y;
    var len = Math.hypot(dx, dy) || 1;
    e.x = p.x + (-dy / len) * e.offset;
    e.y = p.y + (dx / len) * e.offset;
    e.dirX = dx / len;
    e.dirY = dy / len;
  };

  Game.prototype.damageEnemy = function (e, amount, pierce, source) {
    if (!e.alive) return 0;
    var dmg = pierce ? amount
      : Math.max(amount * C.BALANCE.minDamageRatio, amount - e.armor);
    e.hp -= dmg;
    e.hitFlash = 0.13;
    if (source) source.damageDone += dmg;
    if (e.hp <= 0) {
      e.alive = false;
      this.stats.killed++;
      var reward = e.def.gold;
      this.gold += reward;
      this.stats.goldEarned += reward;
      if (source) source.kills++;
      this.spawnParticles(e.x, e.y, e.def.boss ? 60 : 10, e.def.color, e.def.boss ? 5 : 2.6);
      this.floatText(e.x, e.y, '+' + reward, '#ffd75e');
      if (e.def.boss) this.shake = Math.max(this.shake, 1.4);
      this.emit('kill', e);
    }
    return dmg;
  };

  Game.prototype.applySlow = function (e, amount, duration) {
    if (amount >= e.slow || e.slowTimer <= 0) {
      e.slow = Math.max(e.slow, amount);
      e.slowTimer = Math.max(e.slowTimer, duration);
    }
  };

  /* ---- アクティブスキル ---------------------------------------------- */

  Game.prototype.abilityReady = function (key) {
    var a = this.abilities[key];
    return !!a && a.cd <= 0;
  };

  Game.prototype.useAbility = function (key, x, y) {
    var def = C.ABILITIES[key];
    if (!def) return { ok: false, reason: 'type' };
    if (this.phase !== 'wave' && this.phase !== 'ready') return { ok: false, reason: 'over' };
    if (!this.abilityReady(key)) return { ok: false, reason: 'cooldown' };

    if (key === 'meteor') {
      if (x === undefined || y === undefined) return { ok: false, reason: 'aim' };
      var dmg = def.damage(Math.max(1, this.wave));
      var r2 = def.radius * def.radius;
      var hits = 0;
      for (var i = 0; i < this.enemies.length; i++) {
        var e = this.enemies[i];
        if (!e.alive) continue;
        var d2 = dist2(x, y, e.x, e.y);
        if (d2 <= r2) {
          var falloff = 1 - 0.35 * (Math.sqrt(d2) / def.radius);
          this.damageEnemy(e, dmg * falloff, true, null);
          if (e.alive && def.slow) this.applySlow(e, def.slow, def.slowDur);
          hits++;
        }
      }
      this.addEffect({ kind: 'ring', x: x, y: y, r0: 0.2, r1: def.radius, life: 0.5, max: 0.5, color: '#ff9a3c' });
      this.addEffect({ kind: 'ring', x: x, y: y, r0: 0.1, r1: def.radius * 1.5, life: 0.75, max: 0.75, color: '#ffd75e' });
      this.spawnParticles(x, y, 46, '#ffb454', 5.5);
      this.shake = Math.max(this.shake, 1.1);
      this.abilities[key].cd = def.cooldown;
      this.stats.abilitiesUsed++;
      this.emit('ability', { key: key, x: x, y: y, hits: hits });
      return { ok: true, hits: hits };
    }

    /* 氷結: 画面上の敵をまとめて減速 */
    var frozen = 0;
    for (var j = 0; j < this.enemies.length; j++) {
      var en = this.enemies[j];
      if (!en.alive) continue;
      this.applySlow(en, def.slow, def.duration);
      frozen++;
    }
    this.addEffect({
      kind: 'ring', x: C.GRID_COLS / 2, y: C.GRID_ROWS / 2,
      r0: 0.5, r1: C.GRID_ROWS, life: 0.6, max: 0.6, color: '#7fdcff'
    });
    this.addEffect({ kind: 'flash', color: 'rgba(120,220,255,0.45)', life: 0.35, max: 0.35 });
    this.abilities[key].cd = def.cooldown;
    this.stats.abilitiesUsed++;
    this.emit('ability', { key: key, frozen: frozen });
    return { ok: true, frozen: frozen };
  };

  Game.prototype.updateAbilities = function (dt) {
    var self = this;
    C.ABILITY_ORDER.forEach(function (k) {
      var a = self.abilities[k];
      if (a.cd > 0) {
        a.cd = Math.max(0, a.cd - dt);
        if (a.cd === 0) self.emit('abilityReady', { key: k });
      }
    });
  };

  /* ---- エフェクト ---------------------------------------------------- */

  Game.prototype.addEffect = function (fx) {
    if (this.effects.length < 160) this.effects.push(fx);
  };

  Game.prototype.floatText = function (x, y, text, color) {
    this.addEffect({ kind: 'text', x: x, y: y, text: text, color: color, life: 0.9, max: 0.9 });
  };

  Game.prototype.spawnParticles = function (x, y, count, color, speed) {
    if (this.particles.length > 320) return;
    for (var i = 0; i < count; i++) {
      var a = this.rng() * Math.PI * 2;
      var s = speed * (0.35 + this.rng() * 0.75);
      var life = 0.3 + this.rng() * 0.45;
      this.particles.push({
        x: x, y: y,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: life, max: life,
        color: color,
        size: 0.05 + this.rng() * 0.07
      });
    }
  };

  /* ---- メインの更新処理 ---------------------------------------------- */

  Game.prototype.update = function (dt) {
    if (this.phase === 'victory' || this.phase === 'defeat') {
      this.updateVisuals(dt);
      return;
    }
    this.time += dt;

    /* 出現 */
    while (this.spawnQueue.length && this.spawnQueue[0].t <= this.time) {
      var s = this.spawnQueue.shift();
      this.spawnEnemy(s.type, s.hpMul, s.wave, s.affix);
    }

    this.updateAbilities(dt);
    this.updateEnemies(dt);
    this.updateTowers(dt);
    this.updateProjectiles(dt);
    this.updateVisuals(dt);
    this.checkWaveEnd();
  };

  Game.prototype.updateEnemies = function (dt) {
    var alive = [];
    for (var i = 0; i < this.enemies.length; i++) {
      var e = this.enemies[i];
      if (!e.alive) continue;
      if (e.slowTimer > 0) {
        e.slowTimer -= dt;
        if (e.slowTimer <= 0) { e.slow = 0; e.slowTimer = 0; }
      }
      if (e.hitFlash > 0) e.hitFlash -= dt;

      /* 「再生」特性: 毎秒HPの数%を回復 */
      if (e.regenPct > 0 && e.hp < e.maxHp) {
        e.hp = Math.min(e.maxHp, e.hp + e.maxHp * e.regenPct * dt);
      }
      /* 焼夷弾の延焼ダメージ(装甲を無視) */
      if (e.burn > 0) {
        e.burn -= dt;
        this.damageEnemy(e, e.burnDps * dt, true, null);
        if (!e.alive) continue;
      }

      var speed = e.baseSpeed * (1 - e.slow);
      e.dist += speed * dt;
      if (e.dist >= C.PATH_LENGTH) {
        e.alive = false;
        this.hp -= e.def.damage;
        this.stats.leaked++;
        this.shake = Math.max(this.shake, e.def.boss ? 1.2 : 0.5);
        this.addEffect({
          kind: 'ring', x: C.BASE_CELL.c + 0.5, y: C.BASE_CELL.r + 0.5,
          r0: 0.3, r1: 2.2, life: 0.5, max: 0.5, color: '#ff4d6d'
        });
        this.emit('leak', e);
        if (this.hp <= 0) {
          this.hp = 0;
          this.phase = 'defeat';
          this.emit('defeat', null);
        }
        continue;
      }
      this.updateEnemyPos(e);
      alive.push(e);
    }
    this.enemies = alive;
  };

  Game.prototype.findTarget = function (t, range) {
    var best = null, bestDist = -1;
    var r2 = range * range;
    var min = t.def.minRange || 0;
    var min2 = min * min;
    for (var i = 0; i < this.enemies.length; i++) {
      var e = this.enemies[i];
      if (!e.alive) continue;
      var d2 = dist2(t.x, t.y, e.x, e.y);
      if (d2 <= r2 && d2 >= min2 && e.dist > bestDist) {
        best = e; bestDist = e.dist;
      }
    }
    return best;
  };

  Game.prototype.updateTowers = function (dt) {
    for (var i = 0; i < this.towers.length; i++) {
      var t = this.towers[i];
      var st = this.towerStats(t);
      if (t.recoil > 0) t.recoil = Math.max(0, t.recoil - dt * 4);
      t.cooldown -= dt;

      if (t.def.shot === 'pulse') {
        var any = this.findTarget(t, st.range);
        if (any && t.cooldown <= 0) {
          t.cooldown = 1 / st.rate;
          t.recoil = 1;
          this.icePulse(t, st);
        }
        if (any) {
          t.angle = Math.atan2(any.y - t.y, any.x - t.x);
        }
        continue;
      }

      var target = this.findTarget(t, st.range);
      if (!target) continue;
      t.angle = Math.atan2(target.y - t.y, target.x - t.x);
      if (t.cooldown > 0) continue;
      t.cooldown = 1 / st.rate;
      t.recoil = 1;
      this.fire(t, st, target);
    }
  };

  Game.prototype.icePulse = function (t, st) {
    var r2 = st.range * st.range;
    for (var i = 0; i < this.enemies.length; i++) {
      var e = this.enemies[i];
      if (!e.alive) continue;
      if (dist2(t.x, t.y, e.x, e.y) <= r2) {
        this.applySlow(e, st.slow, st.slowDur);
        this.damageEnemy(e, st.dmg, false, t);
      }
    }
    this.addEffect({
      kind: 'ring', x: t.x, y: t.y, r0: 0.2, r1: st.range,
      life: 0.4, max: 0.4, color: '#7fdcff'
    });
  };

  Game.prototype.fire = function (t, st, target) {
    if (t.def.shot === 'beam') {
      this.damageEnemy(target, st.dmg, !!(t.def.pierce || st.pierce), t);
      this.addEffect({
        kind: 'beam', x1: t.x, y1: t.y, x2: target.x, y2: target.y,
        life: 0.18, max: 0.18, color: '#e0c3ff'
      });
      this.spawnParticles(target.x, target.y, 5, '#c792ff', 2);
      return;
    }
    var speed = t.def.shot === 'shell' ? 5.5 : 13;
    this.projectiles.push({
      id: this.nextId++,
      kind: t.def.shot,
      x: t.x, y: t.y,
      tx: target.x, ty: target.y,
      target: target,
      speed: speed,
      dmg: st.dmg,
      splash: st.splash || 0,
      burn: st.burn || null,
      pierce: !!(t.def.pierce || st.pierce),
      source: t,
      color: t.def.color,
      travelled: 0,
      totalDist: Math.hypot(target.x - t.x, target.y - t.y) || 0.01
    });
  };

  Game.prototype.updateProjectiles = function (dt) {
    var keep = [];
    for (var i = 0; i < this.projectiles.length; i++) {
      var p = this.projectiles[i];
      if (p.kind === 'arrow' && p.target && p.target.alive) {
        p.tx = p.target.x; p.ty = p.target.y;
      }
      var dx = p.tx - p.x, dy = p.ty - p.y;
      var d = Math.hypot(dx, dy);
      var step = p.speed * dt;
      p.angle = Math.atan2(dy, dx);
      if (d <= step || d < 0.02) {
        this.impact(p);
        continue;
      }
      p.x += (dx / d) * step;
      p.y += (dy / d) * step;
      p.travelled += step;
      if (p.travelled > 20) continue;    /* 念のための保険 */
      keep.push(p);
    }
    this.projectiles = keep;
  };

  Game.prototype.impact = function (p) {
    if (p.splash > 0) {
      var r2 = p.splash * p.splash;
      for (var i = 0; i < this.enemies.length; i++) {
        var e = this.enemies[i];
        if (!e.alive) continue;
        var d2 = dist2(p.tx, p.ty, e.x, e.y);
        if (d2 <= r2) {
          var falloff = 1 - 0.4 * (Math.sqrt(d2) / p.splash);
          this.damageEnemy(e, p.dmg * falloff, p.pierce, p.source);
          if (p.burn && e.alive) {
            e.burn = Math.max(e.burn, p.burn.dur);
            e.burnDps = Math.max(e.burnDps, p.burn.dps);
          }
        }
      }
      this.addEffect({
        kind: 'ring', x: p.tx, y: p.ty, r0: 0.15, r1: p.splash,
        life: 0.32, max: 0.32, color: '#ffb454'
      });
      this.spawnParticles(p.tx, p.ty, 14, '#ffb454', 3.2);
      this.shake = Math.max(this.shake, 0.22);
    } else if (p.target && p.target.alive) {
      this.damageEnemy(p.target, p.dmg, p.pierce, p.source);
      this.spawnParticles(p.tx, p.ty, 4, p.color, 1.8);
    }
  };

  Game.prototype.updateVisuals = function (dt) {
    var keep = [];
    for (var i = 0; i < this.effects.length; i++) {
      var f = this.effects[i];
      f.life -= dt;
      if (f.kind === 'text') f.y -= dt * 0.9;
      if (f.life > 0) keep.push(f);
    }
    this.effects = keep;

    var pk = [];
    for (var j = 0; j < this.particles.length; j++) {
      var p = this.particles[j];
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.94;
      p.vy = p.vy * 0.94 + dt * 1.6;
      if (p.life > 0) pk.push(p);
    }
    this.particles = pk;

    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 2.4);
  };

  Game.prototype.checkWaveEnd = function () {
    if (this.phase !== 'wave') return;
    if (this.spawnQueue.length || this.enemies.length) return;
    var total = 0;
    var self = this;
    this.pendingWaves.forEach(function (w) {
      total += C.BALANCE.waveClearGold(w);
    });
    var cleared = this.pendingWaves.slice();
    this.pendingWaves = [];
    this.gold += total;
    this.stats.goldEarned += total;
    if (total > 0) {
      this.floatText(C.BASE_CELL.c + 0.5, C.BASE_CELL.r - 0.5, '+' + total, '#ffd75e');
    }
    if (this.wave >= C.TOTAL_WAVES) {
      this.phase = 'victory';
      this.emit('victory', null);
    } else {
      this.phase = 'ready';
      this.emit('waveClear', { waves: cleared, gold: total });
    }
    void self;
  };

  global.LFD.Game = Game;
})(typeof window !== 'undefined' ? window : globalThis);
