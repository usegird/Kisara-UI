import type { NodeId } from '@/graph/types';

// ─────────────────────────────
// カードの列の空の並び（毎回同じものを使う）
// ─────────────────────────────

/** 置き直す前の並びに無い枠の受け口（起きないはずだが、受け口には配列が要る） */
export const NO_MEMBERS: readonly NodeId[] = [];
