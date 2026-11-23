import type { StateStorage } from 'zustand/middleware';

import { isRecord } from '@/lib/guards';
import { mergeChangedKeys } from '@/lib/merge-changes';
import { safeStorage } from '@/lib/safe-storage';

const baseStorage = safeStorage();
let holds = 0;
let pending: { readonly name: string; readonly value: string } | null = null;

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

export const settingsStorage: StateStorage = {
  getItem: (name) => {
    const text = storedText(name);
    if (text !== null) lastSeen.set(name, text);
    return text;
  },
  setItem: (name, value) => {
    if (holds > 0) pending = { name, value };
    else writeSettings(name, value);
  },
  removeItem: (name) => {
    pending = null;
    lastSeen.delete(name);
    void baseStorage.removeItem(name);
  },
};

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
