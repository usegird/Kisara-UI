import { createElement, lazy, Suspense, useState, type ComponentType, type ReactNode } from 'react';

import { PartLoadFault } from '@/components/ui/part-loading';
import { t, type MessageKey } from '@/i18n';
import { asError } from '@/lib/fault';

// ─────────────────────────────
// 開いたときだけ読む部品。ダイアログの中身のように、開くまで要らないものを初期の JS から外し、
// 開いたときに取りに行く。
// ─────────────────────────────

/** 作った部品の読み込み手続き。画面が落ち着いたらまとめて先に読む */
const loaders = new Set<() => Promise<unknown>>();

/**
 * 開いたときだけ読む部品を、画面が落ち着いたときに先に読んでおく。
 * 初期の JS には入れないまま、初めて開くときの待ち（読み込み直後は約 300 ms）を消す。
 * 取れなくてもここでは何もしない（開いたときにもう一度取り、そこで読めなければ印を出す）
 */
export function preloadLazyParts(): void {
  for (const load of loaders) void load().catch(() => undefined);
}

/**
 * 開いたときだけ読む部品を作る。
 *   ・`label`: 部品の名前の鍵の道筋（読めなかったときに引く）
 *   ・`load`: 部品を返す動的な import（`import('…').then((m) => m.Part)`）
 *   ・`fallback`: 読んでいる間に出すもの。渡された props から枠を組める。
 *     枠が据え置きの部品（重ねる画面の中身など）は `PartLoading` を、枠ごと読む部品は null を渡す
 *     （仮の枠を出すと本物の枠に付け替えるぶん描き直しが倍になる）
 * 返す部品は元と同じ props を受ける。
 * 読めなかったときは、読み直すしかない（React は一度失敗した読み込みを覚え、描き直しても
 * 同じ失敗を返す）。新しい版を置いた直後の古いページで起きるので、読み込み直しを勧める。
 * 部品の中で起きた失敗は、呼び出し側の受け止め口が受ける
 */
export function lazyPart<P extends object>(
  label: MessageKey,
  load: () => Promise<ComponentType<P>>,
  fallback: (props: P) => ReactNode,
): ComponentType<P> {
  // 一度読んだら同じ約束を使い回す（先読みと開いたときの読み込みを 1 回にする）
  let loading: Promise<ComponentType<P>> | null = null;
  /** 読み終えた部品。あれば suspend せずにそのまま描く */
  let loaded: ComponentType<P> | null = null;
  const loadOnce = (): Promise<ComponentType<P>> => {
    loading ??= load().then(
      (component) => {
        loaded = component;
        return component;
      },
      (error: unknown) => {
        // 取れなかった約束は覚えない（次に開いたときにもう一度取りに行く）
        loading = null;
        throw error;
      },
    );
    return loading;
  };
  loaders.add(loadOnce);

  const Lazy = lazy<ComponentType<P>>(() =>
    loadOnce().then(
      (component) => ({ default: component }),
      (error: unknown) => {
        // 読めなかった印は props を使わないので、元の部品と同じ型として置ける
        const Fault: ComponentType<P> = () => (
          <PartLoadFault label={t(label)} error={asError(error)} />
        );
        return { default: Fault };
      },
    ),
  );

  return function LazyPart(props: P): React.ReactElement {
    // 読めていれば suspend しない。React の `lazy` は初めて描くとき必ず一度 suspend し、
    // fallback からの切り替えを約 300 ms 抑えるので、先読みが済んでいても初回だけ遅れる。
    // どちらの経路で始めたかは置いた時点で決めて変えない（途中で変えると部品ごと作り直しになる）
    const [direct] = useState(() => loaded);
    if (direct !== null) return createElement(direct, props);
    return <Suspense fallback={fallback(props)}>{createElement(Lazy, props)}</Suspense>;
  };
}
