# OpenAI production provider (Phase 5.3)

Catalyst reuses the existing LLM abstraction in `lib/llm` for:

- Prospect enrichment (`ProspectEnrichmentAgent`)
- Outreach draft generation (`OutreachDraftAgent`)

There is **no second provider framework**. OpenAI chat completions are invoked only through `createOpenAiProvider` / `createOpenAiOutreachDraftProvider`.

## Staging verification

1. **Env (Preview/staging):**
   - `LLM_ENRICHMENT_ENABLED=true`
   - `OPENAI_API_KEY=<staging key>`
   - Budgets via `LLM_*` and/or active policy set
2. **Policy console:** `default_provider=openai`, approved `default_model`, human-review flags enabled.
3. **Optional readiness:** if staging certs are required, approve certifications for enrichment/outreach agents.
4. Open a pending Scorecard candidate → **Enrich** → confirm public summary fields saved; audit shows `provider`, `model`, `prompt_version*`, `policy_*`, `estimated_cost_usd`.
5. **Generate outreach draft** → copy shown for review; saving outreach remains a separate manual action.
6. Negative checks:
   - Disable flag → safe disabled message
   - Unapproved/HITL-off policy → denial without OpenAI call
   - Invalid JSON from mocked provider (unit tests) → `validation_failed`

Never paste API keys into tickets. Never expect automatic email send from draft generation.
