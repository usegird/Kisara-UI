import { CopyButton } from '@/components/ui/copy-button';
import { t } from '@/i18n';
import type { PromptNode, RunFailure } from '@/port/run';
import { forbiddenRunGuide } from '@/queue/connection-guide';
import type { NodeTiming } from '@/queue/execution-state';
import {
  failureTrace,
  formatRejection,
  formatTaskFailure,
  type NodeLabeler,
} from '@/queue/task-failure';
import type { RunNote, SubmitFailure } from '@/queue/task-log';

export interface TaskFailureProps {
  readonly failure: RunFailure;
  readonly nodes: ReadonlyMap<string, PromptNode>;
  readonly timings: readonly NodeTiming[];
  readonly label: NodeLabeler;
}

function Heading({ children }: { readonly children: React.ReactNode }): React.ReactElement {
  return <h4 className="text-muted-foreground mb-0.5 text-2xs font-semibold">{children}</h4>;
}

export function TaskFailure({
  failure,
  nodes,
  timings,
  label,
}: TaskFailureProps): React.ReactElement {
  const trace = failureTrace(failure, nodes, timings);
  const interrupted = failure.kind === 'interrupted';
  const stopped = label(failure.nodeId ?? '?', failure.nodeType);
  const stepLabel = (step: { nodeId: string; classType: string | null }): string =>
    label(step.nodeId, step.classType);

  return (
    <section
      className="border-destructive/40 bg-destructive/5 flex min-w-0 flex-col gap-2.5 rounded-md
        border p-3"
      aria-label={
        interrupted ? t('queue.failure.interruptedLabel') : t('queue.failure.failedLabel')
      }
    >
      <div className="flex items-baseline gap-2">
        <h3 className="text-destructive text-xs font-semibold">
          {interrupted ? t('queue.failure.interruptedNode') : t('queue.failure.stoppedNode')}
        </h3>
        <span className="min-w-0 truncate font-semibold">{stopped}</span>
        <CopyButton
          text={formatTaskFailure(failure, trace, label)}
          label={interrupted ? t('queue.failure.copyInterrupted') : t('queue.failure.copyError')}
          className="ml-auto"
        />
      </div>

      {interrupted ? null : (
        <div>
          <Heading>{t('queue.failure.exception')}</Heading>
          <p className="text-destructive font-mono text-2xs">
            {failure.exceptionType ?? t('queue.failure.unknownType')}
          </p>
          {failure.message === null ? null : (
            <p className="font-mono text-2xs whitespace-pre-wrap">{failure.message.trim()}</p>
          )}
        </div>
      )}

      <div>
        <Heading>
          {t('queue.failure.stepsHeading', {
            order: t(
              trace.orderedBy === 'observed'
                ? 'queue.failure.orderObserved'
                : 'queue.failure.orderDependency',
            ),
          })}
        </Heading>
        <ol className="flex flex-col gap-0.5">
          {trace.steps.map((step, index) => (
            <li key={step.nodeId} className="flex gap-1.5">
              <span className="text-muted-foreground w-6 shrink-0 text-right tabular-nums">
                {index + 1}
              </span>
              <span className="min-w-0 truncate">{stepLabel(step)}</span>
            </li>
          ))}
          <li className="text-destructive flex gap-1.5 font-semibold">
            <span className="w-6 shrink-0 text-right">×</span>
            <span className="min-w-0 truncate">
              {t('queue.failure.stoppedAs', {
                node: stopped,
                state: interrupted ? t('queue.failure.interrupted') : t('queue.failure.failed'),
              })}
            </span>
          </li>
        </ol>
        {trace.orderedBy === 'dependency' && trace.steps.length > 1 ? (
          <p className="text-muted-foreground mt-0.5 text-2xs">
            {t('queue.failure.dependencyNote')}
          </p>
        ) : null}
        {trace.cached.length === 0 ? null : (
          <p className="text-muted-foreground mt-1 text-2xs">
            {t('queue.failure.cached', {
              count: trace.cached.length,
              nodes: trace.cached.map(stepLabel).join(', '),
            })}
          </p>
        )}
        <p className="text-muted-foreground mt-0.5 text-2xs">
          {t('queue.failure.notRun', { count: trace.notRun })}
        </p>
      </div>

      {failure.inputs.length === 0 ? null : (
        <div>
          <Heading>{t('queue.failure.inputs')}</Heading>
          <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 font-mono text-2xs">
            {failure.inputs.map((input) => (
              <div key={input.name} className="contents">
                <dt className="text-muted-foreground">{input.name}</dt>
                <dd className="min-w-0 break-all whitespace-pre-wrap">{input.values.join(', ')}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {failure.traceback.length === 0 ? null : (
        <details>
          <summary className="text-muted-foreground cursor-pointer text-2xs font-semibold">
            {t('queue.failure.traceback', { count: failure.traceback.length })}
          </summary>
          <pre
            className="bg-muted/50 mt-1 max-h-80 overflow-auto rounded p-2 font-mono text-2xs
              whitespace-pre"
          >
            {failure.traceback.map((line) => line.trimEnd()).join('\n')}
          </pre>
        </details>
      )}
    </section>
  );
}

export function TaskRejection({
  rejection,
  label,
}: {
  readonly rejection: SubmitFailure;
  readonly label: NodeLabeler;
}): React.ReactElement {
  const guide =
    rejection.forbidden === true ? forbiddenRunGuide(globalThis.location?.origin ?? '') : null;

  return (
    <section
      className="border-destructive/40 bg-destructive/5 flex min-w-0 flex-col gap-2.5 rounded-md
        border p-3"
      aria-label={t('queue.failure.rejection.label')}
    >
      <div className="flex items-baseline gap-2">
        <h3 className="text-destructive text-xs font-semibold">
          {t('queue.failure.rejection.heading')}
        </h3>
        <CopyButton
          text={formatRejection(rejection, label)}
          label={t('queue.failure.rejection.copy')}
          className="ml-auto"
        />
      </div>
      <p className="font-mono text-2xs whitespace-pre-wrap">{rejection.reason}</p>
      {guide === null ? null : (
        <div className="text-2xs">
          <p>{guide.summary}</p>
          <ol className="list-decimal pl-5">
            {guide.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>
      )}

      {rejection.nodes.length === 0 ? null : (
        <ul className="flex flex-col gap-2">
          {rejection.nodes.map((node) => (
            <li key={node.nodeId}>
              <Heading>{label(node.nodeId, node.classType)}</Heading>
              <ul className="flex flex-col gap-0.5">
                {node.messages.map((message) => (
                  <li
                    key={message}
                    className="text-destructive font-mono text-2xs break-all whitespace-pre-wrap"
                  >
                    {message}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
      <p className="text-muted-foreground text-2xs">{t('queue.failure.rejection.notRun')}</p>
    </section>
  );
}

export function TaskNotes({
  notes,
  label,
}: {
  readonly notes: readonly RunNote[];
  readonly label: NodeLabeler;
}): React.ReactElement {
  return (
    <section className="min-w-0" aria-label={t('queue.failure.notes.label')}>
      <h3 className="text-muted-foreground mb-1 text-2xs font-semibold">
        {t('queue.failure.notes.heading')}
      </h3>
      <ul className="flex flex-col gap-1">
        {notes.map((note, index) => (
          <li key={`${note.nodeId}:${String(index)}`}>
            {note.nodeId.length === 0 ? null : (
              <span className="block">{label(note.nodeId, note.classType)}</span>
            )}
            <span className="text-muted-foreground">{note.message}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
