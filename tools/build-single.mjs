/*
 * CSS も JavaScript も画像も全部埋め込んだ「1ファイル完結版」を作ります。
 * できあがった dist/LastFortressDefense.html は、そのファイル1つだけで動きます。
 * (スマホにダウンロードしてオフラインで遊ぶ用)
 *   node tools/build-single.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const b64 = f => fs.readFileSync(path.join(root, f)).toString('base64');

let html = read('index.html');

/* 画像を data URI にする */
const icon192 = 'data:image/png;base64,' + b64('assets/icon-192.png');
const icon512 = 'data:image/png;base64,' + b64('assets/icon-512.png');

/* manifest も data URI で埋め込む(ホーム画面に追加したときの名前とアイコン) */
const manifest = JSON.parse(read('manifest.webmanifest'));
manifest.start_url = '.';
manifest.icons = [
  { src: icon192, sizes: '192x192', type: 'image/png', purpose: 'any' },
  { src: icon512, sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
];
const manifestUri = 'data:application/manifest+json;base64,' +
  Buffer.from(JSON.stringify(manifest), 'utf8').toString('base64');

/* CSS を <style> に差し替え */
html = html.replace(
  '<link rel="stylesheet" href="css/style.css">',
  '<style>\n' + read('css/style.css') + '\n</style>'
);

/* アイコンと manifest を差し替え */
html = html.replace('<link rel="manifest" href="manifest.webmanifest">',
  '<link rel="manifest" href="' + manifestUri + '">');
html = html.replace('<link rel="icon" href="assets/icon-192.png">',
  '<link rel="icon" href="' + icon192 + '">');
html = html.replace('<link rel="apple-touch-icon" href="assets/icon-192.png">',
  '<link rel="apple-touch-icon" href="' + icon192 + '">');

/* JavaScript を全部インラインにする */
for (const src of ['src/config.js', 'src/engine.js', 'src/renderer.js', 'src/sfx.js', 'src/ui.js']) {
  const tag = '<script src="' + src + '"></script>';
  if (!html.includes(tag)) throw new Error('index.html に ' + tag + ' が見つかりません');
  html = html.replace(tag, '<script>\n' + read(src) + '\n</script>');
}

/* Service Worker は1ファイル版では使えないので取り除く */
html = html.replace(/<script>\s*\/\* オフライン対応[\s\S]*?<\/script>/, '');

if (/<script src=|<link rel="stylesheet"/.test(html)) {
  throw new Error('外部ファイルの読み込みが残っています');
}

const outDir = path.join(root, 'dist');
fs.mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, 'LastFortressDefense.html');
fs.writeFileSync(out, html);

const kb = (Buffer.byteLength(html) / 1024).toFixed(0);
console.log(`dist/LastFortressDefense.html を作成しました (${kb} KB)`);
console.log('このファイル1つをスマホに保存すれば、通信なしで遊べます。');
