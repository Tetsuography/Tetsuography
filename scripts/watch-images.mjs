/**
 * watch-images.mjs
 * images/src/ を監視して、新しい写真が追加されたら自動で
 * generate-images-json.mjs を実行します。
 *
 * 使い方: npm run watch:images
 */

import chokidar from "chokidar";
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC_DIR   = path.resolve(__dirname, "..", "images", "src");
const SCRIPT    = path.join(__dirname, "generate-images-json.mjs");

console.log("👁  images/src/ を監視中…");
console.log("    写真を src/ に追加すると自動で処理されます。");
console.log("    Ctrl+C で停止。\n");

let running = false;
let pending  = false;

function runGenerate() {
  if (running) { pending = true; return; }
  running = true;
  console.log("⚙  変更を検出 — generate:images を実行中…");

  const child = spawn("node", [SCRIPT], {
    stdio: "inherit",
    cwd: path.resolve(__dirname, ".."),
  });

  child.on("close", code => {
    running = false;
    if (pending) {
      pending = false;
      runGenerate();
      return;
    }
    if (code === 0) {
      console.log("✓  完了。images.json を更新しました。\n");
    } else {
      console.log(`✗  エラー (exit code ${code})\n`);
    }
  });
}

chokidar
  .watch(SRC_DIR, {
    ignored: /(^|[/\\])\../,          // dotfiles を無視
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 1000,       // ファイルが安定するまで 1 秒待つ
      pollInterval: 150,
    },
  })
  .on("add",    p => { console.log(`+ ${path.basename(p)}`); runGenerate(); })
  .on("change", p => { console.log(`~ ${path.basename(p)}`); runGenerate(); });
