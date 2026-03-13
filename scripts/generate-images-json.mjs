import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import sizeOf from "image-size";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// プロジェクトのルート
const ROOT = path.resolve(__dirname, "..");

// 読み取る元フォルダ
const FULL_DIR = path.join(ROOT, "images", "full");

// 書き出し先
const OUTPUT_JSON = path.join(ROOT, "images.json");

// 対象拡張子
const VALID_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif"]);

function walk(dir) {
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      results.push(...walk(fullPath));
    } else {
      const ext = path.extname(entry.name).toLowerCase();
      if (VALID_EXTENSIONS.has(ext)) {
        results.push(fullPath);
      }
    }
  }

  return results;
}

function toPosix(p) {
  return p.split(path.sep).join("/");
}

function buildImageEntry(absPath) {
  // images/full からの相対パス
  const relativeFromFull = toPosix(path.relative(FULL_DIR, absPath));

  // chapter = 最初のフォルダ名
  const parts = relativeFromFull.split("/");
  const chapter = parts.length > 1 ? parts[0] : "main";

  let aspect = 1.3;

  try {
    const dimensions = sizeOf(absPath);
    if (dimensions.width && dimensions.height) {
      aspect = Number((dimensions.width / dimensions.height).toFixed(4));
    }
  } catch (err) {
    console.warn("Could not read size:", relativeFromFull);
  }

  return {
    file: relativeFromFull,
    chapter,
    aspect
  };
}

function main() {
  if (!fs.existsSync(FULL_DIR)) {
    console.error("Folder not found:", FULL_DIR);
    process.exit(1);
  }

  const files = walk(FULL_DIR);

  const images = files
    .map(buildImageEntry)
    .sort((a, b) => a.file.localeCompare(b.file, "en"));

  const output = {
    generatedAt: new Date().toISOString(),
    images
  };

  fs.writeFileSync(OUTPUT_JSON, JSON.stringify(output, null, 2) + "\n", "utf8");

  console.log(`images.json updated: ${images.length} images`);
}

main();
