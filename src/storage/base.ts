import type { ReviewItem } from "../types.js";

export interface ReviewStore {
  save(item: ReviewItem): Promise<void>;
  get(id: string): Promise<ReviewItem | undefined>;
  list(filter?: { status?: ReviewItem["status"] }): Promise<ReviewItem[]>;
}
