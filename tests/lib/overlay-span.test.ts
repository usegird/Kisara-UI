import { describe, expect, it } from 'vitest';

import { overlaySpan } from '@/lib/overlay-span';

describe('重ねる範囲の横幅', () => {
  it('アプリ入力の右から、見えている範囲の右端までを覆う', () => {
    expect(overlaySpan(256, { left: -9, right: 1000 })).toEqual({ left: 256, width: 744 });
  });

  it('横に送ってアプリ入力が隠れたら、見えている範囲の左端から覆う', () => {
    expect(overlaySpan(256, { left: 400, right: 1400 })).toEqual({ left: 400, width: 1000 });
  });

  it('アプリ入力が見えている範囲を占めきるときは幅 0、測れていなければ null', () => {
    expect(overlaySpan(1200, { left: 0, right: 1000 })?.width).toBe(0);
    expect(overlaySpan(256, undefined)).toBeNull();
  });
});
