import { useState } from 'react';

import { FIELD_XS } from '@/components/ui/field';

// ─────────────────────────────
// 追加辞書のダイアログの数の欄（発動率・位置・トリガー検索範囲）。
// ─────────────────────────────

/**
 * 数の欄。打つたびに読めれば直しかけに入れ、離れたら欄の文字を直した値に揃える（空は既定の値）。
 * `text` は値から欄の文字、`parse` は欄の文字から値（辞書のダイアログのトリガー検索範囲にも使う）
 */
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
  /** 増減のボタンの刻み（既定は 1） */
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
