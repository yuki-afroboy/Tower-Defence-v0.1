/* 実際のゲームループのまま(倍速で)UI操作だけで数Wave遊んでみる通しテスト
   node tools/playtest.mjs */
import path from 'node:path'; import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const exec = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const b = await chromium.launch(fs.existsSync(exec) ? { executablePath: exec } : {});
const ctx = await b.newContext({ viewport:{width:390,height:844}, isMobile:true, hasTouch:true, deviceScaleFactor:2 });
const p = await ctx.newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
p.on('console',m=>{ if(m.type()==='error') errs.push(m.text()); });
await p.goto(process.env.LFD_URL || pathToFileURL(path.join(root,'index.html')).href);
await p.click('#ov-btn');
await p.click('#btn-speed');          /* ×2 */

const state = () => p.evaluate(()=>{const g=window.LFD.app.game;
  return {gold:g.gold,hp:g.hp,wave:g.wave,phase:g.phase,towers:g.towers.length,killed:g.stats.killed};});

async function place(type,c,r){
  await p.locator(`.tw-card[data-type="${type}"]`).click();
  const box = await p.locator('#game').boundingBox();
  await p.touchscreen.tap(box.x+(c+0.5)*box.width/9, box.y+(r+0.5)*box.height/13);
  await p.waitForTimeout(120);
}
async function upgrade(c,r){
  const box = await p.locator('#game').boundingBox();
  await p.touchscreen.tap(box.x+(c+0.5)*box.width/9, box.y+(r+0.5)*box.height/13);
  await p.waitForTimeout(200);
  if (!(await p.locator('#btn-upgrade').isDisabled())) await p.click('#btn-upgrade');
  await p.click('#btn-close-panel');
}
async function runWave(){
  await p.click('#btn-wave');
  const t0=Date.now();
  while (Date.now()-t0 < 120000) {
    const s = await state();
    if (s.phase!=='wave') return s;
    await p.waitForTimeout(500);
  }
  throw new Error('Waveが終わらない');
}

await place('archer',2,2); await place('archer',5,2); await place('archer',3,4);
for (let w=1; w<=5; w++){
  const s = await runWave();
  console.log(`Wave${w} 終了: HP=${s.hp} Gold=${s.gold} 撃破=${s.killed} タワー=${s.towers}`);
  if (w===2) await place('ice',6,4);
  if (w===3) await upgrade(2,2);
  if (w===4) await place('cannon',2,6);
}
const fin = await state();
console.log('結果:', JSON.stringify(fin));
console.log('JSエラー:', errs.length ? errs : 'なし');
await p.screenshot({ path: path.join(root,'tests','screenshots','20-playtest.png') });
await b.close();
if (fin.hp !== 20) { console.log('注意: 序盤でHPが減りました'); }
