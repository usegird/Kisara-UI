// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { WildcardOverlay } from '@/components/comfy/dialogs/WildcardOverlay';
import { INSERT_CARET_MARK } from '@/lib/text-drag-session';
import { comfyPort, installComfyPort } from '@/store/ports/comfy-port';
import { useSettingsStore } from '@/store/use-settings-store';
import { useWildcardsStore } from '@/store/use-wildcards-store';

const BASE = 'http://127.0.0.1:8188';

let port: ReturnType<typeof comfyPort>;
const fetchEntries = vi.fn<(baseUrl: string, name: string) => Promise<string[] | null>>();

beforeEach(() => {
  port = comfyPort();
  fetchEntries.mockReset();
  fetchEntries.mockResolvedValue(['blue', 'red']);
  installComfyPort({ ...port, assets: { ...port.assets, fetchWildcardEntries: fetchEntries } });
  useSettingsStore.setState({ baseUrl: BASE });
});

afterEach(() => {
  cleanup();
  installComfyPort(port);
  useSettingsStore.setState({ baseUrl: '' });
  useWildcardsStore.setState({
    panelOpen: false,
    names: [],
    status: 'idle',
    baseUrl: '',
    entries: {},
  });
});

function open(): void {
  useWildcardsStore.setState({
    panelOpen: true,
    status: 'ready',
    baseUrl: BASE,
    entries: {},
    names: ['__animal__', '__color/warm__', '__color/tone/pale__', '__weather__'],
  });
}

async function show(): Promise<HTMLElement> {
  render(<WildcardOverlay />);
  await screen.findByLabelText('ワイルドカードを絞り込む');
  return screen.getByRole('navigation', { name: 'ワイルドカードの階層' });
}

function rowNames(tree: HTMLElement): string[] {
  return within(tree)
    .getAllByRole('button')
    .map((button) => button.textContent);
}

describe('ワイルドカードの画面', () => {
  it('閉じていれば何も描かない', () => {
    const { container } = render(<WildcardOverlay />);
    expect(container.firstChild).toBeNull();
  });

  it('階層は閉じた状態で出し、押すと開き、もう一度押すと閉じる', async () => {
    open();
    const tree = await show();
    expect(rowNames(tree)).toEqual(['すべて4', 'color2', 'animal', 'weather']);

    const color = within(tree).getByRole('button', { name: /^color/u });
    expect(color.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(color);
    expect(rowNames(tree)).toEqual(['すべて4', 'color2', 'tone1', 'warm', 'animal', 'weather']);
    expect(color.getAttribute('aria-expanded')).toBe('true');

    fireEvent.click(color);
    expect(rowNames(tree)).toEqual(['すべて4', 'color2', 'animal', 'weather']);
  });

  it('絞り込みの語に当たるものだけを、階層を開いて出す', async () => {
    open();
    const tree = await show();

    fireEvent.change(screen.getByLabelText('ワイルドカードを絞り込む'), {
      target: { value: 'pale weather' },
    });

    expect(rowNames(tree)).toEqual(['すべて2', 'color1', 'tone1', 'pale', 'weather']);
  });

  it('選ぶと中身を取り、右にそのままプレビューを出す', async () => {
    open();
    const tree = await show();

    fireEvent.click(within(tree).getByRole('button', { name: 'animal' }));

    const preview = screen.getByRole('region', { name: 'プレビュー' });
    expect(preview.textContent).toContain(
      'プレビュー（ネストやワイルドカード、重みが適用済のため実際の記述とは異なります）',
    );
    const entries = await within(preview).findByRole('list', { name: 'ワイルドカードの候補' });
    expect(entries.textContent).toBe('bluered');
    expect(fetchEntries).toHaveBeenCalledWith(BASE, '__animal__', {});
  });

  it('選び直しても、同じ名前は取り直さない', async () => {
    open();
    const tree = await show();
    const animal = within(tree).getByRole('button', { name: 'animal' });

    fireEvent.click(animal);
    await screen.findByRole('list', { name: 'ワイルドカードの候補' });
    fireEvent.click(within(tree).getByRole('button', { name: 'weather' }));
    fireEvent.click(animal);

    expect(fetchEntries.mock.calls.map((call) => call[1])).toEqual(['__animal__', '__weather__']);
  });

  it('展開の経路が無ければ、プレビューの欄にその旨を出す', async () => {
    fetchEntries.mockResolvedValue(null);
    open();
    const tree = await show();

    fireEvent.click(within(tree).getByRole('button', { name: 'animal' }));

    expect(await screen.findByText(/接続先がワイルドカードを展開できない/u)).not.toBeNull();
  });

  it('木のワイルドカードのダブルクリックで、外の複数行の欄のキャレット位置へ取り込む', async () => {
    open();
    const field = document.createElement('textarea');
    field.value = 'a b';
    document.body.append(field);
    const tree = await show();

    field.focus();
    field.setSelectionRange(2, 2);
    fireEvent.focusIn(field);
    fireEvent.doubleClick(within(tree).getByRole('button', { name: 'animal' }));

    expect(field.value).toBe('a __animal__b');
    expect(field.selectionStart).toBe(12);
    field.remove();
  });

  it('木のワイルドカードを掴むと、名前をブラウザの文字のドラッグに載せる', async () => {
    open();
    const tree = await show();
    const row = within(tree).getByRole('button', { name: 'animal' });
    const setData = vi.fn();

    expect(row.getAttribute('draggable')).toBe('true');
    fireEvent.dragStart(row, { dataTransfer: { setData, effectAllowed: '' } });

    expect(setData).toHaveBeenCalledWith('text/plain', '__animal__');
  });

  it('選んで、決定のボタンで差し込み、画面を閉じる', async () => {
    open();
    const field = document.createElement('textarea');
    document.body.append(field);
    const tree = await show();

    field.focus();
    fireEvent.focusIn(field);
    fireEvent.click(within(tree).getByRole('button', { name: 'weather' }));
    const decide = screen.getByRole('toolbar', { name: 'ワイルドカードの決定' });
    fireEvent.click(within(decide).getByLabelText('ワイルドカードをキャレット位置に取り込む'));

    expect(field.value).toBe('__weather__');
    expect(useWildcardsStore.getState().panelOpen).toBe(false);
    field.remove();
  });

  it('差し込み先が無ければ見出しに理由を赤で出し、挿入位置のアイコンは置かない', async () => {
    open();
    await show();
    expect(screen.getByText('挿入先を選択してから選択してください')).not.toBeNull();
    expect(document.querySelector('.lucide-text-cursor')).toBeNull();
  });

  it('差し込み先があれば欄のキャレットにアイコンを重ね、帯には置かない', async () => {
    open();
    const field = document.createElement('textarea');
    document.body.append(field);
    await show();

    field.focus();
    fireEvent.focusIn(field);

    await waitFor(() =>
      expect(document.body.querySelector(`[${INSERT_CARET_MARK}]`)).not.toBeNull(),
    );
    expect(screen.queryByTitle('複数行の入力欄へ落とすと、そこを挿入先にします')).toBeNull();
    field.remove();
  });
});

describe('右の一覧とプレビューの切り替え', () => {
  function listed(): string[] {
    const list = screen.getByRole('list', { name: 'ワイルドカードの一覧' });
    return within(list)
      .getAllByRole('button')
      .map((button) => button.getAttribute('aria-label') ?? '');
  }

  it('開いたときは全部の一覧。階層を押すと、その下（入れ子を含む）の一覧にする', async () => {
    open();
    const tree = await show();
    expect(listed()).toHaveLength(4);

    fireEvent.click(within(tree).getByRole('button', { name: /^color/u }));

    expect(listed().sort()).toEqual(['__color/tone/pale__', '__color/warm__']);
  });

  it('一覧で選ぶとプレビューに切り替え、左の木もその階層を開いて選ぶ', async () => {
    open();
    const tree = await show();

    fireEvent.click(screen.getByRole('button', { name: '__color/tone/pale__' }));

    expect(screen.queryByRole('list', { name: 'ワイルドカードの一覧' })).toBeNull();
    expect(await screen.findByRole('list', { name: 'ワイルドカードの候補' })).not.toBeNull();
    const pale = within(tree).getByRole('button', { name: 'pale' });
    expect(pale.getAttribute('aria-pressed')).toBe('true');
  });

  it('右端の閉じる × で、前の一覧へ戻る', async () => {
    open();
    const tree = await show();
    fireEvent.click(within(tree).getByRole('button', { name: /^color/u }));
    fireEvent.click(screen.getByRole('button', { name: '__color/warm__' }));
    await screen.findByRole('list', { name: 'ワイルドカードの候補' });

    fireEvent.click(screen.getByRole('button', { name: 'プレビューを閉じて一覧へ戻る' }));

    expect(listed().sort()).toEqual(['__color/tone/pale__', '__color/warm__']);
    const warm = screen.getByRole('button', { name: '__color/warm__' });
    expect(warm.getAttribute('aria-pressed')).toBe('true');
  });

  it('一覧のダブルクリックで、外の複数行の欄へ取り込む', async () => {
    open();
    const field = document.createElement('textarea');
    document.body.append(field);
    await show();

    field.focus();
    fireEvent.focusIn(field);
    fireEvent.doubleClick(screen.getByRole('button', { name: '__weather__' }));

    expect(field.value).toBe('__weather__');
    field.remove();
  });
});

describe('プレビューの上の段', () => {
  it('左に取り込み、右端に閉じる × を置き、取り込みは閉じずに差し込む', async () => {
    open();
    const field = document.createElement('textarea');
    document.body.append(field);
    const tree = await show();
    field.focus();
    fireEvent.focusIn(field);
    fireEvent.click(within(tree).getByRole('button', { name: 'animal' }));

    const row = screen.getByRole('button', { name: 'プレビューを閉じて一覧へ戻る' }).parentElement;
    const buttons = within(row as HTMLElement).getAllByRole('button');
    expect(buttons[0]?.getAttribute('aria-label')).toBe('ワイルドカードをキャレット位置に取り込む');
    expect(buttons.at(-1)?.getAttribute('aria-label')).toBe('プレビューを閉じて一覧へ戻る');

    fireEvent.click(buttons[0] as HTMLElement);
    expect(field.value).toBe('__animal__');
    expect(screen.getByRole('region', { name: 'プレビュー' })).not.toBeNull();
    field.remove();
  });
});

describe('木の一番上の「すべて」', () => {
  it('押すと右を全部の一覧にし、「すべて」に色を付ける', async () => {
    open();
    const tree = await show();
    const all = within(tree).getByRole('button', { name: /^すべて/u });
    expect(all.getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(within(tree).getByRole('button', { name: /^color/u }));
    expect(all.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(screen.getByRole('button', { name: '__color/warm__' }));
    await screen.findByRole('list', { name: 'ワイルドカードの候補' });

    fireEvent.click(all);

    const list = screen.getByRole('list', { name: 'ワイルドカードの一覧' });
    expect(within(list).getAllByRole('button')).toHaveLength(4);
    expect(all.getAttribute('aria-pressed')).toBe('true');
  });
});
