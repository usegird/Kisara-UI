import { estimateMessages, estimateText, estimateTools } from '@/chat/tokens';
import type { ChatStreamEvent, LlmFailure, LlmPort, LlmResult } from '@/port/llm-port';
import type { Safeguards } from '@/store/settings-fields/safeguards';
import { useLlmBudgetStore, type BudgetUsage } from '@/store/use-llm-budget-store';
import { useSettingsStore } from '@/store/use-settings-store';

const MS_PER_MINUTE = 60_000;

function limits(): Safeguards {
  return useSettingsStore.getState().safeguards;
}

export function budgetWindowMs(): number {
  return limits().llmWindowMinutes * MS_PER_MINUTE;
}

interface Entry {
  readonly at: number;
  input: number;
  output: number;
}

let entries: Entry[] = [];
let now: () => number = () => Date.now();

export function setBudgetClock(clock: (() => number) | null): void {
  now = clock ?? (() => Date.now());
}

function usage(): BudgetUsage {
  const from = now() - budgetWindowMs();
  entries = entries.filter((entry) => entry.at >= from);
  return entries.reduce(
    (sum, entry) => ({ input: sum.input + entry.input, output: sum.output + entry.output }),
    { input: 0, output: 0 },
  );
}

function over(total: BudgetUsage): boolean {
  const { llmWindowInputLimit, llmWindowOutputLimit } = limits();
  return total.input > llmWindowInputLimit || total.output > llmWindowOutputLimit;
}

function pause(total: BudgetUsage): void {
  useLlmBudgetStore.setState({ paused: total, asking: true });
}

function refuse(kind: LlmFailure['kind']): Promise<LlmResult<null>> {
  return Promise.resolve({ ok: false, failure: { kind } });
}

function outputOf(event: ChatStreamEvent): number {
  if (event.kind === 'delta') return estimateText(event.content) + estimateText(event.reasoning);
  if (event.kind === 'tool-call') return estimateText(event.name) + estimateText(event.arguments);
  return 0;
}

export function budgetLlmPort(port: LlmPort): LlmPort {
  return {
    listModels: (endpoint, signal) => port.listModels(endpoint, signal),
    checkKey: (endpoint, signal) => port.checkKey(endpoint, signal),
    streamChat: async (endpoint, request, { onEvent, signal }) => {
      if (useLlmBudgetStore.getState().paused !== null) {
        useLlmBudgetStore.setState({ asking: true });
        return refuse('paused');
      }
      const input = estimateMessages(request.messages) + estimateTools(request.tools ?? []);
      if (input > limits().llmRequestInputMax) return refuse('too-large');
      const entry: Entry = { at: now(), input, output: 0 };
      entries.push(entry);
      const before = usage();
      if (over(before)) {
        pause(before);
        return refuse('paused');
      }
      const controller = new AbortController();
      const forward = (): void => controller.abort();
      signal.addEventListener('abort', forward);
      let stopped = false;
      let silent = false;
      let silence: ReturnType<typeof setTimeout> | undefined;
      const waitSilence = (): void => {
        clearTimeout(silence);
        silence = setTimeout(() => {
          silent = true;
          controller.abort();
        }, limits().llmSilentMinutes * MS_PER_MINUTE);
      };
      waitSilence();
      const watch = (event: ChatStreamEvent): void => {
        if (event.kind === 'delta' || event.kind === 'tool-call') waitSilence();
        if (event.kind === 'usage') {
          entry.input = event.usage.prompt;
          entry.output = event.usage.completion;
        } else {
          entry.output += outputOf(event);
        }
        onEvent(event);
        const total = usage();
        if (!stopped && over(total)) {
          stopped = true;
          pause(total);
          controller.abort();
        }
      };
      try {
        const result = await port.streamChat(endpoint, request, {
          onEvent: watch,
          signal: controller.signal,
        });
        if (signal.aborted) return result;
        if (stopped) return { ok: false, failure: { kind: 'paused' } };
        return silent ? { ok: false, failure: { kind: 'timeout' } } : result;
      } finally {
        clearTimeout(silence);
        signal.removeEventListener('abort', forward);
      }
    },
  };
}

export function resumeLlmBudget(): void {
  entries = [];
  useLlmBudgetStore.setState({ paused: null, asking: false });
}
