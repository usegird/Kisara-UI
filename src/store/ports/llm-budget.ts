import { estimateMessages, estimateText, estimateTools } from '@/chat/tokens';
import type { ChatStreamEvent, LlmFailure, LlmPort, LlmResult } from '@/port/llm-port';
import type { Safeguards } from '@/store/settings-fields/safeguards';
import { useLlmBudgetStore, type BudgetUsage } from '@/store/use-llm-budget-store';
import { useSettingsStore } from '@/store/use-settings-store';

// ─────────────────────────────
// 要求の量の歯止め。LLM の生成の要求（会話・要約・構成の相談）をすべてここで数え、上限や閾値を
// 超えたら送らず・止める（不具合での巨大な入力や暴走を止める）。同意の関門の内側で包む。
// ─────────────────────────────

/** 1 分のミリ秒（設定の窓と無言の閾値は分で持つ） */
const MS_PER_MINUTE = 60_000;

// 上限と閾値は設定の防御機構の値（settings-fields/safeguards）を使う。画面からは変えない

/** 上限と閾値（要求のたびに読む） */
function limits(): Safeguards {
  return useSettingsStore.getState().safeguards;
}

/** 数える窓（ms） */
export function budgetWindowMs(): number {
  return limits().llmWindowMinutes * MS_PER_MINUTE;
}

interface Entry {
  readonly at: number;
  input: number;
  output: number;
}

// このページの中だけで数える（端末に残さない。ほかのブラウザのタブとは合わせない）
let entries: Entry[] = [];
let now: () => number = () => Date.now();

/** テストから時計を差し替える（null で戻す） */
export function setBudgetClock(clock: (() => number) | null): void {
  now = clock ?? (() => Date.now());
}

/** 窓の間の量（古い分は捨てる） */
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

/** 届いたものの出力の見積もり */
function outputOf(event: ChatStreamEvent): number {
  if (event.kind === 'delta') return estimateText(event.content) + estimateText(event.reasoning);
  if (event.kind === 'tool-call') return estimateText(event.name) + estimateText(event.arguments);
  return 0;
}

/** LLM の窓口を、要求の量の歯止めで包む。生成の要求のほか（モデルの一覧・キーの確認）はそのまま通す */
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
      // 受け取りの途中で閾値を超えたら、この要求も止める（呼び出し側の止める合図とは別に持つ）
      const controller = new AbortController();
      const forward = (): void => controller.abort();
      signal.addEventListener('abort', forward);
      let stopped = false;
      // 中身が届かないまま上限の時間が過ぎたら止める。注釈の行（処理中の印）だけでは数え直さない
      // （届くたびに待ち直す読み取りが終わらないのを防ぐ）
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

/** 続ける（窓を数え直し、止めるのを外す）。テストからも呼ぶ */
export function resumeLlmBudget(): void {
  entries = [];
  useLlmBudgetStore.setState({ paused: null, asking: false });
}
