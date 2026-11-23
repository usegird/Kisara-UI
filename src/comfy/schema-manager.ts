import type { NodePackMapping } from '@/graph/node-packs';
import { isRecord, isUnknownArray, stringOr } from '@/lib/guards';
import { setOwn } from '@/lib/own-key';
import type { ManagerQueueStatus } from '@/port/manager';

export function parseNodePackMappings(raw: unknown): NodePackMapping[] {
  if (!isRecord(raw)) return [];
  return Object.entries(raw).flatMap(([key, value]): NodePackMapping[] => {
    if (!isUnknownArray(value)) return [];
    const [names, meta] = value;
    if (!isUnknownArray(names)) return [];
    const info = isRecord(meta) ? meta : {};
    return [
      {
        key,
        title: stringOr(info.title_aux, null) ?? stringOr(info.title, null) ?? key,
        nodes: names.filter((name): name is string => typeof name === 'string'),
        pattern: stringOr(info.nodename_pattern, null),
      },
    ];
  });
}

export function parseManagerQueueStatus(data: unknown): ManagerQueueStatus | null {
  if (!isRecord(data)) return null;
  const status = data.status;
  if (status !== 'in_progress' && status !== 'done') return null;
  const results: Record<string, string> = {};
  const raw = data.nodepack_result;
  if (isRecord(raw)) {
    for (const [key, value] of Object.entries(raw)) {
      if (typeof value === 'string') setOwn(results, key, value);
    }
  }
  return { status, target: stringOr(data.target, null), results };
}
