import { DecideButton } from '@/components/ui/decide-button';
import { t } from '@/i18n';
import { insertAtCaret, type TextField } from '@/lib/insert-at-caret';

// ─────────────────────────────
// 取り込みの決定（スタイルの編集・ワイルドカード）。差し込み先の決まりは `insert-target.ts`。
// ─────────────────────────────

/** 取り込みの決定のボタンの props */
export interface InsertButtonProps {
  /** 差し込む文字 */
  readonly text: string;
  /** 読み上げの名前 */
  readonly label: string;
  /** 差し込み先。無ければ押せない */
  readonly field: TextField | null;
  /** ボタンの文字。既定は「決定」（スタイルは肯定・否定） */
  readonly caption?: string | undefined;
}

/** 差し込み先のキャレット位置へ入れる。押してもフォーカスを奪わない */
export function InsertButton({
  text,
  label,
  field,
  caption,
}: InsertButtonProps): React.ReactElement {
  return (
    <DecideButton
      label={label}
      caption={caption}
      title={t(field === null ? 'comfy.insert.noFieldTitle' : 'comfy.insert.title')}
      disabled={field === null || text.length === 0}
      onClick={() => {
        if (field !== null) insertAtCaret(field, text);
      }}
    />
  );
}
