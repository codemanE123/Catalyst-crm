# Limited production agent pilot controls (Phase 5.5)

**Status:** Implemented  
**Scope:** Deny-by-default real-provider execution for a small allowlisted pilot cohort.

## Capabilities

| Allowed | Kept disabled |
| --- | --- |
| College Scorecard prospect generation | Automatic email sending |
| Prospect enrichment (async worker) | Automatic prospect approval |
| Outreach draft generation | Automatic proposal delivery |
| | Autonomous contact creation |

## Controls

1. **Pilot enablement** — DB `agent_pilot_settings.enabled` (default `false`). Env fallback: `AGENT_PILOT_ENABLED`.
2. **Emergency kill switch** — DB `kill_switch` or `AGENT_PILOT_KILL_SWITCH=true` (env wins if true).
3. **Organization + user allowlists** — tables `agent_pilot_organization_allowlist` / `agent_pilot_user_allowlist`.
4. **Limits** — max orgs, users, daily jobs, daily spend, candidate batch size.
5. **Agent permit list** — only `ProspectGenerationAgent`, `ProspectEnrichmentAgent`, `OutreachDraftAgent`.

## Enforcement points

- Orchestrator queue + claim (`createGatedAgentOrchestratorFromSupabase`)
- LLM production gate (`resolveLlmProductionContextFromSupabase`)
- Product actions: prospect generation, contact discovery, meeting prep, proposal generation

## Ops UI

`/agents` → Limited production pilot panel (status + super-admin controls).

## Audits

`agent_pilot.enable|disable`, `kill_switch_*`, `org_allowlist_*`, `user_allowlist_*`, `access_denied`.

See also: `docs/deployment-runbook.md` §6.6f, `docs/incident-response-runbook.md` §14.2.3.
