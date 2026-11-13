import { createContext, Profiler, useContext, useEffect } from 'react';

import { recordProbeParent, recordStat } from '@/lib/perf-stats';

// ─────────────────────────────
// 描画の回数を数える範囲。通常の本番ビルドでは React がこれを呼ばない。
// ─────────────────────────────

/** いちばん内側の範囲の名前 */
const ProbeContext = createContext<string | null>(null);

/** 計測の範囲の props */
export interface RenderProbeProps {
  /** 台帳の名前。同じ名前の範囲は 1 つに足し込む（カードは全カードで 1 つ） */
  readonly id: string;
  readonly children: React.ReactNode;
}

/**
 * 中の部品が commit されるたびに、初回は `mount:<id>`、それ以外は `render:<id>` として台帳に足す。
 * 外側の範囲も控える（表で入れ子を字下げして見せるため）
 */
export function RenderProbe({ id, children }: RenderProbeProps): React.ReactElement {
  const parent = useContext(ProbeContext);
  // 台帳は React の外にある。入れ子は描いたあとに一度だけ控える
  useEffect(() => recordProbeParent(id, parent), [id, parent]);

  return (
    <ProbeContext.Provider value={id}>
      <Profiler id={id} onRender={recordRender}>
        {children}
      </Profiler>
    </ProbeContext.Provider>
  );
}

function recordRender(id: string, phase: string, actualDuration: number): void {
  recordStat(`${phase === 'mount' ? 'mount' : 'render'}:${id}`, actualDuration);
}
