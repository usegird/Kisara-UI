import { useCallback, useEffect, useRef } from 'react';

import { holdSettingsWrites } from '@/store/use-settings-store';

// ─────────────────────────────
// 掴んで動かす掴みの共通の仕組み（高さ・幅・枠の移動と大きさ）。
// ここでは測らない（掴んだ時点の値は呼び出し側が渡す。測る仕組みは 1 本に留める）。
// ─────────────────────────────

/** 掴みの要素に付けるポインタの受け口 */
export interface DragHandlers {
  readonly onPointerDown: (event: React.PointerEvent<HTMLElement>) => void;
  readonly onPointerMove: (event: React.PointerEvent<HTMLElement>) => void;
  readonly onPointerUp: (event: React.PointerEvent<HTMLElement>) => void;
  readonly onPointerCancel: (event: React.PointerEvent<HTMLElement>) => void;
}

/**
 * 掴んだ時点の値と押した位置からの差を渡し続ける掴みを作る。動かすたびに前回からの差を足すと
 * 丸めた誤差が積み上がるので、いつも掴んだ時点からの差で決める。押している間はポインタを捕まえ、
 * 要素の外へ出ても追い続ける。
 * @param origin - 押した瞬間に呼ばれ、掴んだ時点の値を返す。null なら掴まない
 *   （ボタンの上で押したときなど）
 * @param onDrag - 掴んだ時点の値と、押した位置からの差を毎回受ける。Esc では差 0 で呼ぶ
 */
export function useDragFrom<T>(
  origin: (event: React.PointerEvent<HTMLElement>) => T | null,
  onDrag: (from: T, dx: number, dy: number) => void,
): DragHandlers {
  const start = useRef<{ readonly x: number; readonly y: number; readonly from: T } | null>(null);
  /** 掴んでいる間だけ置く、Esc の受け口と捕まえた要素（離す・取り消すときに外す） */
  const held = useRef<{ readonly element: HTMLElement; readonly pointerId: number } | null>(null);
  const escape = useRef<((event: KeyboardEvent) => void) | null>(null);
  /** 掴んでいる間は設定を書かない。離したら最後の値を 1 回書く */
  const resumeWrites = useRef<(() => void) | null>(null);

  // 下の effect の依存（後始末）なので手で固定する（作り直すと掴んでいる途中で離したことになる）
  const release = useCallback((): void => {
    start.current = null;
    resumeWrites.current?.();
    resumeWrites.current = null;
    if (escape.current) document.removeEventListener('keydown', escape.current, true);
    escape.current = null;
    const current = held.current;
    held.current = null;
    if (current?.element.hasPointerCapture(current.pointerId)) {
      current.element.releasePointerCapture(current.pointerId);
    }
  }, []);

  const onPointerDown = (event: React.PointerEvent<HTMLElement>): void => {
    if (event.button !== 0) return;
    const from = origin(event);
    if (from === null) return;

    release();
    start.current = { x: event.clientX, y: event.clientY, from };
    resumeWrites.current = holdSettingsWrites();
    held.current = { element: event.currentTarget, pointerId: event.pointerId };

    // Esc は掴んだときの値へ戻してやめる。ほかへは渡さない（ダイアログを閉じない）
    const onEscape = (key: KeyboardEvent): void => {
      if (key.key !== 'Escape') return;
      key.preventDefault();
      key.stopPropagation();
      release();
      onDrag(from, 0, 0);
    };
    escape.current = onEscape;
    document.addEventListener('keydown', onEscape, true);

    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  const onPointerMove = (event: React.PointerEvent<HTMLElement>): void => {
    const current = start.current;
    if (current === null) return;
    onDrag(current.from, event.clientX - current.x, event.clientY - current.y);
  };

  const onPointerUp = (): void => {
    if (start.current !== null) release();
  };

  // 掴んだまま外れたら、Esc の受け口も外す
  useEffect(() => release, [release]);

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp };
}
