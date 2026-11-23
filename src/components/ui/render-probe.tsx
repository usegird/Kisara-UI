import { createContext, Profiler, useContext, useEffect } from 'react';

import { recordProbeParent, recordStat } from '@/lib/perf-stats';

const ProbeContext = createContext<string | null>(null);

export interface RenderProbeProps {
  readonly id: string;
  readonly children: React.ReactNode;
}

export function RenderProbe({ id, children }: RenderProbeProps): React.ReactElement {
  const parent = useContext(ProbeContext);
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
