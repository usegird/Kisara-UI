const KIBI = 1024;

interface SseReader {
  readonly push: (chunk: string) => string[];
  readonly flush: () => string[];
}

type SseLineObserver = () => (line: string) => void;

let observer: SseLineObserver | null = null;

export function observeSseLines(next: SseLineObserver | null): void {
  observer = next;
}

interface SseReaderOptions {
  readonly onComment?: (text: string) => void;
  readonly onLine?: (line: string) => void;
  readonly maxLineChars?: number;
}

const SSE_LINE_MAX_CHARS = KIBI * KIBI;

const DATA_FIELD = 'data:';

export class SseLineTooLongError extends Error {}

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
