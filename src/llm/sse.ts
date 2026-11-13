// ─────────────────────────────
// SSE（text/event-stream）の読み取りの唯一の入口。行を区切り、`data:` の中身だけを順に返す
// （`event:`・`id:` は使わず、注釈の行は `onComment` に渡すだけ）。
// ─────────────────────────────

/** 2 進の千（長さの上限の単位） */
const KIBI = 1024;

/** SSE の読み取り。届いた文字を足していき、出来上がった出来事の `data` を返す */
interface SseReader {
  /** 届いた文字を足し、出来上がった出来事の `data` を返す */
  readonly push: (chunk: string) => string[];
  /** 終わりに、区切りの空行が無いまま残った出来事を返す */
  readonly flush: () => string[];
}

/**
 * 開発用に、届いた行（注釈の行も含む。空の行は除く）を見る口。読み取りを作るたびに呼ばれ、
 * その要求の行を渡す先を返す。入れるのは開発サーバの記録（`stream-log.ts`）だけ
 */
type SseLineObserver = () => (line: string) => void;

let observer: SseLineObserver | null = null;

/** 開発サーバで、使わない行も含めて届いた行を記録に渡す口を入れる（null で外す） */
export function observeSseLines(next: SseLineObserver | null): void {
  observer = next;
}

/** SSE の読み取りを作るときに渡すもの */
interface SseReaderOptions {
  /** 注釈の行（`:` で始まる）の中身（先頭の `:` と前後の空白を除いたもの） */
  readonly onComment?: (text: string) => void;
  /**
   * 届いた行をそのまま（空の行は除く。受け取った中身の控え）
   */
  readonly onLine?: (line: string) => void;
  /** 1 行の長さの上限（文字数）。超えたら `SseLineTooLongError` を投げる。既定は `SSE_LINE_MAX_CHARS` */
  readonly maxLineChars?: number;
}

/**
 * 1 行の長さの上限（約 1 MB。改行を送らないサーバーで溜まりを増やし続けない）
 */
const SSE_LINE_MAX_CHARS = KIBI * KIBI;

/** 中身を持つ行の頭 */
const DATA_FIELD = 'data:';

/** 1 行が上限を超えた */
export class SseLineTooLongError extends Error {}

/**
 * SSE の読み取りを作る。1 つの出来事が複数の `data:` 行に分かれていれば改行でつなぐ（SSE の仕様）。
 * 1 行が上限を超えたら `SseLineTooLongError` を投げる
 */
export function createSseReader(options: SseReaderOptions = {}): SseReader {
  const maxLine = options.maxLineChars ?? SSE_LINE_MAX_CHARS;
  let buffer = '';
  let data: string[] = [];
  const watch = observer?.() ?? null;

  const takeLine = (line: string, out: string[]): void => {
    if (line.length > 0) {
      watch?.(line);
      options.onLine?.(line);
    }
    if (line.startsWith(':')) {
      options.onComment?.(line.slice(1).trim());
      return;
    }
    if (line.length === 0) {
      if (data.length > 0) out.push(data.join('\n'));
      data = [];
      return;
    }
    if (!line.startsWith(DATA_FIELD)) return;
    const value = line.slice(DATA_FIELD.length);
    data.push(value.startsWith(' ') ? value.slice(1) : value);
  };

  return {
    push: (chunk) => {
      buffer += chunk;
      const out: string[] = [];
      let index = buffer.search(/\r\n|\r|\n/);
      while (index >= 0) {
        const line = buffer.slice(0, index);
        const breakLength = buffer.startsWith('\r\n', index) ? 2 : 1;
        // \r で切れた直後に \n が後から届く場合に備え、末尾の \r は次を待つ
        if (buffer[index] === '\r' && index + 1 === buffer.length) break;
        buffer = buffer.slice(index + breakLength);
        if (line.length > maxLine) throw new SseLineTooLongError();
        takeLine(line, out);
        index = buffer.search(/\r\n|\r|\n/);
      }
      if (buffer.length > maxLine) throw new SseLineTooLongError();
      return out;
    },
    flush: () => {
      const out: string[] = [];
      if (buffer.length > 0) takeLine(buffer.replace(/\r$/, ''), out);
      buffer = '';
      takeLine('', out);
      return out;
    },
  };
}
