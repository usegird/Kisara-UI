// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TagPanelOverlay } from '@/components/comfy/dialogs/TagPanelOverlay';
import { DELETED_KIND, indexTags } from '@/graph/tag-dictionary';
import { PRESS_GUARD_MS } from '@/lib/press-guard';
import { useSettingsStore } from '@/store/use-settings-store';
import { useTagsStore } from '@/store/use-tags-store';

import { LEAK_ALLOWANCE, LEAK_ROUNDS, leakWatch } from '../helpers/leak';
import { tagEntry } from '../helpers/tags';

const base = 'http://127.0.0.1:8188';
const initial = useTagsStore.getState();

afterEach(() => {
  cleanup();
  useTagsStore.setState(initial, true);
});

function open() {
  const mine = [tagEntry('blue_hair', 5)];
  const pysssss = [tagEntry('long_hair', 900), tagEntry('smile', 50)];
  const commit = vi.fn<ReturnType<typeof useTagsStore.getState>['commit']>(() =>
    Promise.resolve(null),
  );
  useSettingsStore.setState({ baseUrl: base });
  useTagsStore.setState({
    panelOpen: true,
    status: 'ready',
    loadedFrom: base,
    pysssss,
    dictionaries: [{ name: 'mine', entries: mine }],
    overrides: [],
    merged: [...indexTags(mine, 'mine'), ...indexTags(pysssss, null)],
    commit,
  });
  return { commit };
}

async function show(): Promise<void> {
  render(<TagPanelOverlay />);
  await screen.findByLabelText('タグを絞り込む');
}

function select(name: RegExp): void {
  fireEvent.click(screen.getByRole('button', { name, pressed: false }));
}

function tagInputs(): HTMLInputElement[] {
  return screen.getAllByRole<HTMLInputElement>('textbox', { name: 'タグ' });
}

function confirmButton(): HTMLButtonElement {
  return screen.getByRole<HTMLButtonElement>('button', { name: '直した分を辞書へ書く' });
}

let pressedAt = Date.now();

async function confirm(): Promise<void> {
  pressedAt = Math.max(pressedAt, Date.now()) + 10 * PRESS_GUARD_MS;
  vi.setSystemTime(pressedAt);
  await act(async () => {
    fireEvent.click(confirmButton());
    await Promise.resolve();
  });
}

describe('タグ辞書の画面', () => {
  it('すべての下にファイルの無い既定の辞書を出し、すべての表は読むだけ', async () => {
    open();
    await show();

    const names = screen.getAllByRole('button', { pressed: false }).map((b) => b.textContent);
    expect(names.some((name) => name.startsWith('KisaraUI'))).toBe(true);
    expect(screen.queryAllByRole('textbox', { name: 'タグ' })).toHaveLength(0);
    expect(confirmButton().disabled).toBe(true);
  });

  it('辞書をまたいで直しかけを持ち、確定でまとめて書く', async () => {
    const { commit } = open();
    await show();
    select(/^KisaraUI/);

    expect(tagInputs()).toHaveLength(1);
    fireEvent.change(tagInputs()[0] as HTMLInputElement, { target: { value: 'cat' } });
    expect(tagInputs()).toHaveLength(2);

    select(/^mine/);
    expect(screen.queryByText('編集中の内容')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'blue_hair を消す' }));
    select(/^KisaraUI/);
    expect(tagInputs()[0]?.value).toBe('cat');

    await confirm();
    expect(commit).toHaveBeenCalledWith(base, {
      dictionaries: [
        { name: 'KisaraUI', entries: [{ tag: 'cat', kind: '', priority: 0, aliases: [] }] },
        { name: 'mine', entries: [] },
      ],
      overrides: null,
    });
  });

  it('消した行は取り消し線で残り、戻すアイコンで戻せる', async () => {
    open();
    await show();
    select(/^mine/);

    fireEvent.click(screen.getByRole('button', { name: 'blue_hair を消す' }));
    expect(tagInputs()[0]?.readOnly).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'blue_hair を戻す' }));
    expect(tagInputs()[0]?.readOnly).toBe(false);
  });

  it('同じタグが 2 行あれば書かずに知らせる', async () => {
    const { commit } = open();
    await show();
    select(/^mine/);

    fireEvent.change(tagInputs()[1] as HTMLInputElement, { target: { value: 'Blue Hair' } });
    select(/^すべて/);
    await confirm();
    expect(commit).not.toHaveBeenCalled();
    expect(screen.getByText(/同じタグが 2 行あります/)).not.toBeNull();
    expect(tagInputs()).toHaveLength(3);
  });

  it('pysssss の行は取り消し線を引いて消す印を付け、確定で上書きに消す行を書く', async () => {
    const { commit } = open();
    await show();
    select(/^pysssss/);

    expect(screen.queryAllByRole('textbox', { name: 'タグ' })).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'smile を消す' }));
    expect(screen.getByText('smile').className).toContain('line-through');
    expect(screen.getByRole('button', { name: 'smile を戻す' })).not.toBeNull();

    await confirm();
    const changes = commit.mock.calls[0]?.[1];
    expect(changes?.overrides).toEqual([{ ...tagEntry('smile', 50), kind: DELETED_KIND }]);
  });

  it('pysssss の別名と優先度を直すと、確定で同じタグの上書きを書く', async () => {
    const { commit } = open();
    await show();
    select(/^pysssss/);

    const aliases = screen.getAllByRole<HTMLInputElement>('textbox', { name: '別名' });
    fireEvent.change(aliases[0] as HTMLInputElement, { target: { value: 'lh, long' } });
    const priorities = screen.getAllByRole<HTMLInputElement>('textbox', { name: '優先度' });
    fireEvent.change(priorities[0] as HTMLInputElement, { target: { value: '7' } });

    await confirm();
    expect(commit.mock.calls[0]?.[1].overrides).toEqual([tagEntry('long_hair', 7, ['lh', 'long'])]);
  });

  it('見出しを押すとその列で並べ替え、押すたびに昇順・降順・元の並びに戻る', async () => {
    open();
    await show();
    select(/^pysssss/);
    const order = (): string[] =>
      screen.getAllByRole('row').flatMap((row) => {
        const cell = row.querySelector('[role="cell"]');
        return cell === null ? [] : [cell.textContent];
      });

    expect(order()).toEqual(['long_hair', 'smile']);
    const tagHeader = screen.getByRole('button', { name: 'タグ' });
    fireEvent.click(tagHeader);
    expect(order()).toEqual(['long_hair', 'smile']);
    fireEvent.click(tagHeader);
    expect(order()).toEqual(['smile', 'long_hair']);
    fireEvent.click(screen.getByRole('button', { name: '優先度' }));
    expect(order()).toEqual(['smile', 'long_hair']);
    fireEvent.click(tagHeader);
    fireEvent.click(tagHeader);
    fireEvent.click(tagHeader);
    expect(order()).toEqual(['long_hair', 'smile']);
  });

  it('一覧の最下部で辞書を足し、確定で書く', async () => {
    const { commit } = open();
    await show();

    fireEvent.click(screen.getByRole('button', { name: '辞書を足す' }));
    const name = screen.getByRole('textbox', { name: '辞書の名前' });
    fireEvent.change(name, { target: { value: 'MINE' } });
    fireEvent.keyDown(name, { key: 'Enter' });
    expect(screen.getByText('同じ名前の辞書があります')).not.toBeNull();
    fireEvent.change(name, { target: { value: 'extra' } });
    fireEvent.keyDown(name, { key: 'Enter' });
    expect(tagInputs()).toHaveLength(1);

    await confirm();
    expect(commit).toHaveBeenCalledWith(base, {
      dictionaries: [{ name: 'extra', entries: [] }],
      overrides: null,
    });
  });

  it('辞書と pysssss は無効にでき、取り消し線を引く。確定を待たずに設定へ入れ、ファイルは消さない', async () => {
    useSettingsStore.setState({ tagSourcesOff: [] });
    const { commit } = open();
    await show();

    fireEvent.click(screen.getByRole('button', { name: 'mine を無効にする' }));
    fireEvent.click(screen.getByRole('button', { name: 'pysssss を無効にする' }));
    expect(screen.getByText('mine').className).toContain('line-through');
    expect(useSettingsStore.getState().tagSourcesOff).toEqual(['dictionary:mine', 'pysssss']);
    expect(confirmButton().disabled).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'mine を有効に戻す' }));
    expect(useSettingsStore.getState().tagSourcesOff).toEqual(['pysssss']);
    expect(commit).not.toHaveBeenCalled();
    useSettingsStore.setState({ tagSourcesOff: [] });
  });

  it('直しかけがあれば、閉じる前に確かめる', async () => {
    open();
    await show();
    select(/^pysssss/);
    fireEvent.click(screen.getByRole('button', { name: 'smile を消す' }));

    fireEvent.click(screen.getAllByRole('button', { name: 'タグ辞書を閉じる' })[0] as HTMLElement);
    expect(await screen.findByText('編集中の内容')).not.toBeNull();
  });
});

describe('漏れ', () => {
  it('開け閉めを繰り返しても、閉じた画面を残さない', async () => {
    open();
    const leak = leakWatch();
    render(<TagPanelOverlay />);
    for (let round = 0; round < LEAK_ROUNDS; round += 1) {
      await act(async () => {
        useTagsStore.getState().openPanel();
        await Promise.resolve();
      });
      leak.watch(await screen.findByLabelText('タグを絞り込む'));
      await act(async () => {
        useTagsStore.getState().closePanel();
        await Promise.resolve();
      });
    }
    expect(await leak.survivors()).toBeLessThanOrEqual(LEAK_ALLOWANCE);
  });
});
