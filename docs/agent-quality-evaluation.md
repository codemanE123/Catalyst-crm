# Agent quality evaluation (Phase 4.10)

Catalyst measures whether agent outputs are useful and trustworthy—not only whether jobs complete.

## Scoring model

- Each dimension is scored **1–5** (1 = poor, 5 = excellent).
- Dimensions: accuracy, completeness, relevance, usefulness, source quality, confidence calibration, safety, actionability.
- `overall_score` = mean of **present** dimension scores (null dimensions excluded).
- Do not replace component scores with only the overall value.

## Evaluation outcomes

`accepted` · `approved_with_edits` · `needs_revision` · `rejected` · `failed_quality_check`

## Evaluator / evaluation types

- Evaluators: `human`, `system`, `policy`
- Types: `human_review`, `automated_quality_check`, `source_quality`, `output_completeness`, `factuality`, `usefulness`, `safety`

## Thresholds (env)

| Variable | Default | Meaning |
| --- | --- | --- |
| `AGENT_QUALITY_LOW_SCORE_THRESHOLD` | `2.5` | Flag overall scores below this |
| `AGENT_QUALITY_ALERT_REJECTION_RATE` | `0.4` | Dashboard alert when rejection rate ≥ this (n≥5) |
| `AGENT_REQUIRE_SOURCE_CITATIONS` | `true` | Require citations when check applies |
| `AGENT_MIN_SAFETY_SCORE` | `3` | Flag safety scores below this |
| `AGENT_EVALUATION_FEEDBACK_MAX_LENGTH` | `500` | Max scrubbed feedback length |

## Automated checks

Deterministic only (no LLM self-grade): schema, required fields, citations, confidence range, forbidden fields, empty output, PII patterns, secrets, autonomous-action language, boilerplate duplication.

## Source quality

Classes: official institutional · government/public dataset · recognized third party · **unknown**. Unknown stays unknown—never invent credibility.

## Confidence calibration

Buckets high/medium/low confidence vs human outcomes. Reports patterns such as high-confidence frequent rejection or low-confidence frequent acceptance. Measurement only—no automatic behavior change.

## Dashboard metrics

Agent Ops shows average quality, acceptance/rejection/needs-revision/edits rates, averages by agent/model/approval type, low-quality last 7 days, high-confidence rejects, missing citations, revision %, and alerts.

## Pilot monitoring and feedback (Phase 5.6)

Approval Center pilot controls capture structured usefulness signals:

| Control | Stored as |
| --- | --- |
| Accepted as-is | outcome `accepted` |
| Accepted with edits | outcome `approved_with_edits` |
| Rejected | outcome `rejected` |
| Not relevant / Incorrect / Weak sources / Useful | `feedback_categories` |
| Saved time estimate | `metadata.saved_time_minutes` (discrete minutes) |

**Pilot monitoring panel** (`/agents`): candidate approval rate, enrichment acceptance rate, outreach draft use rate (saves ÷ generated), average quality score, cost per approved prospect, cost per saved outreach draft, failed jobs (today), policy denials, budget denials, average saved time, top feedback tags.

Prefer category tags over free-text. If free-text is supplied it is length-limited and PII-scrubbed; prompts and draft bodies are never stored on evaluations.

## Privacy

- No raw prompts, API keys, tokens, cookies, or student PII in evaluation storage
- Feedback is length-limited and PII-scrubbed where feasible
- Audit events store sanitized metadata only (`agent.evaluation_create`, `agent.evaluation_update`, `agent.quality_check_failed`, `agent.low_quality_flagged`)

## Human workflow

Approval Center records a lightweight evaluation with optional usefulness score, structured pilot tags, and saved-time estimate. Prefer tags over narrative. Detailed dimension scoring remains available via `submitAgentEvaluation` without duplicating approval decisions.

## Future agents

1. Persist reviewable output under existing HITL rules.
2. Run `runAutomatedQualityChecks` before surfacing results when practical.
3. Link evaluations to `agent_execution_id`.
4. Prefer citation metadata for source-quality classification.
5. Never treat missing usage cost as `$0`—use `unknown`.
