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

export const RECONNECT_PAUSE_MS = 1000;

function forgetConnectionLists(): void {
  useModelFilesStore.getState().invalidate();
  useStylesStore.getState().invalidate();
  useTagsStore.getState().invalidate();
  useWildcardsStore.getState().invalidate();
  useModelNotesStore.getState().invalidate();
}

function forgetHostRecords(): void {
  useQueueStore.getState().clear();
  useTaskLogStore.getState().clear();
  useExecutionStore.getState().reset();
  useRunHistoryStore.getState().clear();
}

interface ComfyConnection {
  readonly connect: (target?: string) => Promise<void>;
  readonly connected: boolean;
  readonly busy: boolean;
}

export function useComfyConnect(): ComfyConnection {
  const baseUrl = useSettingsStore((state) => state.baseUrl);

  const status = useConnectionStore((state) => state.status);
  const probe = useConnectionStore((state) => state.probe);

  const definitionsStatus = useDefinitionsStore((state) => state.status);
  const loadDefinitions = useDefinitionsStore((state) => state.load);

  const pausing = useConnectionStore((state) => state.pausing);

  const connect = useCallback(
    async (target?: string) => {
      const url = trimBaseUrl(target ?? baseUrl);
      if (url.length === 0 || !termsAccepted()) return;
      if (isRemoteHost(url) && !comfyRemoteAgreed()) {
        useComfyConnectDialogStore.getState().askRemote(url);
        return;
      }
      const connection = useConnectionStore.getState();
      if (connection.pausing) return;
      const again = connection.status === 'connected';
      const switching = hostKeyOf(url) !== hostKeyOf(useSettingsStore.getState().baseUrl);
      if (again) connection.pause();
      if (again || switching) forgetConnectionLists();
      if (switching) forgetHostRecords();
      useSettingsStore.getState().setBaseUrl(url);
      if (again) {
        await new Promise((resolve) => setTimeout(resolve, RECONNECT_PAUSE_MS));
        useConnectionStore.getState().resume();
      }
      if (!(await probe(url))) return;
      useSettingsStore.getState().rememberBaseUrl(url);

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

export function useComfyConnection(): ComfyConnection {
  const baseUrl = useSettingsStore((state) => state.baseUrl);
  const connection = useComfyConnect();
  const { connect } = connection;

  const accepted = useTermsStore((state) => isAccepted(state.accepted));
  const tried = useRef(false);
  useEffect(() => {
    if (tried.current || !accepted) return;
    tried.current = true;
    if (baseUrl.length > 0) void connect();
    useComfyConnectDialogStore.getState().markAutoTried();
  }, [accepted, baseUrl, connect]);

  return connection;
}
