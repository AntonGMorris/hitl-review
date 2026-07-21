import { FileStore } from "./file.js";
import { SqliteStore } from "./sqlite.js";

import type { ReviewStore } from "./base.js";

export { FileStore } from "./file.js";
export { MemoryStore } from "./memory.js";
export { SqliteStore, sqliteAvailable } from "./sqlite.js";
export type { ReviewStore } from "./base.js";

/**
 * Open a store based on the path's extension: `.json` opens the atomic
 * JSON FileStore, anything else (`.db`, `.sqlite`, ...) opens SqliteStore.
 */
export function openStore(dbPath: string): ReviewStore {
  return dbPath.endsWith(".json") ? new FileStore(dbPath) : new SqliteStore(dbPath);
}
