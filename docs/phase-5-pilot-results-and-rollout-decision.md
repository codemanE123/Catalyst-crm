# Phase 5 — Pilot Results and Rollout Decision

**Date:** 2026-07-14  
**Audience:** Catalyst leadership, engineering, partnerships, operations  
**Purpose:** Record limited-production agent pilot scope, evidence, and a go / no-go decision for broader rollout  
**Status of this memo:** Engineering and control plane for Phase 5 are **implemented**. Live multi-day cohort metrics below use **designed baselines and dashboard definitions**; fill green cells after the first operational pilot window.

**Companions:**

- `docs/agent-pilot-controls.md` — allowlists, kill switch, permitted agents  
- `docs/agent-quality-evaluation.md` — scoring + Phase 5.6 feedback tags  
- `docs/deployment-runbook.md` §6.6f — env + emergency stop  
- `docs/incident-response-runbook.md` §14.2.3 — pilot kill switch procedure  
- `docs/phase-5-integration-readiness-audit.md` — pre-provider readiness history  
- `/agents` — Pilot status + Pilot monitoring panels  

---

## 1. Decision summary

| Decision question | Recommendation |
| --- | --- |
| Continue **limited allowlisted** production pilot (Scorecard + enrichment + outreach draft)? | **CONDITIONAL GO** — only with pilot enabled, kill switch tested, readiness certs present for permitted agents, and daily spend/job caps enforced |
| Enable **all organizations / all users** for real providers? | **NO-GO** |
| Raise automatic / autonomous capabilities (send email, auto-approve, auto-deliver proposals, auto-create contacts)? | **NO-GO** — remain disabled |
| Prompt / treatment **rollout percentage** outside allowlist? | **NO-GO** (0%) |
| Prompt / treatment **rollout percentage** inside allowlisted orgs | **10%** treatment (90% control) until monitoring targets in §11 are met for ≥14 days |

**Overall rollout posture:** stay on Phase 5.5 deny-by-default pilot controls; expand cohort size carefully after evidence, not capability demo alone.

---

## 2. Pilot scope

### In scope (real providers)

| Capability | Agent | Provider / source | Human gate |
| --- | --- | --- | --- |
| College Scorecard prospect generation | `ProspectGenerationAgent` | College Scorecard API | Candidate pending review → human approve/reject |
| Async prospect enrichment | `ProspectEnrichmentAgent` | OpenAI (structured enrichment) | Enrichment review; CRM promotion still requires human |
| Outreach draft generation | `OutreachDraftAgent` | OpenAI | Draft is assistive; never auto-send |

### Explicitly out of scope (kept disabled)

- Automatic email sending  
- Automatic prospect approval  
- Automatic proposal delivery  
- Autonomous contact creation  
- Real-provider use of Contact Discovery, Meeting Prep, and Proposal Generation agents during this pilot  

### Control plane

| Control | Default | Cap (design) |
| --- | --- | --- |
| Pilot program enabled | **Off** | — |
| Emergency kill switch | Off (env OR can force ON) | Instant deny all real provider pilot paths |
| Max organizations | — | **3** |
| Max users | — | **15** |
| Max daily jobs (pilot-wide) | — | **50** |
| Max daily spend (pilot-wide est.) | — | **$25** |
| Max candidate batch | — | **25** |

---

## 3. Organizations and users

| Dimension | Target / design | Live evidence (record after enablement) |
| --- | --- | --- |
| Organizations allowlisted | ≤ 3 | ___ / 3 enabled |
| Users allowlisted | ≤ 15 | ___ / 15 enabled |
| Org identity | Dedicated `organizations` rows; no cross-org access | Confirm RLS + memberships |
| Roles | Prefer `sales` / `admin` operators; `super_admin` for pilot toggles | List actors in audit notes |
| Provisioning | Manual allowlist via `/agents` pilot panel or DB | Audits: `agent_pilot.org_allowlist_*`, `user_allowlist_*` |

**Rule:** empty allowlists + pilot disabled ⇒ no real provider execution. Do not rely on env-only open access.

---

## 4. Usage

Capture from `/agents` (pilot monitoring + usage panels) and `agent_executions` / `agent_usage_events`.

| Metric | How measured | Pilot window target | Observed |
| --- | --- | --- | --- |
| Daily agent jobs (pilot orgs) | Executions created UTC day | ≤ 50 | ___ |
| Scorecard generation runs | `ProspectGenerationAgent` completed | Track | ___ |
| Enrichment jobs | Status path queued → running → enriched/failed/denied | Track | ___ |
| Outreach drafts generated | `OutreachDraftAgent` completed | Track | ___ |
| Outreach drafts saved to CRM | Audit `prospect_candidate.outreach_draft_save` | Track | ___ |
| Concurrent load | Running executions vs org concurrency limits | No sustained concurrency denials | ___ |

---

## 5. Costs

| Metric | Definition | Cap / guidance | Observed |
| --- | --- | --- | --- |
| Daily estimated spend (pilot-wide) | Sum of non-null `estimated_cost_usd` for success usage in pilot orgs | ≤ **$25** | $___ |
| Cost per approved prospect | Prospect gen + enrichment spend ÷ approved candidates | Monitor; investigate if > $5 without quality gain | $___ |
| Cost per saved outreach draft | OutreachDraft spend ÷ saved drafts | Monitor; unknown if tokens missing | $___ |
| Budget denials | Candidates with `enrichment_status = budget_denied` | Expect near zero if caps sized well | ___ |
| Missing cost data | Null estimates never shown as $0 | Keep as **unknown** | ___ |

Estimates use list-price token math (`lib/llm/pricing.ts`) and are **operational**, not invoice truth.

---

## 6. Quality

| Signal | Source | Target (initial) | Observed |
| --- | --- | --- | --- |
| Average overall quality score | Human / lightweight evaluations (1–5) | ≥ **3.5** | ___ |
| Low-quality count (7 days) | Quality panel | Trend down / investigate spikes | ___ |
| High-confidence rejected | Rejected + agent confidence ≥ 0.8 | Investigate any > 0 | ___ |
| Missing citations | Quality flags | Prefer Scorecard / public citations | ___ |
| Automation safety | Automated quality checks + autonomy guards | No autonomous external sends | Pass (code) / ___ (ops) |

---

## 7. Acceptance rates

| Rate | Definition | Initial bar | Observed |
| --- | --- | --- | --- |
| Candidate approval rate | Approved ÷ (approved + rejected) | ≥ **50%** among reviewed | ___ |
| Enrichment acceptance rate | Enrichment evals accepted (+ with edits) ÷ enrichment human outcomes | ≥ **60%** | ___ |
| Outreach draft use rate | Saved drafts ÷ drafts generated | ≥ **30%** (assistive use) | ___ |
| Accepted as-is vs with edits | Outcomes `accepted` vs `approved_with_edits` | Prefer rising as-is over time | ___ |
| Rejection rate | Human rejected outcomes | Alert if ≥ **40%** with n ≥ 5 | ___ |

Dashboard: `/agents` → **Pilot monitoring and feedback**.

---

## 8. Incidents

| Severity | During Phase 5 build / early pilot | Containment |
| --- | --- | --- |
| Sev-1 (data leak / auto-send / cross-org) | **None reported** in engineering Phase 5 work | Kill switch + disable allowlists + revoke readiness |
| Sev-2 (spend runaway / provider outage) | **None reported**; controls ready | `AGENT_PILOT_KILL_SWITCH`, budget deny paths, cron pause |
| Sev-3 (UX / failed jobs spike) | Track once live | Ops retry (permanent policy/budget denials must not retry blindly) |

**Ops checklist after any agent incident:** runbook §14.2.3 (pilot emergency stop), then §14.2.2 (policy break-glass) if policies were touched.

---

## 9. Safety events

| Safety property | Status | Notes |
| --- | --- | --- |
| No auto-send email | **Enforced** | `AGENT_AUTONOMY_GUARDS` + policy locks |
| No auto-approve prospects | **Enforced** | HITL Approval Center required |
| No auto proposal delivery | **Enforced** | Drafts only |
| No autonomous contact creation | **Enforced** | Contact discovery out of pilot permit list |
| Kill switch fail-closed | **Implemented** | Env kill ORs DB kill |
| Enrichment fails closed without handler | **Implemented** | No silent `worker_stub` success for enrichment |
| Evaluation privacy | **Implemented** | Tags + minutes preferred; scrub free-text; no prompts/raw LLM in evals |
| Org isolation | **Required** | RLS + membership-scoped ops views |

Record operational safety denials (policy / budget / certification) in the Observed column of §§5–7 after go-live.

---

## 10. User feedback

Structured only (Phase 5.6):

| Control | Storage |
| --- | --- |
| Accepted as-is | outcome `accepted` |
| Accepted with edits | outcome `approved_with_edits` |
| Rejected | outcome `rejected` |
| Not relevant / Incorrect / Weak sources / Useful | `feedback_categories` |
| Saved time estimate | `metadata.saved_time_minutes` |

**Do not** store private CRM narratives, emails, or draft bodies on evaluation rows.

| Feedback theme | Observed count (pilot window) | Action |
| --- | --- | --- |
| Useful | ___ | Reinforce prompts that score high |
| Weak sources | ___ | Tighten citations / Scorecard evidence in prompts |
| Incorrect | ___ | Prompt + validation review; pause treatment % |
| Not relevant | ___ | ICP / geography filters; enrichment input scrub |
| Avg minutes saved | ___ | Product storytelling for partnerships |

---

## 11. Failed workflows

| Failure mode | Expected system behavior | Observed |
| --- | --- | --- |
| Provider timeout / transient OpenAI errors | Enrichment retries (transient only) | ___ |
| Validation / schema failure | Permanent fail; no auto-retry | ___ |
| Policy / readiness denial | `policy_denied`; permanent | ___ |
| Budget / call limit denial | `budget_denied`; permanent | ___ |
| Cron / worker outage | Stuck queues; recover stale running | ___ |
| Non-pilot agent invoked (contact/meeting/proposal) | `pilot_agent_not_permitted` | ___ |
| Org/user not allowlisted | Access denied + audit | ___ |

**Engineering improvements already landed** relative to Phase 5.1 audit (cron gating, enrichment async path, pilot allowlists, monitoring). Remaining failures should be logged as product bugs if they violate the table above.

---

## 12. Improvements required (before broader rollout)

| Priority | Improvement | Owner | Done when |
| --- | --- | --- | --- |
| P0 | Enable pilot for ≤3 orgs / ≤15 users; verify kill switch in staging then production | Eng + Ops | Audit `kill_switch_*` + deny probe |
| P0 | Per-agent readiness certifications for the three permitted agents in production | Eng | Approved, unexpired certs |
| P0 | Fill Observed columns in this memo for ≥**14 consecutive days** | Ops | Rates + spend + failures recorded |
| P1 | Address top feedback tags (incorrect / weak sources) via prompt versions + rollouts **within allowlist** | Eng | New prompt version activated; quality ≥ bar |
| P1 | Confirm Scorecard + OpenAI keys, budgets, and monitoring alerts in prod | Ops | Runbook §6.4–6.6f |
| P2 | Contact discovery / meeting / proposal remain off until separate pilot decision | Product | Explicit Phase 6 plan |
| P2 | Optional: raise org/user caps only after bars met | Leadership | Memo amendment |

---

## 13. Go / no-go recommendation

### Limited production pilot (allowlisted) — **CONDITIONAL GO**

Proceed to operate the Phase 5.5 allowlisted pilot when:

1. Migrations including `20260714230000_agent_pilot_controls.sql` applied  
2. Pilot enabled intentionally; allowlists populated within caps  
3. Kill switch rehearsed  
4. Human approval remains required for promotion and outbound actions  
5. Monitoring panel reviewed at least daily for spend, denials, and failed jobs  

### Broader rollout (all orgs, higher autonomy, or high treatment %) — **NO-GO**

Do **not** expand until §§4–11 Observed values meet initial bars for **14 days** without Sev-1/Sev-2 agent incidents and without sustained rejection ≥ 40%.

### Sign-off

| Role | Name | Decision | Date |
| --- | --- | --- | --- |
| Engineering | __________ | [ ] Agree conditional GO / [ ] Hold | __________ |
| Operations | __________ | [ ] Agree conditional GO / [ ] Hold | __________ |
| Partnerships / Product | __________ | [ ] Agree conditional GO / [ ] Hold | __________ |
| Executive | __________ | [ ] Approve limited pilot / [ ] Block | __________ |

---

## 14. Recommended rollout percentage

| Layer | Recommendation | Rationale |
| --- | --- | --- |
| Org enablement | **Allowlist only** (≤ 3 orgs) | Deny-by-default; Phase 5.5 design |
| User enablement | **Allowlist only** (≤ 15 users) | Same |
| Prompt A/B treatment (inside allowlisted orgs) | **10%** treatment / **90%** control | Enough signal without exposing majority of pilot traffic to unproven prompt changes |
| Prompt A/B treatment (outside allowlist) | **0%** | Providers blocked by pilot gate |
| After 14-day bars met | Consider **25%** then **50%** treatment inside allowlist | Step only if quality + acceptance hold |
| General availability | **Not recommended** in this memo | Separate Phase 6 decision |

**Default until evidence filled:** keep treatment at **10%** (or fixed_control) for prompt experiments; keep pilot org footprint at current allowlist size.

---

## 15. How to refresh this memo

1. Export counts from `/agents` Pilot monitoring + Usage + Quality panels.  
2. Query audits for kill switch and allowlist changes.  
3. Update Observed columns; append an amendment dated.  
4. Revisit go / no-go and rollout % only on written amendment — do not expand silently via env alone.

---

*End of Phase 5 pilot results and rollout decision memo.*
