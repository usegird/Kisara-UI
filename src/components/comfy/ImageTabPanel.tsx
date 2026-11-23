import {
  ModelsSection,
  PromptsSection,
  Section,
  SettingsSection,
} from '@/components/comfy/queue/task-detail-sections';
import { t } from '@/i18n';
import { parseImageParameters } from '@/queue/image-parameters';
import type { TaskNodeRow, TaskPrompt } from '@/queue/task-detail';
import { useGraphStore } from '@/store/use-graph-store';
import { useImageTabsStore } from '@/store/use-image-tabs-store';

const PARAMETERS_KEY = 'parameters';

const sourceLabel = (): string => PARAMETERS_KEY;

interface ImageSummary {
  readonly models: readonly string[];
  readonly prompts: readonly TaskPrompt[];
  readonly rows: readonly TaskNodeRow[];
  readonly others: readonly (readonly [string, string])[];
}

function summarize(texts: readonly (readonly [string, string])[]): ImageSummary {
  const text = texts.find(([key]) => key === PARAMETERS_KEY)?.[1];
  const others = texts.filter(([key]) => key !== PARAMETERS_KEY);
  if (text === undefined) return { models: [], prompts: [], rows: [], others };

  const parsed = parseImageParameters(text);
  const prompt = (inputName: string, body: string, role: TaskPrompt['role']): TaskPrompt => ({
    nodeId: PARAMETERS_KEY,
    classType: '',
    inputName,
    text: body,
    role,
  });
  return {
    models: parsed.models,
    prompts: [
      prompt('prompt', parsed.positive, 'positive'),
      ...(parsed.negative === null ? [] : [prompt('negative prompt', parsed.negative, 'negative')]),
    ],
    rows:
      parsed.settings.length === 0
        ? []
        : [
            {
              nodeId: PARAMETERS_KEY,
              classType: null,
              order: null,
              durationMs: null,
              values: parsed.settings,
            },
          ],
    others,
  };
}

export interface ImageTabPanelProps {
  readonly tabId: string;
}

export function ImageTabPanel({ tabId }: ImageTabPanelProps): React.ReactElement {
  const content = useImageTabsStore((state) => state.images[tabId]);
  const name = useGraphStore((state) => state.name);
  const summary = summarize(content?.texts ?? []);

  if (!content) {
    return <p className="text-muted-foreground p-4 text-sm">{t('comfy.imageTab.notKept')}</p>;
  }

  return (
    <div
      className="flex h-full min-h-0 flex-col"
      role="region"
      aria-label={t('comfy.imageTab.region')}
    >
      <h2 className="truncate border-b px-4 py-2 text-sm font-medium" title={name}>
        {name}
      </h2>
      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col gap-3 overflow-y-auto p-4 text-xs">
          <ModelsSection models={summary.models} />
          <PromptsSection prompts={summary.prompts} label={sourceLabel} />
          <SettingsSection rows={summary.rows} timed={false} label={sourceLabel} />
          {summary.others.map(([key, text]) => (
            <Section key={key} title={key}>
              <p className="break-all whitespace-pre-wrap">{text}</p>
            </Section>
          ))}
        </div>
        <div className="bg-muted/30 w-1/2 shrink-0 overflow-y-auto border-l p-4">
          <img src={content.url} alt={name} className="w-full rounded border" />
        </div>
      </div>
    </div>
  );
}
