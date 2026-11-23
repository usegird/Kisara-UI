import { observeSseLines } from '@/llm/sse';

const MS_PER_SECOND = 1000;

export const STREAM_LOG_LIMIT = 5000;

interface StreamLog {
  readonly lines: () => string[];
  readonly clear: () => void;
}

export function createStreamLog(now: () => number = () => performance.now()): StreamLog {
  const entries: string[] = [];
  let requests = 0;
  const add = (text: string): void => {
    entries.push(text);
    if (entries.length > STREAM_LOG_LIMIT) entries.splice(0, entries.length - STREAM_LOG_LIMIT);
  };
  observeSseLines(() => {
    requests += 1;
    const startedAt = now();
    add(`# request ${String(requests)} ${new Date().toISOString()}`);
    return (line) => add(`${((now() - startedAt) / MS_PER_SECOND).toFixed(2)}s\t${line}`);
  });
  return {
    lines: () => [...entries],
    clear: () => {
      entries.length = 0;
    },
  };
}

export function installStreamLog(): void {
  Object.assign(globalThis, { kisaraLlmLog: createStreamLog() });
}
