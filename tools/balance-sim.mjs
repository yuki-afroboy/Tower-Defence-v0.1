/*
 * バランス調整用のシミュレーター。
 * いろいろな戦略で15Waveを自動プレイして、どこで負けるかを表示します。
 *   node tools/balance-sim.mjs
 */
import { loadEngine } from './load-engine.mjs';

const LFD = loadEngine();
const C = LFD.Config;
const STEP = 1 / 60;

const b = (type, c, r) => ({ a: 'build', type, c, r });
/* branch を渡すと Lv4 の進化先を指定できる */
const u = (c, r, branch) => ({ a: 'up', c, r, branch });

/* 道の近くの良い設置マス(強い順のおおよそ) */
const GOOD_SPOTS = [
  [2, 2], [5, 2], [3, 4], [6, 4], [2, 6], [5, 6], [3, 8], [5, 8],
  [3, 10], [5, 10], [0, 2], [7, 2], [4, 4], [2, 4], [6, 6], [4, 6],
  [0, 4], [7, 4], [2, 8], [6, 8], [3, 12], [5, 12], [1, 10], [7, 6]
];

/* 単一タワー戦略: 良いマスに同じタワーを並べて順に強化 */
function monoPlan(type, count) {
  const spots = GOOD_SPOTS.slice(0, count);
  const plan = spots.map(([c, r]) => b(type, c, r));
  for (let lv = 0; lv < 3; lv++) spots.forEach(([c, r]) => plan.push(u(c, r)));
  return plan;
}

/* 2種類を交互に置く戦略 */
function mixPlan(types, count) {
  const spots = GOOD_SPOTS.slice(0, count);
  const plan = spots.map(([c, r], i) => b(types[i % types.length], c, r));
  for (let lv = 0; lv < 3; lv++) spots.forEach(([c, r]) => plan.push(u(c, r)));
  return plan;
}

/* 想定される「きちんと考えたプレイ」
   序盤は安いアーチャー、中盤にアイス+キャノン、終盤はスナイパーを育ててボスに備える */
const PLAN_BALANCED = [
  b('archer', 2, 2), b('archer', 5, 2), b('archer', 3, 4),
  u(2, 2), u(5, 2), u(3, 4),
  b('ice', 6, 4),
  b('cannon', 2, 6),
  u(6, 4), u(2, 6),
  b('cannon', 3, 8),
  u(2, 6), u(3, 8),
  b('sniper', 6, 10),
  b('ice', 2, 8),
  u(2, 8), u(6, 10),
  u(3, 8), u(2, 6),
  u(6, 10),
  b('sniper', 2, 10),
  u(3, 8), u(2, 10),
  u(6, 10),
  u(2, 10), u(6, 4), u(2, 8),
  u(2, 10),
  u(2, 2), u(5, 2), u(3, 4),
  u(6, 4), u(2, 8),
  b('archer', 5, 6), u(5, 6), u(5, 6), u(5, 6)
];

/* アイスを使わないミックス(組み合わせの価値を測るための対照) */
const PLAN_NO_ICE = [
  b('archer', 2, 2), b('archer', 5, 2), b('archer', 3, 4),
  b('cannon', 6, 4), b('cannon', 2, 6),
  u(2, 2), u(5, 2), u(3, 4),
  b('archer', 5, 6), b('cannon', 3, 8),
  u(6, 4), u(2, 6), u(3, 8),
  b('sniper', 5, 10),
  u(2, 2), u(5, 2), u(3, 4), u(5, 6),
  b('cannon', 5, 8), u(5, 8), u(6, 4), u(2, 6), u(3, 8),
  u(5, 10), b('cannon', 3, 10), u(3, 10),
  u(5, 8), u(3, 8), u(2, 6), u(3, 10), u(5, 10)
];

/* 何も考えずに端から置いていく初心者プレイ */
const PLAN_NAIVE = [];
{
  const spots = [];
  for (let r = 0; r < C.GRID_ROWS; r++) {
    for (let c = 0; c < C.GRID_COLS; c++) {
      if (C.isBuildable(c, r) && !(c === C.BASE_CELL.c && r === C.BASE_CELL.r)) spots.push([c, r]);
    }
  }
  spots.slice(0, 26).forEach(([c, r]) => PLAN_NAIVE.push(b('archer', c, r)));
}

/* ---- シミュレーション ----------------------------------------------- */
/* 「そこそこ上手い人」がスキルを使う想定の簡易AI */
function autoAbilities(g) {
  if (g.abilityReady('freeze') && g.enemies.length >= 8) {
    g.useAbility('freeze');
    return;
  }
  if (!g.abilityReady('meteor') || g.enemies.length === 0) return;
  const R = C.ABILITIES.meteor.radius;
  let best = null, bestCount = 0;
  for (const e of g.enemies) {
    let n = 0;
    for (const o of g.enemies) {
      if ((o.x - e.x) ** 2 + (o.y - e.y) ** 2 <= R * R) n += o.def.boss ? 4 : o.type === 'tank' ? 2 : 1;
    }
    if (n > bestCount) { bestCount = n; best = e; }
  }
  if (best && bestCount >= 3) g.useAbility('meteor', best.x, best.y);
}

export function runPlan(plan, opts = {}) {
  const g = new LFD.Game({ seed: opts.seed ?? 7 });
  const useAbilities = !!opts.abilities;
  let idx = 0;

  function spend() {
    let guard = 0;
    while (idx < plan.length && guard++ < 300) {
      const step = plan[idx];
      if (step.a === 'build') {
        const def = C.TOWERS[step.type];
        if (g.gold < def.cost) break;
        const res = g.build(step.c, step.r, step.type);
        if (!res.ok) { idx++; continue; }
      } else {
        const t = g.towerAt(step.c, step.r);
        if (!t) { idx++; continue; }
        const cost = g.upgradeCost(t, step.branch);
        if (cost === null) { idx++; continue; }
        if (g.gold < cost) break;
        g.upgrade(t, step.branch);
      }
      idx++;
    }
  }

  const waves = [];
  for (let w = 1; w <= C.TOTAL_WAVES; w++) {
    spend();
    const hpBefore = g.hp;
    const goldBefore = g.gold;
    g.startWave();
    let t = 0;
    const leaks = {};
    while (g.phase === 'wave' && t < 400) {
      g.update(STEP); t += STEP;
      if (useAbilities) autoAbilities(g);
      for (const ev of g.drainEvents()) {
        if (ev.type === 'leak') leaks[ev.data.type] = (leaks[ev.data.type] || 0) + 1;
      }
    }
    waves.push({ wave: w, hp: g.hp, lost: hpBefore - g.hp, goldBefore, leaks, time: +t.toFixed(1) });
    if (g.phase === 'defeat') break;
  }
  return { game: g, waves, planUsed: idx, planTotal: plan.length };
}

export const STRATEGIES = [
  ['◎ バランス型(理想プレイ)', PLAN_BALANCED, 'win'],
  ['○ アイス無しミックス', PLAN_NO_ICE, 'any'],
  ['× アーチャーのみ', monoPlan('archer', 16), 'lose'],
  ['× キャノンのみ', monoPlan('cannon', 14), 'lose'],
  ['× スナイパーのみ', monoPlan('sniper', 12), 'lose'],
  ['× アイスのみ', monoPlan('ice', 16), 'lose'],
  ['△ アーチャー+アイス', mixPlan(['archer', 'ice'], 16), 'any'],
  ['△ キャノン+アイス', mixPlan(['cannon', 'ice'], 14), 'any'],
  ['△ スナイパー+アイス', mixPlan(['sniper', 'ice'], 12), 'any'],
  ['× 適当置き(初心者)', PLAN_NAIVE, 'lose']
];

function main() {
  const withAbilities = process.argv.includes('--abilities');
  if (withAbilities) console.log('(アクティブスキルを使うAI付きで実行)');
  const summary = [];
  for (const [name, plan, expect] of STRATEGIES) {
    const { game, waves, planUsed, planTotal } = runPlan(plan, { abilities: withAbilities });
    const status = game.phase === 'victory' ? 'VICTORY' : game.phase === 'defeat' ? 'DEFEAT ' : '???';
    console.log(`\n== ${name} == ${status} 最終HP=${game.hp}/${game.maxHp} 到達Wave=${game.wave} タワー=${game.towers.length} 計画=${planUsed}/${planTotal}`);
    console.log('   HP: ' + waves.map(w => `${w.wave}:${w.hp}${w.lost ? `(-${w.lost})` : ''}`).join(' '));
    const last = waves[waves.length - 1];
    const leakStr = Object.entries(last.leaks).map(([k, v]) => `${k}x${v}`).join(',');
    console.log(`   Wave${last.wave}の漏れ: ${leakStr || 'なし'} / 所要${last.time}秒 / 内訳: ` +
      game.towers.map(t => `${t.type[0].toUpperCase()}${t.level + 1}`).join(' '));
    summary.push({ name, expect, phase: game.phase, hp: game.hp, wave: game.wave });
  }
  console.log('\n---- まとめ ----');
  let ok = true;
  for (const s of summary) {
    const won = s.phase === 'victory';
    let mark = '  ';
    if (s.expect === 'win' && !won) { mark = 'NG'; ok = false; }
    if (s.expect === 'lose' && won) { mark = 'NG'; ok = false; }
    console.log(`${mark} ${s.name}: ${won ? 'VICTORY' : 'DEFEAT'} (Wave${s.wave}, HP${s.hp})`);
  }
  console.log(ok ? '\n=> 期待どおりのバランス' : '\n=> 要調整');
}

if (process.argv[1] && process.argv[1].endsWith('balance-sim.mjs')) main();
