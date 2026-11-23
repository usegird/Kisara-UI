import { useRef } from 'react';

import { TagCompleteList } from '@/components/comfy/flow/TagCompleteList';
import { widgetControl, type WidgetAppearance } from '@/components/comfy/flow/widget-style';
import type { Commit } from '@/components/comfy/flow/WidgetControl';
import { parseNumberText, type NumberSpec } from '@/graph/number-spec';
import { adjustWeight } from '@/graph/prompt-weight';
import type { NodeRow as NodeRowData } from '@/graph/rows';
import { useTagComplete } from '@/hooks/flow/use-tag-complete';
import { insertAtCaret } from '@/lib/insert-at-caret';
import { formatEditValue } from '@/lib/text';
import { entryKeyOf } from '@/lib/text-entry';

interface TextControlProps {
  readonly row: NodeRowData;
  readonly current: unknown;
  readonly draft: string;
  readonly onDraft: (draft: string) => void;
  readonly placeholder: string | undefined;
  readonly appearance: WidgetAppearance;
  readonly height: number | undefined;
  readonly onCommit: Commit;
}

function commitIfChanged(
  row: NodeRowData,
  current: unknown,
  draft: string,
  onCommit: Commit,
): void {
  if (draft !== formatEditValue(current)) onCommit(row, draft);
}

export function TextControl({
  row,
  current,
  draft,
  onDraft,
  placeholder,
  appearance,
  height,
  onCommit,
}: TextControlProps): React.ReactElement {
  const tagComplete = useTagComplete(row.multiline);

  if (row.multiline) {
    return (
      <>
        <textarea
          className={widgetControl({
            appearance,
            multiline: true,
            dirty: draft !== formatEditValue(current),
          })}
          style={height === undefined ? undefined : { height }}
          rows={4}
          value={draft}
          placeholder={placeholder}
          aria-label={row.label}
          {...tagComplete.field}
          onChange={(event) => onDraft(event.target.value)}
          onBlur={() => {
            tagComplete.field.onBlur();
            commitIfChanged(row, current, draft, onCommit);
          }}
          onKeyDown={(event) => {
            if (adjustWeightByKey(event)) return;
            if (tagComplete.onKeyDown(event)) return;
            if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 's') return;
            event.preventDefault();
            commitIfChanged(row, current, draft, onCommit);
          }}
        />
        <TagCompleteList complete={tagComplete} />
      </>
    );
  }

  if (row.number !== null && (row.type === 'INT' || row.type === 'FLOAT')) {
    return (
      <NumberControl
        row={row}
        spec={row.number}
        current={current}
        draft={draft}
        onDraft={onDraft}
        placeholder={placeholder}
        appearance={appearance}
        onCommit={onCommit}
      />
    );
  }
  return (
    <input
      className={widgetControl({ appearance })}
      type="text"
      value={draft}
      placeholder={placeholder}
      aria-label={row.label}
      onChange={(event) => onDraft(event.target.value)}
      onBlur={() => commitIfChanged(row, current, draft, onCommit)}
      onKeyDown={(event) => {
        if (entryKeyOf(event) === 'commit') event.currentTarget.blur();
      }}
    />
  );
}

function adjustWeightByKey(event: React.KeyboardEvent<HTMLTextAreaElement>): boolean {
  const modified = (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey;
  if (!modified || event.nativeEvent.isComposing) return false;
  if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return false;
  const field = event.currentTarget;
  const direction = event.key === 'ArrowUp' ? 1 : -1;
  const edit = adjustWeight(field.value, field.selectionStart, field.selectionEnd, direction);
  if (edit === null) return false;
  event.preventDefault();
  field.setSelectionRange(edit.start, edit.end);
  insertAtCaret(field, edit.text);
  field.setSelectionRange(edit.selection.start, edit.selection.end);
  return true;
}

interface NumberControlProps {
  readonly row: NodeRowData;
  readonly spec: NumberSpec;
  readonly current: unknown;
  readonly draft: string;
  readonly onDraft: (draft: string) => void;
  readonly placeholder: string | undefined;
  readonly appearance: WidgetAppearance;
  readonly onCommit: Commit;
}

function NumberControl({
  row,
  spec,
  current,
  draft,
  onDraft,
  placeholder,
  appearance,
  onCommit,
}: NumberControlProps): React.ReactElement {
  const primed = useRef<HTMLInputElement | null>(null);

  const prime = (input: HTMLInputElement): void => {
    const seed = placeholder?.trim() ?? '';
    if (draft !== '' || seed === '' || !Number.isFinite(Number(seed))) return;
    input.value = seed;
    primed.current = input;
  };
  const unprime = (): void => {
    if (primed.current !== null) primed.current.value = '';
    primed.current = null;
  };

  const commit = (): void => {
    unprime();
    if (draft.trim() === '') {
      if (formatEditValue(current) === '') return;
      if (placeholder !== undefined) onCommit(row, '');
      else onDraft(formatEditValue(current));
      return;
    }
    const value = parseNumberText(draft, row.number);
    if (value === null) onDraft(formatEditValue(current));
    else onCommit(row, value);
  };

  return (
    <input
      className={widgetControl({ appearance })}
      type="number"
      step={spec.step}
      min={spec.min ?? undefined}
      max={spec.max ?? undefined}
      value={draft}
      placeholder={placeholder}
      aria-label={row.label}
      onChange={(event) => {
        primed.current = null;
        onDraft(event.target.value);
      }}
      onBlur={commit}
      onPointerDown={(event) => {
        prime(event.currentTarget);
        window.addEventListener('pointerup', unprime, { once: true });
      }}
      onKeyDown={(event) => {
        if (entryKeyOf(event) === 'commit') event.currentTarget.blur();
        else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') prime(event.currentTarget);
      }}
      onKeyUp={unprime}
    />
  );
}
