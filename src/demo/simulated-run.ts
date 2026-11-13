import type { ApiPrompt } from '@/graph/to-api-prompt';
import type { ComfyEvent, ProgressNode } from '@/port/run';
import { useExecutionStore } from '@/store/use-execution-store';

// ─────────────────────────────
// デモの模擬実行。実行の形に変えたノードを処理の順に並べ、ComfyUI の通知と同じ形の事象を
// 時間をかけて実行の状況のストアへ流す。**通信はしない。**
// ─────────────────────────────

/** 模擬実行の計画の 1 段。ノード 1 つぶん */
interface RunStep {
  /** 実行の形のノード id（`12` / subgraph の中なら `12:34`） */
  readonly nodeId: string;
  /** 進める手数（`steps` の値を持つノード）。持たなければ 0 */
  readonly steps: number;
  /** 出力ノード（結果の画像を出す） */
  readonly output: boolean;
}

/** 実行の形の入力が、別のノードの出力を指しているか（`[ノード id, 出力の番号]`） */
function referenceOf(value: unknown): string | null {
  return Array.isArray(value) && value.length === 2 && typeof value[0] === 'string'
    ? value[0]
    : null;
}

function stepsOf(inputs: Record<string, unknown>): number {
  const steps = inputs.steps;
  return typeof steps === 'number' && Number.isInteger(steps) && steps > 0 ? steps : 0;
}

/** id の並び（`2` は `10` より前。subgraph の中の id も数として比べる） */
function byId(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true });
}

/**
 * 実行の計画。指されるノードを先に、同じ段では id の小さい順に並べる。
 * 輪になっているノード（本来は送れない）は最後に id の順で足す
 */
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

// ─────────────────────────────
// 時間の配り方。全体で数秒に収まるよう、手数 1 つを短くする
// ─────────────────────────────

/** 手数を持たないノードの長さ */
const NODE_MS = 120;
/** 手数 1 つの長さ */
const STEP_MS = 40;
/** 出力ノードの長さ（画像を書き出している見立て） */
const OUTPUT_MS = 300;

/** 模擬実行の進みを受け取る手続き */
interface SimulationHandlers {
  /** 出力ノードが終わった */
  readonly onOutput: (nodeId: string) => void;
  /** 終わったノードの数が変わった */
  readonly onStep: (finished: number) => void;
  /** すべて終わった */
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

/** 事象を流し始める。戻り値は止める手続き（止めたら実行の状況を解く） */
export function runSimulation(plan: readonly RunStep[], handlers: SimulationHandlers): () => void {
  runCount += 1;
  const promptId = `simulated-${String(runCount)}`;
  const store = useExecutionStore.getState();
  const apply = (event: ComfyEvent): void => useExecutionStore.getState().applyEvent(event);

  // 流す順に「待つ時間と、そのときにすること」を並べる
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

  store.start(promptId, plan.length);
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

/** 段の状態。今の段より前は済み、今の段は実行中、後は待ち */
function stepStateOf(index: number, current: number): ProgressNode['state'] {
  if (index < current) return 'finished';
  return index === current ? 'running' : 'pending';
}
