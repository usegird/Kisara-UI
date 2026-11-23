import { useSortable } from '@dnd-kit/sortable';
import { cva } from 'class-variance-authority';
import { GripVertical, Play, Trash2 } from 'lucide-react';
import { useId, useState } from 'react';

import { parseKeyList } from '@/chat/dictionary';
import type { LoreEntry, LoreLogic } from '@/chat/lore';
import type { PromptRole } from '@/chat/types';
import {
  ALWAYS,
  depthOf,
  entryName,
  formatPosition,
  formatTriggers,
  isPlace,
  lineKeys,
  placeOf,
  probabilityOf,
  sentenceList,
  withPlace,
} from '@/components/llm/dictionary/dictionary-entry-fields';
import {
  ENTRY_GRID,
  ENTRY_LEAD,
  ENTRY_REST,
} from '@/components/llm/dictionary/dictionary-entry-grid';
import { DictionaryNumberField } from '@/components/llm/dictionary/DictionaryNumberField';
import { sortableAttributes } from '@/components/ui/drag-announcements';
import { FIELD_XS } from '@/components/ui/field';
import { sortableStyle } from '@/components/ui/sortable-style';
import { t, type MessageKey } from '@/i18n';
import { entryKeyOf } from '@/lib/text-entry';

const GRID = ENTRY_GRID;

const OPEN_LABEL = `text-muted-foreground ${ENTRY_LEAD} self-start justify-self-end pt-1`;

const CONDITION_FIELD = 'col-[4/8]';
const CONDITION_LOGIC = 'col-[8/-1]';

const ROLES: readonly PromptRole[] = ['system', 'user', 'assistant'];

const LOGICS: readonly LoreLogic[] = ['or', 'and', 'nor', 'nand', 'rag'];

const LOGIC_LABEL: Readonly<Record<LoreLogic, MessageKey>> = {
  or: 'llm.dictionary.logic.or',
  and: 'llm.dictionary.logic.and',
  nor: 'llm.dictionary.logic.nor',
  nand: 'llm.dictionary.logic.nand',
  rag: 'llm.dictionary.logic.rag',
};

const LOGIC_HINT: Readonly<Record<LoreLogic, MessageKey>> = {
  or: 'llm.dictionary.conditionHint.or',
  and: 'llm.dictionary.conditionHint.and',
  nor: 'llm.dictionary.conditionHint.nor',
  nand: 'llm.dictionary.conditionHint.nand',
  rag: 'llm.dictionary.conditionHint.rag',
};

const lineField = cva(`${FIELD_XS} min-w-0`, {
  variants: { enabled: { true: '', false: 'text-muted-foreground' } },
});

const entryRow = cva(`${GRID} group/entry hover:bg-muted/50 rounded-md px-1 py-0.5`, {
  variants: { dragging: { true: 'opacity-30', false: '' } },
});

const triangle = cva('size-2.5 fill-current transition-transform', {
  variants: { open: { true: 'rotate-90', false: '' } },
});

export interface EntryRowProps {
  readonly id: string;
  readonly entry: LoreEntry;
  readonly open: boolean;
  readonly sortable: boolean;
  readonly onToggle: () => void;
  readonly onChange: (entry: LoreEntry) => void;
  readonly onRemove: () => void;
}

export function EntryRow({
  id,
  entry,
  open,
  sortable,
  onToggle,
  onChange,
  onRemove,
}: EntryRowProps): React.ReactElement {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    attributes: sortableAttributes(),
    disabled: !sortable,
  });
  const [trigger, setTrigger] = useState(formatTriggers(entry));

  const commitTrigger = (): void => {
    const words = parseKeyList(trigger);
    const keys = words.filter((word) => word !== ALWAYS);
    const constant = words.includes(ALWAYS);
    if (keys.join('\n') !== entry.keys.join('\n') || constant !== entry.constant) {
      onChange({ ...entry, keys, constant });
    }
  };

  return (
    <li
      ref={setNodeRef}
      style={sortableStyle(transform, transition)}
      className={entryRow({ dragging: isDragging })}
    >
      {sortable ? (
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground cursor-grab touch-none rounded-sm"
          aria-label={t('llm.dictionary.reorder', { name: entryName(entry) })}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-3.5" aria-hidden />
        </button>
      ) : (
        <span />
      )}
      <input
        type="checkbox"
        checked={entry.enabled}
        aria-label={t('llm.dictionary.enabled')}
        onChange={(event) => onChange({ ...entry, enabled: event.target.checked })}
      />
      <button
        type="button"
        className="text-muted-foreground hover:text-foreground rounded-sm"
        aria-label={t('llm.dictionary.details')}
        aria-expanded={open}
        onClick={onToggle}
      >
        <Play className={triangle({ open })} aria-hidden />
      </button>
      <input
        className={lineField({ enabled: entry.enabled })}
        value={trigger}
        placeholder={t('llm.dictionary.triggerHint')}
        aria-label={t('llm.dictionary.trigger')}
        onChange={(event) => setTrigger(event.target.value)}
        onBlur={commitTrigger}
        onKeyDown={lineKeys(commitTrigger, () => setTrigger(formatTriggers(entry)))}
      />
      <DictionaryNumberField
        label={t('llm.dictionary.probability')}
        value={entry.probability}
        min={0}
        max={100}
        step={10}
        text={String}
        parse={probabilityOf}
        onCommit={(probability) => onChange({ ...entry, probability })}
      />
      <PlacementCells entry={entry} onChange={onChange} />
      <button
        type="button"
        className="text-muted-foreground hover:text-foreground rounded-sm opacity-0
          group-focus-within/entry:opacity-100 group-hover/entry:opacity-100 focus:opacity-100"
        aria-label={t('llm.dictionary.removeEntry')}
        title={t('llm.dictionary.removeEntry')}
        onClick={onRemove}
      >
        <Trash2 className="size-3.5" aria-hidden />
      </button>
      {open ? <OpenFields entry={entry} onChange={onChange} /> : null}
    </li>
  );
}

function OpenFields({
  entry,
  onChange,
}: {
  readonly entry: LoreEntry;
  readonly onChange: (entry: LoreEntry) => void;
}): React.ReactElement {
  const conditionId = useId();
  const contentId = useId();
  const [condition, setCondition] = useState(entry.secondaryKeys.join(', '));
  const [content, setContent] = useState(entry.content);
  const rag = entry.logic === 'rag';
  const commitCondition = (): void => {
    const sentence = condition.trim();
    const next = rag ? sentenceList(sentence) : parseKeyList(condition);
    if (next.join('\n') !== entry.secondaryKeys.join('\n')) {
      onChange({ ...entry, secondaryKeys: next });
    }
  };
  return (
    <>
      <label htmlFor={conditionId} className={OPEN_LABEL}>
        {t('llm.dictionary.condition')}
      </label>
      <input
        id={conditionId}
        className={`${FIELD_XS} ${CONDITION_FIELD} min-w-0`}
        value={condition}
        placeholder={t(LOGIC_HINT[entry.logic])}
        onChange={(event) => setCondition(event.target.value)}
        onBlur={commitCondition}
        onKeyDown={lineKeys(commitCondition, () => setCondition(entry.secondaryKeys.join(', ')))}
      />
      <select
        className={`${FIELD_XS} ${CONDITION_LOGIC} min-w-0`}
        value={entry.logic}
        aria-label={t('llm.dictionary.logicLabel')}
        onChange={(event) => {
          const logic = LOGICS.find((item) => item === event.target.value);
          if (logic !== undefined) onChange({ ...entry, logic });
        }}
      >
        {LOGICS.map((logic) => (
          <option key={logic} value={logic}>
            {t(LOGIC_LABEL[logic])}
          </option>
        ))}
      </select>
      <label htmlFor={contentId} className={OPEN_LABEL}>
        {t('llm.dictionary.content')}
      </label>
      <textarea
        id={contentId}
        className={`${FIELD_XS} ${ENTRY_REST} min-w-0`}
        rows={4}
        value={content}
        onChange={(event) => setContent(event.target.value)}
        onBlur={() => {
          if (content !== entry.content) onChange({ ...entry, content });
        }}
        onKeyDown={(event) => {
          if (entryKeyOf(event) === 'cancel') {
            event.stopPropagation();
            setContent(entry.content);
          }
        }}
      />
    </>
  );
}

function PlacementCells({
  entry,
  onChange,
}: {
  readonly entry: LoreEntry;
  readonly onChange: (entry: LoreEntry) => void;
}): React.ReactElement {
  const depth = entry.depth;
  return (
    <>
      <select
        className={`${FIELD_XS} min-w-0`}
        value={placeOf(entry)}
        aria-label={t('llm.dictionary.placement')}
        onChange={(event) => {
          const next = event.target.value;
          if (isPlace(next)) onChange(withPlace(entry, next));
        }}
      >
        <option value="dictionary">{t('llm.dictionary.placeDictionary')}</option>
        <option value="historyStart">{t('llm.dictionary.placeHistoryStart')}</option>
        <option value="historyEnd">{t('llm.dictionary.placeHistoryEnd')}</option>
      </select>
      {depth === null ? (
        <>
          <span />
          <span />
        </>
      ) : (
        <>
          <DictionaryNumberField
            label={t('llm.dictionary.depthValue')}
            value={depth.depth}
            max={0}
            text={formatPosition}
            parse={depthOf}
            onCommit={(next) => onChange({ ...entry, depth: { ...depth, depth: next } })}
          />
          <select
            className={`${FIELD_XS} min-w-0`}
            value={depth.role}
            aria-label={t('llm.dictionary.role')}
            onChange={(event) => {
              const role = ROLES.find((item) => item === event.target.value);
              if (role !== undefined) onChange({ ...entry, depth: { ...depth, role } });
            }}
          >
            {ROLES.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
        </>
      )}
    </>
  );
}
