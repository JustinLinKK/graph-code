import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

export type GraphDatabase = Database.Database;

export function openDatabase(dbPath: string): GraphDatabase {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma("foreign_keys = ON");
  return db;
}
