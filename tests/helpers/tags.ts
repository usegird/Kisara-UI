import type { TagEntry } from '@/graph/tag-dictionary';

export function tagEntry(tag: string, priority = 0, aliases: readonly string[] = []): TagEntry {
  return { tag, kind: '', priority, aliases };
}
