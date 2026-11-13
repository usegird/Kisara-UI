// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ChatConnectionPanel } from '@/components/llm/side-panel/ChatConnectionPanel';

// ─────────────────────────────
// 会話の右の列の設定のタブ
// ─────────────────────────────

afterEach(cleanup);

describe('パラメタのタブへ移した欄', () => {
  it('システムメッセージをまとめる・Web 検索を設定のタブに出さない', () => {
    render(<ChatConnectionPanel />);
    expect(screen.queryByRole('switch', { name: 'システムメッセージをまとめる' })).toBeNull();
    expect(screen.queryByText('Web 検索')).toBeNull();
  });
});

describe('ブラウザデータの管理', () => {
  it('見出し・ストレージの管理・スイッチとその説明を出し、戻すボタンは置かない', () => {
    render(<ChatConnectionPanel />);
    expect(screen.getByText('ブラウザデータの管理')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'ストレージの管理' })).toBeTruthy();
    expect(
      screen.getByText(
        'ComfyUI のユーザーフォルダ（kisara/）に会話内容やプリセットの写しを保存します。',
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/対策のため/)).toBeNull();
    // 説明はストレージの管理のボタンの下
    const hint = screen.getByText(/キャッシュクリアや自動整理で消失します/);
    const manage = screen.getByRole('button', { name: 'ストレージの管理' });
    expect(manage.compareDocumentPosition(hint) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const restores = screen
      .getAllByRole('button')
      .filter((button) => button.textContent?.startsWith('バックアップから') === true);
    expect(restores).toEqual([]);
  });
});
