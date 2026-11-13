import type { Workflow } from '@/graph/types';
import { isRecord } from '@/lib/guards';

// ─────────────────────────────
// 独自の持ち物（`extra.kisara`）の読み書き。本体の持ち物には触らない。
// ─────────────────────────────

const OWN_DATA = 'kisara';

/** 独自の持ち物。無い・読めない形なら null */
export function ownData(workflow: Workflow): Record<string, unknown> | null {
  return ownDataOf(workflow);
}

/** 形を確かめる前の値（接続先から読んだもの）の独自の持ち物。無い・読めない形なら null */
export function ownDataOf(value: unknown): Record<string, unknown> | null {
  const extra = isRecord(value) ? value.extra : undefined;
  return isRecord(extra) && isRecord(extra[OWN_DATA]) ? extra[OWN_DATA] : null;
}

/**
 * 1 項目を書き戻す。`undefined` は値が無いことを表す
 */
export function writeOwnData(workflow: Workflow, name: string, value: unknown): Workflow {
  const own = { ...ownData(workflow) };
  if (value === undefined) delete own[name];
  else own[name] = value;

  const extra = isRecord(workflow.extra) ? { ...workflow.extra } : {};
  if (Object.keys(own).length === 0) delete extra[OWN_DATA];
  else extra[OWN_DATA] = own;

  return { ...workflow, extra };
}
