import { describe, expect, it } from 'vitest';

import { llmTargetOf } from '@/store/chat/llm-target';

import { profile } from '../helpers/llm';

// ─────────────────────────────
// 会話で使う接続の設定・モデル・生成の設定（全体で 1 つ）。選んだものが無いときの代わり
// ─────────────────────────────

describe('使う接続の設定とモデル', () => {
  const profiles = [profile({ id: 'a', defaultModel: 'ma' }), profile({ id: 'b' })];

  it('選んだ設定が一覧に無ければ未接続、モデルが空ならその既定', () => {
    expect(llmTargetOf('gone', 'x', profiles)).toEqual({ profileId: null, model: 'x' });
    expect(llmTargetOf('a', '', profiles)).toEqual({ profileId: 'a', model: 'ma' });
    expect(llmTargetOf('b', 'x', profiles)).toEqual({ profileId: 'b', model: 'x' });
    expect(llmTargetOf(null, '', [])).toEqual({ profileId: null, model: '' });
  });
});
