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

// ─────────────────────────────
// 文字と数の欄。打ちかけの値は欄の中に持ち、確定のときに書き戻す
// ─────────────────────────────

interface TextControlProps {
  readonly row: NodeRowData;
  readonly current: unknown;
  /** 打ちかけ。確定（欄を離れる・Enter）で書き込む */
  readonly draft: string;
  readonly onDraft: (draft: string) => void;
  readonly placeholder: string | undefined;
  readonly appearance: WidgetAppearance;
  readonly height: number | undefined;
  readonly onCommit: Commit;
}

/**
 * 離れたときに書く。中身が変わっていなければ書かない（選んで離れただけで変更の印を付けない）
 */
function commitIfChanged(
  row: NodeRowData,
  current: unknown,
  draft: string,
  onCommit: Commit,
): void {
  if (draft !== formatEditValue(current)) onCommit(row, draft);
}

/**
 * 文字と数値の欄。`/object_info` の入力設定が multiline なら複数行で編集する
 */
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
  // 複数行の欄ではタグを補完する
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
            // Ctrl+S（Mac は ⌘S）で欄を離れずに確定する。ページの保存は出さない
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

/**
 * Ctrl+↑↓（Mac は ⌘）で、選んだ範囲かキャレットを囲む括弧・語の重みを 0.1 ずつ増減する。
 * 打ったのと同じ編集として入れ（Ctrl+Z で戻せる）、中身を選び直して続けて押せるようにする。
 * 効かせる先が無ければ何もせず、ブラウザの動きに任せる。扱ったら true
 */
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

/**
 * 数値の欄。上下はブラウザの送りを使う。
 * ブラウザは空の欄からは下限へ送るので、空の欄で上下を押したときだけ、押す直前に
 * 薄く出している値（ノードの値）を入れてそこから送らせる。送らなかったら（文字の位置を
 * 押しただけなど）押し終えたときに空へ戻す。ノードの値が無ければブラウザに任せる（下限から）。
 * 空のまま離れても値を作らない（未入力のまま。カードでは元の値に戻す）
 */
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
  /** 送りの起点として入れた欄。送られずに終わったら空へ戻す */
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
      // 未入力の欄（アプリ入力）は空のまま。値のある欄は、空にしたら外す／カードでは戻す
      if (formatEditValue(current) === '') return;
      if (placeholder !== undefined) onCommit(row, '');
      else onDraft(formatEditValue(current));
      return;
    }
    // 受け取れない値（整数の欄の小数・範囲の外など）は書かず、前の値に戻す
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
        // 欄の外で離しても戻せるよう、離したことは画面全体で受ける
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
