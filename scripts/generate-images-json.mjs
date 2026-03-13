import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = path.resolve(__dirname, "..");
const FULL_DIR = path.join(ROOT, "images", "full");
const THUMB_DIR = path.join(ROOT, "images", "thumb");
const OUTPUT_JSON = path.join(ROOT, "images.json");

const VALID_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif"]);

const THUMB_WIDTH = 900;
const THUMB_WEBP_QUALITY = 78;

function walk(dir) {
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      results.push(...walk(fullPath));
    } else {
      const ext = path.extname(entry.name).toLowerCase();
      if (VALID_EXTENSIONS.has(ext)) results.push(fullPath);
    }
  }

  return results;
}

function toPosix(p) {
  return p.split(path.sep).join("/");
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

async function makeThumbAndEntry(absPath) {
  const relativeFromFull = toPosix(path.relative(FULL_DIR, absPath));
  const parsed = path.parse(relativeFromFull);

  const chapter = parsed.dir ? parsed.dir.split("/")[0] : "main";

  // thumb は全部 webp に統一
  const thumbRelative = toPosix(path.join(parsed.dir, `${parsed.name}.webp`));
  const thumbAbs = path.join(THUMB_DIR, thumbRelative);

  ensureDir(path.dirname(thumbAbs));

  const image = sharp(absPath).rotate();
  const meta = await image.metadata();

  let aspect = 1.3;
  if (meta.width && meta.height) {
    aspect = Number((meta.width / meta.height).toFixed(4));
  }

  await image
    .resize({
      width: THUMB_WIDTH,
      withoutEnlargement: true
    })
    .webp({ quality: THUMB_WEBP_QUALITY })
    .toFile(thumbAbs);

  return {
    file: relativeFromFull,
    thumb: thumbRelative,
    chapter,
    aspect
  };
}

async function main() {
  if (!fs.existsSync(FULL_DIR)) {
    console.error("Folder not found:", FULL_DIR);
    process.exit(1);
  }

  ensureDir(THUMB_DIR);

  const files = walk(FULL_DIR).sort((a, b) => a.localeCompare(b, "en"));

  const images = [];
  for (const file of files) {
    const entry = await makeThumbAndEntry(file);
    images.push(entry);
    console.log("processed:", entry.file);
  }

  const output = {
    generatedAt: new Date().toISOString(),
    images
  };

  fs.writeFileSync(OUTPUT_JSON, JSON.stringify(output, null, 2) + "\n", "utf8");
  console.log(`images.json updated: ${images.length} images`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
