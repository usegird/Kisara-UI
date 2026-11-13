import { safeStorage } from '@/lib/safe-storage';
import { hold } from '@/lib/web-locks';

// ─────────────────────────────
// タブごとの識別子。タブごとの保存領域（sessionStorage）に置き、読み込み直しても同じ値を返す。
// 保存領域・Web Locks に触れない環境では、作った値をそのまま使う。
// ─────────────────────────────

function readStored(key: string): string | null {
  try {
    // 入口は読むたびに作る（テストが保存領域を差し替える）
    const value = safeStorage('session').getItem(key);
    return typeof value !== 'string' || value.length === 0 ? null : value;
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string): void {
  void safeStorage('session').setItem(key, value);
}

/**
 * このタブの識別子。保存してあればそれを、ほかのタブが使っていれば作り直したものを返す。
 * 複製したタブは保存領域ごと写されて同じ値を持ってしまうので、Web Locks で値ごとの鍵を
 * タブを閉じるまで持ち、鍵が取れなければ作り直す。鍵の名前は `key` と値をつないだもの
 */
export async function claimTabId(key: string, create: () => string): Promise<string> {
  const stored = readStored(key);
  if (stored !== null && (await hold(`${key}:${stored}`))) return stored;
  return renewTabId(key, create);
}

/** 保存してある識別子。無ければ null（取り直す前に、複製されたかを見分けるため） */
export function readTabId(key: string): string | null {
  return readStored(key);
}

/** 新しい識別子に切り替える（作り直す）。鍵を取り、保存して返す */
async function renewTabId(key: string, create: () => string): Promise<string> {
  let id = create();
  if (!(await hold(`${key}:${id}`))) {
    id = create();
    await hold(`${key}:${id}`);
  }
  writeStored(key, id);
  return id;
}

/** タブごとの保存領域の文字列の並び。無い・読めなければ空 */
export function readTabList(key: string): string[] {
  const raw = readStored(key);
  if (raw === null) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

/** 文字列の並びをタブごとの保存領域に書く。書けなくても落とさない */
export function writeTabList(key: string, items: readonly string[]): void {
  writeStored(key, JSON.stringify(items));
}
