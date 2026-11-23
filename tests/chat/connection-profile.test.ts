import { describe, expect, it } from 'vitest';

import { profileForConnect, sameBaseUrl } from '@/chat/connection-profile';

import { profile } from '../helpers/llm';

const OPENROUTER = 'https://openrouter.ai/api/v1';

describe('sameBaseUrl', () => {
  it('前後の空白と末尾の / は問わない', () => {
    expect(sameBaseUrl(` ${OPENROUTER}/ `, OPENROUTER)).toBe(true);
    expect(sameBaseUrl('http://x/v1', 'http://y/v1')).toBe(false);
  });
});

describe('profileForConnect', () => {
  const cloud = profile({ id: 'cloud', baseUrl: `${OPENROUTER}/` });
  const blank = profile({ id: 'blank', baseUrl: '' });

  it('同じベース URL の設定に書く', () => {
    expect(profileForConnect([cloud], OPENROUTER, blank)?.id).toBe('cloud');
  });

  it('無ければ、URL を持たない選んでいる設定。それも無ければ新しく作る', () => {
    expect(profileForConnect([cloud], 'http://y/v1', blank)?.id).toBe('blank');
    expect(profileForConnect([cloud], 'http://y/v1', cloud)).toBeUndefined();
  });
});
