import type { LlmPort } from '@/port/llm-port';
import { budgetLlmPort } from '@/store/ports/llm-budget';
import { recordSentLlmPort } from '@/store/ports/llm-sent-log';
import { guardLlmPort } from '@/store/ports/network-consent';
import { traceLlmPort } from '@/store/ports/trace-ports';

let current: LlmPort | null = null;

export function installLlmPort(port: LlmPort): void {
  current = traceLlmPort(guardLlmPort(budgetLlmPort(recordSentLlmPort(port))));
}

export function llmPort(): LlmPort {
  if (current === null) throw new Error('LlmPort is not installed (call installLlmPort first)');
  return current;
}
