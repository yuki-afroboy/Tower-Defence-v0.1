/* 画面の見た目を確認するためのスクリーンショット撮影ツール
   node tools/shot.mjs  -> tests/screenshots/ に保存 */
import path from 'node:path'; import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = path.join(root, 'tests', 'screenshots');
fs.mkdirSync(SHOTS, { recursive: true });
const exec = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const b = await chromium.launch(fs.existsSync(exec) ? { executablePath: exec } : {});
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const p = await ctx.newPage();
await p.goto(pathToFileURL(path.join(root, 'index.html')).href);
await p.click('#ov-btn');
await p.waitForTimeout(200);

/* 中盤の盤面をつくる */
await p.evaluate(() => {
  const g = window.LFD.app.game;
  g.gold = 99999;
  [[2,2,'archer'],[5,2,'archer'],[3,4,'archer'],[6,4,'ice'],[2,6,'cannon'],
   [3,8,'cannon'],[2,8,'ice'],[6,10,'sniper'],[2,10,'sniper']].forEach(([c,r,t],i)=>{
    const res = g.build(c,r,t);
    for (let k=0;k<(i%3);k++) g.upgrade(res.tower);
  });
  g.gold = 640;
  g.wave = 9; g.startWave();
  for (let i=0;i<60*14;i++) g.update(1/60);
});
await p.waitForTimeout(300);
await p.screenshot({ path: path.join(SHOTS, '10-midgame.png') });

/* タワーパネル */
const box = await p.locator('#game').boundingBox();
await p.mouse.click(box.x + 6.5*box.width/9, box.y + 4.5*box.height/13);
await p.waitForTimeout(300);
await p.screenshot({ path: path.join(SHOTS, '11-panel.png') });

/* ボス戦 */
await p.keyboard.press('Escape');
await p.evaluate(() => {
  const g = window.LFD.app.game;
  g.enemies.length = 0; g.spawnQueue.length = 0; g.phase='ready'; g.wave = 14; g.gold=99999;
  g.startWave();
  for (let i=0;i<60*26;i++) g.update(1/60);
});
await p.waitForTimeout(300);
await p.screenshot({ path: path.join(SHOTS, '12-boss.png') });

/* 建設モード */
await p.evaluate(()=>{
  const g=window.LFD.app.game;
  g.enemies.length=0; g.spawnQueue.length=0; g.phase='ready'; g.hp=g.maxHp; g.gold=500;
  document.getElementById('overlay').hidden = true;
});
await p.locator('.tw-card[data-type="sniper"]').click();
await p.waitForTimeout(200);
await p.screenshot({ path: path.join(SHOTS, '13-buildmode.png') });
await b.close();
console.log('保存しました');
