import type { StateStorage } from 'zustand/middleware';

import { isRecord } from '@/lib/guards';
import { mergeChangedKeys } from '@/lib/merge-changes';
import { safeStorage } from '@/lib/safe-storage';

// ─────────────────────────────
// 設定を端末に書く手続き。掴んで動かしている間は書かずに最後の値を持ち、離したら 1 回書く。
// 書くときは前に読んだ・書いた値と比べて変わった項目だけを重ねる。
// ─────────────────────────────

// 掴んで動かしている間（幅・高さ・枠の大きさ）は書かずに最後の値を持ち、離したら 1 回書く
// （動かすたびに設定の全体を書かない）
const baseStorage = safeStorage();
let holds = 0;
let pending: { readonly name: string; readonly value: string } | null = null;

/**
 * このタブが前に読んだ・書いた設定（`{ state, version }` の JSON）。書くときはこれと比べて
 * 変わった項目だけを、読み直した置き場の値に重ねる（古いタブがほかのタブの変更を消さない）
 */
const lastSeen = new Map<string, string>();

function storedText(name: string): string | null {
  const raw = baseStorage.getItem(name);
  return typeof raw === 'string' ? raw : null;
}

function stateOf(text: string | null | undefined): unknown {
  if (typeof text !== 'string') return null;
  try {
    const parsed: unknown = JSON.parse(text);
    return isRecord(parsed) ? parsed.state : null;
  } catch {
    return null;
  }
}

function writeSettings(name: string, value: string): void {
  const parsed: unknown = JSON.parse(value);
  const previous = stateOf(lastSeen.get(name));
  lastSeen.set(name, value);
  if (!isRecord(parsed) || !isRecord(parsed.state)) {
    void baseStorage.setItem(name, value);
    return;
  }
  const state = mergeChangedKeys(stateOf(storedText(name)), previous, parsed.state);
  void baseStorage.setItem(name, JSON.stringify({ ...parsed, state }));
}

/** 設定の persist に渡す置き場 */
export const settingsStorage: StateStorage = {
  /** 置き場の値を読み、前に読んだ値として覚える */
  getItem: (name) => {
    const text = storedText(name);
    if (text !== null) lastSeen.set(name, text);
    return text;
  },
  /** 書くのを止めている間は最後の値を持ち、それ以外は変わった項目だけを重ねて書く */
  setItem: (name, value) => {
    if (holds > 0) pending = { name, value };
    else writeSettings(name, value);
  },
  /** 置き場の値を消す。持っていた書きかけも捨てる */
  removeItem: (name) => {
    pending = null;
    lastSeen.delete(name);
    void baseStorage.removeItem(name);
  },
};

/** 設定を書くのを止める。返した手続きで再開し、止めている間の最後の値を書く（2 回目からは何もしない） */
export function holdSettingsWrites(): () => void {
  holds += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holds -= 1;
    if (holds > 0 || pending === null) return;
    const { name, value } = pending;
    pending = null;
    writeSettings(name, value);
  };
}
