# hitl-review

[![CI](https://github.com/AntonGMorris/hitl-review/actions/workflows/ci.yml/badge.svg)](https://github.com/AntonGMorris/hitl-review/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)](https://nodejs.org)

**Drop-in human-in-the-loop review for any AI system.**

Wrap an AI output with one function call. Set a confidence threshold. Anything below it lands in a review queue where a human approves, rejects, or edits before it reaches your customer. Anything above passes through untouched. Zero native dependencies, works out of the box, self-hosts anywhere Node runs.

> **Status: alpha (v0.1).** Core queue, JSON-file + in-memory storage, console + Slack-webhook notifiers, reviewer CLI. Postgres backend, web review UI, and per-reviewer analytics on the roadmap.

---

## Why

Every AI project hits the same problem: the model is 90% right, and the 10% you get wrong is embarrassing (or expensive). The teams that ship well put a human in the loop for the low-confidence cases. The teams that ship badly bodge it with Slack channels, Google Sheets, and Airtable — which doesn't scale, doesn't audit, and doesn't feed back into evaluation.

`hitl-review` is a small library that does the boring plumbing properly: threshold routing, structured review records, notifier hooks, and a reviewer CLI. Twenty lines of code to wire into any agent.

## Install

```bash
npm install @antongmorris/hitl-review
```

Requires Node.js 20+.

## Quick start

```ts
import { HitlQueue, FileStore, SlackNotifier } from "@antongmorris/hitl-review";

const queue = new HitlQueue({
  storage: new FileStore("./hitl.db.json"),
  threshold: 0.85,
  notifier: new SlackNotifier({ webhookUrl: process.env.SLACK_WEBHOOK! }),
});

// Somewhere in your agent:
const draft = await model.generateEmail(prompt);

const result = await queue.submit({
  system: "email-drafter",
  input: prompt,
  output: draft.text,
  confidence: draft.confidence,
});

if (result.status === "approved") {
  await sendEmail(result.output);
} else if (result.status === "pending") {
  // Below threshold — reviewer will be notified. Fetch later.
  console.log(`Awaiting review: ${result.id}`);
}
```

That's it. Above the threshold → pass-through with `status: "approved"`. Below → the item is stored, the notifier fires, and a reviewer decides via the CLI or your own UI.

## Reviewer CLI

```bash
# List everything awaiting review
npx hitl-review list

# See full detail on one item
npx hitl-review show r_abc123

# Approve (unchanged output)
npx hitl-review approve r_abc123

# Approve with an edited output
npx hitl-review edit r_abc123 --output "the revised text"

# Reject
npx hitl-review reject r_abc123 --reason "hallucinated a fact"
```

Every decision is timestamped and includes the reviewer identity (`$USER` by default, or `--reviewer someone@team`).

## Example — reviewer flow

```
$ npx hitl-review list
id           system              confidence  created
-----------  ------------------  ----------  --------------------
r_9k2f7a     email-drafter       0.72        2026-07-18T14:22:05Z
r_8mp3b1     support-summariser  0.61        2026-07-18T14:19:41Z
r_7nq0c8     invoice-extractor   0.58        2026-07-18T14:17:03Z

$ npx hitl-review edit r_9k2f7a --output "Hi Bethan, that Thursday slot works — booked."
edited + approved r_9k2f7a (by sarah)
```

Every action is stored with the original AI output, the revised (if edited), the reviewer, and a timestamp. Full trail of what the AI proposed vs. what actually went out.

## Storage adapters

Two ship in v0.1:

- **`MemoryStore`** — everything in-process. Good for tests and single-run scripts.
- **`FileStore("./hitl.db.json")`** — atomic JSON file with per-write flush. Good for single-instance deployments up to a few thousand items. Zero native dependencies.

Bring your own by implementing the `ReviewStore` interface (three methods: `save`, `get`, `list`). Postgres and Redis adapters land in v0.2.

## Notifier adapters

- **`ConsoleNotifier`** — logs to stdout. Fine for local dev.
- **`SlackNotifier`** — POSTs to a Slack incoming webhook with the item summary + a link to your review UI (if you set `reviewUrlBuilder`).

Bring your own: implement `notify(item)`. Email (Resend/Sendgrid) and SMS (Twilio) adapters on the roadmap.

## What a review record looks like

```json
{
  "id": "r_9k2f7a",
  "system": "email-drafter",
  "input": "Draft a reply to Bethan about the delivery slot",
  "output": "Hi Bethan, I've booked you in for...",
  "confidence": 0.72,
  "status": "pending",
  "context": { "agent_version": "v3", "temperature": 0.7 },
  "createdAt": "2026-07-18T14:22:05.113Z",
  "decidedAt": null,
  "decidedBy": null,
  "revisedOutput": null,
  "rejectionReason": null
}
```

## Roadmap

- **v0.2** — Postgres storage adapter + a small React review-queue UI.
- **v0.3** — Email (Resend) + SMS (Twilio) notifiers.
- **v0.4** — Per-reviewer analytics (avg time, approval rate, edit distance).
- **v0.5** — Webhook callback on decision so upstream agents can resume automatically.

## Honest caveats

- The `FileStore` is fine for single-instance deployments. Multi-instance needs Postgres — coming in v0.2.
- v0.1 has no built-in review UI. You either use the CLI or build a UI on top of the storage interface. The React UI ships in v0.2.
- No auth on the CLI — `--reviewer` is trusted. If you need signed reviewer identity, wire your own check on top or wait for v0.2 dashboard auth.

## Part of the AI-governance stack

This repo is one of five that ship together as a coherent AI-governance stack. Each is standalone; they compose.

| Repo | What it is |
|---|---|
| [`companies-house-mcp`](https://github.com/AntonGMorris/companies-house-mcp) | Production-grade MCP server for the UK Companies House API. |
| [`prompt-injection-lab`](https://github.com/AntonGMorris/prompt-injection-lab) | Automated red-team suite. Fires known injection payloads at any AI endpoint. |
| [`hitl-review`](https://github.com/AntonGMorris/hitl-review) | **You are here.** Drop-in human-in-the-loop review queue. |
| [`audit-log-llm`](https://github.com/AntonGMorris/audit-log-llm) | GDPR-friendly structured audit logging for LLM calls. |
| [`lead-qual-agent`](https://github.com/AntonGMorris/lead-qual-agent) | Example agent that composes all of the above. |

Built and maintained by [Anton Morris](https://antonmorris.co.uk).

## License

MIT. See `LICENSE`.
