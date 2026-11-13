// ─────────────────────────────
// 指で触れる端末では、焦点の無い入力欄は触れても受けず（上から画面を送れるように）、押したときだけ
// その所の欄に焦点を当てて書き換えに入る。
// ─────────────────────────────

/** 押して開く欄（切り替え・選ぶだけの物は除く。下の TAP_TO_EDIT_CLASS と同じ対象） */
const EDITABLE =
  'input:not([type=checkbox],[type=radio],[type=range],[type=color],[type=file],[type=hidden]),' +
  ' textarea';

/** 押した所が自分で受ける部品（ボタン・選択肢など）なら、欄を探さない */
const OWN_TAP = 'button, a, select, label, [role=button], [role=combobox], [role=switch]';

/** 欄を探すのはこの囲みまで（カード・アプリ入力の枠・変数のまとまりを越えて探さない） */
const BOUNDARY = 'article, [data-flow-item]';

/**
 * 指で触れる端末で、焦点の無い入力欄が触れても受けないようにする（フロー画面の根に付ける）。
 * `pointer-coarse` は指で触れる端末だけに当たる
 */
// Tailwind は文字列のまま拾うので、つないで書かない
export const TAP_TO_EDIT_CLASS =
  'pointer-coarse:[&_:is(input:not([type=checkbox],[type=radio],[type=range],[type=color],[type=file],[type=hidden]),textarea):not(:focus)]:pointer-events-none';

function coarsePointer(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
}

/**
 * 押した所から外側へ辿り、欄が 1 つだけ入った最初の囲みの欄に焦点を当てる。
 * 欄が 2 つ以上入った囲みや、カードの境まで来たら何もしない（どれを開くか決まらない）
 */
export function focusTappedField(event: React.MouseEvent<HTMLElement>): void {
  if (!coarsePointer()) return;
  const target = event.target;
  if (!(target instanceof Element) || target.matches(EDITABLE) || target.closest(OWN_TAP)) return;

  for (
    let node: Element | null = target;
    node !== null && node !== event.currentTarget;
    node = node.parentElement
  ) {
    const fields: NodeListOf<HTMLElement> = node.querySelectorAll<HTMLElement>(EDITABLE);
    const only: HTMLElement | undefined = fields.length === 1 ? fields[0] : undefined;
    if (only !== undefined) {
      only.focus();
      return;
    }
    if (fields.length > 1 || node.matches(BOUNDARY)) return;
  }
}
