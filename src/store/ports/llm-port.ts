import type { LlmPort } from '@/port/llm-port';
import { budgetLlmPort } from '@/store/ports/llm-budget';
import { recordSentLlmPort } from '@/store/ports/llm-sent-log';
import { guardLlmPort } from '@/store/ports/network-consent';
import { traceLlmPort } from '@/store/ports/trace-ports';

// ─────────────────────────────
// LLM の窓口の受け口（形は comfy-port.ts と同じ）。入口が実装を 1 つ入れる。
// ─────────────────────────────

let current: LlmPort | null = null;

/**
 * 入口から呼ぶ。後から入れたものが勝つ。外部のクラウドへは注意に合意するまで送らない関門で包み、
 * その内側で要求の量の歯止めで包む。いちばん内側で送った本文を記録する。
 * いちばん外側で要求の結果を診断のログに残す（関門と歯止めが断った分も残る）
 */
export function installLlmPort(port: LlmPort): void {
  current = traceLlmPort(guardLlmPort(budgetLlmPort(recordSentLlmPort(port))));
}

/** 入っている窓口。入口より先に呼ばれたら、入れ忘れとして投げる */
export function llmPort(): LlmPort {
  if (current === null) throw new Error('LlmPort is not installed (call installLlmPort first)');
  return current;
}
