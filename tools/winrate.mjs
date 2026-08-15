/* 戦略ごとの勝率を複数シードで測る(バランス調整用)
   node tools/winrate.mjs [--abilities] */
import { runPlan, STRATEGIES } from './balance-sim.mjs';
const abilities = process.argv.includes('--abilities');
const SEEDS = [1, 2, 3, 5, 7, 11, 13, 42];
console.log(abilities ? '=== スキルを使うAIあり ===' : '=== スキルなし ===');
for (const [name, plan, expect] of STRATEGIES) {
  let wins = 0; const hps = []; const waves = [];
  for (const seed of SEEDS) {
    const { game } = runPlan(plan, { seed, abilities });
    if (game.phase === 'victory') wins++;
    hps.push(game.hp); waves.push(game.wave);
  }
  const rate = wins / SEEDS.length;
  const bad = (expect === 'win' && rate < 1) || (expect === 'lose' && rate > 0);
  const avgWave = (waves.reduce((a, b) => a + b, 0) / waves.length).toFixed(1);
  const avgHp = (hps.reduce((a, b) => a + b, 0) / hps.length).toFixed(1);
  console.log(`${bad ? 'NG' : '  '} ${name.padEnd(22)} 勝率 ${wins}/${SEEDS.length}  平均到達Wave ${avgWave}  平均残HP ${avgHp}`);
}
