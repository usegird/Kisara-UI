import type { ProgressNodeState } from '@/port/run';
import type { ExecutionProgress, NodeTiming } from '@/queue/execution-state';

export interface RunProgressInput {
  readonly nodeIds: readonly string[];
  readonly nodeStates: Readonly<Record<string, ProgressNodeState>>;
  readonly cachedNodes: readonly string[];
  readonly timings: readonly NodeTiming[];
  readonly runningNode: string | null;
  readonly step: ExecutionProgress | null;
  readonly previous: readonly NodeTiming[] | null;
  readonly now: number;
}

export function runProgressOf(input: RunProgressInput): ExecutionProgress | null {
  if (input.nodeIds.length === 0) return null;

  const done = doneNodesOf(input);
  const expected = expectedDurationsOf(input.nodeIds, input.previous);
  return expected === null ? countProgressOf(input, done) : timeProgressOf(input, done, expected);
}

export function previousTimingsOf(
  promptId: string,
  promptNodesById: Readonly<Record<string, readonly string[]>>,
  nodeTimingsById: Readonly<Record<string, readonly NodeTiming[]>>,
): readonly NodeTiming[] | null {
  const current = promptNodesById[promptId];
  if (current === undefined || current.length === 0) return null;

  const runs = Object.entries(nodeTimingsById).filter(([id]) => id !== promptId);
  for (const [id, timings] of runs.reverse()) {
    if (!timings.some((timing) => timing.endedAt !== null)) continue;
    const sent = new Set(promptNodesById[id] ?? timings.map((timing) => timing.nodeId));
    const shared = current.filter((nodeId) => sent.has(nodeId)).length;
    if (shared * 2 >= current.length) return timings;
  }
  return null;
}

function expectedDurationsOf(
  nodeIds: readonly string[],
  previous: readonly NodeTiming[] | null,
): ReadonlyMap<string, number> | null {
  const durations = new Map<string, number>();
  for (const timing of previous ?? []) {
    if (timing.endedAt === null) continue;
    const spent = Math.max(0, timing.endedAt - timing.startedAt);
    durations.set(timing.nodeId, (durations.get(timing.nodeId) ?? 0) + spent);
  }

  const known = nodeIds.flatMap((nodeId) => durations.get(nodeId) ?? []);
  const sum = known.reduce((total, spent) => total + spent, 0);
  if (sum <= 0) return null;

  const mean = sum / known.length;
  return new Map(nodeIds.map((nodeId) => [nodeId, durations.get(nodeId) ?? mean]));
}

function doneNodesOf(input: RunProgressInput): ReadonlySet<string> {
  const done = new Set(input.cachedNodes);
  for (const [nodeId, state] of Object.entries(input.nodeStates)) {
    if (state === 'finished' || state === 'error') done.add(nodeId);
  }
  for (const timing of input.timings) {
    if (timing.endedAt !== null && timing.nodeId !== input.runningNode) done.add(timing.nodeId);
  }
  return done;
}

function timeProgressOf(
  input: RunProgressInput,
  done: ReadonlySet<string>,
  expected: ReadonlyMap<string, number>,
): ExecutionProgress {
  const now = clockOf(input);
  const first = input.timings[0];
  const elapsed = first === undefined ? 0 : Math.max(0, now - first.startedAt);
  const inRunning = runningElapsedOf(input, now);

  let remaining = 0;
  let total = 0;
  let reached = 0;
  for (const nodeId of input.nodeIds) {
    const spent = expected.get(nodeId) ?? 0;
    total += spent;
    if (done.has(nodeId) || nodeId === input.runningNode) reached += spent;
    if (done.has(nodeId)) continue;
    remaining += nodeId === input.runningNode ? Math.max(0, spent - inRunning) : spent;
  }

  const max = elapsed + remaining;
  if (max <= 0) return { value: 1, max: 1 };
  return { value: Math.min(elapsed, (max * reached) / total), max };
}

function countProgressOf(input: RunProgressInput, done: ReadonlySet<string>): ExecutionProgress {
  let value = 0;
  for (const nodeId of input.nodeIds) {
    if (done.has(nodeId)) value += 1;
    else if (nodeId === input.runningNode) value += stepShareOf(input.step);
  }
  return { value, max: input.nodeIds.length };
}

function clockOf(input: RunProgressInput): number {
  let latest = input.now;
  for (const timing of input.timings) {
    latest = Math.max(latest, timing.startedAt, timing.endedAt ?? 0);
  }
  return latest;
}

function runningElapsedOf(input: RunProgressInput, now: number): number {
  const open = input.timings.findLast(
    (timing) => timing.nodeId === input.runningNode && timing.endedAt === null,
  );
  return open === undefined ? 0 : now - open.startedAt;
}

function stepShareOf(step: ExecutionProgress | null): number {
  if (step === null || step.max <= 0) return 0;
  return Math.min(1, Math.max(0, step.value / step.max));
}
