/* ブラウザ用のスクリプトを Node.js 側で読み込むための小さなヘルパー */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.join(here, '..', 'src');

export function loadEngine() {
  if (!globalThis.LFD || !globalThis.LFD.Game) {
    for (const file of ['config.js', 'engine.js']) {
      const code = fs.readFileSync(path.join(srcDir, file), 'utf8');
      vm.runInThisContext(code, { filename: file });
    }
  }
  return globalThis.LFD;
}
