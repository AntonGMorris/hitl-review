import { promises as fs } from "node:fs";
import * as path from "node:path";

import type { ReviewItem } from "../types.js";
import type { ReviewStore } from "./base.js";

interface FileData {
  version: 1;
  items: ReviewItem[];
}

/**
 * Atomic JSON-file store. Serialises writes through a single in-memory queue
 * so concurrent `save` calls don't clobber each other. Fine for single-instance
 * deployments up to a few thousand items — swap for Postgres in v0.2 for scale
 * or multi-instance.
 */
export class FileStore implements ReviewStore {
  private writeChain: Promise<void> = Promise.resolve();

  constructor(private readonly filePath: string) {}

  async save(item: ReviewItem): Promise<void> {
    await this.enqueue(async () => {
      const data = await this.read();
      const idx = data.items.findIndex((i) => i.id === item.id);
      if (idx === -1) data.items.push({ ...item });
      else data.items[idx] = { ...item };
      await this.write(data);
    });
  }

  async get(id: string): Promise<ReviewItem | undefined> {
    const data = await this.read();
    const item = data.items.find((i) => i.id === id);
    return item ? { ...item } : undefined;
  }

  async list(filter?: { status?: ReviewItem["status"] }): Promise<ReviewItem[]> {
    const data = await this.read();
    if (!filter?.status) return data.items.map((i) => ({ ...i }));
    return data.items.filter((i) => i.status === filter.status).map((i) => ({ ...i }));
  }

  private enqueue(task: () => Promise<void>): Promise<void> {
    const next = this.writeChain.then(task, task);
    this.writeChain = next.catch(() => undefined);
    return next;
  }

  private async read(): Promise<FileData> {
    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as FileData;
      if (parsed.version !== 1 || !Array.isArray(parsed.items)) {
        throw new Error(`unrecognised store schema at ${this.filePath}`);
      }
      return parsed;
    } catch (err: unknown) {
      if (isMissingFileError(err)) return { version: 1, items: [] };
      throw err;
    }
  }

  private async write(data: FileData): Promise<void> {
    const dir = path.dirname(this.filePath);
    await fs.mkdir(dir, { recursive: true });
    const tmp = `${this.filePath}.tmp-${process.pid}-${Date.now()}`;
    await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
    await fs.rename(tmp, this.filePath);
  }
}

function isMissingFileError(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "ENOENT";
}
