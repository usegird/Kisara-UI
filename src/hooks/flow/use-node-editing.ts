import {
  autoSlot,
  needsChoice,
  slotChoices,
  type ConnectSide,
  type SlotChoice,
} from '@/graph/connect-choice';
import type { ReferenceSlot } from '@/graph/node-reference';
import type { PlacementAnchor } from '@/graph/order';
import type { NodeRow } from '@/graph/rows';
import type { LinkId, NodeDefinition, NodeId } from '@/graph/types';
import { useNodePlacement } from '@/hooks/flow/use-node-placement';
import { useRowEditing } from '@/hooks/flow/use-row-editing';
import { useTabState } from '@/hooks/flow/use-tab-state';
import { useGraphStore } from '@/store/use-graph-store';

export type SearchMode =
  | {
      readonly kind: 'after';
      readonly nodeId: NodeId;
      readonly slot: number;
      readonly slotType: string;
    }
  | {
      readonly kind: 'before';
      readonly nodeId: NodeId;
      readonly slot: number | null;
      readonly widget: string | null;
      readonly slotType: string;
    }
  | {
      readonly kind: 'between';
      readonly linkIds: readonly LinkId[];
      readonly slotType: string;
    }
  | {
      readonly kind: 'append';
      readonly anchor?: PlacementAnchor | undefined;
    };

export interface ConnectChoice {
  readonly definition: NodeDefinition;
  readonly side: ConnectSide;
  readonly type: string;
  readonly choices: readonly SlotChoice[];
}

export interface NodeEditing {
  readonly search: SearchMode | null;
  readonly setSearch: (mode: SearchMode | null) => void;
  readonly settingsFor: NodeId | null;
  readonly setSettingsFor: (nodeId: NodeId | null) => void;
  readonly commitValue: (row: NodeRow, value: unknown) => void;
  readonly resizeText: (row: NodeRow, height: number) => void;
  readonly needOptions: (row: NodeRow) => void;
  readonly pickDefinition: (definition: NodeDefinition) => void;
  readonly pickReference: (slot: ReferenceSlot) => void;
  readonly connectChoice: ConnectChoice | null;
  readonly resolveConnect: (slot: number | null) => void;
}

export function useNodeEditing(): NodeEditing {
  const connect = useGraphStore((state) => state.connect);
  const connectToWidget = useGraphStore((state) => state.connectToWidget);
  const { commitValue, resizeText, needOptions } = useRowEditing();
  const place = useNodePlacement();

  const [search, setSearch] = useTabState<SearchMode | null>('flow.search', null);
  const [settingsFor, setSettingsFor] = useTabState<NodeId | null>('flow.settingsFor', null);
  const [pending, setPending] = useTabState<(ConnectChoice & { readonly mode: SearchMode }) | null>(
    'flow.connect',
    null,
  );

  const pickDefinition = (definition: NodeDefinition): void => {
    if (search === null) return;

    if (search.kind === 'append' || search.kind === 'between') {
      place(definition, search, null);
      setSearch(null);
      return;
    }

    const side: ConnectSide = search.kind === 'after' ? 'input' : 'output';
    const choices = slotChoices(definition, search.slotType, side);

    if (needsChoice(choices)) {
      setPending({ definition, mode: search, side, type: search.slotType, choices });
      setSearch(null);
      return;
    }

    place(definition, search, autoSlot(choices));
    setSearch(null);
  };

  const resolveConnect = (slot: number | null): void => {
    if (pending === null) return;

    place(pending.definition, pending.mode, slot);
    setPending(null);
  };

  const pickReference = (slot: ReferenceSlot): void => {
    const mode = search;
    setSearch(null);
    if (mode === null || mode.kind === 'append' || mode.kind === 'between') return;

    if (mode.kind === 'before') {
      if (mode.slot !== null) connect(slot.nodeId, slot.slot, mode.nodeId, mode.slot);
      else if (mode.widget !== null) {
        connectToWidget(slot.nodeId, slot.slot, mode.nodeId, {
          name: mode.widget,
          type: mode.slotType,
        });
      }
      return;
    }

    if (slot.widget !== null) connectToWidget(mode.nodeId, mode.slot, slot.nodeId, slot.widget);
    else connect(mode.nodeId, mode.slot, slot.nodeId, slot.slot);
  };

  return {
    search,
    setSearch,
    pickReference,
    settingsFor,
    setSettingsFor,
    commitValue,
    resizeText,
    needOptions,
    pickDefinition,
    connectChoice: pending,
    resolveConnect,
  };
}
