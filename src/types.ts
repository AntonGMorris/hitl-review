export type ReviewStatus = "approved" | "rejected" | "pending";

export interface ReviewItem {
  id: string;
  system: string;
  input: string;
  output: string;
  confidence: number;
  status: ReviewStatus;
  context: Record<string, unknown>;
  createdAt: string;
  decidedAt: string | null;
  decidedBy: string | null;
  revisedOutput: string | null;
  rejectionReason: string | null;
}

export interface SubmitInput {
  system: string;
  input: string;
  output: string;
  confidence: number;
  context?: Record<string, unknown>;
}

/**
 * The result of {@link HitlQueue.submit}.
 *
 * - `status: "approved"` — the confidence was above threshold, output passes through
 *   untouched. `output` is the original output.
 * - `status: "pending"` — the item was queued for human review. `output` is undefined;
 *   fetch the decided record later via `queue.get(id)`.
 * - `status: "rejected"` — reserved for future auto-reject rules (e.g. output filters).
 *   Not emitted by v0.1's threshold-only routing.
 */
export type SubmitResult =
  | { id: string; status: "approved"; output: string }
  | { id: string; status: "pending"; output: null }
  | { id: string; status: "rejected"; output: null; rejectionReason: string };

export interface Decision {
  reviewer: string;
  action: "approve" | "edit" | "reject";
  revisedOutput?: string;
  reason?: string;
}
