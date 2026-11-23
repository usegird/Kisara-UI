// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { HistoryDetailPanel } from '@/components/comfy/queue/HistoryDetailPanel';
import { PromptsSection } from '@/components/comfy/queue/task-detail-sections';
import { addRuns, EMPTY_RUN_HISTORY } from '@/queue/run-history';
import { buildHistoryCards, type HistoryCard } from '@/queue/run-history-view';
import { PLAIN_LABELER } from '@/queue/task-failure';
import { useConnectionStore } from '@/store/use-connection-store';
import { outputViewUrl, useOutputImagesStore } from '@/store/use-output-images-store';
import { useRunHistoryStore } from '@/store/use-run-history-store';

import { definition, definitionMap, widget } from '../helpers/definitions';
import { LEAK_ALLOWANCE, LEAK_ROUNDS, leakWatch } from '../helpers/leak';
import { runSource } from '../helpers/run-history';

vi.mock('@/comfy/queue', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/comfy/queue')>()),
  fetchOutputImage: () => Promise.reject(new Error('テストでは取らない')),
}));

const DEFINITIONS = definitionMap(
  definition('Noise', [widget('seed', 'INT'), widget('label', 'STRING')], { outputNode: true }),
);

const KINDS = { modelNames: new Set<string>(), loraNames: new Set<string>() };

function card(runs: number, imagesPerRun = 1): HistoryCard {
  const file = addRuns({
    file: EMPTY_RUN_HISTORY,
    sources: Array.from({ length: runs }, (_, index) =>
      runSource(
        `p${String(index)}`,
        (index + 1) * 1_000,
        Array.from({ length: imagesPerRun }, (_slot, n) => `r${String(index)}_${String(n)}.png`),
        {
          nodes: [
            {
              id: 1,
              type: 'Noise',
              pos: [0, 0],
              widgets_values: [100 + index, 'randomize', 'base.safetensors'],
            },
          ],
          links: [],
        },
      ),
    ),
    definitions: DEFINITIONS,
    kinds: KINDS,
    names: new Map([['p0', 'portrait']]),
  });
  const [first] = buildHistoryCards([['s.json', file]]);
  if (first === undefined) throw new Error('no card');
  return first;
}

function show(target: HistoryCard): void {
  render(
    <HistoryDetailPanel
      card={target}
      baseUrl="http://comfy.test"
      onMove={() => {}}
      hasNewer={false}
      hasOlder={false}
      onOpenViewer={() => {}}
      onOpenWorkflow={() => {}}
      opening={false}
      openError={null}
      onClose={() => {}}
    />,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('履歴の詳細', () => {
  it('見出しはセッション名か id。セッションの行の鉛筆で直すと記録に書き、Esc では書かない', () => {
    const renameSession = vi.fn(() => Promise.resolve());
    const original = useRunHistoryStore.getState().renameSession;
    useRunHistoryStore.setState({ renameSession });
    show(card(1));

    expect(screen.getByRole('heading', { name: 's' })).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'セッション名を変える' }));
    const input = screen.getByRole('textbox', { name: 'セッション名' });
    fireEvent.change(input, { target: { value: 'night' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(renameSession).toHaveBeenCalledWith('http://comfy.test', 's.json', '');

    fireEvent.click(screen.getByRole('button', { name: 'セッション名を変える' }));
    const again = screen.getByRole('textbox', { name: 'セッション名' });
    fireEvent.change(again, { target: { value: 'night' } });
    fireEvent.keyDown(again, { key: 'Enter' });
    expect(renameSession).toHaveBeenLastCalledWith('http://comfy.test', 's.json', 'night');
    useRunHistoryStore.setState({ renameSession: original });
  });

  it('実行ごとの一覧に新しい順でシードを出し、行を押すとその実行を選ぶ', () => {
    show(card(2));

    expect(screen.getByRole('button', { pressed: true }).textContent).toContain('シード 101');
    fireEvent.click(screen.getByRole('button', { pressed: false, name: /シード 100/u }));

    expect(screen.getByRole('button', { pressed: true }).textContent).toContain('シード 100');
  });

  it('先頭にセッションと、選んでいる実行の出力のタイプとファイル名を出す', () => {
    show(card(1));

    const summary = screen.getByText('セッション').closest('dl');
    expect(summary?.textContent).toContain('session: s');
    expect(summary?.textContent).toContain('タイプ');
    expect(summary?.textContent).toMatch(/output\s*r0_0\.png/u);
  });

  it('シードの欄にノード番号・ノード名・入力名・値を出し、#番号と設定の欄は出さない', () => {
    show(card(1));

    const seeds = screen.getByRole('heading', { name: 'シード', level: 3 }).parentElement;
    expect(seeds?.textContent).not.toContain('#');
    expect(seeds?.textContent).toContain('ノード 1');
    expect(seeds?.textContent).toContain('Noise');
    expect(seeds?.textContent).toMatch(/ノード 1seed100Noise/u);
    expect(seeds?.textContent).toContain('seed');
    expect(seeds?.textContent).toContain('100');
    expect(screen.queryByRole('heading', { name: '設定', level: 3 })).toBeNull();
  });

  it('実行の一覧は見出しを「実行」にし、時刻を秒まで出し、↑ ↓ で選びを移す', () => {
    show(card(3));

    expect(screen.getByRole('heading', { name: '実行', level: 3 })).toBeDefined();
    const selected = (): HTMLElement => screen.getByRole('button', { pressed: true });
    expect(selected().textContent).toMatch(/\d{2}:\d{2}:\d{2}/u);
    expect(selected().textContent).toContain('シード 102');

    fireEvent.keyDown(selected(), { key: 'ArrowDown' });
    expect(selected().textContent).toContain('シード 101');
    expect(document.activeElement).toBe(selected());
    fireEvent.keyDown(selected(), { key: 'ArrowUp' });
    fireEvent.keyDown(selected(), { key: 'ArrowUp' });
    expect(selected().textContent).toContain('シード 102');
  });

  it('開いたら一番新しい実行の行にフォーカスを置き、フォーカスが無いときも ← → で隣へ移る', () => {
    const onMove = vi.fn();
    render(
      <HistoryDetailPanel
        card={card(2)}
        baseUrl="http://comfy.test"
        onMove={onMove}
        hasNewer
        hasOlder
        onOpenViewer={() => {}}
        onOpenWorkflow={() => {}}
        opening={false}
        openError={null}
        onClose={() => {}}
      />,
    );

    const newest = screen.getByRole('button', { pressed: true });
    expect(document.activeElement).toBe(newest);
    expect(newest.textContent).toContain('シード 101');

    newest.blur();
    fireEvent.keyDown(document.body, { key: 'ArrowRight' });
    expect(onMove).toHaveBeenCalledWith(1);
    fireEvent.keyDown(document.body, { key: 'ArrowLeft' });
    expect(onMove).toHaveBeenLastCalledWith(-1);
  });

  it('写し取りを付けたプロンプトは、ノードの表記の横にアイコンを出す', () => {
    const prompt = {
      nodeId: '6',
      classType: 'Text',
      inputName: 'text',
      text: 'a cat',
      role: 'positive' as const,
    };
    render(<PromptsSection prompts={[prompt]} label={PLAIN_LABELER} copyable />);

    expect(screen.getByRole('button', { name: 'このプロンプトを写す' })).toBeDefined();
  });

  it('モデルは区分を見出しにして出し、無い区分は出さない', () => {
    show(card(1));

    expect(screen.getByRole('heading', { name: 'モデル', level: 3 })).toBeDefined();
    expect(screen.getByText('base.safetensors')).toBeDefined();
    expect(screen.queryByRole('heading', { name: 'LoRA' })).toBeNull();
  });

  it('ワークフローを開くと、選んでいる実行を渡す', () => {
    const target = card(2);
    const onOpenWorkflow = vi.fn();
    render(
      <HistoryDetailPanel
        card={target}
        baseUrl="http://comfy.test"
        onMove={() => {}}
        hasNewer={false}
        hasOlder={false}
        onOpenViewer={() => {}}
        onOpenWorkflow={onOpenWorkflow}
        opening={false}
        openError={null}
        onClose={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'このワークフローを開く' }));

    expect(onOpenWorkflow).toHaveBeenCalledWith(target.runs[0]);
  });

  it('PNG がすべて消えたと分かったら、ワークフローを開くアイコンを出さない', () => {
    vi.stubGlobal(
      'URL',
      class extends URL {
        static override createObjectURL = (): string => 'blob:test';
      },
    );
    const target = card(1);
    const file = target.runs[0]?.outputs[0];
    const url = file === undefined ? null : outputViewUrl('http://comfy.test', file);
    if (url === null) throw new Error('no url');
    useOutputImagesStore.setState({ images: new Map([[url, 'missing']]) });
    show(target);

    expect(screen.queryByRole('button', { name: 'このワークフローを開く' })).toBeNull();
    useOutputImagesStore.setState({ images: new Map() });
  });

  it('狭いときの画像の領域を横に送ると隣の実行を選び、一覧で選び直すと面も移る', () => {
    show(card(2));
    const pager = document.querySelector<HTMLElement>('[data-image-strip] .snap-x');
    if (pager === null) throw new Error('no pager');
    Object.defineProperty(pager, 'clientWidth', { value: 100 });

    pager.scrollLeft = 100;
    fireEvent.scroll(pager);
    expect(screen.getByRole('button', { pressed: true }).textContent).toContain('シード 100');

    fireEvent.click(screen.getByRole('button', { pressed: false, name: /シード 101/u }));
    expect(pager.scrollLeft).toBe(0);
  });

  it('PNG の出力が無い実行では、ワークフローを開くアイコンを出さない', () => {
    show(card(1, 0));

    expect(screen.queryByRole('button', { name: 'このワークフローを開く' })).toBeNull();
  });

  it('ワークフローを開けなかった理由を出し、読んでいる間は押せない', () => {
    render(
      <HistoryDetailPanel
        card={card(1)}
        baseUrl="http://comfy.test"
        onMove={() => {}}
        hasNewer={false}
        hasOlder={false}
        onOpenViewer={() => {}}
        onOpenWorkflow={() => {}}
        opening
        openError="読めません"
        onClose={() => {}}
      />,
    );

    expect(screen.getByRole('alert').textContent).toBe('読めません');
    const button = screen.getByRole('button', { name: 'このワークフローを開く' });
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });

  it('画像は選んでいる実行のものだけを、最初のまとまりだけ描く', async () => {
    type Notify = (entries: { isIntersecting: boolean }[]) => void;
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        readonly #notify: Notify;
        constructor(callback: Notify) {
          this.#notify = callback;
        }
        observe(target: Element): void {
          if (target.tagName === 'SPAN')
            queueMicrotask(() => this.#notify([{ isIntersecting: true }]));
        }
        disconnect(): void {}
      },
    );
    useConnectionStore.setState({ status: 'connected' });
    show(card(2, 10));

    const column = 'img:not([data-image-strip] img)';
    await waitFor(() => expect(document.querySelectorAll(column)).toHaveLength(8));
    expect(document.querySelectorAll('[data-run-page="current"] img')).toHaveLength(10);
    expect(document.querySelector(column)?.getAttribute('alt')).toBe('r1_9.png');

    fireEvent.click(screen.getByRole('button', { pressed: false, name: /シード 100/u }));
    await waitFor(() =>
      expect(document.querySelector(column)?.getAttribute('alt')).toBe('r0_9.png'),
    );
    useConnectionStore.setState({ status: 'disconnected' });
  });

  it('開け閉めを繰り返しても、閉じた詳細を残さない', async () => {
    const target = card(2);
    const leak = leakWatch();
    const Placed = ({ open }: { readonly open: boolean }): React.ReactElement | null =>
      open ? (
        <HistoryDetailPanel
          card={target}
          baseUrl="http://comfy.test"
          onMove={() => {}}
          hasNewer={false}
          hasOlder={false}
          onOpenViewer={() => {}}
          onOpenWorkflow={() => {}}
          opening={false}
          openError={null}
          onClose={() => {}}
        />
      ) : null;
    const { rerender } = render(<Placed open={false} />);

    for (let round = 0; round < LEAK_ROUNDS; round += 1) {
      await act(async () => {
        rerender(<Placed open />);
        await Promise.resolve();
      });
      leak.watch(screen.getByRole('region', { name: '履歴の詳細' }));
      await act(async () => {
        rerender(<Placed open={false} />);
        await Promise.resolve();
      });
    }

    expect(await leak.survivors()).toBeLessThanOrEqual(LEAK_ALLOWANCE);
  });
});
