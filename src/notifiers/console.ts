import type { ReviewItem } from "../types.js";
import type { Notifier } from "./base.js";

export class ConsoleNotifier implements Notifier {
  async notify(item: ReviewItem): Promise<void> {
    console.log(
      `[hitl-review] pending ${item.id} · ${item.system} · confidence ${item.confidence.toFixed(2)}`,
    );
  }
}
