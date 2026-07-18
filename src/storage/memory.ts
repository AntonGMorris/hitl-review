import type { ReviewItem } from "../types.js";
import type { ReviewStore } from "./base.js";

export class MemoryStore implements ReviewStore {
  private readonly items = new Map<string, ReviewItem>();

  async save(item: ReviewItem): Promise<void> {
    this.items.set(item.id, { ...item });
  }

  async get(id: string): Promise<ReviewItem | undefined> {
    const item = this.items.get(id);
    return item ? { ...item } : undefined;
  }

  async list(filter?: { status?: ReviewItem["status"] }): Promise<ReviewItem[]> {
    const all = Array.from(this.items.values()).map((i) => ({ ...i }));
    if (!filter?.status) return all;
    return all.filter((i) => i.status === filter.status);
  }
}
