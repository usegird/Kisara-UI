import { describe, expect, it } from 'vitest';

import { isPrivateHost, isRemoteHost } from '@/lib/remote-host';

// ─────────────────────────────
// 接続前の注意に使う、宛先が私的なネットワークの外かの見分け。表を持たず範囲で決める
// ─────────────────────────────

describe('isPrivateHost', () => {
  it.each([
    'localhost',
    'LOCALHOST',
    'comfy.localhost',
    'gpu-box.local',
    'comfy.test',
    'nas.home.arpa',
    '127.0.0.1',
    '127.5.6.7',
    '10.0.0.8',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.20',
    '169.254.10.10',
    '100.64.0.1',
    '100.127.255.254',
    '0.0.0.0',
    '::1',
    '[::1]',
    'fd12:3456::1',
    'fe80::1',
    '::ffff:192.168.0.2',
    'comfy',
    'gpu-box',
  ])('%s は私的', (host) => {
    expect(isPrivateHost(host)).toBe(true);
  });

  it.each([
    'openrouter.ai',
    'example.com',
    'mylocalhost.com',
    '8.8.8.8',
    '172.32.0.1',
    '100.128.0.1',
    '2001:db8::1',
    '::ffff:8.8.8.8',
    '',
  ])('%s は外', (host) => {
    expect(isPrivateHost(host)).toBe(false);
  });
});

describe('isRemoteHost', () => {
  it('私的な宛先の URL は注意の対象にしない', () => {
    expect(isRemoteHost('http://127.0.0.1:8188')).toBe(false);
    expect(isRemoteHost(' http://localhost:11434/v1 ')).toBe(false);
    expect(isRemoteHost('http://[::1]:8188')).toBe(false);
    expect(isRemoteHost('http://192.168.0.5:8188')).toBe(false);
  });

  it('私的でない宛先の URL は注意の対象', () => {
    expect(isRemoteHost('https://openrouter.ai/api/v1')).toBe(true);
    expect(isRemoteHost('https://abc123-8188.proxy.runpod.net')).toBe(true);
    expect(isRemoteHost('https://api.together.xyz/v1')).toBe(true);
    expect(isRemoteHost('http://203.0.113.4:8188')).toBe(true);
  });

  it('スキームの無い URL も、送る側と同じく http として見分ける', () => {
    expect(isRemoteHost('openrouter.ai/api/v1')).toBe(true);
    expect(isRemoteHost('203.0.113.5:8188')).toBe(true);
    expect(isRemoteHost('comfy.example.com:8188')).toBe(true);
    expect(isRemoteHost('127.0.0.1:8188')).toBe(false);
    expect(isRemoteHost('localhost:11434/v1')).toBe(false);
  });

  it('読めない URL は対象にしない（つないでも失敗する）', () => {
    expect(isRemoteHost('')).toBe(false);
    expect(isRemoteHost('not a url')).toBe(false);
  });
});
