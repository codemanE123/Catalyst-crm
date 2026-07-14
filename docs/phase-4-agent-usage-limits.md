# Phase 4.8 — Agent cost, usage, and safety limits

Centralized guardrails for Catalyst agents and LLM calls. Complements the orchestrator/worker from Phase 4.1–4.7; does **not** add a second queue or autonomous outbound actions.

## Components

| Module | Role |
| --- | --- |
| `lib/agents/limits.ts` | Env-backed caps and safe defaults |
| `lib/agents/policy.ts` | Preflight allow/deny with safe reason codes |
| `lib/agents/usage.ts` / `usageStore.ts` | Append-only usage events (no prompts/raw LLM) |
| `lib/llm/pricing.ts` | Single model price table + estimated USD |
| `lib/agents/safety.ts` | Chain depth, batch size, autonomy hard stops |
| `agent_usage_events` | Org-scoped RLS table for meters |

## Flow

1. **Queue / run preflight** — feature flag, hourly executions, concurrency, chain depth, candidate batch, and (for LLM-backed agents) daily LLM + budget checks.
2. **Deny** — permanent failure (not transient retry), sanitized audit, optional `status=denied` usage row.
3. **LLM call** — optional second budget check + record provider/model/tokens/cost after success or failure.
4. **Dashboard** — Agent Ops shows today/month spend and (admins) breakdowns by agent/model/denial reason.

## Autonomy

Agents must not autonomously send email, approve prospects, or send proposals. Human review remains required for external actions.
