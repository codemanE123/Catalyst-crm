export const AGENT_NAMES = [
  "ProspectGenerationAgent",
  "ProspectEnrichmentAgent",
  "OutreachDraftAgent",
  "ContactDiscoveryAgent",
  "MeetingPrepAgent",
  "FutureContactDiscoveryAgent",
  "FutureMeetingPrepAgent"
] as const;

export type AgentName = (typeof AGENT_NAMES)[number];

export const AGENT_EXECUTION_STATUSES = [
  "queued",
  "running",
  "completed",
  "failed",
  "cancelled"
] as const;

export type AgentExecutionStatus = (typeof AGENT_EXECUTION_STATUSES)[number];

export type AgentExecutionMetadata = Record<
  string,
  string | number | boolean | null
>;

export type AgentExecution = {
  id: string;
  organization_id: string;
  agent_name: AgentName;
  target_type: string;
  target_id: string;
  status: AgentExecutionStatus;
  depends_on_execution_id: string | null;
  attempt_count: number;
  started_at: string | null;
  completed_at: string | null;
  duration_ms: number | null;
  error_message: string | null;
  metadata: AgentExecutionMetadata;
  created_at: string;
  updated_at: string;
};

export type QueueAgentInput = {
  organizationId: string;
  agentName: AgentName;
  targetType: string;
  targetId: string;
  metadata?: AgentExecutionMetadata;
  dependsOnExecutionId?: string | null;
  actorUserId: string;
};

export type QueueAgentChainInput = {
  organizationId: string;
  targetType: string;
  targetId: string;
  agentNames: AgentName[];
  metadata?: AgentExecutionMetadata;
  actorUserId: string;
};

export type AgentExecutorContext = {
  actorUserId: string;
  env?: NodeJS.ProcessEnv;
};

export type AgentExecutorResult =
  | {
      ok: true;
      metadata?: AgentExecutionMetadata;
    }
  | {
      ok: false;
      error_message: string;
      metadata?: AgentExecutionMetadata;
    };

export type AgentExecutor = (
  execution: AgentExecution,
  context: AgentExecutorContext
) => Promise<AgentExecutorResult>;

export const PROSPECT_AGENT_PIPELINE: AgentName[] = [
  "ProspectGenerationAgent",
  "ProspectEnrichmentAgent",
  "OutreachDraftAgent"
];

export const FUTURE_AGENT_NAMES: AgentName[] = [];

export function isFutureAgent(agentName: AgentName): boolean {
  return FUTURE_AGENT_NAMES.includes(agentName);
}

export function isTerminalAgentStatus(status: AgentExecutionStatus): boolean {
  return status === "completed" || status === "failed" || status === "cancelled";
}

export function dependencyIsSatisfied(
  dependency: AgentExecution | null | undefined
): boolean {
  return dependency?.status === "completed";
}
