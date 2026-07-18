import { describe, expect, it } from "vitest";

import { HitlQueue } from "../src/queue.js";
import { MemoryStore } from "../src/storage/memory.js";

describe("HitlQueue threshold validation", () => {
  it("accepts thresholds > 1 as 'always review'", async () => {
    const queue = new HitlQueue({
      threshold: Infinity,
      storage: new MemoryStore(),
    });
    const r = await queue.submit({
      system: "s",
      input: "i",
      output: "o",
      confidence: 1.0,
    });
    expect(r.status).toBe("pending");
  });

  it("rejects negative thresholds", () => {
    expect(() => new HitlQueue({ threshold: -0.1 })).toThrow(/>= 0/);
  });

  it("rejects NaN thresholds", () => {
    expect(() => new HitlQueue({ threshold: Number.NaN })).toThrow(/>= 0/);
  });
});
