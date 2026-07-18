import type { ReviewItem } from "../types.js";

export interface Notifier {
  notify(item: ReviewItem): Promise<void>;
}
