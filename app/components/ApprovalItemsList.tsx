"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import PilotFeedbackControls, {
  type PilotFeedbackSelection
} from "@/app/components/PilotFeedbackControls";
import {
  approveApprovalItem,
  markApprovalNeedsRevision,
  rejectApprovalItem,
  refreshMeetingPrepApproval
} from "@/lib/approvals/actions";
import {
  AI_GENERATED_WARNING,
  APPROVAL_TYPE_LABELS,
  type ApprovalItem
} from "@/lib/approvals/types";

const EMPTY_FEEDBACK: PilotFeedbackSelection = {
  categories: [],
  usefulnessScore: null,
  savedTimeMinutes: null
};

export default function ApprovalItemsList({
  items,
  canAct,
  page,
  pageSize,
  total,
  queryString
}: {
  items: ApprovalItem[];
  canAct: boolean;
  page: number;
  pageSize: number;
  total: number;
  queryString: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedbackByItem, setFeedbackByItem] = useState<
    Record<string, PilotFeedbackSelection>
  >({});

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  function feedbackFor(itemId: string): PilotFeedbackSelection {
    return feedbackByItem[itemId] ?? EMPTY_FEEDBACK;
  }

  function setFeedback(itemId: string, next: PilotFeedbackSelection) {
    setFeedbackByItem((current) => ({ ...current, [itemId]: next }));
  }

  function runAction(
    action: () => Promise<{ ok: boolean; message?: string; error?: string }>
  ) {
    setMessage(null);
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        setMessage(result.message ?? "Updated.");
        router.refresh();
      } else {
        setError(result.error ?? "Action failed.");
      }
    });
  }

  if (items.length === 0) {
    return (
      <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-sm text-slate-600">No items are waiting for review.</p>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      {message ? (
        <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900" role="alert">
          {error}
        </p>
      ) : null}

      {items.map((item) => {
        const feedback = feedbackFor(item.id);

        return (
          <article
            key={item.id}
            className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {APPROVAL_TYPE_LABELS[item.approval_type]}
                </p>
                <h2 className="mt-1 text-xl font-semibold text-slate-950">{item.title}</h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                  {item.summary}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <StatusPill label={item.status} />
                <StatusPill label={item.priority} />
                {item.stale_days >= 7 ? (
                  <StatusPill label="stale 7+ days" tone="warn" />
                ) : item.stale_days >= 3 ? (
                  <StatusPill label="stale 3+ days" tone="warn" />
                ) : null}
              </div>
            </div>

            {item.is_ai_generated ? (
              <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                {AI_GENERATED_WARNING} Pilot feedback uses tags and time estimates
                only — do not paste private CRM text.
              </p>
            ) : null}

            <dl className="mt-4 grid gap-3 text-sm text-slate-600 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <dt className="font-medium text-slate-500">Confidence</dt>
                <dd>
                  {item.confidence_score == null
                    ? "—"
                    : item.confidence_score.toFixed(2)}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-slate-500">Created</dt>
                <dd>{new Date(item.created_at).toLocaleString()}</dd>
              </div>
              <div>
                <dt className="font-medium text-slate-500">Source</dt>
                <dd>{item.citation ?? item.source_type}</dd>
              </div>
              <div>
                <dt className="font-medium text-slate-500">Agent execution</dt>
                <dd>
                  {item.agent_execution_id ? (
                    <Link className="text-cyan-700 hover:text-cyan-900" href="/agents">
                      View agents
                    </Link>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
            </dl>

            {canAct && item.status === "pending" ? (
              <PilotFeedbackControls
                disabled={pending}
                onChange={(next) => setFeedback(item.id, next)}
                value={feedback}
              />
            ) : null}

            <div className="mt-5 flex flex-wrap gap-2">
              {item.source_url ? (
                <Link
                  className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
                  href={item.source_url}
                >
                  Open full review
                </Link>
              ) : null}

              {canAct && item.status === "pending" ? (
                <>
                  {(item.approval_type === "prospect_candidate" ||
                    item.approval_type === "prospect_enrichment") && (
                    <>
                      <ActionButton
                        disabled={pending}
                        label="Accepted as-is"
                        onClick={() =>
                          runAction(async () =>
                            approveApprovalItem({
                              approvalItemId: item.id,
                              usefulnessScore: feedback.usefulnessScore,
                              feedbackCategories: feedback.categories,
                              savedTimeMinutes: feedback.savedTimeMinutes,
                              approvedWithEdits: false
                            })
                          )
                        }
                      />
                      <ActionButton
                        disabled={pending}
                        label="Accepted with edits"
                        onClick={() =>
                          runAction(async () =>
                            approveApprovalItem({
                              approvalItemId: item.id,
                              usefulnessScore: feedback.usefulnessScore,
                              feedbackCategories: feedback.categories,
                              savedTimeMinutes: feedback.savedTimeMinutes,
                              approvedWithEdits: true
                            })
                          )
                        }
                      />
                      <ActionButton
                        disabled={pending}
                        label="Rejected"
                        tone="danger"
                        onClick={() =>
                          runAction(async () =>
                            rejectApprovalItem({
                              approvalItemId: item.id,
                              feedbackCategories: feedback.categories,
                              savedTimeMinutes: feedback.savedTimeMinutes
                            })
                          )
                        }
                      />
                    </>
                  )}

                  {item.approval_type === "outreach_draft" && (
                    <>
                      <span className="rounded-full bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700">
                        Never send automatically
                      </span>
                      <ActionButton
                        disabled={pending}
                        label="Rejected"
                        tone="danger"
                        onClick={() =>
                          runAction(async () =>
                            rejectApprovalItem({
                              approvalItemId: item.id,
                              feedbackCategories: feedback.categories,
                              savedTimeMinutes: feedback.savedTimeMinutes
                            })
                          )
                        }
                      />
                    </>
                  )}

                  {(item.approval_type === "contact_recommendation" ||
                    item.approval_type === "meeting_prep" ||
                    item.approval_type === "proposal_draft") && (
                    <>
                      <ActionButton
                        disabled={pending}
                        label="Accepted as-is"
                        onClick={() =>
                          runAction(async () =>
                            approveApprovalItem({
                              approvalItemId: item.id,
                              usefulnessScore: feedback.usefulnessScore,
                              feedbackCategories: feedback.categories,
                              savedTimeMinutes: feedback.savedTimeMinutes
                            })
                          )
                        }
                      />
                      <ActionButton
                        disabled={pending}
                        label="Needs revision"
                        onClick={() =>
                          runAction(async () =>
                            markApprovalNeedsRevision({
                              approvalItemId: item.id,
                              feedbackCategories: feedback.categories,
                              savedTimeMinutes: feedback.savedTimeMinutes
                            })
                          )
                        }
                      />
                      <ActionButton
                        disabled={pending}
                        label="Rejected"
                        tone="danger"
                        onClick={() =>
                          runAction(async () =>
                            rejectApprovalItem({
                              approvalItemId: item.id,
                              feedbackCategories: feedback.categories,
                              savedTimeMinutes: feedback.savedTimeMinutes
                            })
                          )
                        }
                      />
                    </>
                  )}

                  {item.approval_type === "contact_recommendation" ? (
                    <span className="rounded-full bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700">
                      Do not create personal contacts automatically
                    </span>
                  ) : null}

                  {item.approval_type === "proposal_draft" ? (
                    <span className="rounded-full bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700">
                      Never send automatically
                    </span>
                  ) : null}

                  {item.approval_type === "meeting_prep" ? (
                    <ActionButton
                      disabled={pending}
                      label="Refresh"
                      onClick={() =>
                        runAction(async () =>
                          refreshMeetingPrepApproval({ approvalItemId: item.id })
                        )
                      }
                    />
                  ) : null}
                </>
              ) : null}
            </div>
          </article>
        );
      })}

      <div className="flex items-center justify-between text-sm text-slate-600">
        <p>
          Page {page} of {totalPages} · {total} items
        </p>
        <div className="flex gap-2">
          {page > 1 ? (
            <Link
              className="rounded-full border border-slate-200 px-3 py-1 hover:bg-slate-50"
              href={`/approvals?${withPage(queryString, page - 1)}`}
            >
              Previous
            </Link>
          ) : null}
          {page < totalPages ? (
            <Link
              className="rounded-full border border-slate-200 px-3 py-1 hover:bg-slate-50"
              href={`/approvals?${withPage(queryString, page + 1)}`}
            >
              Next
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function withPage(queryString: string, page: number): string {
  const params = new URLSearchParams(queryString);
  params.set("page", String(page));
  return params.toString();
}

function StatusPill({
  label,
  tone = "default"
}: {
  label: string;
  tone?: "default" | "warn";
}) {
  return (
    <span
      className={
        tone === "warn"
          ? "rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-900 ring-1 ring-amber-200"
          : "rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200"
      }
    >
      {label}
    </span>
  );
}

function ActionButton({
  label,
  onClick,
  disabled,
  tone = "default"
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: "default" | "danger";
}) {
  return (
    <button
      className={
        tone === "danger"
          ? "rounded-full border border-red-200 px-4 py-2 text-sm font-semibold text-red-800 hover:bg-red-50 disabled:opacity-50"
          : "rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
      }
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}
