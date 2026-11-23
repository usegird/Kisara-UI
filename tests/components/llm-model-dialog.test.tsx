// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LlmModelButton, LlmModelDialog } from '@/components/llm/dialogs/LlmModelDialog';
import { DEFAULT_LLM_MODEL_SORT, type LlmModelSort } from '@/components/llm/dialogs/model-sort';
import { useLlmProfilesStore } from '@/store/use-llm-profiles-store';
import { useSettingsStore } from '@/store/use-settings-store';

import { LEAK_ALLOWANCE, LEAK_ROUNDS, leakWatch } from '../helpers/leak';
import { modelDetails, profile } from '../helpers/llm';

const MODELS = ['openai/gpt-x', 'anthropic/claude-a', 'anthropic/claude-b', 'local-model'];

beforeEach(() => {
  useLlmProfilesStore.setState({
    profiles: [profile()],
    checks: { p1: { kind: 'ok', models: MODELS, contexts: {}, details: {}, serverContext: null } },
  });
});

afterEach(() => {
  cleanup();
  useSettingsStore.setState({ dialogLayouts: {} });
});

function ModelButton({
  value,
  attention = false,
}: {
  readonly value: string;
  readonly attention?: boolean;
}): React.ReactElement {
  const [open, setOpen] = useState(false);
  return (
    <LlmModelButton
      profileId="p1"
      value={value}
      onValueChange={vi.fn()}
      open={open}
      onOpenChange={setOpen}
      attention={attention}
    />
  );
}

function SortedDialog({
  value,
  onDecide,
}: {
  readonly value: string;
  readonly onDecide: (model: string) => void;
}): React.ReactElement {
  const [sort, setSort] = useState<LlmModelSort>(DEFAULT_LLM_MODEL_SORT);
  return (
    <LlmModelDialog
      open
      profileId="p1"
      value={value}
      sort={sort}
      onSort={setSort}
      onClose={vi.fn()}
      onDecide={onDecide}
    />
  );
}

function open(onDecide = vi.fn(), value = ''): ReturnType<typeof vi.fn> {
  render(<SortedDialog value={value} onDecide={onDecide} />);
  return onDecide;
}

function titles(): (string | null)[] {
  return within(list())
    .getAllByRole('button')
    .map((row) => row.getAttribute('title'));
}

function list(): HTMLElement {
  return screen.getByRole('list', { name: 'モデルの一覧' });
}

describe('会話のモデルを選ぶダイアログ', () => {
  it('/ の前をディレクトリとして並べ、押すとその下だけに絞る', () => {
    open();
    const tree = screen.getByRole('navigation', { name: 'モデルのディレクトリ' });
    fireEvent.click(within(tree).getByRole('button', { name: /anthropic/ }));
    const names = within(list())
      .getAllByRole('button')
      .map((row) => row.getAttribute('title'));
    expect(names).toEqual(['anthropic/claude-a', 'anthropic/claude-b']);
  });

  it('開いたときは絞り込みの欄に焦点を当てる（キーボードだけで絞って決められる）', async () => {
    open();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('searchbox')));
  });

  it('行のダブルクリックで、その名前（ディレクトリを含む）を返す', () => {
    const onDecide = open();
    fireEvent.doubleClick(within(list()).getByTitle('openai/gpt-x'));
    expect(onDecide).toHaveBeenCalledWith('openai/gpt-x');
  });

  it('絞り込みは空白で区切った語をすべて含むものだけ残す（AND）', () => {
    open();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'anthropic b' } });
    expect(titles().slice(1)).toEqual(['anthropic/claude-b']);
  });

  it('一覧に無い名前を打つと、それを使う行を先頭に出し、Enter で返す', () => {
    const onDecide = open();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'my/own' } });
    expect(within(list()).getAllByRole('button')[0]?.textContent).toContain('my/own');
    fireEvent.keyDown(screen.getByRole('searchbox'), { key: 'Enter' });
    expect(onDecide).toHaveBeenCalledWith('my/own');
  });

  it('開いたときは今のモデルを選んでおき、決定で返す', () => {
    const onDecide = open(vi.fn(), 'anthropic/claude-b');
    expect(within(list()).getByTitle('anthropic/claude-b').getAttribute('aria-pressed')).toBe(
      'true',
    );
    fireEvent.click(screen.getByRole('button', { name: '選んだモデルを使う' }));
    expect(onDecide).toHaveBeenCalledWith('anthropic/claude-b');
  });
});

describe('選んだモデルの情報', () => {
  it('付帯情報のあるモデルを選ぶと右の列に思考・費用を出し、無いモデルでは列を出さない', async () => {
    useLlmProfilesStore.setState({
      checks: {
        p1: {
          kind: 'ok',
          models: MODELS,
          contexts: {},
          details: {
            'openai/gpt-x': modelDetails({
              description: '説明の本文',
              prices: [{ name: 'prompt', usd: 0.000002, perToken: true }],
              inputs: ['text'],
              outputs: ['text'],
              reasoning: {
                mandatory: true,
                defaultEnabled: null,
                efforts: [],
                defaultEffort: null,
              },
              reasoningParam: true,
              others: [{ name: 'top_provider.max_completion_tokens', value: '128000' }],
            }),
          },
          serverContext: null,
        },
      },
    });
    open();
    fireEvent.click(within(list()).getByTitle('openai/gpt-x'));
    expect(within(list()).getByTitle('openai/gpt-x').textContent).toContain('prompt $2/1M');
    const info = await screen.findByRole('region', { name: 'モデルの情報' });
    expect(info.textContent).toContain('必須（思考モデル）');
    expect(info.textContent).toContain('$2 / 1M トークン');
    const titles = [...info.querySelectorAll('h3')].map((title) => title.textContent);
    expect(titles.slice(0, 4)).toEqual(['費用', '説明', '入力 → 出力', '思考']);
    expect(info.textContent).toContain('説明の本文');
    expect(info.textContent).toContain('top_provider.max_completion_tokens');
    fireEvent.click(within(info).getByRole('button', { name: 'モデルの情報を閉じる' }));
    expect(screen.queryByRole('region', { name: 'モデルの情報' })).toBeNull();
    expect(within(list()).getByTitle('openai/gpt-x').getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(within(list()).getByTitle('local-model'));
    expect(screen.queryByRole('region', { name: 'モデルの情報' })).toBeNull();
  });
});

describe('並び替え', () => {
  it('既定は名前の昇順。費用の種類を押すと prompt の安い順にし、費用の無いモデルは末尾に置く', () => {
    const price = (usd: number) =>
      modelDetails({ prices: [{ name: 'prompt', usd, perToken: true }] });
    useLlmProfilesStore.setState({
      checks: {
        p1: {
          kind: 'ok',
          models: MODELS,
          contexts: {},
          details: { 'openai/gpt-x': price(0.000002), 'anthropic/claude-b': price(0.000001) },
          serverContext: null,
        },
      },
    });
    open();
    expect(titles()).toEqual([
      'anthropic/claude-a',
      'anthropic/claude-b',
      'local-model',
      'openai/gpt-x',
    ]);
    fireEvent.click(screen.getByRole('button', { name: '費用で並べる' }));
    expect(titles()).toEqual([
      'anthropic/claude-b',
      'openai/gpt-x',
      'anthropic/claude-a',
      'local-model',
    ]);
    fireEvent.click(screen.getByRole('button', { name: '費用・昇順（押すと降順）' }));
    expect(titles().slice(0, 2)).toEqual(['openai/gpt-x', 'anthropic/claude-b']);
  });
});

describe('開くボタンの名前（WCAG 2.5.3）', () => {
  it('見えている文字を名前に含める（選んでいないときも、選んだときも）', () => {
    const { rerender } = render(<ModelButton value="" />);
    const button = screen.getByRole('button', { name: 'モデルを選択' });
    expect(button.textContent).toBe('モデルを選択');

    rerender(<ModelButton value="local-model" />);
    expect(screen.getByRole('button', { name: /local-model/ }).textContent).toBe('local-model');
  });
});

describe('選ぶよう促す', () => {
  it('促す間だけ欄を青い枠にする', () => {
    const { rerender } = render(<ModelButton value="" attention />);
    expect(screen.getByRole('button', { name: 'モデルを選択' }).className).toContain('ring-1');

    rerender(<ModelButton value="" />);
    expect(screen.getByRole('button', { name: 'モデルを選択' }).className).not.toContain('ring-1');
  });
});

describe('漏れ', () => {
  it('開け閉めを繰り返しても、閉じたダイアログを残さない', async () => {
    const leak = leakWatch();
    render(<ModelButton value="" />);

    for (let round = 0; round < LEAK_ROUNDS; round += 1) {
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'モデルを選択' }));
        await Promise.resolve();
      });
      leak.watch(await screen.findByRole('dialog'));
      await act(async () => {
        fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
        await Promise.resolve();
      });
    }

    expect(await leak.survivors()).toBeLessThanOrEqual(LEAK_ALLOWANCE);
  });
});
