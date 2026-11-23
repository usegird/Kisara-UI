import type { ApiPrompt } from '@/graph/to-api-prompt';
import type { ComfyEvent, ProgressNode } from '@/port/run';
import { useExecutionStore } from '@/store/use-execution-store';

interface RunStep {
  readonly nodeId: string;
  readonly steps: number;
  readonly output: boolean;
}

function referenceOf(value: unknown): string | null {
  return Array.isArray(value) && value.length === 2 && typeof value[0] === 'string'
    ? value[0]
    : null;
}

function stepsOf(inputs: Record<string, unknown>): number {
  const steps = inputs.steps;
  return typeof steps === 'number' && Number.isInteger(steps) && steps > 0 ? steps : 0;
}

function byId(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true });
}

export function planRun(prompt: ApiPrompt, isOutput: (classType: string) => boolean): RunStep[] {
  const ids = Object.keys(prompt).sort(byId);
  const waiting = new Map<string, Set<string>>();
  for (const id of ids) {
    const inputs = prompt[id]?.inputs ?? {};
    const deps = Object.values(inputs)
      .map(referenceOf)
      .filter((dep): dep is string => dep !== null && dep in prompt && dep !== id);
    waiting.set(id, new Set(deps));
  }

  const order: string[] = [];
  const done = new Set<string>();
  while (order.length < ids.length) {
    const ready = ids.filter(
      (id) => !done.has(id) && [...(waiting.get(id) ?? [])].every((dep) => done.has(dep)),
    );
    const next = ready.length > 0 ? ready : ids.filter((id) => !done.has(id));
    for (const id of next) {
      order.push(id);
      done.add(id);
    }
  }

  return order.map((nodeId) => {
    const node = prompt[nodeId];
    return {
      nodeId,
      steps: node ? stepsOf(node.inputs) : 0,
      output: node ? isOutput(node.class_type) : false,
    };
  });
}

const NODE_MS = 120;
const STEP_MS = 40;
const OUTPUT_MS = 300;

interface SimulationHandlers {
  readonly onOutput: (nodeId: string) => void;
  readonly onStep: (finished: number) => void;
  readonly onDone: () => void;
}

let runCount = 0;

function progressState(
  promptId: string,
  plan: readonly RunStep[],
  current: number,
  value: number,
): ComfyEvent {
  const nodes: ProgressNode[] = plan.map((step, index) => ({
    nodeId: step.nodeId,
    displayNodeId: step.nodeId,
    value: index === current ? value : 0,
    max: Math.max(step.steps, 1),
    state: stepStateOf(index, current),
  }));
  return { type: 'progress_state', promptId, nodes };
}

export function runSimulation(plan: readonly RunStep[], handlers: SimulationHandlers): () => void {
  runCount += 1;
  const promptId = `simulated-${String(runCount)}`;
  const store = useExecutionStore.getState();
  const apply = (event: ComfyEvent): void => useExecutionStore.getState().applyEvent(event);

  const actions: { readonly wait: number; readonly run: () => void }[] = [];
  plan.forEach((step, index) => {
    actions.push({
      wait: index === 0 ? 0 : NODE_MS,
      run: () => {
        handlers.onStep(index);
        apply(progressState(promptId, plan, index, 0));
        apply({ type: 'executing', promptId, node: step.nodeId, displayNode: step.nodeId });
      },
    });
    for (let value = 1; value <= step.steps; value += 1) {
      actions.push({
        wait: STEP_MS,
        run: () => {
          apply({ type: 'progress', promptId, node: step.nodeId, value, max: step.steps });
        },
      });
    }
    if (step.output) {
      actions.push({ wait: OUTPUT_MS, run: () => handlers.onOutput(step.nodeId) });
    }
  });
  actions.push({
    wait: NODE_MS,
    run: () => {
      handlers.onStep(plan.length);
      apply(progressState(promptId, plan, plan.length, 0));
      apply({ type: 'execution_success', promptId });
      handlers.onDone();
    },
  });

  store.start(
    promptId,
    plan.map((step) => step.nodeId),
  );
  apply({ type: 'execution_start', promptId });

  let timer: ReturnType<typeof setTimeout> | null = null;
  let index = 0;
  const next = (): void => {
    const action = actions[index];
    if (action === undefined) {
      timer = null;
      return;
    }
    timer = setTimeout(() => {
      index += 1;
      action.run();
      next();
    }, action.wait);
  };
  next();

  return () => {
    if (timer === null) return;
    clearTimeout(timer);
    timer = null;
    useExecutionStore.getState().stop();
  };
}

function stepStateOf(index: number, current: number): ProgressNode['state'] {
  if (index < current) return 'finished';
  return index === current ? 'running' : 'pending';
}
