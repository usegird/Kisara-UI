import { useEffect, useRef, useState } from 'react';

import { isTextField, type TextField } from '@/lib/insert-at-caret';

// ─────────────────────────────
// 差し込み先にする文字の欄（最後に焦点があった欄）を見張る。覚えるのは要素そのもので、
// キャレットの位置は要素が持っているので二重に持たない。
// ─────────────────────────────

/** 今フォーカスのある欄。受け付けない欄なら null */
function focusedField(accept: (field: TextField) => boolean): TextField | null {
  const active = globalThis.document.activeElement;
  return active !== null && isTextField(active) && accept(active) ? active : null;
}

/**
 * `active` の間だけ差し込み先を見張る（焦点を閉じ込めない画面を開いている間）。押しボタンを押すと
 * 焦点は外れるので、外れる直前の欄を覚えておく（押す側は `onMouseDown` で焦点を奪わないこと）。
 * 始まった時点でキャレットのある欄を拾い、その後は**最後に入った欄**を返す（離れても外さない）。
 * 始まった時点でキャレットが無ければ、どこかの欄に入るまで null。
 * **開いたときに作られる画面**（スタイルの編集・ワイルドカード）は最初から `active` なので、
 * 作られた時点も「始まった時点」として拾う
 */
export function useTextFieldWhile(
  accept: (field: TextField) => boolean,
  active: boolean,
): TextField | null {
  const [field, setField] = useState<TextField | null>(() =>
    active ? focusedField(accept) : null,
  );
  const change = useChangeOnly(field, setField);
  const [wasActive, setWasActive] = useState(active);
  // 始まった瞬間に拾う（焦点が画面へ移る前。描画中に前回の状態から直す React の型）
  if (active !== wasActive) {
    setWasActive(active);
    setField(active ? focusedField(accept) : null);
  }

  useEffect(() => {
    if (!active) return;
    const onFocus = (event: FocusEvent): void => {
      const target = event.target;
      if (target instanceof Element && isTextField(target) && accept(target)) change(target);
    };
    globalThis.document.addEventListener('focusin', onFocus);
    return () => globalThis.document.removeEventListener('focusin', onFocus);
  }, [accept, active, change]);

  // 画面から消えた欄には入れられない
  return active && field?.isConnected === true ? field : null;
}

/**
 * 描いた値と違うときだけ `set` を呼ぶ手続き（見張りから呼ぶ）。
 * 同じ値の更新でも React は描き直さずに更新を控えに積み、次に描き直すまで捨てない。焦点はページの
 * どこでも頻繁に動くので、毎回更新すると積んだ更新が抱える要素（閉じたダイアログの中身など）が
 * 残り続ける。
 * （描く前に続けて来た更新は、同じ値でもそのまま渡す。描けば控えは片付く）
 */
function useChangeOnly(
  value: TextField | null,
  set: (next: TextField | null) => void,
): (next: TextField | null) => void {
  const latest = useRef(value);
  useEffect(() => {
    latest.current = value;
  }, [value]);

  const [change] = useState(() => (next: TextField | null): void => {
    if (next !== latest.current) set(next);
  });
  return change;
}
