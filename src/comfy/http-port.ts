import {
  fetchChatFile,
  isStorageFull,
  listChatMetas,
  removeChatFiles,
  saveChatFiles,
} from '@/comfy/chats';
import { ComfyRequestError } from '@/comfy/client';
import { currentPageContext, diagnoseFailure, refineWithReachability } from '@/comfy/diagnose';
import { viewUrl, websocketUrl } from '@/comfy/endpoints';
import { fetchFeatures, fetchSystemStats, probeReachability } from '@/comfy/health';
import { inputImageSrc, uploadInputImage, uploadTempImage } from '@/comfy/input-images';
import {
  fetchLibraryImage,
  listLibraryItems,
  removeLibraryItem,
  saveLibraryItem,
} from '@/comfy/library-backup';
import {
  fetchManagerVersion,
  fetchNodePackMappings,
  installNodePack,
  rebootComfy,
} from '@/comfy/manager';
import {
  fetchModelFiles,
  fetchModelJson,
  fetchModelMetadata,
  fetchModelNotes,
  hasModelNotesRoute,
  modelPreviewSrc,
} from '@/comfy/models';
import { fetchNodeFrequency } from '@/comfy/node-frequency';
import {
  fetchJsonEdits,
  fetchSavedNotes,
  listSavedNotes,
  saveJsonEdits,
  saveNotes,
} from '@/comfy/notes';
import { fetchNodeDefinition, fetchNodeDefinitions } from '@/comfy/object-info';
import { parseOutputTexts } from '@/comfy/output-texts';
import { interruptRun, PromptRejectedError, submitPrompt } from '@/comfy/prompt';
import {
  deleteQueued,
  fetchHistory,
  fetchHistoryItem,
  fetchOutputImage,
  fetchPromptFromImage,
  fetchQueue,
  fetchWorkflowFromImage,
} from '@/comfy/queue';
import {
  fetchRunHistoryFile,
  listRunHistoryFiles,
  parseHistoryRuns,
  saveRunHistoryFile,
} from '@/comfy/run-history';
import { historyEntryNodes, parsePromptNodes, parseRunFailure } from '@/comfy/schema';
import { fetchSavedStyles, fetchStyleTable, saveStyle } from '@/comfy/styles';
import {
  fetchPysssssOverrides,
  fetchPysssssTags,
  fetchTagDictionaries,
  removeTagDictionary,
  savePysssssOverrides,
  saveTagDictionary,
} from '@/comfy/tags';
import { fetchTemplate, listTemplates, templateThumbnailSrc } from '@/comfy/templates';
import { listUserFiles, readUserFile, removeUserFile } from '@/comfy/user-files';
import { fetchWildcardEntries, fetchWildcards } from '@/comfy/wildcards';
import {
  fetchSavedWorkflow,
  listSavedWorkflows,
  saveWorkflow,
  WorkflowExistsError,
  WorkflowNotOwnedError,
} from '@/comfy/workflows';
import { connectComfySocket } from '@/comfy/ws';
import type { ComfyPort } from '@/port/comfy-port';
import type { RequestFailure } from '@/port/connection';

function failureOf(error: unknown): RequestFailure | null {
  if (!(error instanceof ComfyRequestError)) return null;
  const { kind, reasonCode, params, url, message, status } = error;
  const failure = { kind, reasonCode, params, url, message };
  return status === null ? failure : { ...failure, status };
}

export function createHttpPort(): ComfyPort {
  return {
    connection: connectionPort(),
    definitions: {
      fetchAll: (baseUrl, options) => fetchNodeDefinitions(baseUrl, options),
      fetchOne: (baseUrl, className, options) => fetchNodeDefinition(baseUrl, className, options),
      fetchFrequency: (baseUrl, options) => fetchNodeFrequency(baseUrl, options),
    },
    run: runPort(),
    events: {
      connect: ({ baseUrl, clientId, ...rest }) =>
        connectComfySocket({ url: websocketUrl(baseUrl, clientId), ...rest }),
    },
    queue: queuePort(),
    workflows: workflowsPort(),
    models: modelsPort(),
    inputImages: {
      upload: (baseUrl, file, options) => uploadInputImage(baseUrl, file, options),
      uploadTemp: (baseUrl, file, subfolder, options) =>
        uploadTempImage(baseUrl, file, subfolder, options),
      src: (baseUrl, value) => inputImageSrc(baseUrl, value),
    },
    assets: {
      fetchStyleTable: (baseUrl, options) => fetchStyleTable(baseUrl, options),
      fetchSavedStyles: (baseUrl, options) => fetchSavedStyles(baseUrl, options),
      saveStyle: (baseUrl, entry, options) => saveStyle(baseUrl, entry, options),
      fetchWildcards: (baseUrl, options) => fetchWildcards(baseUrl, options),
      fetchWildcardEntries: (baseUrl, name, options) =>
        fetchWildcardEntries(baseUrl, name, options),
    },
    tags: {
      fetchPysssss: (baseUrl, options) => fetchPysssssTags(baseUrl, options),
      fetchDictionaries: (baseUrl, options) => fetchTagDictionaries(baseUrl, options),
      fetchOverrides: (baseUrl, options) => fetchPysssssOverrides(baseUrl, options),
      saveDictionary: (baseUrl, dictionary, overwrite, options) =>
        saveTagDictionary(baseUrl, dictionary, overwrite, options),
      saveOverrides: (baseUrl, overrides, options) =>
        savePysssssOverrides(baseUrl, overrides, options),
      removeDictionary: (baseUrl, name, options) => removeTagDictionary(baseUrl, name, options),
    },
    runHistory: {
      list: (baseUrl, options) => listRunHistoryFiles(baseUrl, options),
      fetch: (baseUrl, name, options) => fetchRunHistoryFile(baseUrl, name, options),
      save: (baseUrl, name, file, options) => saveRunHistoryFile(baseUrl, name, file, options),
      sourcesOf: (raw) => parseHistoryRuns(raw),
    },
    chats: {
      listMetas: (baseUrl, options) => listChatMetas(baseUrl, options),
      fetchChat: (baseUrl, id, options) => fetchChatFile(baseUrl, id, options),
      saveChat: (baseUrl, files, options) => saveChatFiles(baseUrl, files, options),
      removeChat: (baseUrl, id, options) => removeChatFiles(baseUrl, id, options),
      isFull: (error) => isStorageFull(error),
    },
    library: {
      list: (baseUrl, kind, options) => listLibraryItems(baseUrl, kind, options),
      save: (baseUrl, item, options) => saveLibraryItem(baseUrl, item, options),
      fetchImage: (baseUrl, kind, id, options) => fetchLibraryImage(baseUrl, kind, id, options),
      remove: (baseUrl, kind, id, options) => removeLibraryItem(baseUrl, kind, id, options),
    },
    userFiles: {
      list: (baseUrl, kind, options) => listUserFiles(baseUrl, kind, options),
      read: (baseUrl, kind, path, options) => readUserFile(baseUrl, kind, path, options),
      remove: (baseUrl, kind, path, options) => removeUserFile(baseUrl, kind, path, options),
    },
    manager: {
      fetchVersion: (baseUrl, options) => fetchManagerVersion(baseUrl, options),
      fetchMappings: (baseUrl, options) => fetchNodePackMappings(baseUrl, options),
      install: (baseUrl, pack, options) => installNodePack(baseUrl, pack, options),
      reboot: (baseUrl, options) => rebootComfy(baseUrl, options),
    },
  };
}

function connectionPort(): ComfyPort['connection'] {
  return {
    check: async (baseUrl) => {
      await fetchFeatures(baseUrl);
    },
    diagnose: async (error, baseUrl) => {
      const failure = failureOf(error) ?? { kind: 'unreachable' as const, url: baseUrl };
      const guess = diagnoseFailure(failure, currentPageContext());
      return guess.code === 'cors-or-down'
        ? refineWithReachability(guess, await probeReachability(baseUrl))
        : guess;
    },
    failureOf,
    systemStats: (baseUrl, options) => fetchSystemStats(baseUrl, options),
  };
}

function runPort(): ComfyPort['run'] {
  return {
    submit: (baseUrl, params, options) => submitPrompt(baseUrl, params, options),
    interrupt: (baseUrl, promptId, options) => interruptRun(baseUrl, promptId, options),
    rejectionOf: (error) =>
      error instanceof PromptRejectedError
        ? {
            reasonCode: error.reasonCode,
            params: error.params,
            reason: error.reason,
            nodeErrors: error.nodeErrors,
          }
        : null,
  };
}

function queuePort(): ComfyPort['queue'] {
  return {
    fetchQueue: (baseUrl, options) => fetchQueue(baseUrl, options),
    deleteQueued: (baseUrl, promptId, options) => deleteQueued(baseUrl, promptId, options),
    fetchHistory: (baseUrl, maxItems, options) => fetchHistory(baseUrl, maxItems, options),
    fetchHistoryItem: (baseUrl, promptId, options) => fetchHistoryItem(baseUrl, promptId, options),
    fetchPromptFromImage: (baseUrl, file, options) => fetchPromptFromImage(baseUrl, file, options),
    fetchWorkflowFromImage: (baseUrl, file, options) =>
      fetchWorkflowFromImage(baseUrl, file, options),
    fetchOutputImage: (baseUrl, file, options) => fetchOutputImage(baseUrl, file, options),
    outputSrc: (baseUrl, file) =>
      viewUrl(baseUrl, { filename: file.filename, type: file.type, subfolder: file.subfolder }),
    entryNodesOf: (entry) => historyEntryNodes(entry),
    entryFailureOf: (entry) => parseRunFailure(entry),
    entryTextsOf: (entry) => parseOutputTexts(entry),
    promptNodesOf: (nodes) => parsePromptNodes(nodes),
  };
}

function workflowsPort(): ComfyPort['workflows'] {
  return {
    list: (baseUrl, options) => listSavedWorkflows(baseUrl, options),
    fetch: (baseUrl, path, options) => fetchSavedWorkflow(baseUrl, path, options),
    save: (baseUrl, path, content, options) => saveWorkflow(baseUrl, path, content, options),
    saveFailure: (error) => {
      if (error instanceof WorkflowExistsError) return error.owned ? 'exists' : 'exists-foreign';
      return error instanceof WorkflowNotOwnedError ? 'not-owned' : null;
    },
    listTemplates: (baseUrl, locale, options) => listTemplates(baseUrl, locale, options),
    fetchTemplate: (baseUrl, name, options) => fetchTemplate(baseUrl, name, options),
    templateThumbnailSrc: (baseUrl, template) => templateThumbnailSrc(baseUrl, template),
  };
}

function modelsPort(): ComfyPort['models'] {
  return {
    fetchFiles: (baseUrl, folder, options) => fetchModelFiles(baseUrl, folder, options),
    fetchMetadata: (baseUrl, folder, filename, options) =>
      fetchModelMetadata(baseUrl, folder, filename, options),
    listNotes: (baseUrl, options) => listSavedNotes(baseUrl, options),
    fetchNotes: (baseUrl, folder, filename, options) =>
      fetchSavedNotes(baseUrl, folder, filename, options),
    fetchPysssssNotes: (baseUrl, folder, filename, options) =>
      fetchModelNotes(baseUrl, folder, filename, options),
    hasNotesRoute: (baseUrl, options) => hasModelNotesRoute(baseUrl, options),
    fetchModelJson: (baseUrl, folder, filename, options) =>
      fetchModelJson(baseUrl, folder, filename, options),
    saveNotes: (baseUrl, note, options) => saveNotes(baseUrl, note, options),
    fetchJsonEdits: (baseUrl, folder, filename, options) =>
      fetchJsonEdits(baseUrl, folder, filename, options),
    saveJsonEdits: (baseUrl, file, options) => saveJsonEdits(baseUrl, file, options),
    previewSrc: (baseUrl, folder, file) => modelPreviewSrc(baseUrl, folder, file),
  };
}
