import { describe, expect, it, vi } from "vitest";

import { HitlQueue } from "../src/queue.js";
import { MemoryStore } from "../src/storage/memory.js";
import type { Notifier } from "../src/notifiers/base.js";

function fixedClock(): { now: () => Date; advance: (ms: number) => void } {
  let t = new Date("2026-07-18T12:00:00Z").getTime();
  return {
    now: () => new Date(t),
    advance: (ms) => {
      t += ms;
    },
  };
}

let counter = 0;
const testId = (): string => `r_test${(++counter).toString().padStart(3, "0")}`;

describe("HitlQueue", () => {
  it("auto-approves when confidence meets threshold", async () => {
    const queue = new HitlQueue({ threshold: 0.85, idGen: testId });
    const result = await queue.submit({
      system: "email",
      input: "hi",
      output: "hello there",
      confidence: 0.95,
    });
    expect(result.status).toBe("approved");
    expect(result.output).toBe("hello there");
  });

  it("queues below threshold and returns pending with no output", async () => {
    const queue = new HitlQueue({ threshold: 0.85, idGen: testId });
    const result = await queue.submit({
      system: "email",
      input: "hi",
      output: "iffy draft",
      confidence: 0.6,
    });
    expect(result.status).toBe("pending");
    expect(result.output).toBeNull();
  });

  it("fires the notifier for pending items only", async () => {
    const notify = vi.fn(async () => undefined);
    const notifier: Notifier = { notify };
    const queue = new HitlQueue({ threshold: 0.85, notifier, idGen: testId });

    await queue.submit({ system: "e", input: "i", output: "a", confidence: 0.9 });
    expect(notify).not.toHaveBeenCalled();

    await queue.submit({ system: "e", input: "i", output: "b", confidence: 0.5 });
    expect(notify).toHaveBeenCalledOnce();
  });

  it("swallows notifier failures without losing the item", async () => {
    const notifier: Notifier = {
      notify: vi.fn(async () => {
        throw new Error("slack down");
      }),
    };
    const storage = new MemoryStore();
    const queue = new HitlQueue({ threshold: 0.85, notifier, storage, idGen: testId });

    const result = await queue.submit({ system: "e", input: "i", output: "x", confidence: 0.4 });
    expect(result.status).toBe("pending");

    const stored = await storage.get(result.id);
    expect(stored?.status).toBe("pending");
  });

  it("records reviewer + decidedAt on approve", async () => {
    const clock = fixedClock();
    const queue = new HitlQueue({ threshold: 0.85, now: clock.now, idGen: testId });
    const submitted = await queue.submit({
      system: "e",
      input: "i",
      output: "draft",
      confidence: 0.4,
    });
    clock.advance(60_000);

    const item = await queue.decide(submitted.id, { reviewer: "sarah@team", action: "approve" });
    expect(item.status).toBe("approved");
    expect(item.decidedBy).toBe("sarah@team");
    expect(item.decidedAt).toBe("2026-07-18T12:01:00.000Z");
  });

  it("stores revisedOutput on edit", async () => {
    const queue = new HitlQueue({ threshold: 0.85, idGen: testId });
    const submitted = await queue.submit({
      system: "e",
      input: "i",
      output: "draft",
      confidence: 0.4,
    });

    const item = await queue.decide(submitted.id, {
      reviewer: "sarah",
      action: "edit",
      revisedOutput: "polished draft",
    });
    expect(item.status).toBe("approved");
    expect(item.revisedOutput).toBe("polished draft");
  });

  it("rejects edit with identical output", async () => {
    const queue = new HitlQueue({ threshold: 0.85, idGen: testId });
    const submitted = await queue.submit({
      system: "e",
      input: "i",
      output: "same",
      confidence: 0.4,
    });
    await expect(
      queue.decide(submitted.id, { reviewer: "s", action: "edit", revisedOutput: "same" }),
    ).rejects.toThrow(/different from the original/);
  });

  it("refuses to decide the same item twice", async () => {
    const queue = new HitlQueue({ threshold: 0.85, idGen: testId });
    const submitted = await queue.submit({
      system: "e",
      input: "i",
      output: "draft",
      confidence: 0.4,
    });
    await queue.decide(submitted.id, { reviewer: "s", action: "approve" });
    await expect(
      queue.decide(submitted.id, { reviewer: "s", action: "reject" }),
    ).rejects.toThrow(/already decided/);
  });

  it("validates confidence range", async () => {
    const queue = new HitlQueue({ threshold: 0.85, idGen: testId });
    await expect(
      queue.submit({ system: "e", input: "i", output: "x", confidence: 1.5 }),
    ).rejects.toThrow(/between 0 and 1/);
  });

  it("list filters by status", async () => {
    const queue = new HitlQueue({ threshold: 0.85, idGen: testId });
    await queue.submit({ system: "e", input: "i", output: "hi", confidence: 0.95 });
    await queue.submit({ system: "e", input: "i", output: "iffy", confidence: 0.3 });

    const pending = await queue.list({ status: "pending" });
    const approved = await queue.list({ status: "approved" });
    expect(pending).toHaveLength(1);
    expect(approved).toHaveLength(1);
  });
});
