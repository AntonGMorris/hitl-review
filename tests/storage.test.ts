import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { FileStore } from "../src/storage/file.js";
import { MemoryStore } from "../src/storage/memory.js";
import { openStore, sqliteAvailable, SqliteStore } from "../src/storage/index.js";
import type { ReviewItem } from "../src/types.js";

function item(overrides: Partial<ReviewItem> = {}): ReviewItem {
  return {
    id: "r_a",
    system: "test",
    input: "in",
    output: "out",
    confidence: 0.5,
    status: "pending",
    context: {},
    createdAt: "2026-07-18T12:00:00.000Z",
    decidedAt: null,
    decidedBy: null,
    revisedOutput: null,
    rejectionReason: null,
    ...overrides,
  };
}

describe("MemoryStore", () => {
  it("saves and gets by id", async () => {
    const store = new MemoryStore();
    await store.save(item({ id: "r_1" }));
    const got = await store.get("r_1");
    expect(got?.id).toBe("r_1");
  });

  it("returns undefined for missing ids", async () => {
    const store = new MemoryStore();
    expect(await store.get("nope")).toBeUndefined();
  });

  it("filters list by status", async () => {
    const store = new MemoryStore();
    await store.save(item({ id: "r_1", status: "pending" }));
    await store.save(item({ id: "r_2", status: "approved" }));
    const pending = await store.list({ status: "pending" });
    expect(pending.map((i) => i.id)).toEqual(["r_1"]);
  });
});

describe("FileStore", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(tmpdir(), "hitl-test-"));
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("persists across instances", async () => {
    const file = path.join(dir, "store.json");
    const s1 = new FileStore(file);
    await s1.save(item({ id: "r_persist" }));

    const s2 = new FileStore(file);
    const got = await s2.get("r_persist");
    expect(got?.id).toBe("r_persist");
  });

  it("upserts on repeat save with same id", async () => {
    const file = path.join(dir, "store.json");
    const s = new FileStore(file);
    await s.save(item({ id: "r_x", output: "v1" }));
    await s.save(item({ id: "r_x", output: "v2" }));
    const got = await s.get("r_x");
    expect(got?.output).toBe("v2");
    const all = await s.list();
    expect(all).toHaveLength(1);
  });

  it("serialises concurrent writes without dropping items", async () => {
    const file = path.join(dir, "store.json");
    const s = new FileStore(file);
    await Promise.all(
      Array.from({ length: 20 }, (_, i) => s.save(item({ id: `r_${i}` }))),
    );
    const all = await s.list();
    expect(all).toHaveLength(20);
  });

  it("handles a missing file as empty", async () => {
    const s = new FileStore(path.join(dir, "does-not-exist.json"));
    const all = await s.list();
    expect(all).toEqual([]);
  });
});

describe.skipIf(!sqliteAvailable())("SqliteStore", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(tmpdir(), "hitl-sqlite-test-"));
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("persists across instances", async () => {
    const file = path.join(dir, "store.db");
    const s1 = new SqliteStore(file);
    await s1.save(item({ id: "r_persist" }));
    s1.close();

    const s2 = new SqliteStore(file);
    const got = await s2.get("r_persist");
    expect(got?.id).toBe("r_persist");
    s2.close();
  });

  it("upserts on repeat save with same id", async () => {
    const s = new SqliteStore(path.join(dir, "store.db"));
    await s.save(item({ id: "r_x", output: "v1" }));
    await s.save(item({ id: "r_x", output: "v2", status: "approved" }));
    const got = await s.get("r_x");
    expect(got?.output).toBe("v2");
    expect(got?.status).toBe("approved");
    expect(await s.list()).toHaveLength(1);
    s.close();
  });

  it("filters list by status and orders by createdAt", async () => {
    const s = new SqliteStore(path.join(dir, "store.db"));
    await s.save(item({ id: "r_2", status: "pending", createdAt: "2026-07-18T12:00:02.000Z" }));
    await s.save(item({ id: "r_1", status: "pending", createdAt: "2026-07-18T12:00:01.000Z" }));
    await s.save(item({ id: "r_3", status: "approved" }));
    const pending = await s.list({ status: "pending" });
    expect(pending.map((i) => i.id)).toEqual(["r_1", "r_2"]);
    s.close();
  });

  it("round-trips context objects", async () => {
    const s = new SqliteStore(path.join(dir, "store.db"));
    await s.save(item({ id: "r_ctx", context: { customer: "acme", nested: { n: 1 } } }));
    const got = await s.get("r_ctx");
    expect(got?.context).toEqual({ customer: "acme", nested: { n: 1 } });
    s.close();
  });

  it("returns undefined for missing ids", async () => {
    const s = new SqliteStore(path.join(dir, "store.db"));
    expect(await s.get("nope")).toBeUndefined();
    s.close();
  });
});

describe("openStore", () => {
  it("opens FileStore for .json paths", async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), "hitl-open-test-"));
    const s = openStore(path.join(dir, "q.json"));
    expect(s).toBeInstanceOf(FileStore);
    await fs.rm(dir, { recursive: true, force: true });
  });

  it.skipIf(!sqliteAvailable())("opens SqliteStore for .db paths", async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), "hitl-open-test-"));
    const s = openStore(path.join(dir, "q.db"));
    expect(s).toBeInstanceOf(SqliteStore);
    (s as SqliteStore).close();
    await fs.rm(dir, { recursive: true, force: true });
  });
});
