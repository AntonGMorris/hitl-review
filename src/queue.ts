import { randomBytes } from "node:crypto";

import type { Notifier } from "./notifiers/base.js";
import { MemoryStore } from "./storage/memory.js";
import type { ReviewStore } from "./storage/base.js";
import type { Decision, ReviewItem, SubmitInput, SubmitResult } from "./types.js";

export interface HitlQueueOptions {
  /** Auto-approve when confidence ≥ threshold. Defaults to 0.85. */
  threshold?: number;
  /** Where review items live. Defaults to a MemoryStore. */
  storage?: ReviewStore;
  /** Fired when an item lands below threshold and enters the queue. Optional. */
  notifier?: Notifier;
  /** Injectable clock — mainly for tests. */
  now?: () => Date;
  /** Injectable id generator — mainly for tests. */
  idGen?: () => string;
}

export class HitlQueue {
  private readonly threshold: number;
  private readonly storage: ReviewStore;
  private readonly notifier: Notifier | undefined;
  private readonly now: () => Date;
  private readonly idGen: () => string;

  constructor(opts: HitlQueueOptions = {}) {
    if (opts.threshold !== undefined && (opts.threshold < 0 || opts.threshold > 1)) {
      throw new Error(`threshold must be between 0 and 1, got ${opts.threshold}`);
    }
    this.threshold = opts.threshold ?? 0.85;
    this.storage = opts.storage ?? new MemoryStore();
    this.notifier = opts.notifier;
    this.now = opts.now ?? (() => new Date());
    this.idGen = opts.idGen ?? defaultId;
  }

  async submit(input: SubmitInput): Promise<SubmitResult> {
    validateSubmit(input);
    const id = this.idGen();
    const createdAt = this.now().toISOString();

    if (input.confidence >= this.threshold) {
      const item: ReviewItem = {
        id,
        system: input.system,
        input: input.input,
        output: input.output,
        confidence: input.confidence,
        context: input.context ?? {},
        status: "approved",
        createdAt,
        decidedAt: createdAt,
        decidedBy: "auto:threshold",
        revisedOutput: null,
        rejectionReason: null,
      };
      await this.storage.save(item);
      return { id, status: "approved", output: input.output };
    }

    const item: ReviewItem = {
      id,
      system: input.system,
      input: input.input,
      output: input.output,
      confidence: input.confidence,
      context: input.context ?? {},
      status: "pending",
      createdAt,
      decidedAt: null,
      decidedBy: null,
      revisedOutput: null,
      rejectionReason: null,
    };
    await this.storage.save(item);

    if (this.notifier) {
      try {
        await this.notifier.notify(item);
      } catch (err) {
        // Notifier failures must never lose the queued item. Log to stderr
        // and let the caller inspect the notifier separately.
        console.error(`[hitl-review] notifier failed for ${id}:`, err);
      }
    }

    return { id, status: "pending", output: null };
  }

  async get(id: string): Promise<ReviewItem | undefined> {
    return this.storage.get(id);
  }

  async list(filter?: { status?: ReviewItem["status"] }): Promise<ReviewItem[]> {
    return this.storage.list(filter);
  }

  async decide(id: string, decision: Decision): Promise<ReviewItem> {
    const item = await this.storage.get(id);
    if (!item) throw new Error(`review ${id} not found`);
    if (item.status !== "pending") {
      throw new Error(`review ${id} already decided (${item.status})`);
    }

    const decidedAt = this.now().toISOString();
    const next: ReviewItem = {
      ...item,
      decidedAt,
      decidedBy: decision.reviewer,
    };

    switch (decision.action) {
      case "approve":
        next.status = "approved";
        break;
      case "edit":
        if (!decision.revisedOutput || decision.revisedOutput === item.output) {
          throw new Error("edit requires revisedOutput different from the original");
        }
        next.status = "approved";
        next.revisedOutput = decision.revisedOutput;
        break;
      case "reject":
        next.status = "rejected";
        next.rejectionReason = decision.reason ?? "no reason given";
        break;
    }

    await this.storage.save(next);
    return next;
  }
}

function validateSubmit(input: SubmitInput): void {
  if (!input.system) throw new Error("submit: system is required");
  if (!input.output) throw new Error("submit: output is required");
  if (typeof input.confidence !== "number" || Number.isNaN(input.confidence)) {
    throw new Error("submit: confidence must be a number");
  }
  if (input.confidence < 0 || input.confidence > 1) {
    throw new Error(`submit: confidence must be between 0 and 1, got ${input.confidence}`);
  }
}

function defaultId(): string {
  return "r_" + randomBytes(4).toString("hex");
}
