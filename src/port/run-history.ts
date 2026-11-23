import type { SlotNode, ValueSlot } from '@/graph/run-record';

export type PromptRoleMark = 'posi' | 'nega' | null;

export type PromptSlot = readonly [nodeId: string, input: string, role: PromptRoleMark];

export interface RunHistoryWorkflow {
  readonly model: readonly string[];
  readonly lora: readonly string[];
  readonly other: readonly string[];
  readonly nodes: Readonly<Record<string, SlotNode>>;
  readonly seeds: readonly ValueSlot[];
  readonly prompts: readonly PromptSlot[];
  readonly name?: string | undefined;
}

export interface RunHistoryRun {
  readonly start: number;
  readonly end: number | null;
  readonly paths: readonly string[];
  readonly workflow: string | null;
  readonly prompt: string | null;
  readonly seeds: readonly unknown[];
}

export interface RunHistoryFile {
  readonly workflows: Readonly<Record<string, RunHistoryWorkflow>>;
  readonly prompts: Readonly<Record<string, readonly unknown[]>>;
  readonly runs: readonly RunHistoryRun[];
  readonly name?: string | undefined;
}

export interface RunHistoryEntry {
  readonly name: string;
  readonly modified: number | null;
}

export type RunHistoryRead =
  | { readonly kind: 'file'; readonly file: RunHistoryFile }
  | { readonly kind: 'missing' }
  | { readonly kind: 'unreadable' };

export interface HistoryRunSource {
  readonly promptId: string;
  readonly startedAt: number | null;
  readonly finishedAt: number | null;
  readonly paths: readonly string[];
  readonly workflow: unknown;
  readonly session: string | null;
  readonly sent?: boolean | undefined;
}
