#!/usr/bin/env node
import { HitlQueue } from "./queue.js";
import { FileStore } from "./storage/file.js";
import type { ReviewItem } from "./types.js";

const DEFAULT_DB = process.env.HITL_DB ?? "./hitl.db.json";

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);
  if (!command || command === "help" || command === "--help" || command === "-h") {
    printHelp();
    return;
  }

  const queue = new HitlQueue({ storage: new FileStore(DEFAULT_DB) });

  switch (command) {
    case "list":
      return listCmd(queue, parseArgs(rest));
    case "show":
      return showCmd(queue, rest);
    case "approve":
      return approveCmd(queue, rest, parseArgs(rest));
    case "edit":
      return editCmd(queue, rest, parseArgs(rest));
    case "reject":
      return rejectCmd(queue, rest, parseArgs(rest));
    default:
      console.error(`unknown command: ${command}\n`);
      printHelp();
      process.exit(1);
  }
}

function printHelp(): void {
  console.log(`hitl-review — reviewer CLI

Usage:
  hitl-review list [--status pending|approved|rejected]
  hitl-review show <id>
  hitl-review approve <id> [--reviewer name]
  hitl-review edit    <id> --output "..."      [--reviewer name]
  hitl-review reject  <id> [--reason "..."]    [--reviewer name]

Storage path: HITL_DB env (default: ./hitl.db.json)
Reviewer identity defaults to $USER or 'anonymous'.
`);
}

async function listCmd(queue: HitlQueue, args: Record<string, string>): Promise<void> {
  const status = (args.status ?? "pending") as ReviewItem["status"];
  const items = await queue.list({ status });
  if (items.length === 0) {
    console.log(`no items with status=${status}`);
    return;
  }
  console.log(`id           system              confidence  created`);
  console.log(`-----------  ------------------  ----------  --------------------`);
  for (const i of items) {
    console.log(
      `${i.id.padEnd(11)}  ${i.system.slice(0, 18).padEnd(18)}  ${i.confidence.toFixed(2).padEnd(10)}  ${i.createdAt}`,
    );
  }
}

async function showCmd(queue: HitlQueue, positional: string[]): Promise<void> {
  const id = firstPositional(positional);
  const item = await queue.get(id);
  if (!item) {
    console.error(`no item with id ${id}`);
    process.exit(1);
  }
  console.log(JSON.stringify(item, null, 2));
}

async function approveCmd(
  queue: HitlQueue,
  positional: string[],
  args: Record<string, string>,
): Promise<void> {
  const id = firstPositional(positional);
  const item = await queue.decide(id, { reviewer: reviewer(args), action: "approve" });
  console.log(`approved ${id} (by ${item.decidedBy})`);
}

async function editCmd(
  queue: HitlQueue,
  positional: string[],
  args: Record<string, string>,
): Promise<void> {
  const id = firstPositional(positional);
  const revisedOutput = args.output;
  if (!revisedOutput) {
    console.error("edit requires --output '...'");
    process.exit(1);
  }
  const item = await queue.decide(id, {
    reviewer: reviewer(args),
    action: "edit",
    revisedOutput,
  });
  console.log(`edited + approved ${id} (by ${item.decidedBy})`);
}

async function rejectCmd(
  queue: HitlQueue,
  positional: string[],
  args: Record<string, string>,
): Promise<void> {
  const id = firstPositional(positional);
  const item = await queue.decide(id, {
    reviewer: reviewer(args),
    action: "reject",
    reason: args.reason,
  });
  console.log(`rejected ${id} (by ${item.decidedBy}): ${item.rejectionReason}`);
}

function firstPositional(tokens: string[]): string {
  const id = tokens.find((t) => !t.startsWith("--"));
  if (!id) {
    console.error("missing id argument");
    process.exit(1);
  }
  return id;
}

function reviewer(args: Record<string, string>): string {
  return args.reviewer ?? process.env.USER ?? process.env.USERNAME ?? "anonymous";
}

function parseArgs(tokens: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i]!;
    if (!tok.startsWith("--")) continue;
    const key = tok.slice(2);
    const next = tokens[i + 1];
    if (next && !next.startsWith("--")) {
      out[key] = next;
      i++;
    } else {
      out[key] = "true";
    }
  }
  return out;
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.stack ?? err.message : String(err);
  console.error("hitl-review:", message);
  process.exit(1);
});
