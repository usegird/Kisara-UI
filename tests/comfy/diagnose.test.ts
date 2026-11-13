import { describe, expect, it } from 'vitest';

import { ComfyRequestError } from '@/comfy/client';
import { diagnoseFailure, refineWithReachability, type PageContext } from '@/comfy/diagnose';
import { isPrivateHost } from '@/lib/remote-host';

const HOSTED: PageContext = { protocol: 'https:', hostname: 'kisara.example', online: true };
const LOCAL_PAGE: PageContext = { protocol: 'http:', hostname: 'localhost', online: true };

function unreachable(url: string): ComfyRequestError {
  return new ComfyRequestError('unreachable', url);
}

describe('接続失敗の原因推定', () => {
  it('プライベートホストを判定する', () => {
    for (const host of ['localhost', '127.0.0.1', '192.168.1.5', '10.0.0.1', '172.16.0.1']) {
      expect(isPrivateHost(host), host).toBe(true);
    }
    for (const host of ['comfy.example', '8.8.8.8', '172.32.0.1']) {
      expect(isPrivateHost(host), host).toBe(false);
    }
  });

  it('LAN の機器名・予約の末尾は私的、fc・fd で始まる公開の名前は私的でない', () => {
    const lan = diagnoseFailure(unreachable('https://mypc:8188/object_info'), HOSTED);
    expect(lan.code).toBe('local-network');
    const reserved = diagnoseFailure(unreachable('https://comfy.home.arpa/object_info'), HOSTED);
    expect(reserved.code).toBe('local-network');
    const publicName = diagnoseFailure(unreachable('https://fc2.example/object_info'), HOSTED);
    expect(publicName.code).not.toBe('local-network');
  });

  it('https ページから http の接続先は mixed content', () => {
    const diagnosis = diagnoseFailure(unreachable('http://192.168.1.5:8188/object_info'), HOSTED);
    expect(diagnosis.code).toBe('mixed-content');
  });

  it('公開オリジンからプライベート IP は Local Network Access', () => {
    const diagnosis = diagnoseFailure(unreachable('https://192.168.1.5:8188/object_info'), HOSTED);
    expect(diagnosis.code).toBe('local-network');
  });

  it('ローカルページからローカル接続先の失敗は CORS か未起動', () => {
    const diagnosis = diagnoseFailure(unreachable('http://127.0.0.1:8188/object_info'), LOCAL_PAGE);
    expect(diagnosis.code).toBe('cors-or-down');
  });

  it('オフラインは他の推定より優先する', () => {
    const diagnosis = diagnoseFailure(unreachable('http://127.0.0.1:8188/object_info'), {
      ...HOSTED,
      online: false,
    });
    expect(diagnosis.code).toBe('offline');
  });

  it('HTTP エラーや壊れた応答は接続経路の問題と区別する', () => {
    const url = 'http://127.0.0.1:8188/object_info';
    const http = new ComfyRequestError('http', url, { status: 500 });
    const parse = new ComfyRequestError('parse', url);
    const timeout = new ComfyRequestError('timeout', url, { params: { ms: 1 } });

    const httpDiagnosis = diagnoseFailure(http, LOCAL_PAGE);
    expect(httpDiagnosis.code).toBe('http-error');
    expect(httpDiagnosis.status).toBe(500);
    expect(diagnoseFailure(parse, LOCAL_PAGE).code).toBe('bad-response');
    expect(diagnoseFailure(timeout, LOCAL_PAGE).code).toBe('timeout');
  });

  describe('到達確認で CORS か未起動かを確定する', () => {
    const guess = diagnoseFailure(unreachable('http://127.0.0.1:8188/features'), LOCAL_PAGE);

    it('届いていれば CORS 拒否', () => {
      expect(refineWithReachability(guess, 'reachable').code).toBe('cors');
    });

    it('届かなければ未起動', () => {
      expect(refineWithReachability(guess, 'unreachable').code).toBe('down');
    });

    it('決着しなければ推定のまま', () => {
      expect(refineWithReachability(guess, 'unknown').code).toBe('cors-or-down');
    });

    it('他の原因には触らない', () => {
      const lna = diagnoseFailure(unreachable('https://192.168.1.5:8188/features'), HOSTED);
      expect(refineWithReachability(lna, 'reachable').code).toBe('local-network');
    });
  });
});
