/*
 * ゲームバランスの自動テスト。
 * 「考えて組めば勝てる / 同じタワーばかりでは勝てない」を数字で確認します。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runPlan, STRATEGIES } from '../tools/balance-sim.mjs';

const SEEDS = [1, 7, 42];
const byName = name => STRATEGIES.find(s => s[0].includes(name))[1];

test('理想的なプレイならどの乱数でも15Waveをクリアできる', () => {
  for (const seed of SEEDS) {
    const { game } = runPlan(byName('バランス型'), { seed });
    assert.equal(game.phase, 'victory', `seed=${seed} でクリアできない (Wave${game.wave}, HP${game.hp})`);
  }
});

test('序盤(Wave1-5)は理想プレイならノーダメージで抜けられる', () => {
  for (const seed of SEEDS) {
    const { waves } = runPlan(byName('バランス型'), { seed });
    const early = waves.slice(0, 5);
    const lost = early.reduce((s, w) => s + w.lost, 0);
    assert.equal(lost, 0, `seed=${seed} でWave1-5に${lost}ダメージ受けている`);
  }
});

test('1種類のタワーだけでは勝てない', () => {
  for (const name of ['アーチャーのみ', 'キャノンのみ', 'スナイパーのみ', 'アイスのみ']) {
    for (const seed of SEEDS) {
      const { game } = runPlan(byName(name), { seed });
      assert.equal(game.phase, 'defeat',
        `${name} が seed=${seed} で勝ててしまう (HP${game.hp})`);
    }
  }
});

test('適当に置くだけでは後半で負ける (ただしWave5までは耐えられる)', () => {
  for (const seed of SEEDS) {
    const { game, waves } = runPlan(byName('適当置き'), { seed });
    assert.equal(game.phase, 'defeat', `seed=${seed} で適当置きが勝ってしまう`);
    assert.ok(game.wave >= 6, `seed=${seed} で序盤(Wave${game.wave})に負けていて厳しすぎる`);
    const early = waves.slice(0, 5).reduce((s, w) => s + w.lost, 0);
    assert.ok(early <= 2, `序盤で${early}ダメージは初心者に厳しすぎる`);
  }
});

test('アイスを混ぜると生存力が上がる (組み合わせに意味がある)', () => {
  let better = 0;
  for (const seed of SEEDS) {
    const mono = runPlan(byName('スナイパーのみ'), { seed });
    const mixed = runPlan(byName('スナイパー+アイス'), { seed });
    if (mixed.game.wave > mono.game.wave ||
        (mixed.game.phase === 'victory' && mono.game.phase !== 'victory')) better++;
  }
  assert.equal(better, SEEDS.length, 'アイスを足しても強くならない');
});

test('最終Waveのボスは理想プレイなら倒しきれる', () => {
  const { game, waves } = runPlan(byName('バランス型'), { seed: 7 });
  const last = waves[waves.length - 1];
  assert.equal(game.phase, 'victory');
  assert.ok(!last.leaks.boss, 'ボスが拠点まで到達している');
});
