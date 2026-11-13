import { RotateCcw, Table2, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { formatMegabytes } from '@/lib/file-size';
import {
  heapUsage,
  probeParents,
  resetStats,
  statRows,
  statsSnapshot,
  type HeapUsage,
  type StatRow,
} from '@/lib/perf-stats';

// ─────────────────────────────
// 回数の台帳の表と、空にするボタン・表を開くボタン。**開発と計測用ビルドでだけ**入口から読む。
// ─────────────────────────────

/** 表を開いている間、台帳を読み直す間隔 */
const REFRESH_MS = 1000;

/** 字下げ 1 段の幅（px） */
const INDENT_PX = 12;

type Rows = readonly StatRow[];

/** 今の台帳を表の並びで読む */
function readRows(): Rows {
  return statRows(statsSnapshot(), probeParents());
}

/** ミリ秒を小数 1 桁で出す */
function formatMilliseconds(value: number): string {
  return value.toFixed(1);
}

/** 台帳の表の props */
export interface PerfStatsBarProps {
  /**
   * 計測用ビルドか。時間の列と JS ヒープの量を出し、表を開いた状態で始める
   * （開発サーバの時間は StrictMode・HMR・開発用のモジュールが乗り使えない）
   */
  readonly profiling: boolean;
}

/** 台帳のボタンと表。画面とは別の根に描くので、押しても読み直しても台帳は増えない */
export function PerfStatsBar({ profiling }: PerfStatsBarProps): React.ReactElement {
  /** 最後に読んだ台帳。閉じていれば null */
  const [rows, setRows] = useState<Rows | null>(() => (profiling ? readRows() : null));
  /** 最後に読んだ JS ヒープの量。台帳と同じ時に読み直す */
  const [heap, setHeap] = useState<HeapUsage | null>(() => (profiling ? heapUsage() : null));

  // 下の effect の依存なので手で固定する（作り直すと読み直しのタイマーを張り直す）
  const read = useCallback((): void => {
    setRows(readRows());
    if (profiling) setHeap(heapUsage());
  }, [profiling]);

  const reset = (): void => {
    resetStats();
    if (rows !== null) setRows([]);
  };

  // 台帳は React の外にあるので、開いている間だけ定期的に読み直す
  const open = rows !== null;
  useEffect(() => {
    if (!open) return;
    const timer = setInterval(read, REFRESH_MS);
    return () => clearInterval(timer);
  }, [open, read]);

  return (
    <div className="fixed top-1 right-1 z-[100] flex flex-col items-end gap-1">
      <div className="bg-card/90 flex gap-0.5 rounded-md border p-0.5 shadow-sm">
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="描画の回数を空にする"
          title="描画の回数を空にする（操作の直前に押す）"
          onClick={reset}
        >
          <RotateCcw />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="描画の回数を表で出す"
          title="描画の回数を表で出す"
          onClick={read}
        >
          <Table2 />
        </Button>
      </div>

      {rows === null ? null : (
        <section
          aria-label="描画の回数"
          className="bg-card text-foreground max-h-[60vh] overflow-auto rounded-md border p-2
            text-xs shadow-lg"
        >
          <div className="mb-1 flex items-center justify-between gap-4">
            <span className="font-medium">描画の回数</span>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="表を閉じる"
              title="表を閉じる"
              onClick={() => setRows(null)}
            >
              <X />
            </Button>
          </div>
          {rows.length === 0 ? (
            <p className="text-muted-foreground">まだ何も数えていません</p>
          ) : (
            <table className="tabular-nums">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="pr-3 text-left font-normal">項目</th>
                  <th className="text-right font-normal">回数</th>
                  {profiling ? (
                    <>
                      <th className="pl-3 text-right font-normal">合計 ms</th>
                      <th className="pl-3 text-right font-normal">最大 ms</th>
                    </>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {rows.map(({ name, depth, stat }) => (
                  <tr key={name}>
                    {/* 字下げの段は数で決まるので、幅だけを style で渡す */}
                    <td className="pr-3 font-mono" style={{ paddingLeft: depth * INDENT_PX }}>
                      {depth > 0 ? <span className="text-muted-foreground">└ </span> : null}
                      {name}
                    </td>
                    <td className="text-right">{stat.count}</td>
                    {profiling ? (
                      <>
                        <td className="pl-3 text-right">{formatMilliseconds(stat.totalMs)}</td>
                        <td className="pl-3 text-right">{formatMilliseconds(stat.maxMs)}</td>
                      </>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {profiling ? (
            <p className="text-muted-foreground mt-1 tabular-nums">
              {heap === null
                ? 'JS ヒープ: この環境では読めません'
                : `JS ヒープ ${formatMegabytes(heap.usedBytes)} MB` +
                  `（上限 ${formatMegabytes(heap.limitBytes)} MB）`}
            </p>
          ) : null}
        </section>
      )}
    </div>
  );
}
