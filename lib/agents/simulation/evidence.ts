/**
 * Minimal simulation evidence adapter for readiness certification.
 * Not a second scenario runner — stores/pass references only.
 */
import type { SimulationRunEvidence } from "../readiness/types";

export class InMemorySimulationEvidenceStore {
  runs: SimulationRunEvidence[] = [];

  record(run: SimulationRunEvidence): SimulationRunEvidence {
    this.runs.unshift(run);
    return run;
  }

  latestFor(params: {
    agentName: string;
    organizationId: string | null;
  }): SimulationRunEvidence | null {
    return (
      this.runs.find(
        (row) =>
          row.agent_name === params.agentName &&
          row.organization_id === params.organizationId
      ) ??
      this.runs.find(
        (row) =>
          row.agent_name === params.agentName && row.organization_id == null
      ) ??
      null
    );
  }
}

export function createPassingSimulationEvidence(params: {
  id?: string;
  agentName: string;
  organizationId?: string | null;
  scenarioCoverage?: number;
  fixedSeed?: string;
  completedAt?: string;
}): SimulationRunEvidence {
  return {
    id: params.id ?? `sim_${Date.now()}`,
    organization_id: params.organizationId ?? null,
    agent_name: params.agentName,
    status: "passed",
    scenario_coverage: params.scenarioCoverage ?? 1,
    failure_count: 0,
    fixed_seed: params.fixedSeed ?? "fixed-seed-1",
    completed_at: params.completedAt ?? new Date().toISOString(),
    metadata: {}
  };
}
