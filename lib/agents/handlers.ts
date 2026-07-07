import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  AgentExecution,
  AgentExecutionMetadata,
  AgentExecutor,
  AgentExecutorContext,
  AgentExecutorResult,
  AgentName
} from "./types";

export type AgentHandlerDependencies = {
  processProspectGenerationJob?: (input: {
    jobId: string;
    organizationId: string;
    actorUserId: string;
  }) => Promise<AgentExecutorResult>;
  enrichProspectCandidate?: (input: {
    candidateId: string;
    organizationId: string;
    actorUserId: string;
    env?: NodeJS.ProcessEnv;
  }) => Promise<AgentExecutorResult>;
  generateProspectOutreachDraft?: (input: {
    candidateId: string;
    organizationId: string;
    actorUserId: string;
    env?: NodeJS.ProcessEnv;
  }) => Promise<AgentExecutorResult>;
  runContactDiscovery?: (input: {
    organizationId: string;
    actorUserId: string;
    targetType: "prospect_candidate" | "school";
    targetId: string;
    agentExecutionId?: string | null;
  }) => Promise<AgentExecutorResult>;
  runMeetingPrep?: (input: {
    organizationId: string;
    actorUserId: string;
    targetType: "prospect_candidate" | "school";
    targetId: string;
    agentExecutionId?: string | null;
  }) => Promise<AgentExecutorResult>;
};

function futureAgentResult(agentName: AgentName): AgentExecutorResult {
  return {
    ok: false,
    error_message: `${agentName} is not implemented yet.`,
    metadata: {
      extension_point: "future_agent",
      agent_name: agentName
    }
  };
}

function invalidTargetResult(
  agentName: AgentName,
  expectedTargetType: string,
  actualTargetType: string
): AgentExecutorResult {
  return {
    ok: false,
    error_message: `${agentName} requires target_type ${expectedTargetType}.`,
    metadata: {
      agent_name: agentName,
      expected_target_type: expectedTargetType,
      actual_target_type: actualTargetType
    }
  };
}

function defaultProspectGenerationHandler(
  execution: AgentExecution,
  context: AgentExecutorContext,
  deps: AgentHandlerDependencies
): Promise<AgentExecutorResult> {
  if (execution.target_type !== "prospect_generation_job") {
    return Promise.resolve(
      invalidTargetResult(
        "ProspectGenerationAgent",
        "prospect_generation_job",
        execution.target_type
      )
    );
  }

  if (deps.processProspectGenerationJob) {
    return deps.processProspectGenerationJob({
      jobId: execution.target_id,
      organizationId: execution.organization_id,
      actorUserId: context.actorUserId
    });
  }

  return Promise.resolve({
    ok: true,
    metadata: {
      mode: "worker_stub",
      agent_name: "ProspectGenerationAgent",
      target_id: execution.target_id
    }
  });
}

function defaultProspectEnrichmentHandler(
  execution: AgentExecution,
  context: AgentExecutorContext,
  deps: AgentHandlerDependencies
): Promise<AgentExecutorResult> {
  if (execution.target_type !== "prospect_candidate") {
    return Promise.resolve(
      invalidTargetResult(
        "ProspectEnrichmentAgent",
        "prospect_candidate",
        execution.target_type
      )
    );
  }

  if (deps.enrichProspectCandidate) {
    return deps.enrichProspectCandidate({
      candidateId: execution.target_id,
      organizationId: execution.organization_id,
      actorUserId: context.actorUserId,
      env: context.env
    });
  }

  return Promise.resolve({
    ok: true,
    metadata: {
      mode: "worker_stub",
      agent_name: "ProspectEnrichmentAgent",
      target_id: execution.target_id
    }
  });
}

function defaultOutreachDraftHandler(
  execution: AgentExecution,
  context: AgentExecutorContext,
  deps: AgentHandlerDependencies
): Promise<AgentExecutorResult> {
  if (execution.target_type !== "prospect_candidate") {
    return Promise.resolve(
      invalidTargetResult(
        "OutreachDraftAgent",
        "prospect_candidate",
        execution.target_type
      )
    );
  }

  if (deps.generateProspectOutreachDraft) {
    return deps.generateProspectOutreachDraft({
      candidateId: execution.target_id,
      organizationId: execution.organization_id,
      actorUserId: context.actorUserId,
      env: context.env
    });
  }

  return Promise.resolve({
    ok: true,
    metadata: {
      mode: "worker_stub",
      agent_name: "OutreachDraftAgent",
      target_id: execution.target_id
    }
  });
}

function defaultContactDiscoveryHandler(
  execution: AgentExecution,
  context: AgentExecutorContext,
  deps: AgentHandlerDependencies
): Promise<AgentExecutorResult> {
  const allowedTargetTypes = new Set(["prospect_candidate", "school"]);

  if (!allowedTargetTypes.has(execution.target_type)) {
    return Promise.resolve(
      invalidTargetResult(
        "ContactDiscoveryAgent",
        "prospect_candidate or school",
        execution.target_type
      )
    );
  }

  if (deps.runContactDiscovery) {
    return deps.runContactDiscovery({
      organizationId: execution.organization_id,
      actorUserId: context.actorUserId,
      targetType: execution.target_type as "prospect_candidate" | "school",
      targetId: execution.target_id,
      agentExecutionId: execution.id
    });
  }

  return Promise.resolve({
    ok: true,
    metadata: {
      mode: "worker_stub",
      agent_name: "ContactDiscoveryAgent",
      target_id: execution.target_id,
      target_type: execution.target_type
    }
  });
}

function defaultMeetingPrepHandler(
  execution: AgentExecution,
  context: AgentExecutorContext,
  deps: AgentHandlerDependencies
): Promise<AgentExecutorResult> {
  const allowedTargetTypes = new Set(["prospect_candidate", "school"]);

  if (!allowedTargetTypes.has(execution.target_type)) {
    return Promise.resolve(
      invalidTargetResult(
        "MeetingPrepAgent",
        "prospect_candidate or school",
        execution.target_type
      )
    );
  }

  if (deps.runMeetingPrep) {
    return deps.runMeetingPrep({
      organizationId: execution.organization_id,
      actorUserId: context.actorUserId,
      targetType: execution.target_type as "prospect_candidate" | "school",
      targetId: execution.target_id,
      agentExecutionId: execution.id
    });
  }

  return Promise.resolve({
    ok: true,
    metadata: {
      mode: "worker_stub",
      agent_name: "MeetingPrepAgent",
      target_id: execution.target_id,
      target_type: execution.target_type
    }
  });
}

export function createAgentHandlerRegistry(
  deps: AgentHandlerDependencies = {}
): Map<AgentName, AgentExecutor> {
  const registry = new Map<AgentName, AgentExecutor>();

  registry.set("ProspectGenerationAgent", (execution, context) =>
    defaultProspectGenerationHandler(execution, context, deps)
  );
  registry.set("ProspectEnrichmentAgent", (execution, context) =>
    defaultProspectEnrichmentHandler(execution, context, deps)
  );
  registry.set("OutreachDraftAgent", (execution, context) =>
    defaultOutreachDraftHandler(execution, context, deps)
  );
  registry.set("ContactDiscoveryAgent", (execution, context) =>
    defaultContactDiscoveryHandler(execution, context, deps)
  );
  registry.set("MeetingPrepAgent", (execution, context) =>
    defaultMeetingPrepHandler(execution, context, deps)
  );
  registry.set("FutureContactDiscoveryAgent", async () =>
    futureAgentResult("FutureContactDiscoveryAgent")
  );
  registry.set("FutureMeetingPrepAgent", async () =>
    futureAgentResult("FutureMeetingPrepAgent")
  );

  return registry;
}

export function mapExecutorFailureToResult(error: unknown): AgentExecutorResult {
  if (error instanceof Error && error.message.trim()) {
    return {
      ok: false,
      error_message: error.message
    };
  }

  return {
    ok: false,
    error_message: "Agent execution failed unexpectedly."
  };
}

export type AgentHandlerSupabaseContext = {
  supabase: SupabaseClient;
};

export function toAgentMetadata(
  value: Record<string, unknown> | undefined
): AgentExecutionMetadata | undefined {
  if (!value) {
    return undefined;
  }

  const metadata: AgentExecutionMetadata = {};

  for (const [key, nestedValue] of Object.entries(value)) {
    if (
      typeof nestedValue === "string" ||
      typeof nestedValue === "number" ||
      typeof nestedValue === "boolean" ||
      nestedValue === null
    ) {
      metadata[key] = nestedValue;
    }
  }

  return metadata;
}
