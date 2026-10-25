#!/usr/bin/env node
// scripts/backup-d1.mjs
// Off-site backup of the production D1 database as a SQL dump.
//
//   node scripts/backup-d1.mjs                 export to backups/d1/, keep the newest 12
//   node scripts/backup-d1.mjs --verify        ...and test-restore it into a throwaway local DB
//   node scripts/backup-d1.mjs --dry-run       show what would happen; export and prune nothing
//   node scripts/backup-d1.mjs --out DIR --keep N
//   node scripts/backup-d1.mjs --restore-local FILE
//                                              load a dump into the local DB used by `wrangler dev`
//
// Exports are read-only on production (a read-only API token is enough). For
// recovering production itself, use D1 Time Travel first
// (`npx wrangler d1 time-travel restore cutetopop-db --timestamp=...`); these
// dumps are the off-site copy if the database or account is lost.
//
// Every run appends one line to <out>/backup-log.txt. Wrangler prints a one-hour
// download link for each export; it never reaches this script's output or log.

import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripVTControlCharacters } from 'node:util';

const DB_NAME = 'cutetopop-db';
const FILE_PREFIX = `${DB_NAME}-`;
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Count schema objects and rows per table in a D1 SQL dump. */
export function dumpStats(sql) {
  const rows = {};
  for (const m of sql.matchAll(/^INSERT INTO "?([A-Za-z0-9_]+)"?/gm)) {
    rows[m[1]] = (rows[m[1]] || 0) + 1;
  }
  const count = (re) => (sql.match(re) || []).length;
  return {
    tables: count(/^CREATE TABLE /gm),
    views: count(/^CREATE VIEW /gm),
    indexes: count(/^CREATE (UNIQUE )?INDEX /gm),
    rows,
  };
}

/**
 * Make a dump restorable: D1 exports tables in an order where a table can be
 * filled before a table its foreign keys point at exists, which a database with
 * foreign keys enforced rejects ("no such table: main.artists"). Create every
 * table up front, then run the dump unchanged with its CREATE TABLEs made no-ops.
 */
export function hoistTables(sql) {
  const ddl = [];
  let current = null;
  for (const line of sql.split('\n')) {
    if (current) {
      current.push(line);
      if (/\);\s*$/.test(line)) {
        ddl.push(current.join('\n'));
        current = null;
      }
    } else if (/^CREATE TABLE /.test(line)) {
      if (/\);\s*$/.test(line)) ddl.push(line);
      else current = [line];
    }
  }
  const ifNotExists = (s) => s.replace(/^CREATE TABLE /gm, 'CREATE TABLE IF NOT EXISTS ');
  return ['PRAGMA defer_foreign_keys=TRUE;', ...ddl.map(ifNotExists), ifNotExists(sql)].join('\n');
}

/** Backup files to delete so only the newest `keep` remain (names sort by timestamp). */
export function filesToPrune(names, keep) {
  const backups = names.filter((n) => n.startsWith(FILE_PREFIX) && n.endsWith('.sql')).sort();
  return backups.slice(0, Math.max(0, backups.length - keep));
}

/** Timestamp for file names, e.g. 2026-10-25T0243Z (UTC, sorts chronologically). */
export function stamp(date = new Date()) {
  return date.toISOString().replace(/:\d\d\.\d+Z$/, 'Z').replace(/:/g, '');
}

function parseArgs(argv) {
  const opts = { out: path.join(REPO_ROOT, 'backups', 'd1'), keep: 12, dryRun: false, verify: false, restoreLocal: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--verify') opts.verify = true;
    else if (a === '--out') opts.out = path.resolve(argv[++i]);
    else if (a === '--keep') opts.keep = Number(argv[++i]);
    else if (a === '--restore-local') opts.restoreLocal = path.resolve(argv[++i]);
    else throw new Error(`unknown option ${a}`);
  }
  if (!Number.isInteger(opts.keep) || opts.keep < 1) throw new Error('--keep must be a positive integer');
  return opts;
}

// Run the project's own Wrangler with Node directly (no shell, so paths with spaces are safe)
function wrangler(args) {
  const require = createRequire(path.join(REPO_ROOT, 'package.json'));
  const bin = path.join(path.dirname(require.resolve('wrangler/package.json')), 'bin', 'wrangler.js');
  const r = spawnSync(process.execPath, [bin, ...args], { cwd: REPO_ROOT, encoding: 'utf8', env: { ...process.env, CI: '1' } });
  // Strip ANSI colours and signed URLs before anything is shown
  const clean = (s) => stripVTControlCharacters(s || '').replace(/https:\/\/\S+X-Amz-\S+/g, '<signed-url>');
  return { ok: r.status === 0, out: clean(r.stdout) + clean(r.stderr) };
}

function localCounts(persistTo, tables) {
  const select = tables.map((t) => `(SELECT COUNT(*) FROM "${t}") AS "${t}"`).join(', ');
  const args = ['d1', 'execute', DB_NAME, '--local', '--json', '--command', `SELECT ${select}`];
  if (persistTo) args.push('--persist-to', persistTo);
  const r = wrangler(args);
  if (!r.ok) throw new Error(`count query failed:\n${r.out.trim().split('\n').slice(-3).join('\n')}`);
  return JSON.parse(r.out.slice(r.out.indexOf('[')))[0].results[0];
}

function restore(file, persistTo) {
  const sql = fs.readFileSync(file, 'utf8');
  const tmp = path.join(os.tmpdir(), `d1-restore-${process.pid}.sql`);
  fs.writeFileSync(tmp, hoistTables(sql));
  try {
    const args = ['d1', 'execute', DB_NAME, '--local', '--file', tmp, '--yes'];
    if (persistTo) args.push('--persist-to', persistTo);
    const r = wrangler(args);
    if (!r.ok) throw new Error(`restore failed:\n${r.out.trim().split('\n').slice(-3).join('\n')}`);
  } finally {
    fs.rmSync(tmp, { force: true });
  }
  const expected = dumpStats(sql).rows;
  const tables = Object.keys(expected).filter((t) => t !== 'sqlite_sequence' && t !== 'd1_migrations');
  const actual = localCounts(persistTo, tables);
  const mismatched = tables.filter((t) => actual[t] !== expected[t]);
  return { tables: tables.length, rows: tables.reduce((n, t) => n + expected[t], 0), mismatched };
}

function logLine(dir, text) {
  fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(path.join(dir, 'backup-log.txt'), `${new Date().toISOString()} ${text}\n`);
}

function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.restoreLocal) {
    // Only into an empty local DB, so existing local test data is never overwritten
    const probe = wrangler(['d1', 'execute', DB_NAME, '--local', '--json', '--command',
      "SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='images'"]);
    const exists = probe.ok && JSON.parse(probe.out.slice(probe.out.indexOf('[')))[0].results[0].n > 0;
    if (exists) throw new Error('local DB already has tables; delete .wrangler/state/v3/d1 first if you want to replace it');
    if (opts.dryRun) return console.log(`[dry-run] would restore ${opts.restoreLocal} into the local wrangler dev DB`);
    const r = restore(opts.restoreLocal, null);
    if (r.mismatched.length) throw new Error(`row counts differ for: ${r.mismatched.join(', ')}`);
    return console.log(`restored ${r.rows} rows in ${r.tables} tables into the local wrangler dev DB`);
  }

  const file = path.join(opts.out, `${FILE_PREFIX}${stamp()}.sql`);
  const existing = fs.existsSync(opts.out) ? fs.readdirSync(opts.out) : [];
  // The new export counts towards `keep`, so prune one more of the existing ones
  const prune = filesToPrune(existing, opts.keep - 1);

  if (opts.dryRun) {
    console.log(`[dry-run] would export ${DB_NAME} (remote) to ${file}`);
    console.log(`[dry-run] would prune ${prune.length} old backup(s)${prune.length ? ': ' + prune.join(', ') : ''}`);
    if (opts.verify) console.log('[dry-run] would test-restore the export into a throwaway local DB');
    return;
  }

  fs.mkdirSync(opts.out, { recursive: true });
  const r = wrangler(['d1', 'export', DB_NAME, '--remote', '--output', file]);
  if (!r.ok || !fs.existsSync(file) || fs.statSync(file).size === 0) {
    logLine(opts.out, `FAIL export: ${r.out.trim().split('\n').slice(-1)[0]}`);
    throw new Error(`export failed:\n${r.out.trim().split('\n').slice(-5).join('\n')}`);
  }

  const stats = dumpStats(fs.readFileSync(file, 'utf8'));
  const totalRows = Object.values(stats.rows).reduce((a, b) => a + b, 0);
  let summary = `OK ${path.basename(file)} ${fs.statSync(file).size} bytes, ${stats.tables} tables, ${stats.views} views, ${stats.indexes} indexes, ${totalRows} rows`;

  if (opts.verify) {
    const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'd1-verify-'));
    try {
      const v = restore(file, scratch);
      if (v.mismatched.length) {
        logLine(opts.out, `FAIL verify ${path.basename(file)}: row counts differ for ${v.mismatched.join(', ')}`);
        throw new Error(`verify failed: row counts differ for ${v.mismatched.join(', ')}`);
      }
      summary += `, verified (${v.rows} rows restored in ${v.tables} tables)`;
    } finally {
      fs.rmSync(scratch, { recursive: true, force: true });
    }
  }

  for (const name of prune) fs.rmSync(path.join(opts.out, name));
  if (prune.length) summary += `, pruned ${prune.length}`;
  logLine(opts.out, summary);
  console.log(summary);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(`backup-d1: ${error.message}`);
    process.exit(1);
  }
}
