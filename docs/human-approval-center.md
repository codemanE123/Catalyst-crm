# Human Approval Center (Phase 4.9)

Centralized review queue for AI-assisted and agent-generated work. Source CRM / prospect tables remain authoritative; the Approval Center is a **read-model + action router**.

## Supported approval types

| Type | Source table / record | Pending signal |
| --- | --- | --- |
| `prospect_candidate` | `prospect_candidates` | `status = pending_review` |
| `prospect_enrichment` | `prospect_candidates` | `enrichment_status = enriched` and still pending |
| `outreach_draft` | derived from enriched candidates with outreach angle | pending review |
| `contact_recommendation` | `prospect_contact_recommendations` | `review_status = pending_review` |
| `meeting_prep` | `meeting_prep_briefs` | `review_status = pending_review` |
| `proposal_draft` | `proposal_drafts` | `review_status = pending_review` |

## Role permissions

| Role | View | Approve / reject / revision | Assign reviewer / priority |
| --- | --- | --- | --- |
| `read_only` | Yes (org-scoped; existing redaction rules still apply on source pages) | No | No |
| `sales` | Yes | Yes (org) | No |
| `admin` | Yes | Yes (org) | Yes |
| `super_admin` | Cross-org (existing pattern) | Yes | Yes |

## Human-review guarantees

- No automatic prospect approval, email, LinkedIn, proposal send, or unverified personal contact creation
- AI content shows: **“AI-generated content must be reviewed before use.”**
- Stale items (≥3 / ≥7 days) are flagged visually only — never auto-approved or auto-rejected

## Source-of-truth architecture

- Approve/reject prospects call `approveProspectCandidate` / `rejectProspectCandidate`
- Meeting refresh calls existing meeting prep actions
- Contact / meeting / proposal accept, needs_revision, dismiss update `review_status` on the source row
- Optional `approval_assignments` stores reviewer + explicit priority without duplicating content

## Display priority (non-mutating)

Documented in `deriveApprovalPriority`: urgent (≥7d), high (≥3d / high confidence / contact priority ≤2), low (confidence &lt; 0.4), else normal. Explicit assignment priority overrides.

## Bulk-action restrictions

Allowed: assign reviewer, change priority, mark needs_revision (per-item results).  
Denied: bulk prospect approve/reject, send, contact creation across mixed types.

## Integrating new agent outputs

1. Persist a reviewable source row with org RLS and a clear pending status.
2. Add a mapper in `lib/approvals/data.ts` that projects an `ApprovalItem`.
3. Route actions to the existing source server action (do not fork business logic).
4. Extend nav badge / Agent Ops `awaiting_human_review` counts.
