#!/usr/bin/env node
// Download a Google Fonts family/weight once and write a self-hosted copy into
// public/fonts/, so visitors load the font from cutetopop.com and never contact Google.
//
//   node scripts/self-host-font.mjs --family "Noto Serif JP" --weight 500 [--dry-run]
//   node scripts/self-host-font.mjs --family "Hina Mincho" --weight 400
//
// Output: public/fonts/<slug>-<version>-<weight>/NNN.woff2 (Google's unicode-range
// slices, unmodified, so a browser fetches only the slices for characters on the
// page), public/fonts/<slug>-<version>-<weight>.css, and the font's licence (SIL OFL)
// in the directory. The CSS family name is "cutetopop <family>". The path carries
// Google's version, so public/_headers can cache it forever: a new version gets a new
// directory and CSS path. src/lib/fonts.js points at these paths.
import { mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };
const FAMILY = arg('--family');
const WEIGHT = arg('--weight') || '400';
const dryRun = process.argv.includes('--dry-run');
if (!FAMILY || !/^\d{3}$/.test(WEIGHT)) {
  console.error('usage: node scripts/self-host-font.mjs --family "<Google family>" --weight <100-900> [--dry-run]');
  process.exit(2);
}
const CSS_FAMILY = `cutetopop ${FAMILY}`;
const SLUG = FAMILY.toLowerCase().replace(/[^a-z0-9]+/g, '-');
const LICENCE_URL = `https://raw.githubusercontent.com/google/fonts/main/ofl/${FAMILY.toLowerCase().replace(/[^a-z0-9]/g, '')}/OFL.txt`;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function get(url, as = 'text') {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`${res.status} for ${url}`);
  return as === 'bytes' ? new Uint8Array(await res.arrayBuffer()) : res.text();
}

const css = await get(`https://fonts.googleapis.com/css2?family=${encodeURIComponent(FAMILY)}:wght@${WEIGHT}&display=swap`);
const faces = [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map(m => {
  const body = m[1];
  const url = body.match(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+\.woff2)\)/)?.[1];
  const range = body.match(/unicode-range:\s*([^;]+);/)?.[1].trim();
  if (!url || !range) throw new Error('Unexpected @font-face block: ' + body.slice(0, 200));
  return { url, range };
});
if (!faces.length) throw new Error(`No @font-face for ${FAMILY} ${WEIGHT}`);
const version = faces[0].url.match(/\/(v\d+)\//)?.[1] || 'v0';
const dirName = `${SLUG}-${version}-${WEIGHT}`;
const outDir = path.join(root, 'public', 'fonts', dirName);
const licence = await get(LICENCE_URL);
if (!/SIL OPEN FONT LICENSE/i.test(licence)) throw new Error(`${LICENCE_URL} is not the SIL OFL`);

let total = 0;
let latin = '';
const rules = [];
if (!dryRun) { await rm(outDir, { recursive: true, force: true }); await mkdir(outDir, { recursive: true }); }
for (const [i, f] of faces.entries()) {
  const name = String(i).padStart(3, '0') + '.woff2';
  const bytes = await get(f.url, 'bytes');
  if (bytes[0] !== 0x77 || bytes[1] !== 0x4f || bytes[2] !== 0x46 || bytes[3] !== 0x32) throw new Error(`${f.url} is not WOFF2`);
  total += bytes.length;
  if (/^U\+0000-00FF\b/.test(f.range)) latin = `/fonts/${dirName}/${name}`;
  if (!dryRun) await writeFile(path.join(outDir, name), bytes);
  rules.push(`@font-face{font-family:"${CSS_FAMILY}";font-style:normal;font-weight:${WEIGHT};font-display:swap;src:url(/fonts/${dirName}/${name}) format("woff2");unicode-range:${f.range.replace(/\s+/g, '')}}`);
}
const header = `/* ${FAMILY} ${WEIGHT} (${version}), self-hosted from Google Fonts by scripts/self-host-font.mjs.\n   SIL Open Font License 1.1: /fonts/${dirName}/OFL.txt */\n`;
if (!dryRun) {
  await writeFile(path.join(root, 'public', 'fonts', `${dirName}.css`), header + rules.join('\n') + '\n');
  await writeFile(path.join(outDir, 'OFL.txt'), licence);
}
console.log(`${dryRun ? '[dry-run] would write' : 'wrote'} ${faces.length} slices (${total} bytes) to public/fonts/${dirName}/ and public/fonts/${dirName}.css`);
console.log(`CSS family: "${CSS_FAMILY}"; Basic Latin slice: ${latin || 'none'}`);
