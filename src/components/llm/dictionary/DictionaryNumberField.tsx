import { useState } from 'react';

import { FIELD_XS } from '@/components/ui/field';

export function DictionaryNumberField({
  label,
  value,
  min,
  max,
  step = 1,
  text,
  parse,
  onCommit,
}: {
  readonly label: string;
  readonly value: number;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly text: (value: number) => string;
  readonly parse: (text: string) => number;
  readonly onCommit: (value: number) => void;
}): React.ReactElement {
  const [draft, setDraft] = useState(text(value));
  return (
    <input
      className={`${FIELD_XS} w-full min-w-0`}
      type="number"
      min={min}
      max={max}
      step={step}
      value={draft}
      aria-label={label}
      onChange={(event) => {
        setDraft(event.target.value);
        if (event.target.value.trim().length === 0) return;
        const next = parse(event.target.value);
        if (next !== value) onCommit(next);
      }}
      onBlur={() => {
        const next = parse(draft);
        setDraft(text(next));
        if (next !== value) onCommit(next);
      }}
    />
  );
}
