import { ArrowLeftToLine } from 'lucide-react';

// ─────────────────────────────
// 文字を外の欄へ差し込む、絵だけのボタン（ダイアログの決定と同じ取り込みの矢印）。
// 層をまたいで使うので基盤の置き場に置く。
// ─────────────────────────────

/** 差し込みのボタンの props */
export interface InsertIconButtonProps {
  /** 読み上げの名前（何を入れるか） */
  readonly label: string;
  /** 押せない理由（差し込み先が無いなど）。null なら押せる */
  readonly blocked: string | null;
  /** 入れる文字が空なら押せない */
  readonly empty?: boolean | undefined;
  readonly onInsert: () => void;
}

/** 差し込みのボタン。写し取りの脇に枠なしで並べる */
export function InsertIconButton({
  label,
  blocked,
  empty = false,
  onInsert,
}: InsertIconButtonProps): React.ReactElement {
  return (
    <button
      type="button"
      className="text-muted-foreground hover:bg-muted hover:text-foreground shrink-0 rounded-md p-1
        disabled:pointer-events-none disabled:opacity-40"
      aria-label={label}
      title={blocked ?? label}
      disabled={blocked !== null || empty}
      // 押しても焦点を奪わない（差し込み先のキャレットを外さない）
      onMouseDown={(event) => event.preventDefault()}
      onClick={(event) => {
        // カードの上に載ることがあるので、押しても下の操作を起こさない
        event.stopPropagation();
        onInsert();
      }}
    >
      <ArrowLeftToLine className="size-3" aria-hidden />
    </button>
  );
}
