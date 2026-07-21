import { createRequire } from "node:module";

import type { ReviewItem } from "../types.js";
import type { ReviewStore } from "./base.js";

// Minimal structural types for node:sqlite so we can compile against
// @types/node 20, where the module's typings don't exist yet.
interface SqliteStatement {
  run(...params: unknown[]): unknown;
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
}

interface SqliteDatabase {
  exec(sql: string): void;
  prepare(sql: string): SqliteStatement;
  close(): void;
}

interface SqliteRow {
  id: string;
  system: string;
  input: string;
  output: string;
  confidence: number;
  status: ReviewItem["status"];
  context: string;
  created_at: string;
  decided_at: string | null;
  decided_by: string | null;
  revised_output: string | null;
  rejection_reason: string | null;
}

export function sqliteAvailable(): boolean {
  try {
    createRequire(import.meta.url)("node:sqlite");
    return true;
  } catch {
    return false;
  }
}

/**
 * SQLite-backed store using Node's built-in `node:sqlite` (Node >= 22.5).
 * No native dependencies — the whole package stays dependency-free.
 * WAL mode keeps reads non-blocking while the review dashboard writes.
 */
export class SqliteStore implements ReviewStore {
  private readonly db: SqliteDatabase;

  constructor(dbPath: string) {
    let mod: { DatabaseSync: new (path: string) => SqliteDatabase };
    try {
      mod = createRequire(import.meta.url)("node:sqlite");
    } catch {
      throw new Error(
        "SqliteStore requires Node.js >= 22.5 (built-in node:sqlite). " +
          "On older Node, use FileStore or MemoryStore instead.",
      );
    }
    this.db = new mod.DatabaseSync(dbPath);
    this.db.exec("PRAGMA journal_mode = WAL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS review_items (
        id TEXT PRIMARY KEY,
        system TEXT NOT NULL,
        input TEXT NOT NULL,
        output TEXT NOT NULL,
        confidence REAL NOT NULL,
        status TEXT NOT NULL,
        context TEXT NOT NULL,
        created_at TEXT NOT NULL,
        decided_at TEXT,
        decided_by TEXT,
        revised_output TEXT,
        rejection_reason TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_review_items_status ON review_items(status);
    `);
  }

  async save(item: ReviewItem): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO review_items
           (id, system, input, output, confidence, status, context,
            created_at, decided_at, decided_by, revised_output, rejection_reason)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           system = excluded.system,
           input = excluded.input,
           output = excluded.output,
           confidence = excluded.confidence,
           status = excluded.status,
           context = excluded.context,
           created_at = excluded.created_at,
           decided_at = excluded.decided_at,
           decided_by = excluded.decided_by,
           revised_output = excluded.revised_output,
           rejection_reason = excluded.rejection_reason`,
      )
      .run(
        item.id,
        item.system,
        item.input,
        item.output,
        item.confidence,
        item.status,
        JSON.stringify(item.context),
        item.createdAt,
        item.decidedAt,
        item.decidedBy,
        item.revisedOutput,
        item.rejectionReason,
      );
  }

  async get(id: string): Promise<ReviewItem | undefined> {
    const row = this.db.prepare("SELECT * FROM review_items WHERE id = ?").get(id) as
      | SqliteRow
      | undefined;
    return row ? toItem(row) : undefined;
  }

  async list(filter?: { status?: ReviewItem["status"] }): Promise<ReviewItem[]> {
    const rows = (
      filter?.status
        ? this.db
            .prepare("SELECT * FROM review_items WHERE status = ? ORDER BY created_at")
            .all(filter.status)
        : this.db.prepare("SELECT * FROM review_items ORDER BY created_at").all()
    ) as SqliteRow[];
    return rows.map(toItem);
  }

  close(): void {
    this.db.close();
  }
}

function toItem(row: SqliteRow): ReviewItem {
  return {
    id: row.id,
    system: row.system,
    input: row.input,
    output: row.output,
    confidence: row.confidence,
    status: row.status,
    context: JSON.parse(row.context) as Record<string, unknown>,
    createdAt: row.created_at,
    decidedAt: row.decided_at,
    decidedBy: row.decided_by,
    revisedOutput: row.revised_output,
    rejectionReason: row.rejection_reason,
  };
}
