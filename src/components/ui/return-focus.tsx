import { useEffect, useRef, useState } from 'react';

// ─────────────────────────────
// 外したときに、開く前の焦点へ戻す（開いている間だけ置くダイアログ用）。
// ─────────────────────────────

function currentFocus(): HTMLElement | null {
  const active = globalThis.document.activeElement;
  return active instanceof HTMLElement && active !== globalThis.document.body ? active : null;
}

/**
 * 置いた時点で焦点のあった要素を覚え、外したら基盤の後始末が済んでからそこへ戻す。
 * ダイアログの基盤は閉じる手順の中で焦点を戻すが、ダイアログごと外すとその手順が走らず、
 * 焦点はページ全体か、以前に触った別の要素へ行く
 */
export function ReturnFocus({
  children,
}: {
  readonly children: React.ReactNode;
}): React.ReactElement {
  // 置く描画の時点では、まだ開く前の要素に焦点がある
  const [opener] = useState(currentFocus);

  // 開発時の StrictMode は置いた直後に後始末を一度走らせる。本当に外したときだけ戻す
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      const restore = (): void => {
        if (mounted.current || opener?.isConnected !== true) return;
        if (currentFocus() !== opener) opener.focus();
      };
      // 基盤も外した後に焦点を動かす（次の描画の後）。描画の周期は画面が隠れていると
      // 止まるので、すぐ後の順番でも一度戻しておく
      globalThis.setTimeout(restore);
      globalThis.requestAnimationFrame(() => globalThis.setTimeout(restore));
    };
  }, [opener]);

  return <>{children}</>;
}
