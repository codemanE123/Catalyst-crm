# Production Launch Blocker Checklist

Source: docs/production-readiness-audit.md

## 1. Vercel Production Environment Variables
Status: FAIL

## 2. Production Supabase Project
Status: FAIL

## 3. Production Auth URLs
Status: FAIL

## 4. Sentry Verification
Status: FAIL

## 5. securityheaders.com Scan
Status: FAIL

## 6. Manual Security Verification
Status: FAIL

## Launch Decision
? Ready  
? Not Ready

## Agent readiness certification (Phase 4.14)

Before enabling production agents, complete a certification at `/agents/readiness`:

- [ ] Migration `20260714210000_agent_readiness_certifications.sql` applied
- [ ] Production certification approved for each production agent scope
- [ ] Simulation evidence fresh and passing
- [ ] No open SEV-1/SEV-2; quality/safety thresholds met
- [ ] Orchestrator denies uncertified production execution (`certification_denied`)
- [ ] Prompt/policy activation path verified to revoke certifications with audit
- [ ] Expiry calendar noted (default 30 days production)

See `docs/agent-readiness-certification.md`.
