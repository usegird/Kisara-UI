import type { TagEntry } from '@/graph/tag-dictionary';

// ─────────────────────────────
// タグ辞書の行の組み立て。
// ─────────────────────────────

/** タグ 1 行。種別は空 */
export function tagEntry(tag: string, priority = 0, aliases: readonly string[] = []): TagEntry {
  return { tag, kind: '', priority, aliases };
}
