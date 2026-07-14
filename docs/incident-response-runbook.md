# Incident Response Runbook — Catalyst CRM Pilot

**Version:** 1.0 (Phase 2 Task 2.35)  
**Audience:** Catalyst leadership, engineering, security, and operations  
**Status:** Active for pilot deployments  

**Companion documents:**

- `docs/deployment-runbook.md` — deploy, rollback, and environment procedures
- `docs/auth-hardening.md` — MFA, session hygiene, credential compromise
- `docs/pilot-it-security-packet.md` — IT review, contacts, MOU notification terms
- `docs/agent-readiness-certification.md` — production agent go/no-go certification

---

## 1. Purpose and scope

This runbook defines how Catalyst CRM responds to **security**, **availability**, and **data** incidents during the university pilot.

**In scope:**

- Hosted staging and production (Vercel + Supabase)
- Pilot user accounts and organization data
- Suspected unauthorized access, outages, data exposure, and credential compromise
- Coordination with university IT and privacy contacts

**Out of scope (escalate externally):**

- Supabase or Vercel platform-wide outages (follow vendor status pages; apply workarounds here)
- Legal/regulatory determinations (engage counsel and university privacy office)
- Law enforcement engagement (executive sponsor + legal)

**Pilot constraints:**

- Catalyst CRM is **not** a student information system. Incidents involving possible **student PII/FERPA** data are treated as **high severity** even if scope is small.
- This runbook is **documentation only** — it does not change application behavior.

**MOU commitment:** Notify the other party within **24 hours** of becoming aware of a confirmed security incident affecting pilot data or credentials (`docs/pilot-it-security-packet.md` §11).

---

## 2. Incident severity levels

| Level | Name | Examples | Response target | University notify |
| --- | --- | --- | --- | --- |
| **SEV-1** | Critical | Confirmed breach of production data; active attacker; `super_admin` compromise; student PII in production | Immediate (15 min) | Within 24 hours; initial notice ASAP |
| **SEV-2** | High | Suspected unauthorized access; prod outage > 1 hour; leaked service role key or production secrets | 30 minutes | Within 24 hours if security/data confirmed |
| **SEV-3** | Medium | Degraded feature; staging-only incident; single account lockout; non-prod secret exposure | 4 business hours | If pilot users affected or data at risk |
| **SEV-4** | Low | Minor bug; failed deploy caught in staging; Sentry noise; documentation gap | Next business day | Not required unless user-visible |

**Severity may increase** as facts emerge. When in doubt, classify **one level higher** until investigation narrows scope.

---

## 3. Contact tree

Fill placeholders before go-live (`docs/pilot-it-security-packet.md` §10).

| Role | Responsibility | Contact |
| --- | --- | --- |
| **Incident commander (IC)** | Catalyst technical lead (default) | `[NAME]` `[EMAIL]` `[PHONE]` |
| **Executive sponsor** | Business decisions, university executive comms | `[NAME]` `[EMAIL]` `[PHONE]` |
| **Security lead** | Security incidents, forensics coordination, MOU clock | `[NAME]` `[EMAIL]` `[PHONE]` |
| **Engineering on-call** | Deploy rollback, Supabase/Vercel actions | `[NAME]` `[EMAIL]` `[PHONE]` |
| **University IT primary** | Institutional coordination | `[NAME]` `[EMAIL]` `[PHONE]` |
| **University privacy contact** | FERPA/data governance | `[NAME]` `[EMAIL]` `[PHONE]` |

### Notification order (default)

```
Detector → Incident commander → Security lead (if SEV-1/2 or data)
         → Engineering on-call (if technical)
         → Executive sponsor (if SEV-1/2 or external comms)
         → University IT (per §5, within 24h for confirmed security)
         → University privacy (if student PII or data exposure suspected)
```

---

## 4. Incident commander responsibilities

The IC owns the incident until closed or handed off.

| # | Responsibility |
| --- | --- |
| 1 | Declare severity and open an **incident record** (ticket/doc with timeline) |
| 2 | Assign roles: scribe, comms lead, technical lead |
| 3 | Start a **war-room channel** (call + chat) for SEV-1/2 |
| 4 | Approve containment actions (account disable, rollback, env rotation) |
| 5 | Ensure **24-hour MOU notification** clock is tracked for confirmed security incidents |
| 6 | Approve external messages (university, pilot users) before send |
| 7 | Request **post-incident review** within 5 business days of resolution |

**IC authority:** May direct immediate rollback and credential rotation without waiting for full root-cause analysis when SEV-1/2 active risk exists.

---

## 5. University notification procedure

Use when pilot data, credentials, or availability commitments are affected.

| Step | Action | Timing |
| --- | --- | --- |
| 1 | IC + security lead confirm whether incident meets MOU **security incident** definition | ASAP |
| 2 | Executive sponsor aligns with IC on facts known vs unknown | Before external send |
| 3 | Send **initial notification** to university IT primary (template §16) | SEV-1/2: ASAP; MOU max **24 hours** from awareness |
| 4 | Copy university **privacy contact** if student PII, interview notes misuse, or data exposure | Same thread or parallel |
| 5 | Provide follow-up updates at agreed cadence (daily for SEV-1 until contained) | Ongoing |
| 6 | Send **resolution notice** (template §16) when incident is closed | Within 5 business days of close |

**Do not include** sensitive payloads, passwords, or raw interview content in university emails. Share impact summary, scope, and remediation steps only.

---

## 6. Internal escalation procedure

| Condition | Escalate to | Action |
| --- | --- | --- |
| SEV-3 → SEV-2 triggers met | Executive sponsor + security lead | Expand response team |
| Cross-org data visible | Security lead + executive sponsor | SEV-1 path; university notify |
| `super_admin` involved | Security lead immediately | Disable account; full audit |
| Legal/regulatory question | Executive sponsor | Pause external statements |
| Vendor platform outage > 4h | Executive sponsor | University availability notice |

**SEV-1/2:** Security lead and executive sponsor join within **30 minutes** of declaration.

---

## 7. Security incident procedure

**Triggers:** suspected breach, unauthorized access, anomalous audit activity, stolen laptop with active session, phishing of pilot credentials.

| Phase | Actions |
| --- | --- |
| **Detect** | Sentry alert, user report, university IT notice, or audit review |
| **Triage** | IC assigns severity; preserve timestamps and alert links |
| **Contain** | Disable affected Auth users (Supabase → Authentication → Users); force password reset; revoke sessions; see §12 |
| **Investigate** | Query `audit_events` (§15); review Sentry (§16); check Vercel/Supabase access logs |
| **Eradicate** | Rotate compromised secrets (§14); patch vulnerability; redeploy known-good build |
| **Recover** | Validate RLS; smoke test (`docs/pilot-onboarding-checklist.md`); re-enable users deliberately |
| **Notify** | University per §5 if confirmed |
| **Review** | Post-incident checklist §17 |

**Preserve evidence:** Export relevant Sentry issues, audit query results, and deployment IDs before cleanup. Do not delete audit rows.

### Agent readiness / recertification (SEV-1 / SEV-2)

When a SEV-1 or SEV-2 affects agent safety, authenticity, or production configuration:

1. **Revoke** relevant production certifications at `/agents/readiness` with reason linking the incident ID and containment status (`agent_readiness.revoke` audit).
2. Confirm orchestrator denies new production executions (`certification_denied`).
3. After containment: re-run evaluation with fresh simulation, quality, and security evidence; submit a new certification for `super_admin` approval.
4. Do not re-enable agents via env alone — certification must be re-approved.

See `docs/agent-readiness-certification.md`.

---

## 8. Availability / outage procedure

**Triggers:** production URL down, `/login` unavailable, widespread 500 errors, Vercel build failure on `main`.

| Step | Action |
| --- | --- |
| 1 | Confirm scope (production vs staging; single user vs all users) |
| 2 | Check [Vercel Status](https://www.vercel-status.com/) and [Supabase Status](https://status.supabase.com/) |
| 3 | Review recent deploys (Vercel → Deployments) and Sentry error spike (§16) |
| 4 | If bad deploy: **Vercel rollback** (§13) |
| 5 | If env misconfiguration: fix vars and redeploy (§14) |
| 6 | If database issue: Supabase dashboard health; do not destructive-reset production |
| 7 | IC posts internal status every 30 min for SEV-1/2 outage |
| 8 | Notify university IT if outage > 1 hour or during business hours pilot demo (template §16) |
| 9 | After restore: smoke test dashboard, login, school profile |

---

## 9. Data exposure procedure

**Triggers:** wrong org data shown; `read_only` user sees restricted fields; accidental export; possible **student PII** in interviews/notes.

| Step | Action |
| --- | --- |
| 1 | Classify **SEV-1** if confirmed student PII or cross-tenant production data |
| 2 | Contain: disable affected accounts or org access if ongoing |
| 3 | Identify scope: which users, orgs, tables, time window (`audit_events`, app logs) |
| 4 | **Remediation:** delete or correct rows via admin SQL only with IC approval; document IDs |
| 5 | Notify university **privacy contact** and IT (§5) |
| 6 | Root cause: RLS policy, view routing, app redaction — file engineering follow-up |
| 7 | Do not copy exposed content into incident tickets or Sentry |

**FERPA note:** If users entered student PII despite policy, coordinate deletion with university privacy contact per pilot packet.

---

## 10. Authentication compromise procedure

**Triggers:** phished password, lost device with session, shared credentials, MFA bypass concern.

| Step | Action |
| --- | --- |
| 1 | Disable user in **Supabase Auth** immediately |
| 2 | Revoke sessions (Supabase user management / password reset) |
| 3 | Review `organization_members` role — downgrade if elevation suspected |
| 4 | Query `audit_events` for `actor_user_id` during exposure window (§15) |
| 5 | If `admin` or `super_admin`: **SEV-2 minimum**; force MFA re-enrollment per `docs/auth-hardening.md` |
| 6 | If `super_admin`: **SEV-1**; executive sponsor + university notify path |
| 7 | Communicate credential reset to user via approved secure channel |

See `docs/auth-hardening.md` §4.4 (lost device / suspected compromise).

---

## 11. Supabase rollback guidance

Application rollback **does not** undo database migrations (`docs/deployment-runbook.md` §11.2).

| Scenario | Guidance |
| --- | --- |
| **Bad migration on production** | Stop deploys depending on migration; fix forward with new migration or approved manual SQL; test on staging first |
| **Accidental data change** | Point-in-time recovery if Supabase plan supports PITR; otherwise selective SQL restore from backup export |
| **RLS policy regression** | Deploy hotfix migration; verify with `read_only` test account |
| **Auth compromise** | Disable users; rotate anon key only as last resort (requires Vercel env update + redeploy) |
| **Full project compromise** | Executive + legal; consider isolating project, rotating all keys, creating fresh production project |

**Never** paste `service_role` key into user-facing Vercel env. If service role leaked: rotate in Supabase → API → service_role, audit who had access.

**During incident:** prefer **user disable** and **session revoke** over destructive schema rollback.

---

## 12. Vercel rollback guidance

Detailed steps: `docs/deployment-runbook.md` §11.2, §14.7.

| Scenario | Steps |
| --- | --- |
| **Bad production deploy** | Vercel → Deployments → last known good → **Promote to Production** |
| **Bad preview/staging** | Promote previous preview or redeploy prior commit on `main` |
| **Security headers break app** | §11.6 deployment runbook — revert `next.config.ts` deploy |
| **Sentry misconfiguration** | Remove DSN env vars → redeploy (§18.6 deployment runbook) |

Record **deployment ID** and **git SHA** in the incident timeline.

---

## 13. Environment variable compromise procedure

**Triggers:** `.env` leak in chat, committed secrets, stolen Vercel access, exposed `SUPABASE_SERVICE_ROLE_KEY`.

| Secret | Severity | Rotation steps |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Medium–High | Supabase → Settings → API → roll anon key → update Vercel Preview/Production → redeploy |
| `SENTRY_DSN` | Low–Medium | Revoke DSN in Sentry → issue new → update Vercel → redeploy |
| `SUPABASE_SERVICE_ROLE_KEY` | **Critical (SEV-1)** | Rotate immediately; audit all service-role usage; assume RLS bypass possible |
| Vercel account access | High | Revoke team tokens; review deployment history; rotate all project env vars |

After rotation:

1. Verify `docs/deployment-runbook.md` §10 — correct project ref on each environment.
2. Force sign-out affected users if session tokens may be compromised.
3. Document rotation time in incident record.

---

## 14. Audit log investigation procedure (`audit_events`)

Append-only table; **do not delete** rows during investigation.

### 14.1 Schema reference

| Column | Use |
| --- | --- |
| `id` | Event UUID |
| `organization_id` | Tenant scope |
| `actor_user_id` | Supabase Auth user who performed action |
| `action` | Event type (see below) |
| `target_table` | Affected table |
| `record_id` | Affected row UUID |
| `metadata` | Non-content context (no raw notes by design) |
| `created_at` | Timeline |

### 14.2 Known actions (pilot)

| `action` | Meaning |
| --- | --- |
| `interview.create` | Discovery interview submitted |
| `university_research.run` | Research agent executed |
| `university_research.save` | Research results saved to profile |
| `membership.role_change` | Admin changed a member role |
| `membership.remove` | Admin removed a member |
| `agent.queue` / `agent.start` / `agent.complete` / `agent.fail` | Agent execution lifecycle |
| `agent.retry` / `agent.cancel` | Operator retry/cancel from Agent Ops |
| `agent.retry_scheduled` | Transient failure scheduled for backoff retry |
| `agent.retry_exhausted` | Transient retries exhausted; left failed |
| `agent.stale_recovered` | Stale `running` execution re-queued by cron worker |
| `agent.policy_denied` | Preflight policy denied queue/run (safe reason_code only) |
| `agent.usage_limit_reached` | Hourly/concurrency/LLM call limit hit |
| `agent.budget_limit_reached` | Daily or monthly estimated spend limit hit |
| `agent.chain_depth_exceeded` | Agent chain deeper than `AGENT_MAX_CHAIN_DEPTH` |

### 14.2.1 Agent cron worker incidents

If `/api/agents/process` fails repeatedly:

1. Verify `AGENT_CRON_SECRET` and `SUPABASE_SERVICE_ROLE_KEY` on Vercel (Staging/Production).
2. Check Vercel Cron logs for 401 (secret mismatch) or 503 (service role missing).
3. Query `agent_executions` for stuck `running` rows older than 15 minutes — cron recovers these and audits `agent.stale_recovered`.
4. Do **not** rotate the service role key without updating Vercel env in the same change window.

### 14.2.2 Agent policy break-glass and rollback

High-risk agent policy changes (disabling human review, private CRM context to LLMs, autonomy flags, citation requirements) require **super_admin break-glass** with a typed reason, confirmation phrase `BREAK GLASS`, expiration, and audit (`agent_policy.break_glass_enable`). See `docs/agent-policy-management.md`.

**During incident:**

1. Prefer rolling back to a prior active policy set in `/agents/policies` (`agent_policy.rollback`) over leaving an unsafe override active.
2. Query `agent_policy_break_glass` for grants past `expires_at` and mark `expired_at` / audit `agent_policy.break_glass_expire`.
3. Do **not** enable `allow_auto_send_email` / `allow_auto_send_proposals` / `allow_auto_approve_prospects` even under incident pressure — product code continues to block autonomous external actions.
4. Record policy_set_id / resolved_policy_hash from affected `agent_executions.metadata` in the incident timeline (no prompts or secrets).

### 14.3 Investigation queries (Supabase SQL Editor)

**Recent activity for an organization:**

```sql
SELECT id, actor_user_id, action, target_table, record_id, metadata, created_at
FROM audit_events
WHERE organization_id = '<pilot-organization-id>'
ORDER BY created_at DESC
LIMIT 100;
```

**All actions by a suspected user:**

```sql
SELECT id, organization_id, action, target_table, record_id, metadata, created_at
FROM audit_events
WHERE actor_user_id = '<auth-user-id>'
  AND created_at >= '<incident-start-timestamptz>'
ORDER BY created_at ASC;
```

**Membership changes in window:**

```sql
SELECT *
FROM audit_events
WHERE action IN ('membership.role_change', 'membership.remove')
  AND created_at BETWEEN '<start>' AND '<end>'
ORDER BY created_at ASC;
```

**Map user to email (operator only — do not export to Sentry):**

```sql
-- Run in Supabase SQL Editor with operator access
SELECT id, email, created_at
FROM auth.users
WHERE id = '<auth-user-id>';
```

### 14.4 Limits

- Not all CRM mutations are audited in v1 (see Phase 2 roadmap Task 2.7). Absence of rows does not prove absence of activity.
- Failed audit writes log to server console only — check Vercel function logs if gaps suspected.

---

## 15. Sentry investigation workflow (Task 2.32)

Monitoring docs: `docs/deployment-runbook.md` §18.

| Step | Action |
| --- | --- |
| 1 | Open Sentry project matching environment (`staging` vs `production`) |
| 2 | Filter issues by time window and `environment` tag |
| 3 | Open representative event — confirm **no PII** per no-PII policy (§18.3 deployment runbook) |
| 4 | Note release/deployment if available; correlate with Vercel deployment ID |
| 5 | Link Sentry issue URL in incident record (internal only) |
| 6 | If error flood from bad deploy: rollback Vercel (§12) before deep debugging |
| 7 | After resolution: mark issue resolved or mute false positive with IC approval |

**Do not** increase `sendDefaultPii` or attach user emails to Sentry during incidents.

---

## 16. Communication templates

Replace bracketed placeholders before sending.

### 16.1 Internal leadership

**Subject:** `[SEV-{n}] Catalyst CRM incident — {short title}`

```
Status: Investigating | Contained | Resolved
Severity: SEV-{n}
Incident commander: {name}
Start time (UTC): {time}
Impact: {who/what affected}
Current actions: {bullets}
University notified: Yes/No/Pending
Next update: {time}
```

### 16.2 University IT

**Subject:** Catalyst CRM pilot — security incident notification

```
Dear {university IT contact},

This message fulfills our pilot agreement notification requirement.

We are writing to inform you of a security incident affecting the Catalyst CRM pilot.

Awareness time (UTC): {time}
Summary: {non-technical description}
Pilot data affected: Known | Under investigation | Not confirmed
User accounts affected: {count or "under investigation"}
Actions taken: {containment bullets}
Next update: {date/time}

Catalyst security contact: {name, email, phone}

We will provide an update by {time}.

Regards,
{Executive sponsor or IC}
```

### 16.3 Pilot users

**Subject:** Catalyst CRM — service notice

```
Hello,

We are experiencing {brief issue} with Catalyst CRM.

Impact: {what you may see}
Workaround: {if any}
Estimated update: {time or "investigating"}

You do not need to change your password unless we send a separate instruction.

Contact: {support email}

Thank you,
Catalyst Team
```

### 16.4 Resolution notice

**Subject:** Catalyst CRM — incident resolved

```
Dear {recipient},

The incident reported on {date} is resolved as of {time} UTC.

Summary: {what happened}
Scope: {final scope}
Remediation: {fixes applied}
Preventive actions: {follow-up items}

Please contact {security contact} with questions.

Regards,
{Executive sponsor or IC}
```

---

## 17. Post-incident review checklist

Complete within **5 business days** of resolution.

- [ ] Incident timeline documented (detect → contain → recover → close)
- [ ] Final severity assigned
- [ ] Root cause identified (or marked unknown with gaps)
- [ ] University notification compliance verified (24h MOU if applicable)
- [ ] Corrective actions assigned with owners and dates
- [ ] Rollback/deploy steps evaluated — update `docs/deployment-runbook.md` if needed
- [ ] Audit/Sentry gaps noted
- [ ] Lessons learned recorded (§18)
- [ ] Pilot IT packet contacts still accurate

---

## 18. Lessons learned template

```markdown
# Post-incident review — {incident title}

**Date closed:** {date}
**Severity:** SEV-{n}
**IC:** {name}
**Duration:** {hours}

## Summary
{2–3 sentences}

## What went well
-

## What went poorly
-

## Timeline
| Time (UTC) | Event |
| --- | --- |
| | |

## Root cause
-

## Action items
| Action | Owner | Due |
| --- | --- | --- |
| | | |

## Runbook updates needed
- [ ] deployment-runbook
- [ ] auth-hardening
- [ ] incident-response-runbook
- [ ] pilot-it-security-packet
```

---

## 19. Quick reference — incident type → first actions

| Type | First 3 actions |
| --- | --- |
| Security | Disable affected users → IC + security lead → audit query §14 |
| Outage | Check vendor status → Vercel rollback §12 → Sentry §15 |
| Data exposure | Classify severity → contain access → university privacy §5 |
| Auth compromise | Disable Auth user → audit query → MFA reset path §10 |
| Secret leak | Classify key type §13 → rotate → redeploy |

---

## 20. Rollback (this document)

Documentation-only. Revert `docs/incident-response-runbook.md` and deployment-runbook links. **No runtime behavior changes.**

---

## 21. References

- `docs/deployment-runbook.md` — Vercel/Supabase rollback, Sentry, environments
- `docs/auth-hardening.md` — MFA, session compromise, lost device
- `docs/pilot-it-security-packet.md` — contacts, MOU notification, data categories
- `docs/pilot-onboarding-checklist.md` — smoke verification after recovery
- `docs/agent-readiness-certification.md` — agent production launch gate / recertification
- `lib/auditLog.ts` — `AUDIT_ACTIONS` enum in codebase
