// test/backup-d1.test.mjs
// Offline tests for the pure helpers in scripts/backup-d1.mjs, using a small
// synthetic dump shaped like a D1 export (a foreign key to a table created later).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dumpStats, hoistTables, filesToPrune, stamp } from '../scripts/backup-d1.mjs';

const dump = [
  'PRAGMA defer_foreign_keys=TRUE;',
  'CREATE TABLE credits (',
  '  id INTEGER PRIMARY KEY,',
  '  name TEXT',
  ', artist_id INTEGER REFERENCES artists(id));',
  'INSERT INTO "credits" ("id","name","artist_id") VALUES(1,\'Unknown\',NULL);',
  'INSERT INTO "credits" ("id","name","artist_id") VALUES(2,\'Has; semicolon\',1);',
  'CREATE TABLE artists (id INTEGER PRIMARY KEY, name TEXT);',
  'INSERT INTO "artists" ("id","name") VALUES(1,\'Someone\');',
  'CREATE INDEX idx_credits_artist ON credits(artist_id);',
  'CREATE VIEW v_credits AS SELECT * FROM credits;',
].join('\n');

test('dumpStats counts schema objects and rows per table', () => {
  assert.deepEqual(dumpStats(dump), {
    tables: 2, views: 1, indexes: 1,
    rows: { credits: 2, artists: 1 },
  });
});

test('hoistTables creates every table before any INSERT', () => {
  const out = hoistTables(dump);
  const firstInsert = out.indexOf('INSERT INTO');
  for (const t of ['credits', 'artists']) {
    const create = out.indexOf(`CREATE TABLE IF NOT EXISTS ${t}`);
    assert.ok(create >= 0 && create < firstInsert, `${t} is created before the first insert`);
  }
  assert.ok(!/^CREATE TABLE (?!IF NOT EXISTS)/m.test(out), 'original CREATE TABLEs become no-ops');
});

test('hoistTables keeps every data line unchanged', () => {
  const inserts = (s) => s.split('\n').filter((l) => l.startsWith('INSERT'));
  assert.deepEqual(inserts(hoistTables(dump)), inserts(dump));
});

test('filesToPrune keeps the newest N backups and ignores other files', () => {
  const names = [
    'cutetopop-db-2026-10-01T0300Z.sql',
    'cutetopop-db-2026-10-15T0300Z.sql',
    'backup-log.txt',
    'cutetopop-db-2026-10-08T0300Z.sql',
    'notes.sql',
  ];
  assert.deepEqual(filesToPrune(names, 2), ['cutetopop-db-2026-10-01T0300Z.sql']);
  assert.deepEqual(filesToPrune(names, 5), []);
  assert.deepEqual(filesToPrune(names, 0), [
    'cutetopop-db-2026-10-01T0300Z.sql',
    'cutetopop-db-2026-10-08T0300Z.sql',
    'cutetopop-db-2026-10-15T0300Z.sql',
  ]);
});

test('stamp is UTC, file-name safe, and sorts chronologically', () => {
  assert.equal(stamp(new Date('2026-10-25T02:43:17.123Z')), '2026-10-25T0243Z');
  assert.ok(stamp(new Date('2026-01-02T00:00:00Z')) < stamp(new Date('2026-10-25T00:00:00Z')));
});
