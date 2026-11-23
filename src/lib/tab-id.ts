import { safeStorage } from '@/lib/safe-storage';
import { hold } from '@/lib/web-locks';

function readStored(key: string): string | null {
  try {
    const value = safeStorage('session').getItem(key);
    return typeof value !== 'string' || value.length === 0 ? null : value;
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string): void {
  void safeStorage('session').setItem(key, value);
}

export async function claimTabId(key: string, create: () => string): Promise<string> {
  const stored = readStored(key);
  if (stored !== null && (await hold(`${key}:${stored}`))) return stored;
  return renewTabId(key, create);
}

export function readTabId(key: string): string | null {
  return readStored(key);
}

async function renewTabId(key: string, create: () => string): Promise<string> {
  let id = create();
  if (!(await hold(`${key}:${id}`))) {
    id = create();
    await hold(`${key}:${id}`);
  }
  writeStored(key, id);
  return id;
}

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

export function writeTabList(key: string, items: readonly string[]): void {
  writeStored(key, JSON.stringify(items));
}
