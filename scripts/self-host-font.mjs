#!/usr/bin/env node
// Download a Google Fonts family once and write a self-hosted copy into public/fonts/,
// so visitors load the font from cutetopop.com and never contact Google.
//
//   node scripts/self-host-font.mjs                 (BIZ UDMincho 400, the site font)
//   node scripts/self-host-font.mjs --dry-run       (show what would be written)
//
// Output: public/fonts/<dir>/NNN.woff2 (Google's unicode-range slices, so a browser
// fetches only the slices for characters on the page), public/fonts/<dir>.css, and
// the font's licence next to them. The slice files are unmodified (SIL OFL 1.1).
// The directory name carries Google's version, so _headers can cache it forever:
// a new version gets a new directory and a new CSS path.
import { mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FAMILY = 'BIZ UDMincho';
const CSS_FAMILY = 'cutetopop Mincho';
const LICENCE_URL = 'https://raw.githubusercontent.com/google/fonts/main/ofl/bizudmincho/OFL.txt';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const dryRun = process.argv.includes('--dry-run');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function get(url, as = 'text') {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`${res.status} for ${url}`);
  return as === 'bytes' ? new Uint8Array(await res.arrayBuffer()) : res.text();
}

const css = await get(`https://fonts.googleapis.com/css2?family=${encodeURIComponent(FAMILY)}&display=swap`);
const faces = [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map(m => {
  const body = m[1];
  const url = body.match(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+\.woff2)\)/)?.[1];
  const range = body.match(/unicode-range:\s*([^;]+);/)?.[1].trim();
  const weight = body.match(/font-weight:\s*(\d+)/)?.[1] || '400';
  if (!url || !range) throw new Error('Unexpected @font-face block: ' + body.slice(0, 200));
  return { url, range, weight };
});
const version = faces[0].url.match(/\/(v\d+)\//)?.[1] || 'v0';
const dirName = `biz-udmincho-${version}`;
const outDir = path.join(root, 'public', 'fonts', dirName);

let total = 0;
const rules = [];
if (!dryRun) { await rm(outDir, { recursive: true, force: true }); await mkdir(outDir, { recursive: true }); }
for (const [i, f] of faces.entries()) {
  const name = String(i).padStart(3, '0') + '.woff2';
  const bytes = await get(f.url, 'bytes');
  if (bytes[0] !== 0x77 || bytes[1] !== 0x4f || bytes[2] !== 0x46 || bytes[3] !== 0x32) throw new Error(`${f.url} is not WOFF2`);
  total += bytes.length;
  if (!dryRun) await writeFile(path.join(outDir, name), bytes);
  rules.push(`@font-face{font-family:"${CSS_FAMILY}";font-style:normal;font-weight:${f.weight};font-display:swap;src:url(/fonts/${dirName}/${name}) format("woff2");unicode-range:${f.range.replace(/\s+/g, '')}}`);
}
const header = `/* ${FAMILY} (${version}), self-hosted from Google Fonts by scripts/self-host-font.mjs.\n   SIL Open Font License 1.1: /fonts/${dirName}/OFL.txt */\n`;
const licence = await get(LICENCE_URL);
if (!dryRun) {
  await writeFile(path.join(root, 'public', 'fonts', `${dirName}.css`), header + rules.join('\n') + '\n');
  await writeFile(path.join(outDir, 'OFL.txt'), licence);
}
console.log(`${dryRun ? '[dry-run] would write' : 'wrote'} ${faces.length} slices (${total} bytes) to public/fonts/${dirName}/ and public/fonts/${dirName}.css`);
