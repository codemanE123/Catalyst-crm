import {
  classifyAgentFailure,
  isRetriableFailureClass,
  type AgentFailureClass
} from "./failureClassification";

export const DEFAULT_AGENT_MAX_ATTEMPTS = 3;
export const DEFAULT_AGENT_WORKER_BATCH_SIZE = 5;
export const DEFAULT_STALE_RUNNING_MINUTES = 15;

export function resolveAgentMaxAttempts(env: NodeJS.ProcessEnv = process.env): number {
  const parsed = Number.parseInt(env.AGENT_MAX_ATTEMPTS ?? "", 10);

  if (!Number.isFinite(parsed)) {
    return DEFAULT_AGENT_MAX_ATTEMPTS;
  }

  return Math.min(10, Math.max(1, parsed));
}

export function resolveAgentWorkerBatchSize(
  env: NodeJS.ProcessEnv = process.env
): number {
  const parsed = Number.parseInt(env.AGENT_WORKER_BATCH_SIZE ?? "", 10);

  if (!Number.isFinite(parsed)) {
    return DEFAULT_AGENT_WORKER_BATCH_SIZE;
  }

  return Math.min(25, Math.max(1, parsed));
}

export function computeRetryBackoffMs(attemptCount: number): number {
  const attempt = Math.max(1, attemptCount);
  const baseMs = 30_000;
  const maxMs = 15 * 60_000;
  const delay = baseMs * 2 ** (attempt - 1);
  return Math.min(maxMs, delay);
}

export function computeNextRetryAt(
  attemptCount: number,
  now: Date = new Date()
): string {
  return new Date(now.getTime() + computeRetryBackoffMs(attemptCount)).toISOString();
}

export type RetryDecision =
  | {
      shouldRetry: true;
      failureClass: AgentFailureClass;
      nextRetryAt: string;
      nextAttemptCount: number;
    }
  | {
      shouldRetry: false;
      failureClass: AgentFailureClass;
      exhausted: boolean;
    };

export function decideAgentRetry(input: {
  attemptCount: number;
  maxAttempts: number;
  errorMessage: string | null | undefined;
  errorCode?: string | null;
  now?: Date;
}): RetryDecision {
  const failureClass = classifyAgentFailure(input.errorMessage, input.errorCode);
  const exhausted = input.attemptCount >= input.maxAttempts;

  if (!isRetriableFailureClass(failureClass) || exhausted) {
    return {
      shouldRetry: false,
      failureClass,
      exhausted: isRetriableFailureClass(failureClass) && exhausted
    };
  }

  return {
    shouldRetry: true,
    failureClass,
    nextRetryAt: computeNextRetryAt(input.attemptCount, input.now),
    nextAttemptCount: input.attemptCount
  };
}
