import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { HitlQueue } from "../src/queue.js";
import { startServer, type StartedServer } from "../src/server.js";
import { MemoryStore } from "../src/storage/memory.js";

let server: StartedServer;
let queue: HitlQueue;

beforeEach(async () => {
  queue = new HitlQueue({ storage: new MemoryStore(), threshold: 0.85 });
  // port 0 = OS assigns a free ephemeral port — parallel-safe.
  server = await startServer({ queue, port: 0, host: "127.0.0.1" });
});
afterEach(async () => {
  await server.close();
});

async function api(path: string, init?: RequestInit): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${server.url}${path}`, init);
  const text = await res.text();
  const body = text.length ? JSON.parse(text) : null;
  return { status: res.status, body };
}

describe("dashboard server", () => {
  it("GET /api/items returns pending items by default when ?status=pending", async () => {
    await queue.submit({ system: "s", input: "i", output: "iffy", confidence: 0.4 });
    await queue.submit({ system: "s", input: "i", output: "fine", confidence: 0.95 });

    const { status, body } = await api("/api/items?status=pending");
    expect(status).toBe(200);
    const items = (body as { items: unknown[] }).items;
    expect(items).toHaveLength(1);
  });

  it("GET /api/items?status=approved returns only approved items", async () => {
    await queue.submit({ system: "s", input: "i", output: "auto", confidence: 0.95 });
    const { body } = await api("/api/items?status=approved");
    const items = (body as { items: unknown[] }).items;
    expect(items).toHaveLength(1);
  });

  it("GET /api/items/:id returns the record", async () => {
    const submitted = await queue.submit({ system: "s", input: "i", output: "x", confidence: 0.4 });
    const { status, body } = await api(`/api/items/${submitted.id}`);
    expect(status).toBe(200);
    expect((body as { id: string }).id).toBe(submitted.id);
  });

  it("GET /api/items/:missing returns 404", async () => {
    const { status } = await api("/api/items/does-not-exist");
    expect(status).toBe(404);
  });

  it("POST /api/items/:id/approve records the decision", async () => {
    const submitted = await queue.submit({ system: "s", input: "i", output: "x", confidence: 0.4 });
    const { status, body } = await api(`/api/items/${submitted.id}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reviewer: "sarah" }),
    });
    expect(status).toBe(200);
    const item = body as { status: string; decidedBy: string };
    expect(item.status).toBe("approved");
    expect(item.decidedBy).toBe("sarah");
  });

  it("POST /api/items/:id/edit stores revisedOutput", async () => {
    const submitted = await queue.submit({ system: "s", input: "i", output: "old", confidence: 0.4 });
    const { status, body } = await api(`/api/items/${submitted.id}/edit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reviewer: "sarah", revisedOutput: "new" }),
    });
    expect(status).toBe(200);
    expect((body as { revisedOutput: string }).revisedOutput).toBe("new");
  });

  it("POST /api/items/:id/reject stores the reason", async () => {
    const submitted = await queue.submit({ system: "s", input: "i", output: "x", confidence: 0.4 });
    const { body } = await api(`/api/items/${submitted.id}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reviewer: "sarah", reason: "wrong" }),
    });
    expect((body as { rejectionReason: string }).rejectionReason).toBe("wrong");
  });

  it("POST decide-twice returns 400", async () => {
    const submitted = await queue.submit({ system: "s", input: "i", output: "x", confidence: 0.4 });
    await api(`/api/items/${submitted.id}/approve`, {
      method: "POST",
      body: JSON.stringify({ reviewer: "s" }),
    });
    const { status } = await api(`/api/items/${submitted.id}/reject`, {
      method: "POST",
      body: JSON.stringify({ reviewer: "s" }),
    });
    expect(status).toBe(400);
  });

  it("GET / serves the SPA shell HTML", async () => {
    const res = await fetch(`${server.url}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    const text = await res.text();
    expect(text).toContain("hitl-review · dashboard");
  });

  it("GET unknown route returns 404 JSON", async () => {
    const { status, body } = await api("/nope");
    expect(status).toBe(404);
    expect((body as { error: string }).error).toBe("not_found");
  });
});
