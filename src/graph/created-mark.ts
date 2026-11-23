import { ownData, ownDataOf, writeOwnData } from '@/graph/own-data';
import type { Workflow } from '@/graph/types';

const CREATED = 'created';

export function isKisaraCreated(value: unknown): boolean {
  return ownDataOf(value)?.[CREATED] === true;
}

export function withCreatedMark(workflow: Workflow): Workflow {
  return writeOwnData(workflow, CREATED, true);
}

export function withoutCreatedMark(workflow: Workflow): Workflow {
  if (ownData(workflow)?.[CREATED] === undefined) return workflow;
  return writeOwnData(workflow, CREATED, undefined);
}
