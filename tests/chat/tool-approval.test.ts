import { describe, expect, it } from 'vitest';

import { runsWithoutConfirm, type ToolApprovalInput } from '@/chat/tool-approval';

// ─────────────────────────────
// 承諾の関門で確認を省いてよいかの判断。既定は確認を待ち、すべてを満たすときだけ省く
// ─────────────────────────────

const ALL: ToolApprovalInput = {
  kind: 'workflow',
  skipConfirm: true,
  fresh: true,
  connected: true,
};

describe('runsWithoutConfirm', () => {
  it('設定・この画面で受け取った・接続がすべて揃えば、確認を省く', () => {
    expect(runsWithoutConfirm(ALL)).toBe(true);
  });

  it.each([
    ['設定が切', { skipConfirm: false }],
    ['読み込み直した呼び出し', { fresh: false }],
    ['接続していない', { connected: false }],
  ])('%s なら確認を待つ', (_label, patch) => {
    expect(runsWithoutConfirm({ ...ALL, ...patch })).toBe(false);
  });
});
