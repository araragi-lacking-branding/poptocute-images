// test/helpers/d1.mjs
// A minimal stand-in for the Cloudflare D1 binding over Node's built-in SQLite,
// so tests run the project's real schema and real SQL offline. It covers what
// the Worker uses: prepare().bind().all()/first()/run(), batch() and exec().
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

const plain = (row) => (row ? { ...row } : row);
const returnsRows = (sql) => /^\s*(SELECT|WITH|PRAGMA)\b/i.test(sql) || /\bRETURNING\b/i.test(sql);

class Statement {
  constructor(db, sql, params = []) {
    this.db = db;
    this.sql = sql;
    this.params = params;
  }
  bind(...params) {
    // D1 rejects statements with more than 100 bound parameters
    if (params.length > 100) throw new Error(`D1_ERROR: too many SQL variables (${params.length})`);
    for (const p of params) {
      if (p === undefined) throw new Error('D1_TYPE_ERROR: Type \'undefined\' not supported for value \'undefined\'');
    }
    return new Statement(this.db, this.sql, params);
  }
  async all() {
    const results = this.db.prepare(this.sql).all(...this.params).map(plain);
    return { results, success: true, meta: {} };
  }
  async first(column) {
    const row = plain(this.db.prepare(this.sql).get(...this.params)) ?? null;
    return column && row ? row[column] : row;
  }
  async run() {
    if (returnsRows(this.sql)) return this.all();
    const info = this.db.prepare(this.sql).run(...this.params);
    return { results: [], success: true, meta: { changes: Number(info.changes), last_row_id: Number(info.lastInsertRowid) } };
  }
}

export function createD1({ files = [] } = {}) {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;'); // D1 enforces foreign keys
  for (const file of files) db.exec(readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8'));
  return {
    raw: db,
    prepare: (sql) => new Statement(db, sql),
    exec: async (sql) => { db.exec(sql); return { count: 1 }; },
    // D1 runs a batch as one transaction
    async batch(statements) {
      db.exec('BEGIN');
      try {
        const out = [];
        for (const s of statements) out.push(await s.run());
        db.exec('COMMIT');
        return out;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
  };
}

// Production's schema: schema.sql plus the hand-applied status columns and 0001-0004
export const PROD_SCHEMA = [
  'schema.sql',
  'scripts/archive/migration/add-status-fields.sql',
  'migrations/0001_add_image_metadata_fields.sql',
  'migrations/0002_add_permissions_field.sql',
  'migrations/0003_add_comprehensive_metadata.sql',
  'migrations/0004_add_performance_indexes.sql',
];
