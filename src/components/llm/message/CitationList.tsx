import { t } from '@/i18n';
import { isWebUrl } from '@/lib/web-url';
import type { Citation } from '@/port/llm-port';

function domainOf(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

export function CitationList({
  citations,
}: {
  readonly citations: readonly Citation[];
}): React.ReactElement {
  return (
    <section aria-label={t('llm.chat.citations')} className="text-muted-foreground px-1 text-xs">
      <h3 className="mb-0.5 font-medium">{t('llm.chat.citations')}</h3>
      <ol className="flex flex-col gap-0.5">
        {citations.map((citation, index) => {
          const domain = domainOf(citation.url);
          return (
            <li key={citation.url} className="flex min-w-0 gap-1">
              <span className="tabular-nums">[{index + 1}]</span>
              {isWebUrl(citation.url) ? (
                <a
                  href={citation.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-foreground min-w-0 truncate underline underline-offset-2"
                  title={citation.url}
                >
                  {citation.title.length > 0 ? citation.title : citation.url}
                </a>
              ) : (
                <span className="min-w-0 truncate" title={citation.url}>
                  {citation.title.length > 0 ? citation.title : citation.url}
                </span>
              )}
              {domain !== null && citation.title.length > 0 ? (
                <span className="shrink-0">{domain}</span>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
