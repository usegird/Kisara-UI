import { buildNodeDefinitions } from '@/graph/node-definition';
import { openWorkflow, serializeWorkflow } from '@/store/persist/workflow-file';
import { useDefinitionsStore } from '@/store/use-definitions-store';
import { useGraphStore } from '@/store/use-graph-store';

const DIR = '/.dev-data/';
const DEFINITIONS_FILE = 'object-info';

const files = import.meta.glob<string>('/.dev-data/*.json', { query: '?raw', import: 'default' });

function nameOf(path: string): string {
  return path.slice(DIR.length, -'.json'.length);
}

async function readJson(name: string): Promise<unknown> {
  const read = files[`${DIR}${name}.json`];
  if (!read) {
    throw new Error(`${DIR}${name}.json がありません（kisaraDev.list() で名前を確かめる）`);
  }
  return JSON.parse(await read()) as unknown;
}

async function ensureDefinitions(): Promise<void> {
  if (useDefinitionsStore.getState().status === 'ready') return;
  const definitions = buildNodeDefinitions(await readJson(DEFINITIONS_FILE), {
    dropOptions: false,
  });
  useDefinitionsStore.setState({
    status: 'ready',
    source: 'cache',
    definitions,
    fetchedAt: Date.now(),
    frequency: [],
    error: null,
  });
}

interface DevDataConsole {
  readonly list: () => string[];
  readonly open: (name: string) => Promise<void>;
  readonly workflow: () => string | null;
}

export function installDevData(): void {
  const api: DevDataConsole = {
    list: () =>
      Object.keys(files)
        .map(nameOf)
        .filter((name) => name !== DEFINITIONS_FILE)
        .sort(),
    open: async (name) => {
      await ensureDefinitions();
      openWorkflow(await readJson(name), name);
    },
    workflow: () => {
      const workflow = useGraphStore.getState().workflow;
      return workflow ? serializeWorkflow(workflow) : null;
    },
  };
  Object.assign(globalThis, { kisaraDev: api });
}
