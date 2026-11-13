// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DictionaryDialog } from '@/components/llm/dictionary/DictionaryDialog';

import { loreEntry } from '../helpers/llm';

// ─────────────────────────────
// 追加辞書のダイアログ。「⊕ 追加」は一覧の末尾にあり、末尾に足す。
// ─────────────────────────────

afterEach(() => {
  cleanup();
});

describe('項目を足す', () => {
  it('一覧の末尾のボタンで、空の項目を末尾に足して開く。列は発動率が追加先の左', () => {
    const onSave = vi.fn();
    render(
      <DictionaryDialog
        dictionary={{
          id: 'd1',
          name: 'D',
          entries: [loreEntry({ keys: ['alpha'] })],
          createdAt: 0,
          updatedAt: 0,
        }}
        onSave={onSave}
        onRemove={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const add = screen.getByRole('button', { name: '追加' });
    // ボタンは一覧の中（最後の行）にある
    expect(add.closest('ul')).not.toBeNull();
    fireEvent.click(add);

    const triggers = screen.getAllByRole('textbox', { name: 'トリガーワード' });
    expect(triggers.map((input) => (input as HTMLInputElement).value)).toEqual(['alpha', '']);
    expect(screen.getAllByRole('textbox', { name: '追加内容' })).toHaveLength(1);

    const row = triggers[0]?.closest('li');
    const probability = row?.querySelector('[aria-label="発動率"]');
    const placement = row?.querySelector('[aria-label="追加先"]');
    expect(probability?.nextElementSibling).toBe(placement);
  });
});

describe('トリガー検索範囲', () => {
  it('既定は 2。変えて OK を押すと、名前・項目と一緒に書く', () => {
    const onSave = vi.fn();
    render(
      <DictionaryDialog
        dictionary={{ id: 'd1', name: 'D', entries: [], createdAt: 0, updatedAt: 0 }}
        onSave={onSave}
        onRemove={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const depth = screen.getByRole('spinbutton', { name: 'トリガー検索範囲' });
    expect((depth as HTMLInputElement).value).toBe('2');
    expect(depth.parentElement?.parentElement?.textContent).toBe(
      'トリガー検索範囲履歴件まで（および最新のユーザー入力も含む）',
    );
    fireEvent.change(depth, { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(onSave).toHaveBeenCalledWith({ name: 'D', entries: [], scanDepth: 5 });
  });
});
describe('予約の名前', () => {
  const dialog = (name: string, onSave = vi.fn()) =>
    render(
      <DictionaryDialog
        dictionary={{ id: 'd1', name, entries: [], createdAt: 0, updatedAt: 0 }}
        onSave={onSave}
        onRemove={vi.fn()}
        onClose={vi.fn()}
      />,
    );

  it('## で始まる名前は付けられず、わけを出して元の名前で保存する', () => {
    const onSave = vi.fn();
    dialog('D', onSave);
    const name = screen.getByRole('textbox', { name: '名前' });
    fireEvent.change(name, { target: { value: '##mine' } });
    expect(screen.getByRole('alert').textContent).toContain('##');
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(onSave).toHaveBeenCalledWith({ name: 'D', entries: [], scanDepth: 2 });
  });

  it('##playbook の段は、保存するとトリガーワードを題の 【題】 に合わせ直す', () => {
    const onSave = vi.fn();
    const entries = [loreEntry({ keys: ['outline'], constant: true, comment: 'One' })];
    render(
      <DictionaryDialog
        dictionary={{ id: 'd1', name: '##playbook', entries, createdAt: 0, updatedAt: 0 }}
        onSave={onSave}
        onRemove={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    const trigger = screen.getByRole('textbox', { name: 'トリガーワード' });
    fireEvent.change(trigger, { target: { value: '*, x' } });
    fireEvent.blur(trigger);
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ entries: [expect.objectContaining({ keys: ['【One】'] })] }),
    );
  });

  it('予約の辞書（##playbook）は名前を変えられない', () => {
    dialog('##playbook');
    expect(screen.getByRole('textbox', { name: '名前' }).hasAttribute('readonly')).toBe(true);
  });
});
