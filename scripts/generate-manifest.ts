/**
 * generate-manifest.ts
 *
 * Approach: COPY assets into public/assets/ preserving directory structure.
 * Rationale: symlinks are unreliable across platforms and break `vite build`
 * (Rollup follows symlinks but the resulting bundle paths can mismatch).
 * Copying is idempotent (we skip files whose mtime/size match), safe, and
 * works out of the box for both `vite dev` and `vite build`.
 *
 * Run via: npm run manifest   (tsx scripts/generate-manifest.ts)
 */

import fs from "fs";
import path from "path";
import sharp from "sharp";
import type { CharacterAnimEntry, StageLayerEntry, Manifest } from "../src/types/manifest.ts";

const ROOT = path.resolve(import.meta.dirname, "..");
const ASSETS_DIR = path.join(ROOT, "assets");
const PUBLIC_ASSETS_DIR = path.join(ROOT, "public", "assets");
const MANIFEST_PATH = path.join(ROOT, "public", "manifest.json");

// ---------------------------------------------------------------------------
// Junk filters
// ---------------------------------------------------------------------------
const JUNK_FILE_RE = /^(COUPON\..*|.*\.url|.*\.pdf|License.*\.txt|\.DS_Store)$/i;

function isJunk(filePath: string): boolean {
  const parts = filePath.split(path.sep);
  if (parts.includes("PSD")) return true;
  return JUNK_FILE_RE.test(path.basename(filePath));
}

// ---------------------------------------------------------------------------
// Utility: copy a file idempotently (skip if dest mtime >= src mtime and sizes match)
// ---------------------------------------------------------------------------
function copyIdempotent(src: string, dest: string): void {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  if (fs.existsSync(dest)) {
    const srcStat = fs.statSync(src);
    const dstStat = fs.statSync(dest);
    if (dstStat.size === srcStat.size && dstStat.mtimeMs >= srcStat.mtimeMs) return;
  }
  fs.copyFileSync(src, dest);
}

// ---------------------------------------------------------------------------
// Variant dir-name → canonical snake_case id
// ---------------------------------------------------------------------------
function toVariantId(dirName: string): string {
  return dirName.toLowerCase().replace(/[\s-]+/g, "_");
}

// ---------------------------------------------------------------------------
// Depth-sort heuristic for stage layers (sky/back first → ground last)
// ---------------------------------------------------------------------------
const DEPTH_ORDER: string[] = [
  "sky", "jungle_bg", "ruins_bg", "back_trees",
  "mountains", "mountaims", "hills&trees", "bg",
  "ruins", "ruins2", "wall@windows", "wall", "crypt",
  "fireflys", "lianas", "tree", "tree_face",
  "trees&bushes", "dragon",
  "columns&falgs", "statue", "candeliar", "graves", "bones",
  "grass&road", "grasses", "floor", "ground",
  "stones&grass",
];

function layerDepthKey(layer: string): number {
  const lc = layer.toLowerCase();
  const idx = DEPTH_ORDER.findIndex((k) => lc.includes(k.toLowerCase()));
  return idx === -1 ? DEPTH_ORDER.length : idx;
}

// ---------------------------------------------------------------------------
// Scan characters
// ---------------------------------------------------------------------------
async function scanCharacters(): Promise<CharacterAnimEntry[]> {
  const entries: CharacterAnimEntry[] = [];
  const charsDir = path.join(ASSETS_DIR, "characters");

  const families = fs.readdirSync(charsDir).filter((f) => {
    return fs.statSync(path.join(charsDir, f)).isDirectory() && !isJunk(f);
  });

  for (const family of families) {
    const familyDir = path.join(charsDir, family);
    const variants = fs.readdirSync(familyDir).filter((v) => {
      const vp = path.join(familyDir, v);
      return fs.statSync(vp).isDirectory() && !isJunk(path.join(family, v));
    });

    for (const variantDir of variants) {
      const variantPath = path.join(familyDir, variantDir);
      const variant = toVariantId(variantDir);

      const pngs = fs.readdirSync(variantPath)
        .filter((f) => f.toLowerCase().endsWith(".png") && !isJunk(path.join(family, variantDir, f)))
        .sort();

      for (const file of pngs) {
        const srcAbs = path.join(variantPath, file);
        // Relative to assets/ root for the dest under public/assets/
        const relToAssets = path.relative(ASSETS_DIR, srcAbs);
        const destAbs = path.join(PUBLIC_ASSETS_DIR, relToAssets);
        copyIdempotent(srcAbs, destAbs);

        const { width: sheetW, height: sheetH } = await sharp(srcAbs).metadata();
        if (!sheetW || !sheetH) {
          console.warn(`  WARN: cannot read dimensions for ${srcAbs}`);
          continue;
        }

        const frameH = sheetH;
        const frameW = frameH; // square frames for character strips

        // If sheet is taller than wide it's a single icon (e.g. tiny projectile)
        const frameCount = sheetW <= sheetH ? 1 : Math.max(1, Math.round(sheetW / frameH));

        const state = path.basename(file, ".png");
        // path relative to served root (Vite serves public/ at /)
        const servePath = "assets/" + relToAssets.split(path.sep).join("/");

        entries.push({ family: family.toLowerCase(), variant, state, frameW, frameH, frameCount, path: servePath });
      }
    }
  }

  return entries;
}

// ---------------------------------------------------------------------------
// Scan stages
// ---------------------------------------------------------------------------
async function scanStages(): Promise<StageLayerEntry[]> {
  const entries: StageLayerEntry[] = [];
  const bgBase = path.join(ASSETS_DIR, "background", "fantasy-2d-battlegrounds", "PNG");

  const battlegrounds = fs.readdirSync(bgBase).filter((d) => {
    return d.startsWith("Battleground") && fs.statSync(path.join(bgBase, d)).isDirectory();
  }).sort();

  for (const bg of battlegrounds) {
    const bgDir = path.join(bgBase, bg);
    const variants = fs.readdirSync(bgDir).filter((v) => {
      return (v === "Bright" || v === "Pale") && fs.statSync(path.join(bgDir, v)).isDirectory();
    });

    for (const variant of variants as ("Bright" | "Pale")[]) {
      const variantDir = path.join(bgDir, variant);
      let pngs = fs.readdirSync(variantDir)
        .filter((f) => f.toLowerCase().endsWith(".png") && !isJunk(f))
        .sort((a, b) => {
          const da = layerDepthKey(path.basename(a, ".png"));
          const db = layerDepthKey(path.basename(b, ".png"));
          return da - db;
        });

      // Remove the composite battleground image (same name as folder, e.g. Battleground1.png)
      pngs = pngs.filter((f) => f.toLowerCase() !== bg.toLowerCase() + ".png");

      for (let i = 0; i < pngs.length; i++) {
        const file = pngs[i];
        const srcAbs = path.join(variantDir, file);
        const relToAssets = path.relative(ASSETS_DIR, srcAbs);
        const destAbs = path.join(PUBLIC_ASSETS_DIR, relToAssets);
        copyIdempotent(srcAbs, destAbs);

        const { width, height } = await sharp(srcAbs).metadata();
        if (!width || !height) {
          console.warn(`  WARN: cannot read dimensions for ${srcAbs}`);
          continue;
        }

        const layer = path.basename(file, ".png");
        const servePath = "assets/" + relToAssets.split(path.sep).join("/");

        entries.push({
          stage: bg,
          variant,
          layer,
          index: i,
          path: servePath,
          width,
          height,
        });
      }
    }
  }

  return entries;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  fs.mkdirSync(path.join(ROOT, "public"), { recursive: true });

  console.log("Scanning characters...");
  const characters = await scanCharacters();

  console.log("Scanning stages...");
  const stages = await scanStages();

  const manifest: Manifest = { characters, stages };
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));

  const variants = new Set(characters.map((c) => c.variant));
  console.log(`\n=== Manifest written to public/manifest.json ===`);
  console.log(`  Variants : ${variants.size}  (expected 21)`);
  console.log(`  Character entries : ${characters.length}`);
  console.log(`  Stage layer entries : ${stages.length}`);

  if (variants.size !== 21) {
    console.error(`ERROR: expected 21 variants, got ${variants.size}`);
    console.error("  Found:", [...variants].sort().join(", "));
    process.exit(1);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
