// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import { accumulateWheel, insideOwnZoom, OWN_ZOOM_MARK, zoomKey } from '@/lib/zoom-input';

function key(code: string, mods: Partial<KeyboardEventInit> = {}): KeyboardEvent {
  return new KeyboardEvent('keydown', { code, ...mods });
}

describe('zoomKey', () => {
  it('Alt＋＋ で広げ、Alt＋－ で縮め、Ctrl＋0 で戻す', () => {
    expect(zoomKey(key('Equal', { altKey: true }))).toBe(1);
    expect(zoomKey(key('Minus', { altKey: true }))).toBe(-1);
    expect(zoomKey(key('Digit0', { ctrlKey: true }))).toBe('reset');
  });

  it('Shift 付き・Ctrl＋＋（ブラウザの操作）は拾わない', () => {
    expect(zoomKey(key('Equal', { altKey: true, shiftKey: true }))).toBeNull();
    expect(zoomKey(key('Equal', { ctrlKey: true }))).toBeNull();
  });
});

describe('accumulateWheel', () => {
  it('一定量に満たなければ貯め、達したら上へ回した向きを広げる向きで返す', () => {
    const first = accumulateWheel(null, 'a', -30);
    expect(first.direction).toBe(0);
    const second = accumulateWheel(first.held, 'a', -30);
    expect(second).toEqual({ direction: 1, held: null });
  });

  it('対象が替わったら貯めを捨てる', () => {
    const held = accumulateWheel(null, 'a', -30).held;
    expect(accumulateWheel(held, 'b', -30).direction).toBe(0);
  });
});

describe('insideOwnZoom', () => {
  it('自分で倍率を持つ所の中かを見る', () => {
    const frame = document.createElement('div');
    frame.setAttribute(OWN_ZOOM_MARK, '');
    const inner = document.createElement('span');
    frame.append(inner);
    expect(insideOwnZoom(inner)).toBe(true);
    expect(insideOwnZoom(document.createElement('span'))).toBe(false);
  });
});
