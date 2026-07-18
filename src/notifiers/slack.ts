import type { ReviewItem } from "../types.js";
import type { Notifier } from "./base.js";

export interface SlackNotifierOptions {
  webhookUrl: string;
  /** Optional builder that returns a link into your own review UI for each item. */
  reviewUrlBuilder?: (item: ReviewItem) => string;
  fetchImpl?: typeof fetch;
}

export class SlackNotifier implements Notifier {
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly opts: SlackNotifierOptions) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async notify(item: ReviewItem): Promise<void> {
    const link = this.opts.reviewUrlBuilder?.(item);
    const linkLine = link ? `\n<${link}|Open review ${item.id}>` : "";
    const text =
      `*New review needed* · \`${item.system}\` · confidence ${item.confidence.toFixed(2)}\n` +
      `> ${truncate(item.output, 300)}${linkLine}`;

    const response = await this.fetchImpl(this.opts.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!response.ok) {
      throw new Error(
        `Slack webhook rejected notification: ${response.status} ${response.statusText}`,
      );
    }
  }
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}
