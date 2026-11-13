import { observeSseLines } from '@/llm/sse';

// ─────────────────────────────
// LLM から受け取った SSE の行の、画面のメモリだけの記録。**開発サーバでだけ**入口から入れる。
// 送った中身と API キーは記録しない（受け取った行だけを見る）。
// ─────────────────────────────

/** 1 秒のミリ秒（行の頭の経過時間は秒で書く） */
const MS_PER_SECOND = 1000;

/** 残す行の数。超えたら古い方から捨てる */
export const STREAM_LOG_LIMIT = 5000;

/** SSE の行の記録。読む・消す */
interface StreamLog {
  /** 記録した行。要求ごとに `# request N 時刻` の区切りの行が先に入る */
  readonly lines: () => string[];
  readonly clear: () => void;
}

/** 届いた行を、要求ごとに「送ってからの秒・行」で記録し始める */
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

/** 記録を始め、開発者のコンソールから `kisaraLlmLog` で読めるようにする */
export function installStreamLog(): void {
  Object.assign(globalThis, { kisaraLlmLog: createStreamLog() });
}
