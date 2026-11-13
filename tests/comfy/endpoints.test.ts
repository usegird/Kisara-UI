import { describe, expect, it } from 'vitest';

import {
  featuresUrl,
  historyItemUrl,
  interruptUrl,
  InvalidBaseUrlError,
  normalizeBaseUrl,
  objectInfoClassUrl,
  objectInfoUrl,
  promptUrl,
  viewUrl,
  websocketUrl,
} from '@/comfy/endpoints';

describe('エンドポイント URL', () => {
  it('プロトコル省略・末尾スラッシュ・余分なパスを正規化する', () => {
    expect(normalizeBaseUrl('127.0.0.1:8188')).toBe('http://127.0.0.1:8188');
    expect(normalizeBaseUrl('http://127.0.0.1:8188/')).toBe('http://127.0.0.1:8188');
    // パス接頭辞は残す（リバースプロキシ配下の配置に対応するため）
    expect(normalizeBaseUrl('  https://comfy.example/comfy/  ')).toBe(
      'https://comfy.example/comfy',
    );
    expect(objectInfoUrl('http://localhost:5173/comfy')).toBe(
      'http://localhost:5173/comfy/object_info',
    );
  });

  it('不正な接続先は理由付きで弾く', () => {
    expect(() => normalizeBaseUrl('')).toThrow(InvalidBaseUrlError);
    expect(() => normalizeBaseUrl('ftp://example.com')).toThrow(InvalidBaseUrlError);
    expect(() => normalizeBaseUrl('http://')).toThrow(InvalidBaseUrlError);
  });
  it('弾いた理由は符号で持ち、文言の表を読まない', () => {
    const reasonOf = (baseUrl: string): unknown => {
      try {
        normalizeBaseUrl(baseUrl);
        return null;
      } catch (error) {
        return error;
      }
    };
    expect(reasonOf('  ')).toMatchObject({ reasonCode: 'base-url-empty', params: {} });
    expect(reasonOf('ftp://example.com')).toMatchObject({
      reasonCode: 'base-url-scheme',
      params: { url: 'ftp://example.com' },
    });
    expect(reasonOf('http://')).toMatchObject({
      reasonCode: 'base-url-invalid',
      params: { url: 'http://' },
    });
  });

  it('使うエンドポイントを組み立てる', () => {
    const base = 'http://127.0.0.1:8188';

    expect(objectInfoUrl(base)).toBe(`${base}/object_info`);
    expect(promptUrl(base)).toBe(`${base}/prompt`);
    expect(historyItemUrl(base, 'abc-123')).toBe(`${base}/history/abc-123`);
  });

  it('クラス名やフォルダ名をエスケープする', () => {
    const base = 'http://127.0.0.1:8188';

    expect(objectInfoClassUrl(base, 'Image Edit/Node')).toBe(
      `${base}/object_info/Image%20Edit%2FNode`,
    );
  });

  it('WebSocket は http→ws / https→wss に読み替える', () => {
    expect(websocketUrl('http://127.0.0.1:8188', 'cid')).toBe(
      'ws://127.0.0.1:8188/ws?clientId=cid',
    );
    expect(websocketUrl('https://comfy.example', 'cid')).toBe(
      'wss://comfy.example/ws?clientId=cid',
    );
    // パス接頭辞のある配置（リバースプロキシ・開発時のプロキシ）でも /ws を足すだけにする
    expect(websocketUrl('http://localhost:5173/comfy', 'cid')).toBe(
      'ws://localhost:5173/comfy/ws?clientId=cid',
    );
  });
});

describe('DESIGN §9.3-L で追加したエンドポイント', () => {
  const base = 'http://127.0.0.1:8188';

  it('疎通確認は軽量な /features を使う', () => {
    expect(featuresUrl(base)).toBe(`${base}/features`);
  });

  it('/view はクエリを組み立てる', () => {
    expect(viewUrl(base, { filename: 'a b.png' })).toBe(`${base}/view?filename=a+b.png`);
    expect(viewUrl(base, { filename: 'x.png', type: 'output', subfolder: 'sub' })).toBe(
      `${base}/view?filename=x.png&type=output&subfolder=sub`,
    );
  });

  it('中断エンドポイント', () => {
    expect(interruptUrl(base)).toBe(`${base}/interrupt`);
  });
});
