import { cva } from 'class-variance-authority';
import { Loader2, Music } from 'lucide-react';
import { useState } from 'react';

import type { WorkflowTemplate } from '@/graph/template-filter';
import { comfyPort } from '@/store/ports/comfy-port';

const thumbnail = cva('size-full object-cover', {
  variants: { ready: { true: '', false: 'opacity-0' } },
});

export function TemplateCard({
  template,
  baseUrl,
  onSelect,
}: {
  readonly template: WorkflowTemplate;
  readonly baseUrl: string;
  readonly onSelect: (template: WorkflowTemplate) => void;
}): React.ReactElement {
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const src = comfyPort().workflows.templateThumbnailSrc(baseUrl, template);

  return (
    <button
      type="button"
      className="hover:bg-accent flex h-64 flex-col overflow-hidden rounded-md border text-left"
      title={template.description || template.title}
      onClick={() => onSelect(template)}
    >
      <span className="bg-muted relative flex h-40 w-full shrink-0 items-center justify-center">
        {src === null || state === 'failed' ? (
          template.mediaType === 'audio' ? (
            <Music className="text-muted-foreground/60 size-8" aria-hidden />
          ) : (
            <span className="text-muted-foreground px-2 text-center text-xs">{template.title}</span>
          )
        ) : (
          <>
            <img
              src={src}
              alt=""
              loading="lazy"
              decoding="async"
              className={thumbnail({ ready: state === 'ready' })}
              onLoad={() => setState('ready')}
              onError={() => setState('failed')}
            />
            {state === 'ready' ? null : (
              <Loader2
                className="text-muted-foreground absolute size-5 motion-safe:animate-spin"
                aria-hidden
              />
            )}
          </>
        )}
      </span>
      <span className="w-full truncate px-2 pt-1.5 text-sm font-medium">{template.title}</span>
      <span className="text-muted-foreground line-clamp-3 px-2 pt-0.5 text-2xs">
        {template.description}
      </span>
    </button>
  );
}
