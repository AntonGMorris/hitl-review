// One-off seed script used to populate a demo DB for the marketing screenshot.
// Not shipped in the package — this file lives at the repo root and is not
// referenced from any published surface.
import { promises as fs } from "node:fs";

const dbPath = process.env.HITL_DB ?? "./demo.db.json";

const now = new Date("2026-07-19T09:14:00Z").toISOString();
const t = (mMinusAgo) => new Date(new Date(now).getTime() - mMinusAgo * 60_000).toISOString();

const seedItems = [
  {
    id: "r_9k2f7a",
    system: "email-drafter",
    input: "Draft a reply to Bethan Ellis about the Thursday 2pm delivery slot for order INV-2026-411.",
    output:
      "Hi Bethan,\n\nThanks for confirming. I've booked you in for Thursday 2pm — the driver will call 30 minutes ahead as usual.\n\nAll the best,\nAnton",
    confidence: 0.72,
    status: "pending",
    context: { agent_version: "v3", temperature: 0.7, replied_to: "b.ellis@snowdon-freight.co.uk" },
    createdAt: t(0),
    decidedAt: null,
    decidedBy: null,
    revisedOutput: null,
    rejectionReason: null,
  },
  {
    id: "r_8mp3b1",
    system: "support-summariser",
    input: "Summarise the last 5 messages in ticket #4482 for the escalation queue.",
    output:
      "Customer reports intermittent 502s since Tuesday, mostly evenings. Restart cycle at 21:04 UTC caused the initial outage. Fix rolled back on Wednesday, since then no repeat but customer still cautious.",
    confidence: 0.61,
    status: "pending",
    context: { ticket_id: 4482, thread_length: 5 },
    createdAt: t(3),
    decidedAt: null,
    decidedBy: null,
    revisedOutput: null,
    rejectionReason: null,
  },
  {
    id: "r_7nq0c8",
    system: "invoice-extractor",
    input: "Extract line items from snowdon-2026-411.pdf",
    output:
      'Supplier: Snowdon Freight Ltd  ·  Invoice #: 2026-411  ·  Total: £1,842.60\n1 line item: "Cardiff to Newport haulage · 6 pallets" @ £307.10 (VAT 20%)',
    confidence: 0.58,
    status: "pending",
    context: {
      source_pdf: "snowdon-2026-411.pdf",
      extraction_notes: "Multi-page invoice, VAT number partially cropped on page 2. Verify VAT rate against supplier profile before push.",
    },
    createdAt: t(7),
    decidedAt: null,
    decidedBy: null,
    revisedOutput: null,
    rejectionReason: null,
  },
  {
    id: "r_6xh2e4",
    system: "email-drafter",
    input: "Draft a decline to a sponsor pitch that isn't a fit.",
    output:
      "Hi Marcus,\n\nAppreciate the note. Not a fit for us this quarter — happy to reconnect if the scope changes.\n\nBest,\nAnton",
    confidence: 0.94,
    status: "approved",
    context: { auto_approved: true, threshold: 0.85 },
    createdAt: t(22),
    decidedAt: t(22),
    decidedBy: "auto:threshold",
    revisedOutput: null,
    rejectionReason: null,
  },
];

await fs.writeFile(dbPath, JSON.stringify({ version: 1, items: seedItems }, null, 2), "utf8");
console.log(`seeded ${seedItems.length} items → ${dbPath}`);
