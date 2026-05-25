import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT        = path.resolve(__dirname, "..");
const SRC_DIR     = path.join(ROOT, "images", "src");
const FULL_DIR    = path.join(ROOT, "images", "full");
const THUMB_DIR   = path.join(ROOT, "images", "thumb");
const OUTPUT_JSON = path.join(ROOT, "images.json");

const VALID_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif"]);

const FULL_MAX_WIDTH     = 2400;
const FULL_JPEG_QUALITY  = 88;
const THUMB_WIDTH        = 900;
const THUMB_WEBP_QUALITY = 78;

function walk(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walk(fullPath));
    } else if (VALID_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      results.push(fullPath);
    }
  }
  return results;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

async function processImage(srcPath) {
  const name      = path.parse(srcPath).name;
  const fullFile  = `${name}.jpg`;
  const thumbFile = `${name}.webp`;
  const fullAbs   = path.join(FULL_DIR, fullFile);
  const thumbAbs  = path.join(THUMB_DIR, thumbFile);

  if (fs.existsSync(fullAbs) && fs.existsSync(thumbAbs)) {
    const meta   = await sharp(fullAbs).metadata();
    const aspect = meta.width && meta.height
      ? Number((meta.width / meta.height).toFixed(4))
      : 1.3;
    console.log("skip:", fullFile);
    return { file: fullFile, thumb: thumbFile, aspect };
  }

  const image  = sharp(srcPath).rotate();
  const meta   = await image.metadata();
  const aspect = meta.width && meta.height
    ? Number((meta.width / meta.height).toFixed(4))
    : 1.3;

  await image
    .resize({ width: FULL_MAX_WIDTH, withoutEnlargement: true })
    .jpeg({ quality: FULL_JPEG_QUALITY })
    .toFile(fullAbs);

  await sharp(srcPath).rotate()
    .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
    .webp({ quality: THUMB_WEBP_QUALITY })
    .toFile(thumbAbs);

  console.log("processed:", fullFile);
  return { file: fullFile, thumb: thumbFile, aspect };
}

async function main() {
  if (!fs.existsSync(SRC_DIR)) {
    console.error("images/src/ が見つかりません:", SRC_DIR);
    process.exit(1);
  }

  ensureDir(FULL_DIR);
  ensureDir(THUMB_DIR);

  const files  = walk(SRC_DIR).sort((a, b) => a.localeCompare(b, "en"));
  console.log("debug - found:", files.length, "SRC_DIR:", SRC_DIR);
  const images = [];

  for (const file of files) {
    images.push(await processImage(file));
  }

  fs.writeFileSync(
    OUTPUT_JSON,
    JSON.stringify({ generatedAt: new Date().toISOString(), images }, null, 2) + "\n",
    "utf8"
  );

  console.log(`images.json updated: ${images.length} images`);
}

main().catch((err) => { console.error(err); process.exit(1); });
