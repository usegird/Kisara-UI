// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ModelInfoPanel } from '@/components/comfy/flow/dialogs/ModelInfoPanel';
import { buildModelItems, modelFileIndex } from '@/graph/model-files';
import type { ModelInfo } from '@/graph/model-metadata';

import { modelFile } from '../helpers/model-files';

// 埋め込みの情報は取りに行かない（テストから ComfyUI に触れない）
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

// ─────────────────────────────
// モデルの情報。下に置いたときは横の広さを使って組む。
// ─────────────────────────────

afterEach(cleanup);

function item(): ReturnType<typeof buildModelItems>[number] {
  const files = [modelFile('b.safetensors', { size: 2048 })];
  const [first] = buildModelItems(['b.safetensors'], modelFileIndex(files));
  if (first === undefined) throw new Error('組み立てられない');
  return first;
}

describe('モデルの情報（下に置いたとき）', () => {
  it('上段は 2 列で、右に大きさ・日時。学習語はその外で 1 行を通す', () => {
    render(<ModelInfoPanel item={item()} folder="loras" layout="wide" onClose={vi.fn()} />);

    const size = screen.getByText('大きさ').closest('section');
    const path = screen.getByText('パス').closest('section');
    expect(size).not.toBe(path);
    expect(path?.textContent).toContain('名称');
    expect(size?.parentElement?.className).toContain('grid-cols-2');

    const words = screen.getByText('学習で多かった語').closest('section');
    expect(words?.parentElement).not.toBe(size?.parentElement);
  });

  it('学習で多かった語の並びはメモの欄と同じ高さまでで、越えたらスクロールする', () => {
    render(<ModelInfoPanel item={item()} folder="loras" onClose={vi.fn()} />);

    const words = screen.getByText('smile').closest('ul');
    expect(words?.className).toContain('max-h-20');
    expect(words?.className).toContain('overflow-y-auto');
  });

  it('右に置いたとき、上段は名称が一番上で、日時と網の間を空けない', () => {
    render(<ModelInfoPanel item={item()} folder="loras" onClose={vi.fn()} />);

    const name = screen.getByText('名称');
    const section = name.closest('section');
    expect(section?.firstElementChild?.contains(name)).toBe(true);
    expect(section?.contains(screen.getByText('大きさ'))).toBe(true);
    expect(section?.contains(screen.getByText('ネットワーク'))).toBe(true);
  });

  it('情報の幅が狭いときは、上段も名前と値を 2 行に分ける', () => {
    render(<ModelInfoPanel item={item()} folder="loras" onClose={vi.fn()} />);

    expect(screen.getByLabelText('モデルの情報').className).toContain('@container');
    const label = screen.getByText('パス');
    expect(label.className).toContain('@max-[18rem]:w-full');
    expect(label.parentElement?.className).toContain('flex-wrap');
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
