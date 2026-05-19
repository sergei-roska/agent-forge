import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { MIGRATIONS } from './migrations/index.js';
import { sqliteDbPath } from './paths.js';

function applyMigrations(db: Database.Database): void {
  db.exec(`CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY)`);
  const applied = new Set(
    (db.prepare('SELECT name FROM _migrations').all() as { name: string }[]).map(
      (r) => r.name,
    ),
  );
  for (const { name, sql } of MIGRATIONS) {
    if (applied.has(name)) continue;
    db.exec(sql);
    db.prepare('INSERT INTO _migrations(name) VALUES (?)').run(name);
  }
}

export function openDb(projectPath: string): Database.Database {
  const dbPath = sqliteDbPath(projectPath);
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  applyMigrations(db);
  return db;
}

/** Run `fn` inside a BEGIN IMMEDIATE transaction; rolls back on throw. */
export function withImmediate<T>(db: Database.Database, fn: () => T): T {
  return db.transaction(fn).immediate();
}
