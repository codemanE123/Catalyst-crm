import type { SupabaseClient } from "@supabase/supabase-js";

import { recordAuditEvent } from "@/lib/auditLog";

import type { AgentHandlerDependencies } from "./handlers";
import { createAgentHandlerRegistry } from "./handlers";
import {
  AgentOrchestrator,
  type RunNextAgentResult
} from "./orchestrator";
import type { AgentExecutionStore } from "./store";
import {
  createSupabaseAgentAuditRecorder,
  SupabaseAgentExecutionStore
} from "./supabaseStore";
import type { AgentExecution } from "./types";

export type ProcessNextAgentWorkerResult =
  | {
      ok: true;
      ran: false;
      message: string;
    }
  | {
      ok: true;
      ran: true;
      execution: AgentExecution;
      message: string;
    }
  | {
      ok: false;
      error: string;
    };

export class AgentWorker {
  constructor(private readonly orchestrator: AgentOrchestrator) {}

  async processNext(params: {
    organizationId: string;
    actorUserId: string;
    env?: NodeJS.ProcessEnv;
  }): Promise<ProcessNextAgentWorkerResult> {
    const result = await this.orchestrator.runNextAgent(params);
    return toWorkerResult(result);
  }
}

export function toWorkerResult(result: RunNextAgentResult): ProcessNextAgentWorkerResult {
  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  if (!result.ran || !result.execution) {
    return {
      ok: true,
      ran: false,
      message: result.reason
    };
  }

  if (result.execution.status === "completed") {
    return {
      ok: true,
      ran: true,
      execution: result.execution,
      message: `${result.execution.agent_name} completed successfully.`
    };
  }

  if (result.execution.status === "failed") {
    return {
      ok: true,
      ran: true,
      execution: result.execution,
      message:
        result.execution.error_message ??
        `${result.execution.agent_name} failed.`
    };
  }

  return {
    ok: true,
    ran: true,
    execution: result.execution,
    message: `${result.execution.agent_name} finished with status ${result.execution.status}.`
  };
}

export function createAgentOrchestrator(
  store: AgentExecutionStore,
  options?: {
    handlerDependencies?: AgentHandlerDependencies;
    auditRecorder?: import("./orchestrator").AgentAuditRecorder;
  }
): AgentOrchestrator {
  const handlers = createAgentHandlerRegistry(options?.handlerDependencies ?? {});

  return new AgentOrchestrator(store, handlers, options?.auditRecorder);
}

export function createAgentWorkerFromStore(
  store: AgentExecutionStore,
  options?: {
    handlerDependencies?: AgentHandlerDependencies;
    auditRecorder?: import("./orchestrator").AgentAuditRecorder;
  }
): AgentWorker {
  return new AgentWorker(createAgentOrchestrator(store, options));
}

export function createAgentWorkerFromSupabase(
  supabase: SupabaseClient,
  options?: {
    handlerDependencies?: AgentHandlerDependencies;
  }
): AgentWorker {
  return createAgentWorkerFromStore(new SupabaseAgentExecutionStore(supabase), {
    handlerDependencies: options?.handlerDependencies,
    auditRecorder: createSupabaseAgentAuditRecorder(supabase, recordAuditEvent)
  });
}
