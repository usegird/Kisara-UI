import { INSERT_SOURCE_MARK } from '@/lib/insert-at-caret';

// ─────────────────────────────
// 文字のドラッグの受け渡し。掴んだ側（Lora のカード・スタイル・ワイルドカードの一覧）が置き、
// 落とし先の見張り（`useTextDropCaret`）が取り出して入れる。
// ─────────────────────────────

/** ドラッグに付ける目印。これが付いたものだけを受け持つ（他のドラッグはブラウザに任せる） */
export const TEXT_DRAG_TYPE = 'application/x-kisara-text';

/** 落とされたときに作った文字か、作れなかった理由 */
export type DragTextResult = { readonly text: string } | { readonly error: string };

/** 掴んだ側が置く「落とされたら入れる文字の作り方」 */
interface TextDragSession {
  /**
   * 落とされたときに入れる文字を作る。**文字は落とされた時に作る。** Lora の書式が学習で
   * 多かった語を使うときは取りに行く必要があり、掴んだ瞬間には間に合わないことがある
   * （画像の読み込みで接続が埋まっている間など）
   */
  readonly resolve: () => Promise<DragTextResult>;
  /** 作れなかったときに理由を伝える先（掴んだ側の画面） */
  readonly onError?: ((message: string) => void) | undefined;
}

let current: TextDragSession | null = null;

/** 掴んだときに作り方を置く。ブラウザのドラッグは同時に 1 つなので、置き場も 1 つ */
export function beginTextDrag(session: TextDragSession): void {
  current = session;
}

/** 落とされたときに取り出す。取り出したら空にする（同じ文字を二度入れない） */
export function takeTextDrag(): TextDragSession | null {
  const session = current;
  current = null;
  return session;
}

/** ドラッグが終わったら、落とされなかった作り方を捨てる */
export function endTextDrag(): void {
  current = null;
}

/**
 * 落とせる欄。複数行の欄だけで、ダイアログの中と差し込み元の画面の中は除く
 * （自分の文面を自分へ入れても意味がない）
 */
export function isTextDropTarget(target: EventTarget | null): target is HTMLTextAreaElement {
  return (
    target instanceof HTMLTextAreaElement &&
    target.closest('[role="dialog"]') === null &&
    target.closest(`[${INSERT_SOURCE_MARK}]`) === null
  );
}
