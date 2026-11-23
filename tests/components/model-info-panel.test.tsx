// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ModelInfoPanel } from '@/components/comfy/flow/dialogs/ModelInfoPanel';
import { buildModelItems, modelFileIndex } from '@/graph/model-files';
import type { ModelInfo } from '@/graph/model-metadata';
import { useModelJson } from '@/hooks/flow/use-model-json';

import { modelFile } from '../helpers/model-files';

const INFO: ModelInfo = {
  title: 'b',
  baseModel: 'sdxl',
  network: '32 / 16',
  triggers: ['1girl', 'smile'],
  entries: [
    { key: 'ss_short', value: 'x' },
    { key: 'ss_long', value: 'y'.repeat(80) },
  ],
};
vi.mock('@/hooks/flow/use-model-metadata', () => ({
  useModelMetadata: () => ({ status: 'ready', info: INFO, error: null }),
}));
vi.mock('@/hooks/flow/use-model-json', async (original) => {
  const actual = await original<typeof import('@/hooks/flow/use-model-json')>();
  return { ...actual, useModelJson: vi.fn(actual.useModelJson) };
});

afterEach(cleanup);

function item(): ReturnType<typeof buildModelItems>[number] {
  const files = [modelFile('b.safetensors', { size: 2048 })];
  const [first] = buildModelItems(['b.safetensors'], modelFileIndex(files));
  if (first === undefined) throw new Error('組み立てられない');
  return first;
}

describe('モデルの情報（下に置いたとき）', () => {
  it('上段は name・type・base model・ss_tag_frequency を見出しなしの項目として並べる', () => {
    render(<ModelInfoPanel item={item()} folder="loras" layout="wide" onClose={vi.fn()} />);

    const top = screen.getByText('name').closest('section');
    expect(top?.textContent).toBe('namebtype.safetensorsbase modelsdxlss_tag_frequency1girlsmile');
    expect(screen.queryByRole('heading', { name: 'ss_tag_frequency' })).toBeNull();
  });

  it('name・type・base model は 1 つの行に横に並べる', () => {
    render(<ModelInfoPanel item={item()} folder="loras" onClose={vi.fn()} />);

    const line = screen.getByText('name').parentElement?.parentElement?.parentElement;
    expect(line?.className).toContain('flex-wrap');
    expect(line?.children).toHaveLength(3);
    expect(line?.textContent).not.toContain('ss_tag_frequency');
  });

  it('Lora の段は JSON・txt・model data の順', () => {
    vi.mocked(useModelJson).mockReturnValueOnce({
      status: 'loading',
      source: null,
      error: null,
      save: vi.fn(),
    });
    render(<ModelInfoPanel item={item()} folder="loras" onClose={vi.fn()} />);

    const order = screen
      .getAllByRole('heading', { level: 4 })
      .map((heading) => heading.textContent);
    expect(order.filter((name) => ['JSON', 'txt', 'model data'].includes(name ?? ''))).toEqual([
      'JSON',
      'txt',
      'model data',
    ]);
  });

  it('model data の段の先頭はサイズ・作成日・更新日・ネットワークの順', () => {
    const files = [modelFile('b.safetensors', { size: 2048, created: 1, modified: 2 })];
    const [dated] = buildModelItems(['b.safetensors'], modelFileIndex(files));
    if (dated === undefined) throw new Error('組み立てられない');
    render(<ModelInfoPanel item={dated} folder="loras" onClose={vi.fn()} />);

    const metadata = screen.getByRole('heading', { name: 'model data' }).closest('section');
    const labels = [...(metadata?.querySelectorAll('span.text-muted-foreground') ?? [])];
    expect(labels.map((label) => label.textContent)).toEqual([
      'サイズ',
      '作成日',
      '更新日',
      'ネットワーク',
    ]);
    expect(metadata?.contains(screen.getByText('ss_short'))).toBe(true);
  });

  it('name は経路から拡張子を除いたもの（ディレクトリを含む）を写す', () => {
    const files = [modelFile('style/b.v2.safetensors')];
    const [nested] = buildModelItems(['style\\b.v2.safetensors'], modelFileIndex(files));
    if (nested === undefined) throw new Error('組み立てられない');
    render(<ModelInfoPanel item={nested} folder="loras" onClose={vi.fn()} />);

    const copy = screen.getByRole('button', { name: 'b.v2 の名前を写す' });
    expect(copy.previousElementSibling?.textContent).toBe('name');
    expect(copy.parentElement?.nextElementSibling?.textContent).toBe('style/b.v2');
  });

  it('学習で多かった語の並びはメモの欄と同じ高さまでで、越えたらスクロールする', () => {
    render(<ModelInfoPanel item={item()} folder="loras" onClose={vi.fn()} />);

    const words = screen.getByText('smile').closest('ul');
    expect(words?.className).toContain('max-h-20');
    expect(words?.className).toContain('overflow-y-auto');
  });

  it('txt・JSON・model data の見出しの左にアイコンを置く（読み上げない）', () => {
    render(<ModelInfoPanel item={item()} folder="loras" onClose={vi.fn()} />);

    const heading = screen.getByRole('heading', { name: 'model data' });
    const icon = heading.previousElementSibling;
    expect(icon?.tagName.toLowerCase()).toBe('svg');
    expect(icon?.getAttribute('aria-hidden')).toBe('true');
    expect(heading.closest('section')?.className).toBe('pt-1');
    expect(heading.parentElement?.className).toContain('min-h-5');
  });

  it('上段・model data の先頭の項目は、名前の行の下に値を出す', () => {
    render(<ModelInfoPanel item={item()} folder="loras" onClose={vi.fn()} />);

    for (const name of ['type', 'ネットワーク']) {
      const label = screen.getByText(name);
      expect(label.parentElement?.nextElementSibling?.textContent).not.toBe('');
      expect(label.parentElement?.textContent).toBe(name);
    }
  });

  it('全項目は名前と値を 1 行に並べ、長い値だけ 1 行を通して使う', () => {
    render(<ModelInfoPanel item={item()} folder="loras" layout="wide" onClose={vi.fn()} />);

    expect(screen.getByText('ss_long').parentElement?.className).toContain('col-span-full');
    expect(screen.getByText('ss_short').parentElement?.className).not.toContain('col-span-full');
  });

  it('差し込みを渡されたときは、学習で多かった語をまとめて入れられる', () => {
    const onInsert = vi.fn();
    render(
      <ModelInfoPanel
        item={item()}
        folder="checkpoints"
        insert={{ blocked: null, onInsert }}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(
      screen.getByRole('button', { name: '学習で多かった語をキャレットの位置へ入れる' }),
    );
    expect(onInsert).toHaveBeenCalledWith('1girl, smile');
  });

  it('見出しの × の左に、渡された操作（置き場の切り替え）を置く', () => {
    render(
      <ModelInfoPanel
        item={item()}
        folder="loras"
        actions={<button type="button">情報を右に出す</button>}
        onClose={vi.fn()}
      />,
    );

    const toggle = screen.getByRole('button', { name: '情報を右に出す' });
    expect(toggle.nextElementSibling?.getAttribute('aria-label')).toBe('情報を閉じる');
  });
});

describe('モデルの情報（カードの画像）', () => {
  const preview = { baseUrl: 'http://127.0.0.1:8188' };

  it('カードに重なったとき（preview を渡したとき）だけ、見出しの下の最上段に画像を出す', async () => {
    render(
      <ModelInfoPanel item={item()} folder="checkpoints" preview={preview} onClose={vi.fn()} />,
    );

    const image = await screen.findByRole('img', { name: 'b のプレビュー' });
    expect(image.parentElement?.firstElementChild).toBe(image);
    cleanup();

    render(<ModelInfoPanel item={item()} folder="checkpoints" onClose={vi.fn()} />);
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('読めない画像は出さない', async () => {
    render(
      <ModelInfoPanel item={item()} folder="checkpoints" preview={preview} onClose={vi.fn()} />,
    );

    fireEvent.error(await screen.findByRole('img', { name: 'b のプレビュー' }));
    expect(screen.queryByRole('img')).toBeNull();
  });
});

describe('モデルの情報（選び直し）', () => {
  it('別の Lora を選び直しても、txt の段は 1 つのまま', () => {
    const files = [modelFile('a.safetensors'), modelFile('b.safetensors')];
    const items = buildModelItems(['a.safetensors', 'b.safetensors'], modelFileIndex(files));
    const [first, second] = items;
    if (first === undefined || second === undefined) throw new Error('組み立てられない');
    const { rerender } = render(<ModelInfoPanel item={first} folder="loras" onClose={vi.fn()} />);

    rerender(<ModelInfoPanel item={second} folder="loras" onClose={vi.fn()} />);
    rerender(<ModelInfoPanel item={first} folder="loras" onClose={vi.fn()} />);

    expect(screen.getAllByRole('heading', { name: 'txt' })).toHaveLength(1);
  });
});
