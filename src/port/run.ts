import type { ApiPrompt } from '@/graph/to-api-prompt';
import type { ComfyFailure } from '@/port/connection';
import type { OutputFileRef } from '@/port/files';
import type { ManagerQueueStatus } from '@/port/manager';

export type ProgressNodeState = 'pending' | 'running' | 'finished' | 'error';

export interface ProgressNode {
  readonly nodeId: string;
  readonly displayNodeId: string;
  readonly value: number;
  readonly max: number;
  readonly state: ProgressNodeState;
}

export type ComfyEvent =
  | { readonly type: 'status'; readonly queueRemaining: number | null }
  | { readonly type: 'execution_start'; readonly promptId: string | null }
  | {
      readonly type: 'execution_cached';
      readonly promptId: string | null;
      readonly nodes: string[];
    }
  | {
      readonly type: 'executing';
      readonly promptId: string | null;
      readonly node: string | null;
      readonly displayNode: string | null;
    }
  | { readonly type: 'execution_success'; readonly promptId: string | null }
  | {
      readonly type: 'execution_interrupted';
      readonly promptId: string | null;
      readonly node: string | null;
    }
  | {
      readonly type: 'progress_state';
      readonly promptId: string | null;
      readonly nodes: readonly ProgressNode[];
    }
  | {
      readonly type: 'progress';
      readonly promptId: string | null;
      readonly node: string | null;
      readonly value: number;
      readonly max: number;
    }
  | {
      readonly type: 'executed';
      readonly promptId: string | null;
      readonly node: string | null;
      readonly files: readonly OutputFileRef[];
    }
  | {
      readonly type: 'execution_error';
      readonly promptId: string | null;
      readonly node: string | null;
      readonly message: string | null;
    }
  | ({ readonly type: 'manager_queue' } & ManagerQueueStatus)
  | { readonly type: 'unknown'; readonly rawType: string };

export interface PromptAccepted {
  readonly promptId: string;
  readonly number: number | null;
}

export interface PromptNodeError {
  readonly nodeId: string;
  readonly classType: string;
  readonly messages: readonly string[];
}

export interface RunFailureInput {
  readonly name: string;
  readonly values: readonly string[];
}

export interface RunFailure {
  readonly kind: 'error' | 'interrupted';
  readonly nodeId: string | null;
  readonly nodeType: string | null;
  readonly exceptionType: string | null;
  readonly message: string | null;
  readonly traceback: readonly string[];
  readonly inputs: readonly RunFailureInput[];
  readonly executed: readonly string[];
  readonly cached: readonly string[];
}

export interface PromptNode {
  readonly classType: string;
  readonly inputs: Readonly<Record<string, unknown>>;
}

export interface SubmitPromptParams {
  readonly prompt: ApiPrompt;
  readonly clientId: string;
  readonly workflow?: unknown;
  readonly session?: string | undefined;
}

export interface PromptRejection extends ComfyFailure {
  readonly reason: string | null;
  readonly nodeErrors: readonly PromptNodeError[];
}
