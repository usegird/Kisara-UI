import type { Workflow } from '@/graph/types';
import { isRecord } from '@/lib/guards';

const OWN_DATA = 'kisara';

export function ownData(workflow: Workflow): Record<string, unknown> | null {
  return ownDataOf(workflow);
}

export function ownDataOf(value: unknown): Record<string, unknown> | null {
  const extra = isRecord(value) ? value.extra : undefined;
  return isRecord(extra) && isRecord(extra[OWN_DATA]) ? extra[OWN_DATA] : null;
}

export function writeOwnData(workflow: Workflow, name: string, value: unknown): Workflow {
  const own = { ...ownData(workflow) };
  if (value === undefined) delete own[name];
  else own[name] = value;

  const extra = isRecord(workflow.extra) ? { ...workflow.extra } : {};
  if (Object.keys(own).length === 0) delete extra[OWN_DATA];
  else extra[OWN_DATA] = own;

  return { ...workflow, extra };
}
