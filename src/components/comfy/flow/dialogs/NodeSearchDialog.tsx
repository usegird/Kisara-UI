import { PreviewCard } from '@base-ui/react/preview-card';
import { Command } from 'cmdk';
import { useMemo, useRef, useState } from 'react';

import {
  AnyTypeCheckbox,
  ModeTabs,
  RefreshDefinitionsButton,
  TypeSelect,
} from '@/components/comfy/flow/dialogs/NodeSearchFilters';
import {
  CategoryNav,
  ReferenceList,
  ReferenceNodeNav,
} from '@/components/comfy/flow/dialogs/NodeSearchNav';
import { CardPreviewPopup, NodeResult } from '@/components/comfy/flow/dialogs/NodeSearchResults';
import { DialogFrame } from '@/components/ui/dialog';
import { EMPTY_NOTICE_CLASS } from '@/components/ui/empty-notice';
import { PaneDivider } from '@/components/ui/pane-divider';
import { SEARCH_INPUT_CLASS, SearchBox } from '@/components/ui/search-field';
import { referenceSlots, type ReferenceSide, type ReferenceSlot } from '@/graph/node-reference';
import type { NodeView } from '@/graph/rows';
import {
  defaultGroup,
  groupTree,
  hasFilters,
  NO_FILTERS,
  searchDefinitions,
  slotTypesOf,
  type SearchFilters,
} from '@/graph/search';
import type { NodeDefinition, NodeDefinitionMap, NodeId } from '@/graph/types';
import { t } from '@/i18n';
import { useSettingsStore } from '@/store/use-settings-store';

export interface ReferenceTarget {
  readonly side: ReferenceSide;
  readonly exclude: NodeId;
  readonly type: string;
}

export type PopupMode = 'add' | 'reference';

const NO_VIEWS: readonly NodeView[] = [];
const NO_FREQUENCY: readonly string[] = [];

export interface NodeSearchDialogProps {
  readonly open: boolean;
  readonly definitions: NodeDefinitionMap;
  readonly frequency?: readonly string[] | undefined;
  readonly title: string;
  readonly initialFilters?: SearchFilters | undefined;
  readonly onSelect: (definition: NodeDefinition) => void;
  readonly onClose: () => void;
  readonly reference?: ReferenceTarget | null | undefined;
  readonly views?: readonly NodeView[] | undefined;
  readonly onPickReference?: ((slot: ReferenceSlot) => void) | undefined;
}

const FILTER_ROW_CLASS =
  'text-muted-foreground flex items-center gap-1.5 border-b px-3 py-1.5 text-2xs';

export function NodeSearchDialog({
  open,
  definitions,
  title,
  initialFilters,
  onSelect,
  onClose,
  reference = null,
  views = NO_VIEWS,
  frequency = NO_FREQUENCY,
  onPickReference,
}: NodeSearchDialogProps): React.ReactElement | null {
  const context = useMemo(
    () => ({ used: new Set(views.map((view) => view.classType)), frequency }),
    [views, frequency],
  );
  const [mode, setMode] = useState<PopupMode>('add');
  const [query, setQuery] = useState('');
  const [preview] = useState(() => PreviewCard.createHandle<NodeDefinition>());
  const body = useRef<HTMLDivElement>(null);
  const dialogOfBody = (): Element | null => body.current?.closest('[role="dialog"]') ?? null;
  const [filters, setFilters] = useState<SearchFilters>(() => ({
    ...(initialFilters ?? NO_FILTERS),
    group: initialFilters?.group || defaultGroup(context),
  }));

  const types = useMemo(() => slotTypesOf(definitions), [definitions]);
  const results = useMemo(
    () => searchDefinitions(definitions, query, { filters, context }),
    [definitions, query, filters, context],
  );
  const tree = groupTree(definitions, query, filters, context);

  const [referenceType, setReferenceType] = useState(reference?.type ?? '');
  const [referenceNode, setReferenceNode] = useState<NodeId | null>(null);
  const referenceable = reference !== null && onPickReference !== undefined;
  const candidates = reference
    ? referenceSlots(views, reference.side, {
        exclude: reference.exclude,
        type: referenceType,
        anyType: filters.anyType,
        query,
      })
    : [];
  const setAnyType = (anyType: boolean): void =>
    setFilters((previous) => ({ ...previous, anyType }));

  const searchInput = (
    <SearchBox className="flex-[2]">
      <Command.Input
        autoFocus
        value={query}
        onValueChange={setQuery}
        placeholder={t(
          mode === 'add'
            ? 'nodeSearch.search.addPlaceholder'
            : 'nodeSearch.search.referencePlaceholder',
        )}
        className={SEARCH_INPUT_CLASS}
      />
    </SearchBox>
  );

  const listWidth = useSettingsStore((state) => state.nodeSearchListWidth);
  const setListWidth = useSettingsStore((state) => state.setNodeSearchListWidth);
  const listDivider = (
    <PaneDivider
      label={t('nodeSearch.listColumn')}
      size={listWidth}
      side="left"
      onResize={setListWidth}
    />
  );

  return (
    <DialogFrame
      id="node-search"
      movable
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      size="lg"
      title={title}
      header={<ModeTabs mode={mode} referenceable={referenceable} onMode={setMode} />}
      actions={<RefreshDefinitionsButton />}
    >
      <Command
        ref={body}
        shouldFilter={false}
        label={title}
        className="flex min-h-0 flex-1 flex-col"
      >
        <CardPreviewPopup handle={preview} definitions={definitions} anchor={dialogOfBody} />
        {mode === 'reference' && reference ? (
          <>
            <div className={FILTER_ROW_CLASS}>
              <TypeSelect
                label={t('nodeSearch.reference.type')}
                title={t(
                  reference.side === 'outputs'
                    ? 'nodeSearch.reference.typeOutputs'
                    : 'nodeSearch.reference.typeInputs',
                )}
                ariaLabel={t('nodeSearch.reference.typeFilter')}
                value={referenceType}
                types={[...new Set([reference.type, ...types])]}
                onChange={setReferenceType}
              />
              {searchInput}
              <AnyTypeCheckbox checked={filters.anyType} onChange={setAnyType} />
            </div>
            <div className="flex min-h-0 flex-1">
              <ReferenceNodeNav
                candidates={candidates}
                selected={referenceNode}
                width={listWidth}
                onSelect={setReferenceNode}
              />
              {listDivider}
              <ReferenceList
                side={reference.side}
                candidates={
                  referenceNode === null
                    ? candidates
                    : candidates.filter((candidate) => candidate.nodeId === referenceNode)
                }
                onPick={(slot) => onPickReference?.(slot)}
              />
            </div>
          </>
        ) : (
          <>
            <div className={FILTER_ROW_CLASS}>
              <TypeSelect
                label={t('nodeSearch.filter.input')}
                title={t('nodeSearch.filter.inputTitle')}
                ariaLabel={t('nodeSearch.filter.inputFilter')}
                value={filters.input}
                types={types}
                onChange={(input) => setFilters((previous) => ({ ...previous, input }))}
              />
              <TypeSelect
                label={t('nodeSearch.filter.output')}
                title={t('nodeSearch.filter.outputTitle')}
                ariaLabel={t('nodeSearch.filter.outputFilter')}
                value={filters.output}
                types={types}
                onChange={(output) => setFilters((previous) => ({ ...previous, output }))}
              />
              {searchInput}
              <AnyTypeCheckbox checked={filters.anyType} onChange={setAnyType} />
            </div>
            <div className="flex min-h-0 flex-1">
              <CategoryNav
                tree={tree}
                selected={filters.group}
                width={listWidth}
                onSelect={(group) => setFilters((previous) => ({ ...previous, group }))}
              />
              {listDivider}
              <Command.List className="min-w-0 flex-1 overflow-y-auto p-1">
                <Command.Empty className={EMPTY_NOTICE_CLASS}>
                  {emptyMessage(definitions.size, filters)}
                </Command.Empty>
                {results.map((definition) => (
                  <NodeResult
                    key={definition.name}
                    definition={definition}
                    preview={preview}
                    onSelect={onSelect}
                  />
                ))}
              </Command.List>
            </div>
          </>
        )}
      </Command>
    </DialogFrame>
  );
}

function emptyMessage(definitionCount: number, filters: SearchFilters): string {
  if (definitionCount === 0) return t('nodeSearch.empty.noDefinitions');
  return hasFilters(filters) ? t('nodeSearch.empty.filtered') : t('nodeSearch.empty.none');
}
