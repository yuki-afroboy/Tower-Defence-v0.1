/* ホーム画面用のアイコンPNGを生成する(一度だけ実行して assets/ に保存) */
import path from 'node:path'; import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const exec = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const b = await chromium.launch(fs.existsSync(exec) ? { executablePath: exec } : {});
const p = await b.newPage();
await p.setContent('<canvas id="c"></canvas>');
for (const size of [192, 512]) {
  const data = await p.evaluate((S) => {
    const c = document.getElementById('c');
    c.width = S; c.height = S;
    const x = c.getContext('2d');
    const u = S / 100;
    /* 背景 */
    const g = x.createLinearGradient(0, 0, 0, S);
    g.addColorStop(0, '#1e3a2b'); g.addColorStop(1, '#10151d');
    x.fillStyle = g; x.fillRect(0, 0, S, S);
    /* 道 */
    x.strokeStyle = '#8a7250'; x.lineWidth = 13 * u; x.lineCap = 'square';
    x.beginPath();
    x.moveTo(8 * u, 26 * u); x.lineTo(78 * u, 26 * u);
    x.lineTo(78 * u, 52 * u); x.lineTo(22 * u, 52 * u);
    x.lineTo(22 * u, 78 * u); x.lineTo(60 * u, 78 * u);
    x.stroke();
    /* 拠点 */
    x.fillStyle = '#3f6fd8';
    x.fillRect(52 * u, 70 * u, 17 * u, 16 * u);
    x.fillStyle = '#9fc0ff';
    x.beginPath();
    x.moveTo(49 * u, 71 * u); x.lineTo(60.5 * u, 60 * u); x.lineTo(72 * u, 71 * u);
    x.closePath(); x.fill();
    /* タワー(アーチャー) */
    x.fillStyle = '#2b3444';
    x.beginPath(); x.roundRect(26 * u, 30 * u, 26 * u, 26 * u, 5 * u); x.fill();
    x.strokeStyle = '#2f8f43'; x.lineWidth = 3 * u; x.stroke();
    x.fillStyle = '#5bd66d';
    x.beginPath(); x.arc(39 * u, 43 * u, 9 * u, 0, Math.PI * 2); x.fill();
    x.strokeStyle = '#eaffea'; x.lineWidth = 3.5 * u;
    x.beginPath(); x.arc(39 * u, 43 * u, 9 * u, -Math.PI * 0.55, Math.PI * 0.55); x.stroke();
    return c.toDataURL('image/png');
  }, size);
  fs.writeFileSync(path.join(root, 'assets', `icon-${size}.png`),
    Buffer.from(data.split(',')[1], 'base64'));
  console.log(`assets/icon-${size}.png を作成`);
}
await b.close();
