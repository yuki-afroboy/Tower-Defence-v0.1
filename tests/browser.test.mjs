/*
 * 実際のブラウザ(Chromium)で iPhone 相当の縦画面を開いて操作するテスト。
 *   node --test tests/browser.test.mjs
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
/* LFD_URL を指定すると別のファイル(1ファイル版など)をテストできる */
const PAGE_URL = process.env.LFD_URL || pathToFileURL(path.join(root, 'index.html')).href;
const SHOTS = path.join(root, 'tests', 'screenshots');

/* この環境に入っている Chromium を使う(無ければ Playwright 既定) */
const CANDIDATES = [
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  process.env.CHROMIUM_PATH
].filter(Boolean);
const execPath = CANDIDATES.find(p => fs.existsSync(p));

let browser, ctx, page;
const pageErrors = [];

before(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  browser = await chromium.launch(execPath ? { executablePath: execPath } : {});
  ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },   /* iPhone 相当 */
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true
  });
  page = await ctx.newPage();
  page.on('pageerror', e => pageErrors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') pageErrors.push('console: ' + m.text()); });
  await page.goto(PAGE_URL);
  await page.waitForTimeout(400);
});

after(async () => { await browser?.close(); });

/* ---- 便利関数 --------------------------------------------------------- */

const gs = () => page.evaluate(() => {
  const g = window.LFD.app.game;
  return {
    gold: g.gold, hp: g.hp, wave: g.wave, phase: g.phase,
    towers: g.towers.length, enemies: g.enemies.length,
    killed: g.stats.killed, time: g.time,
    speed: window.LFD.app.state.speed,
    paused: window.LFD.app.state.paused,
    started: window.LFD.app.state.started
  };
});

/* マス(c,r)の画面上の座標を求めてタップする */
async function tapCell(c, r) {
  const box = await page.locator('#game').boundingBox();
  const x = box.x + (c + 0.5) * box.width / 9;
  const y = box.y + (r + 0.5) * box.height / 13;
  await page.mouse.click(x, y);
  await page.waitForTimeout(60);
}

/* 建設モード解除 + パネルを閉じて、操作前の状態にそろえる */
async function resetUi() {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(60);
}

async function placeTower(type, c, r) {
  await page.locator(`.tw-card[data-type="${type}"]`).click();
  await tapCell(c, r);
}

/* 実時間を待たずにゲームを進める(テスト用) */
async function simulate(seconds) {
  await page.evaluate(sec => {
    const g = window.LFD.app.game;
    for (let i = 0; i < Math.round(sec * 60); i++) g.update(1 / 60);
  }, seconds);
  await page.waitForTimeout(80);   /* UIが追いつくのを待つ */
}

/* ---- テスト ----------------------------------------------------------- */

test('起動: タイトル画面が出て、スタートで開始できる', async () => {
  assert.equal(await page.isVisible('#overlay'), true);
  assert.match(await page.textContent('#ov-title'), /LAST FORTRESS DEFENSE/);
  await page.click('#ov-btn');
  assert.equal(await page.isVisible('#overlay'), false);
  assert.equal((await gs()).started, true);
  await page.screenshot({ path: path.join(SHOTS, '01-start.png') });
});

test('表示: 390x844で横スクロールが起きず、UIが画面内に収まる', async () => {
  const m = await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    innerW: window.innerWidth,
    scrollH: document.documentElement.scrollHeight,
    innerH: window.innerHeight,
    canvas: document.getElementById('game').getBoundingClientRect(),
    dock: document.getElementById('dock').getBoundingClientRect(),
    hud: document.getElementById('hud').getBoundingClientRect()
  }));
  assert.ok(m.scrollW <= m.innerW, `横スクロールが発生 (${m.scrollW} > ${m.innerW})`);
  assert.ok(m.scrollH <= m.innerH + 1, `縦スクロールが発生 (${m.scrollH} > ${m.innerH})`);
  assert.ok(m.canvas.width >= 300, `盤面が小さすぎる (${m.canvas.width}px)`);
  assert.ok(m.dock.bottom <= m.innerH + 1, '操作エリアが画面外にはみ出している');
  assert.ok(m.hud.top >= 0);
  assert.ok(m.canvas.bottom <= m.dock.top + 1, '盤面と操作エリアが重なっている');
});

test('表示: ボタンが指で押せる大きさ、文字が小さすぎない', async () => {
  const items = await page.evaluate(() => {
    const sel = ['#btn-wave', '#btn-pause', '#btn-speed', '#btn-sound', '.tw-card'];
    const out = [];
    sel.forEach(s => document.querySelectorAll(s).forEach(el => {
      const r = el.getBoundingClientRect();
      out.push({ s, w: r.width, h: r.height, fs: parseFloat(getComputedStyle(el).fontSize) });
    }));
    return out;
  });
  for (const it of items) {
    assert.ok(it.h >= 36, `${it.s} の高さが小さすぎる (${it.h.toFixed(0)}px)`);
    assert.ok(it.w >= 38, `${it.s} の幅が小さすぎる (${it.w.toFixed(0)}px)`);
    assert.ok(it.fs >= 11, `${it.s} の文字が小さすぎる (${it.fs}px)`);
  }
});

test('設置: タワーを選んでタップすると建ち、ゴールドが減る', async () => {
  const before = await gs();
  await placeTower('archer', 2, 2);
  const after = await gs();
  assert.equal(after.towers, before.towers + 1, 'タワーが建っていない');
  assert.equal(after.gold, before.gold - 60, 'ゴールドが減っていない');
  assert.equal(await page.textContent('#gold-val'), String(after.gold));
});

test('設置: 道の上や埋まったマスには置けない', async () => {
  await resetUi();
  const before = await gs();
  await page.evaluate(() => { document.getElementById('toast').textContent = ''; });
  await page.locator('.tw-card[data-type="archer"]').click();
  await tapCell(3, 1);                       /* 道の上 */
  let after = await gs();
  assert.equal(after.towers, before.towers, '道の上に建ってしまった');
  assert.equal(after.gold, before.gold, 'ゴールドが減ってしまった');
  assert.match(await page.textContent('#toast'), /置けません/);

  await resetUi();
  await page.locator('.tw-card[data-type="archer"]').click();
  await tapCell(2, 2);                       /* すでにタワーがある */
  after = await gs();
  assert.equal(after.towers, before.towers, '同じマスに二重に建った');
});

test('設置: タッチ操作(指)でも設置できる', async () => {
  await resetUi();
  const before = await gs();
  await page.locator('.tw-card[data-type="archer"]').tap();
  const box = await page.locator('#game').boundingBox();
  await page.touchscreen.tap(box.x + 5.5 * box.width / 9, box.y + 2.5 * box.height / 13);
  await page.waitForTimeout(80);
  const after = await gs();
  assert.equal(after.towers, before.towers + 1, 'タッチで設置できない');
});

test('建設モード: 案内とキャンセルボタンが入れ替わりで出る', async () => {
  await resetUi();
  assert.equal(await page.isVisible('#btn-wave'), true);
  assert.equal(await page.isVisible('#btn-cancel-build'), false);

  await page.locator('.tw-card[data-type="cannon"]').click();
  assert.equal(await page.isVisible('#btn-cancel-build'), true, 'キャンセルボタンが出ない');
  assert.equal(await page.isVisible('#btn-wave'), false, 'Wave開始ボタンが残っている');
  assert.match(await page.textContent('#wave-preview'), /Cannon/, '案内文が出ていない');

  await page.click('#btn-cancel-build');
  assert.equal(await page.isVisible('#btn-cancel-build'), false, 'キャンセルできていない');
  assert.equal(await page.isVisible('#btn-wave'), true, 'Wave開始ボタンが戻らない');
  assert.equal((await page.locator('.tw-card.selected').count()), 0, '選択状態が解除されない');
  assert.match(await page.textContent('#wave-preview'), /Wave/, '次Wave予告が戻らない');
});

test('レイアウト: タワーを選んでも盤面が動かない(押し間違い防止)', async () => {
  await resetUi();
  const boxOf = () => page.evaluate(() => {
    const r = document.getElementById('game').getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
  });
  const idle = await boxOf();
  await page.locator('.tw-card[data-type="sniper"]').click();
  await page.waitForTimeout(250);
  const building = await boxOf();
  assert.deepEqual(building, idle, `建設モードで盤面が動いた idle=${JSON.stringify(idle)} 建設中=${JSON.stringify(building)}`);

  await page.click('#btn-cancel-build');
  await page.waitForTimeout(250);
  await tapCell(2, 2);                       /* タワーをタップしてパネルを開く */
  await page.waitForTimeout(250);
  const panel = await boxOf();
  assert.deepEqual(panel, idle, `パネル表示で盤面が動いた idle=${JSON.stringify(idle)} パネル=${JSON.stringify(panel)}`);
  await resetUi();
});

test('レイアウト: 小さい画面(375x667)でも盤面が動かない', async () => {
  const small = await browser.newContext({
    viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true
  });
  const sp = await small.newPage();
  await sp.goto(PAGE_URL);
  await sp.click('#ov-btn');
  await sp.waitForTimeout(300);
  const boxOf = () => sp.evaluate(() => {
    const r = document.getElementById('game').getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
  });
  const idle = await boxOf();
  const bx = await sp.locator('#game').boundingBox();

  await sp.locator('.tw-card[data-type="ice"]').click();
  await sp.waitForTimeout(250);
  assert.deepEqual(await boxOf(), idle, '建設モードで盤面が動いた(小画面)');

  await sp.mouse.click(bx.x + 2.5 * bx.width / 9, bx.y + 2.5 * bx.height / 13);
  await sp.waitForTimeout(200);
  await sp.mouse.click(bx.x + 2.5 * bx.width / 9, bx.y + 2.5 * bx.height / 13);
  await sp.waitForTimeout(300);
  assert.equal(await sp.isVisible('#tower-panel'), true, 'パネルが開いていない(小画面)');
  assert.deepEqual(await boxOf(), idle, 'パネル表示で盤面が動いた(小画面)');

  const fits = await sp.evaluate(() => {
    const p = document.getElementById('tower-panel').getBoundingClientRect();
    return { bottom: Math.round(p.bottom), innerH: window.innerHeight, top: Math.round(p.top) };
  });
  assert.ok(fits.bottom <= fits.innerH + 1, 'パネルが画面下からはみ出している');
  assert.ok(fits.top >= 0, 'パネルが画面上からはみ出している');
  await small.close();
});

test('強化: タワーをタップするとパネルが開き、強化できる', async () => {
  await resetUi();
  await tapCell(2, 2);
  assert.equal(await page.isVisible('#tower-panel'), true, 'パネルが開かない');
  assert.equal(await page.textContent('#tp-name'), 'Archer');
  assert.equal(await page.textContent('#tp-level'), 'Lv1');

  const before = await gs();
  const cost = Number(await page.textContent('#up-cost'));
  await page.click('#btn-upgrade');
  const after = await gs();
  assert.equal(after.gold, before.gold - cost, '強化でゴールドが減っていない');
  assert.equal(await page.textContent('#tp-level'), 'Lv2');
  await page.screenshot({ path: path.join(SHOTS, '02-panel.png') });
});

test('強化: ゴールドが足りないと強化ボタンが押せない', async () => {
  await page.evaluate(() => { window.LFD.app.game.gold = 0; });
  await page.waitForTimeout(250);
  assert.equal(await page.locator('#btn-upgrade').isDisabled(), true);
  await page.evaluate(() => { window.LFD.app.game.gold = 250; });
  await page.waitForTimeout(250);
});

test('売却: ゴールドが戻り、マスが空く', async () => {
  const before = await gs();
  const refund = Number((await page.textContent('#sell-val')).replace('+', ''));
  await page.click('#btn-sell');
  const after = await gs();
  assert.equal(after.towers, before.towers - 1, 'タワーが消えていない');
  assert.equal(after.gold, before.gold + refund, '売却額が戻っていない');
  assert.equal(await page.isVisible('#tower-panel'), false, 'パネルが閉じていない');
});

test('Wave: 開始すると敵が出てきて、倒すとゴールドが増える', async () => {
  await page.evaluate(() => {
    const app = window.LFD.app;
    app.game.gold = 500;
    [[2, 2], [5, 2], [3, 4]].forEach(([c, r]) => app.game.build(c, r, 'archer'));
  });
  await page.click('#btn-wave');
  let s = await gs();
  assert.equal(s.wave, 1);
  assert.equal(s.phase, 'wave');
  assert.equal(await page.textContent('#wave-val'), '1');

  await simulate(3);
  s = await gs();
  assert.ok(s.enemies > 0, '敵が出てこない');
  await page.screenshot({ path: path.join(SHOTS, '03-wave.png') });

  const goldBefore = s.gold;
  await simulate(25);
  s = await gs();
  assert.ok(s.killed > 0, '敵を倒せていない');
  assert.ok(s.gold > goldBefore, '撃破でゴールドが増えていない');
  assert.equal(s.phase, 'ready', 'Waveが終わっていない');
  assert.equal(s.hp, 20, '敵に拠点を削られた');
});

test('速度: ×2にすると2倍の速さで進む', async () => {
  await page.click('#btn-wave');            /* Wave2 */
  assert.equal(await page.textContent('#btn-speed'), '×1');

  const t0 = (await gs()).time;
  await page.waitForTimeout(700);
  const d1 = (await gs()).time - t0;

  await page.click('#btn-speed');
  assert.equal(await page.textContent('#btn-speed'), '×2');
  const t1 = (await gs()).time;
  await page.waitForTimeout(700);
  const d2 = (await gs()).time - t1;

  assert.ok(d2 > d1 * 1.5, `×2が効いていない (×1で${d1.toFixed(2)}秒, ×2で${d2.toFixed(2)}秒)`);
  await page.click('#btn-speed');
  assert.equal(await page.textContent('#btn-speed'), '×1');
});

test('一時停止: ゲームが止まり、再開できる', async () => {
  await page.click('#btn-pause');
  assert.equal(await page.isVisible('#overlay'), true);
  assert.equal(await page.textContent('#ov-title'), 'PAUSE');
  const t0 = (await gs()).time;
  await page.waitForTimeout(500);
  assert.equal((await gs()).time, t0, '一時停止中なのに時間が進んでいる');
  await page.screenshot({ path: path.join(SHOTS, '04-pause.png') });

  await page.click('#ov-btn');
  assert.equal(await page.isVisible('#overlay'), false);
  await page.waitForTimeout(400);
  assert.ok((await gs()).time > t0, '再開できていない');
});

test('ゲームオーバー: HPが0になると専用画面が出る', async () => {
  await page.evaluate(() => {
    const g = window.LFD.app.game;
    g.hp = 1;
    const e = g.spawnEnemy('normal', 1, g.wave);
    e.dist = window.LFD.Config.PATH_LENGTH - 0.02;
  });
  await page.waitForTimeout(500);
  assert.equal((await gs()).phase, 'defeat');
  assert.equal(await page.isVisible('#overlay'), true);
  assert.match(await page.textContent('#ov-title'), /GAME OVER/);
  await page.screenshot({ path: path.join(SHOTS, '05-gameover.png') });

  await page.click('#ov-btn');              /* もう一度あそぶ */
  const s = await gs();
  assert.equal(s.phase, 'ready');
  assert.equal(s.wave, 0);
  assert.equal(s.hp, 20);
  assert.equal(s.towers, 0);
  assert.equal(await page.isVisible('#overlay'), false);
});

test('勝利: 15Waveを突破すると Victory 画面が出る', async () => {
  await page.evaluate(() => {
    const g = window.LFD.app.game;
    g.gold = 999999;
    const board = [[2, 2, 'archer'], [5, 2, 'archer'], [3, 4, 'archer'], [6, 4, 'ice'],
                   [2, 6, 'cannon'], [3, 8, 'cannon'], [2, 8, 'ice'], [6, 10, 'sniper'],
                   [2, 10, 'sniper'], [5, 6, 'archer'], [3, 12, 'cannon'], [5, 12, 'archer']];
    board.forEach(([c, r, t]) => {
      const res = g.build(c, r, t);
      for (let i = 0; i < 3; i++) g.upgrade(res.tower);
      g.gold = 999999;
    });
    /* 15Wave分をその場で進める */
    for (let w = 1; w <= 15; w++) {
      g.startWave();
      let guard = 0;
      while (g.phase === 'wave' && guard++ < 400 * 60) g.update(1 / 60);
      if (g.phase === 'defeat') break;
    }
  });
  await page.waitForTimeout(400);
  const s = await gs();
  assert.equal(s.phase, 'victory', `勝てなかった (Wave${s.wave}, HP${s.hp})`);
  assert.equal(await page.isVisible('#overlay'), true);
  assert.match(await page.textContent('#ov-title'), /VICTORY/);
  assert.equal(await page.textContent('#wave-val'), '15');
  await page.screenshot({ path: path.join(SHOTS, '06-victory.png') });
});

test('JavaScriptエラーが一度も出ていない', () => {
  assert.deepEqual(pageErrors, [], 'ブラウザでエラーが出ている:\n' + pageErrors.join('\n'));
});
