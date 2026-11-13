import { useCallback, useEffect, useRef } from 'react';

import { hostKeyOf, isRemoteHost } from '@/lib/remote-host';
import { trimBaseUrl } from '@/lib/url-history';
import { useComfyConnectDialogStore } from '@/store/use-comfy-connect-dialog-store';
import { useConnectionStore } from '@/store/use-connection-store';
import { useDefinitionsStore } from '@/store/use-definitions-store';
import { useExecutionStore } from '@/store/use-execution-store';
import { useModelFilesStore } from '@/store/use-model-files-store';
import { useModelNotesStore } from '@/store/use-model-notes-store';
import { useQueueStore } from '@/store/use-queue-store';
import { useRunHistoryStore } from '@/store/use-run-history-store';
import { useSettingsStore } from '@/store/use-settings-store';
import { useStylesStore } from '@/store/use-styles-store';
import { useTagsStore } from '@/store/use-tags-store';
import { useTaskLogStore } from '@/store/use-task-log-store';
import {
  comfyRemoteAgreed,
  isAccepted,
  termsAccepted,
  useTermsStore,
} from '@/store/use-terms-store';
import { useWildcardsStore } from '@/store/use-wildcards-store';

// ─────────────────────────────
// 接続の開始・つなぎ直しと、起動時の自動接続。ヘッダーと接続案内で同じ操作を共有する。
// `/object_info` は無条件に取り直さない（更新は手動だけ）。
// ─────────────────────────────

/** 接続し直すときに未接続にしておく長さ（ms） */
export const RECONNECT_PAUSE_MS = 1000;

/**
 * 接続ごとに取る一覧を未取得に戻す。つながると、初めての接続と同じ所から取りに行く。
 * 中身は残すので、取り直す間も画面は変わらない。
 */
function forgetConnectionLists(): void {
  useModelFilesStore.getState().invalidate();
  useStylesStore.getState().invalidate();
  useTagsStore.getState().invalidate();
  useWildcardsStore.getState().invalidate();
  useModelNotesStore.getState().invalidate();
}

/** 接続先ごとの記録を捨てる。別の ComfyUI へ替えたときだけ */
function forgetHostRecords(): void {
  useQueueStore.getState().clear();
  useTaskLogStore.getState().clear();
  useExecutionStore.getState().reset();
  useRunHistoryStore.getState().clear();
}

/** 接続の操作と、つながっているか・途中か */
interface ComfyConnection {
  /**
   * 接続先を渡すと、それを接続先にしてからつなぐ（接続先の欄の打ちかけの値）。
   * 省くと今の接続先でつなぎ直す。
   */
  readonly connect: (target?: string) => Promise<void>;
  readonly connected: boolean;
  readonly busy: boolean;
}

/**
 * 接続の操作だけ（自動接続は持たない）。接続を確かめ直すと通知も張り直される。
 * 起動時の自動接続を二重に走らせないよう、操作だけが要る部品はこちらを使う
 */
export function useComfyConnect(): ComfyConnection {
  const baseUrl = useSettingsStore((state) => state.baseUrl);

  const status = useConnectionStore((state) => state.status);
  const probe = useConnectionStore((state) => state.probe);

  const definitionsStatus = useDefinitionsStore((state) => state.status);
  const loadDefinitions = useDefinitionsStore((state) => state.load);

  const pausing = useConnectionStore((state) => state.pausing);

  // 起動時の自動接続（effect）の依存なので、compiler に任せず手で固定する
  const connect = useCallback(
    async (target?: string) => {
      const url = trimBaseUrl(target ?? baseUrl);
      if (url.length === 0 || !termsAccepted()) return;
      // 私的なアドレスの外は、外部の ComfyUI の注意に合意するまでつながず、ポップアップで待つ
      if (isRemoteHost(url) && !comfyRemoteAgreed()) {
        useComfyConnectDialogStore.getState().askRemote(url);
        return;
      }
      const connection = useConnectionStore.getState();
      if (connection.pausing) return;
      const again = connection.status === 'connected';
      // 別の ComfyUI へ替えるか。同じ相手の書き方の違い（スキーム・末尾の `/`・パス）は替えない
      const switching = hostKeyOf(url) !== hostKeyOf(useSettingsStore.getState().baseUrl);
      // つながっている所から押されたら、いったん未接続にして初めての接続と同じ手続きを通す
      if (again) connection.pause();
      if (again || switching) forgetConnectionLists();
      // 前の接続先のキュー・履歴・タスクの控え・実行の状況・実行の記録を捨てる（残すと前の接続先の
      // タスクが並び、その画像を今の接続先へ取りに行く）
      if (switching) forgetHostRecords();
      // 接続先を変えるのは未接続にしてから。つながったままの通知や取得を、確かめていない
      // 接続先へ向け直さない（不正な形なら組み立てで投げて画面ごと止まる）
      useSettingsStore.getState().setBaseUrl(url);
      if (again) {
        await new Promise((resolve) => setTimeout(resolve, RECONNECT_PAUSE_MS));
        useConnectionStore.getState().resume();
      }
      if (!(await probe(url))) return;
      // つながった接続先だけを履歴に残す
      useSettingsStore.getState().rememberBaseUrl(url);

      // 再接続で出していた接続のポップアップは、つながったら下ろす
      useComfyConnectDialogStore.getState().connected();
      await loadDefinitions(url);
    },
    [baseUrl, probe, loadDefinitions],
  );

  return {
    connect,
    connected: status === 'connected',
    busy: pausing || status === 'connecting' || definitionsStatus === 'loading',
  };
}

/** 接続の操作に加えて、起動時（または同意した時点）の自動接続を 1 回だけ試す */
export function useComfyConnection(): ComfyConnection {
  const baseUrl = useSettingsStore((state) => state.baseUrl);
  const connection = useComfyConnect();
  const { connect } = connection;

  // 起動時の自動接続は1回だけ。失敗しても繰り返さない（案内を出して手動に委ねる）。
  // 試すのは開いた時点で接続先が入っていたときだけ。後から打ち込んだ接続先では試さない
  // （打ちかけの URL へ勝手に繋ぎに行かない。接続は押して始める）
  // 同意するまでは試さない。同意を待っている間は画面を触れないので、接続先は開いた時点のまま
  const accepted = useTermsStore((state) => isAccepted(state.accepted));
  const tried = useRef(false);
  useEffect(() => {
    if (tried.current || !accepted) return;
    tried.current = true;
    if (baseUrl.length > 0) void connect();
    // 試した後でだけ、つないでいなければ接続のポップアップを自動で出す（probe はここで同期に
    // 「接続中」にするので、出してすぐ閉じることはない）
    useComfyConnectDialogStore.getState().markAutoTried();
  }, [accepted, baseUrl, connect]);

  return connection;
}
