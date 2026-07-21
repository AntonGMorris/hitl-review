import { promises as fs } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { HitlQueue } from "./queue.js";
import { openStore } from "./storage/index.js";
import type { Decision, ReviewItem } from "./types.js";

export interface ServeOptions {
  queue: HitlQueue;
  port?: number;
  host?: string;
}

export interface StartedServer {
  server: Server;
  port: number;
  url: string;
  close: () => Promise<void>;
}

const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public");

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

export function startServer(opts: ServeOptions): Promise<StartedServer> {
  const host = opts.host ?? "127.0.0.1";
  const port = opts.port ?? 3737;

  const server = createServer(async (req, res) => {
    try {
      await handle(req, res, opts.queue);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      writeJson(res, 500, { error: "internal", message });
    }
  });

  return new Promise((resolve, reject) => {
    server.on("error", reject);
    server.listen(port, host, () => {
      const address = server.address();
      const actualPort = typeof address === "object" && address ? address.port : port;
      resolve({
        server,
        port: actualPort,
        url: `http://${host}:${actualPort}`,
        close: () => new Promise((r) => server.close(() => r())),
      });
    });
  });
}

/** Convenience: open a store for the path (JSON or SQLite by extension), wrap in a queue, start the server. */
export async function startFromFile(dbPath: string, opts: { port?: number; host?: string } = {}): Promise<StartedServer> {
  const queue = new HitlQueue({ storage: openStore(dbPath) });
  return startServer({ queue, ...opts });
}

async function handle(req: IncomingMessage, res: ServerResponse, queue: HitlQueue): Promise<void> {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const method = req.method ?? "GET";

  // API routes.
  if (url.pathname === "/api/items" && method === "GET") {
    const status = url.searchParams.get("status") as ReviewItem["status"] | null;
    const items = await queue.list(status ? { status } : undefined);
    return writeJson(res, 200, { items });
  }

  const itemMatch = /^\/api\/items\/([^/]+)$/.exec(url.pathname);
  if (itemMatch && method === "GET") {
    const item = await queue.get(itemMatch[1]!);
    if (!item) return writeJson(res, 404, { error: "not_found" });
    return writeJson(res, 200, item);
  }

  const decideMatch = /^\/api\/items\/([^/]+)\/(approve|edit|reject)$/.exec(url.pathname);
  if (decideMatch && method === "POST") {
    const [, id, action] = decideMatch as unknown as [string, string, Decision["action"]];
    const body = await readJsonBody(req);
    const decision: Decision = {
      action,
      reviewer: typeof body.reviewer === "string" && body.reviewer ? body.reviewer : "dashboard",
      revisedOutput: typeof body.revisedOutput === "string" ? body.revisedOutput : undefined,
      reason: typeof body.reason === "string" ? body.reason : undefined,
    };
    try {
      const item = await queue.decide(id, decision);
      return writeJson(res, 200, item);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return writeJson(res, 400, { error: "decide_failed", message });
    }
  }

  // Static files.
  if (method === "GET") {
    const rel = url.pathname === "/" ? "/index.html" : url.pathname;
    const file = path.join(PUBLIC_DIR, rel);
    // Prevent path traversal: ensure the resolved path is still inside PUBLIC_DIR.
    if (!file.startsWith(PUBLIC_DIR + path.sep) && file !== path.join(PUBLIC_DIR, "index.html")) {
      return writeJson(res, 403, { error: "forbidden" });
    }
    try {
      const content = await fs.readFile(file);
      const ext = path.extname(file).toLowerCase();
      res.writeHead(200, { "Content-Type": CONTENT_TYPES[ext] ?? "application/octet-stream" });
      res.end(content);
      return;
    } catch {
      /* fall through to 404 */
    }
  }

  writeJson(res, 404, { error: "not_found" });
}

function writeJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  if (chunks.length === 0) return {};
  const text = Buffer.concat(chunks).toString("utf8");
  try {
    const parsed = JSON.parse(text) as unknown;
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
