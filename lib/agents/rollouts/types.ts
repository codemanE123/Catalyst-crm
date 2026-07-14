export const ROLLOUT_STATUSES = [
  "draft",
  "active",
  "paused",
  "completed",
  "cancelled"
] as const;

export type RolloutStatus = (typeof ROLLOUT_STATUSES)[number];

export const ROLLOUT_TYPES = [
  "percentage",
  "organization_allowlist",
  "user_allowlist",
  "fixed_control",
  "fixed_treatment"
] as const;

export type RolloutType = (typeof ROLLOUT_TYPES)[number];

export const ROLLOUT_PERCENTAGES = [0, 10, 25, 50, 100] as const;
export type RolloutPercentage = (typeof ROLLOUT_PERCENTAGES)[number];

export type ExperimentVariant = "control" | "treatment";

export type AgentRollout = {
  id: string;
  organization_id: string | null;
  agent_name: string;
  prompt_key: string;
  control_prompt_version_id: string;
  treatment_prompt_version_id: string;
  rollout_type: RolloutType;
  rollout_percentage: number;
  status: RolloutStatus;
  started_at: string | null;
  ended_at: string | null;
  created_by: string | null;
  metadata: Record<string, string | number | boolean | null | string[]>;
  created_at: string;
};

export type RolloutAssignmentContext = {
  organizationId: string;
  userId?: string | null;
  targetId?: string | null;
};

export type RolloutAssignmentResult = {
  variant: ExperimentVariant;
  rollout_id: string;
  prompt_version_id: string;
  assignment_key: string;
  assignment_bucket: number;
};
