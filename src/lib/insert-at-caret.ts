// ─────────────────────────────
// フォーカスしている入力欄のキャレット位置へ文字列を差し込む。
// ここが**唯一の置き場**。差し込みを各部品で書かない（同じ回避策が散る）。
// ─────────────────────────────

/** 文字を差し込める入力欄 */
export type TextField = HTMLInputElement | HTMLTextAreaElement;

/** 差し込み元の画面（スタイルの編集・ワイルドカード）に付ける目印。この中の欄は差し込み先にしない */
export const INSERT_SOURCE_MARK = 'data-insert-source';

/** 打った語ではない差し込みをしている最中の欄（入力の知らせは同期で届くので、その間だけ入れる） */
const quietFields = new WeakSet<TextField>();

/**
 * 打った語ではない文字（選んだ Lora・落とした文字）として差し込む。タグの補完はこの入力では出さない
 */
export function insertQuietly(element: TextField, text: string): boolean {
  quietFields.add(element);
  try {
    return insertAtCaret(element, text);
  } finally {
    quietFields.delete(element);
  }
}

/**
 * 差し込みの画面（Lora・スタイル・ワイルドカード）から 1 件を入れる。末尾に改行を足し（入れる文字が
 * 改行で終わっていれば足さない）、キャレットは入れた文字の先頭に戻す。入れた先頭の位置と入れた文字を
 * 返し、入れられなければ null
 */
export function insertEntry(
  element: TextField,
  text: string,
): { readonly start: number; readonly text: string } | null {
  if (text.length === 0) return null;
  const entry = text.endsWith('\n') ? text : `${text}\n`;
  // 選んでいる範囲は置き換わるので、入った文字はその先頭から始まる
  const start = element.selectionStart ?? element.value.length;
  if (!insertQuietly(element, entry)) return null;
  element.setSelectionRange(start, start);
  return { start, text: entry };
}

/** いま届いている入力の知らせが、打った語ではない差し込みによるものか */
export function isQuietInput(element: TextField): boolean {
  return quietFields.has(element);
}

/** 文字を打てる欄か。押しボタンや選択肢は対象にしない */
export function isTextField(element: Element | null): element is TextField {
  if (element instanceof HTMLTextAreaElement) return true;
  if (!(element instanceof HTMLInputElement)) return false;

  return ['text', 'search', 'url', 'tel', 'password', 'email', 'number'].includes(element.type);
}

/**
 * React が差し替える前の値の setter。無ければ差し込みは諦める。
 * 入力欄の値は React が持っているので、素の setter で入れて `input` を発火しないと次の描画で
 * 戻される。素の setter は React が差し替えたものより下にあるため、これだけが両方に届く。
 *
 * eslint-disable-next-line の理由: 取り出した setter を**その要素に当てて呼ぶ**のがここの目的で、
 * 束ねられていない関数を持ち出すことは避けられない（`Reflect.apply` で受け側を明示している）。
 */
function nativeValueSetter(element: TextField): ((value: string) => void) | null {
  const prototype =
    element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  // eslint-disable-next-line @typescript-eslint/unbound-method -- 上のコメントの理由
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;

  if (setter === undefined) return null;

  return (value: string): void => {
    Reflect.apply(setter, element, [value]);
  };
}

/**
 * 人が打ったのと同じ編集として差し込む。ブラウザの取り消し履歴に積まれるので Ctrl+Z / Cmd+Z で戻せる。
 * `execCommand` は古い呼び名の仕組みだが、入力欄の取り消し履歴に積む方法は他に無いので使う。
 * 使えない環境（対応していない・欄が受け付けない）では false。
 */
function insertAsUserEdit(element: TextField, text: string): boolean {
  const owner = element.ownerDocument;
  if (typeof owner.execCommand !== 'function') return false;

  const insertText = owner.execCommand.bind(owner);
  try {
    element.focus();
    return insertText('insertText', false, text);
  } catch {
    // 受け付けない欄・対応していない環境。下の道へ落とす
    return false;
  }
}

/**
 * キャレット位置（選択があればその範囲を置き換えて）差し込む。
 * 差し込めたら true。**キャレットは差し込んだ末尾**に置き、続けて打てるようにする。
 * 人が打ったのと同じ編集として入れられなかったときだけ素の setter で入れる
 * （この道では取り消し履歴に積めない）。
 */
export function insertAtCaret(element: TextField, text: string): boolean {
  if (text.length === 0) return false;
  if (insertAsUserEdit(element, text)) return true;

  const setValue = nativeValueSetter(element);
  if (setValue === null) return false;

  const value = element.value;
  const start = element.selectionStart ?? value.length;
  const end = element.selectionEnd ?? start;

  setValue(`${value.slice(0, start)}${text}${value.slice(end)}`);
  element.dispatchEvent(new Event('input', { bubbles: true }));

  const caret = start + text.length;
  element.setSelectionRange(caret, caret);
  element.focus();

  return true;
}

/**
 * 欄の文をまるごと置き換える（空にするときは `text` に空を渡す）。差し込みと同じく、まず人が打ったのと
 * 同じ編集として入れるので、Ctrl+Z / Cmd+Z で元の文に戻せる。使えなければ素の setter で入れる
 * （この道では取り消し履歴に積めない）。置き換えたら true
 */
export function replaceFieldText(element: TextField, text: string): boolean {
  if (element.value === text) return true;
  element.focus();
  element.select();
  const owner = element.ownerDocument;
  if (typeof owner.execCommand === 'function') {
    const run = owner.execCommand.bind(owner);
    try {
      if (text.length === 0 ? run('delete') : run('insertText', false, text)) return true;
    } catch {
      // 受け付けない欄・対応していない環境。下の道へ落とす
    }
  }
  const setValue = nativeValueSetter(element);
  if (setValue === null) return false;
  setValue(text);
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.setSelectionRange(text.length, text.length);
  return true;
}
