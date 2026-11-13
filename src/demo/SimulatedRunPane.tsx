import { cva } from 'class-variance-authority';
import { Play, Square, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { outputKind, SAMPLE_SETS, sampleImage } from '@/demo/sample-images';
import { planRun, runSimulation } from '@/demo/simulated-run';
import { cardIdOfPromptNode, toApiPrompt } from '@/graph/to-api-prompt';
import type { NodeDefinitionMap, Workflow } from '@/graph/types';
import { t } from '@/i18n';
import { useDefinitionsStore } from '@/store/use-definitions-store';
import { useExecutionStore } from '@/store/use-execution-store';
import { useGraphStore } from '@/store/use-graph-store';

// ─────────────────────────────
// デモの模擬実行の枠。待ち → 実行中 → 終わりを切り替えて描く。**通信はしない**。
// ─────────────────────────────

type Phase = 'idle' | 'running' | 'done';

interface RunResult {
  /** 実行の形のノード id */
  readonly nodeId: string;
  readonly name: string;
  readonly src: string;
}

const BUTTON =
  'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium ' +
  'bg-primary text-primary-foreground hover:bg-primary/90';
const ICON_BUTTON = 'text-muted-foreground hover:bg-muted rounded p-1';

/**
 * 待ちはボタンの大きさ、実行中と終わりは画像が入る幅。
 * 狭い画面は右下の拡大・縮小のボタンに掛からない幅に留める
 */
const pane = cva(
  'bg-popover text-popover-foreground absolute bottom-4 left-4 z-30 flex max-w-[calc(100%-2rem)] ' +
    'max-md:max-w-[calc(100%-5rem)] flex-col gap-2 rounded-lg border p-2 shadow-lg',
  { variants: { wide: { true: 'w-80', false: '' } } },
);

const thumb = cva('size-12 shrink-0 overflow-hidden rounded border-2', {
  variants: {
    selected: { true: 'border-primary', false: 'border-transparent hover:border-border' },
  },
});

/** 実行の形のノードの見出し（カードのコメントか、ノードの名前） */
function nodeName(
  nodeId: string,
  workflow: Workflow | null,
  definitions: NodeDefinitionMap,
): string {
  const cardId = cardIdOfPromptNode(nodeId);
  const node = workflow?.nodes.find((each) => each.id === cardId);
  if (!node) return nodeId;
  const title = typeof node.title === 'string' ? node.title.trim() : '';
  return title !== '' ? title : (definitions.get(node.type)?.displayName ?? node.type);
}

/** 模擬実行の枠。押すと見本の画像を時間をかけて出し、実行中の見た目を本体と同じ仕組みで出す */
export function SimulatedRunPane(): React.ReactElement {
  const workflow = useGraphStore((state) => state.workflow);
  const definitions = useDefinitionsStore((state) => state.definitions);
  const runningNode = useExecutionStore((state) => state.runningNode);
  const progress = useExecutionStore((state) => state.progress);

  const [phase, setPhase] = useState<Phase>('idle');
  const [results, setResults] = useState<readonly RunResult[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [done, setDone] = useState(0);
  const [total, setTotal] = useState(0);
  const runs = useRef(0);
  const cancel = useRef<(() => void) | null>(null);

  // 枠を外す（ワークフローを開き直す）ときは実行を止め、状況を初めに戻す
  useEffect(
    () => () => {
      cancel.current?.();
      useExecutionStore.getState().reset();
    },
    [],
  );

  const run = (): void => {
    if (!workflow) return;
    cancel.current?.();
    const plan = planRun(
      toApiPrompt(workflow, definitions).prompt,
      (classType) => definitions.get(classType)?.outputNode ?? false,
    );
    const set = runs.current % SAMPLE_SETS;
    runs.current += 1;
    setResults([]);
    setSelected(null);
    setDone(0);
    setTotal(plan.length);
    setPhase('running');
    cancel.current = runSimulation(plan, {
      onOutput: (nodeId) => {
        const src = sampleImage(set, outputKind(nodeId));
        if (src === undefined) return;
        const name = nodeName(nodeId, workflow, definitions);
        setResults((previous) => [...previous, { nodeId, name, src }]);
      },
      onStep: (index) => setDone(index),
      onDone: () => {
        cancel.current = null;
        setPhase('done');
      },
    });
  };

  const stop = (): void => {
    cancel.current?.();
    cancel.current = null;
    setResults([]);
    setPhase('idle');
  };

  // 大きく出すのは選んだ画像、無ければ最後に出た画像
  const shown = results.find((result) => result.nodeId === selected) ?? results.at(-1);

  return (
    <section aria-label={t('demo.run.run')} className={pane({ wide: phase !== 'idle' })}>
      {phase === 'running' ? (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-sm">
              {t('demo.run.running', {
                name: runningNode === null ? '…' : nodeName(runningNode, workflow, definitions),
              })}
            </p>
            <button
              type="button"
              className={ICON_BUTTON}
              aria-label={t('demo.run.stop')}
              onClick={stop}
            >
              <Square className="size-4" aria-hidden />
            </button>
          </div>
          <progress className="h-1.5 w-full" value={done} max={Math.max(total, 1)} />
          {progress !== null && progress.max > 1 ? (
            <p className="text-muted-foreground text-xs">
              {t('demo.run.step', { value: progress.value, max: progress.max })}
            </p>
          ) : null}
          <p className="text-muted-foreground text-xs">{t('demo.run.note')}</p>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2">
          <button type="button" className={BUTTON} onClick={run} disabled={!workflow}>
            <Play className="size-4" aria-hidden />
            {t(phase === 'done' ? 'demo.run.runAgain' : 'demo.run.run')}
          </button>
          {phase === 'done' ? (
            <button
              type="button"
              className={ICON_BUTTON}
              aria-label={t('demo.run.close')}
              onClick={() => {
                setResults([]);
                setPhase('idle');
              }}
            >
              <X className="size-4" aria-hidden />
            </button>
          ) : null}
        </div>
      )}

      {shown === undefined ? null : (
        <>
          <div className="relative">
            <img
              src={shown.src}
              alt={shown.name}
              className="aspect-square w-full rounded object-cover"
            />
            {/* 説明の一行は実行中だけなので、結果にも模擬だと示す */}
            <span
              title={t('demo.run.note')}
              className="absolute top-1.5 left-1.5 rounded bg-black/60 px-1.5 py-0.5 text-3xs
                font-medium text-white"
            >
              {t('demo.run.badge')}
            </span>
          </div>
          <ul aria-label={t('demo.run.outputs')} className="flex gap-1.5 overflow-x-auto">
            {results.map((result) => (
              <li key={result.nodeId} className="shrink-0">
                <button
                  type="button"
                  title={result.name}
                  aria-label={t('demo.run.show', { name: result.name })}
                  aria-pressed={result.nodeId === shown.nodeId}
                  className={thumb({ selected: result.nodeId === shown.nodeId })}
                  onClick={() => setSelected(result.nodeId)}
                >
                  <img src={result.src} alt="" className="size-full object-cover" />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
