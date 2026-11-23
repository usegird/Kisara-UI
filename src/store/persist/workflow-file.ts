import {
  savedAppValues,
  withoutSavedAppValues,
  withSavedAppValues,
} from '@/graph/app-input-values';
import { isKisaraCreated, withCreatedMark, withoutCreatedMark } from '@/graph/created-mark';
import { parseWorkflow } from '@/graph/normalize';
import { withLinkExtensionsInOrder } from '@/graph/reroutes';
import type { Workflow } from '@/graph/types';
import { withNamedCopies } from '@/graph/widgets';
import { useAppValuesStore } from '@/store/use-app-values-store';
import { useGraphStore, type SavedOrigin } from '@/store/use-graph-store';

export function openWorkflow(
  raw: unknown,
  name: string,
  from: Omit<SavedOrigin, 'own'> | null = null,
): void {
  const workflow = parseWorkflow(raw);
  const saved = from === null ? null : { ...from, own: isKisaraCreated(workflow) };
  const working = withoutCreatedMark(withoutSavedAppValues(workflow));
  useGraphStore.getState().loadWorkflow(working, name, saved);
  useAppValuesStore.getState().restore(savedAppValues(workflow));
}

export function serializeWorkflow(
  workflow: Workflow,
  options: { readonly created?: boolean } = {},
): string {
  const forComfy = withLinkExtensionsInOrder(withNamedCopies(workflow));
  const saved = withSavedAppValues(forComfy, useAppValuesStore.getState().values);
  return JSON.stringify(options.created === true ? withCreatedMark(saved) : saved, null, 2);
}
