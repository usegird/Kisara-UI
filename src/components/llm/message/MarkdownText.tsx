import Markdown, { type Components, type ExtraProps } from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';

import { splitMarkdownBlocks } from '@/chat/markdown-blocks';
import { CopyButton } from '@/components/ui/copy-button';
import { t } from '@/i18n';
import { isWebUrl } from '@/lib/web-url';

const PLUGINS = [remarkGfm, remarkBreaks];

const BLOCK_CLASS = `min-w-0 [&_:not(pre)>code]:bg-muted [&_:not(pre)>code]:rounded
  [&_:not(pre)>code]:px-1 [&_:not(pre)>code]:font-mono [&_:not(pre)>code]:text-[0.85em]`;

type HastElement = NonNullable<ExtraProps['node']>;
type HastNode = HastElement | HastElement['children'][number];

function nodeText(node: HastNode): string {
  if (node.type === 'text') return node.value;
  if (node.type === 'element') return node.children.map((child) => nodeText(child)).join('');
  return '';
}

const COMPONENTS: Components = {
  a: ({ href, children }) =>
    isWebUrl(href) ? (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary underline underline-offset-2"
      >
        {children}
      </a>
    ) : (
      <span>{children}</span>
    ),
  img: ({ src, alt }) => {
    const label = alt !== undefined && alt.length > 0 ? alt : (src ?? '');
    return isWebUrl(src) ? (
      <a
        href={src}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary underline underline-offset-2"
        title={t('llm.chat.imageLink')}
      >
        {label}
      </a>
    ) : (
      <span>{label}</span>
    );
  },
  pre: ({ node, children }) => (
    <div className="group/code relative my-2">
      <pre className="bg-muted overflow-x-auto rounded-md px-3 py-2 font-mono text-xs leading-relaxed">
        {children}
      </pre>
      <CopyButton
        text={node === undefined ? '' : nodeText(node).replace(/\n$/, '')}
        label={t('llm.chat.copyCode')}
        iconOnly
        frameless
        className="bg-muted absolute top-1 right-1 opacity-0 transition-opacity
          group-focus-within/code:opacity-100 group-hover/code:opacity-100"
      />
    </div>
  ),
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto">
      <table className="border-collapse text-xs">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border-border border px-2 py-1 text-left font-medium">{children}</th>
  ),
  td: ({ children }) => <td className="border-border border px-2 py-1">{children}</td>,
  p: ({ children }) => <p className="my-2 first:mt-0 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="my-2 list-disc pl-5">{children}</ul>,
  ol: ({ children, start }) => (
    <ol className="my-2 list-decimal pl-5" start={start}>
      {children}
    </ol>
  ),
  blockquote: ({ children }) => (
    <blockquote className="text-muted-foreground my-2 border-l-2 pl-3">{children}</blockquote>
  ),
  h1: ({ children }) => <h3 className="mt-3 mb-2 text-base font-semibold">{children}</h3>,
  h2: ({ children }) => <h3 className="mt-3 mb-2 text-base font-semibold">{children}</h3>,
  h3: ({ children }) => <h4 className="mt-3 mb-1 font-semibold">{children}</h4>,
  h4: ({ children }) => <h5 className="mt-2 mb-1 font-semibold">{children}</h5>,
  h5: ({ children }) => <h6 className="mt-2 mb-1 font-semibold">{children}</h6>,
  h6: ({ children }) => <h6 className="mt-2 mb-1 font-semibold">{children}</h6>,
  hr: () => <hr className="border-border my-3" />,
};

export interface MarkdownTextProps {
  readonly text: string;
}

export function MarkdownText({ text }: MarkdownTextProps): React.ReactElement {
  const blocks = splitMarkdownBlocks(text);
  return (
    <div className="flex flex-col gap-2">
      {blocks.map((block, index) => (
        <MarkdownBlock key={index} text={block} />
      ))}
    </div>
  );
}

function MarkdownBlock({ text }: { readonly text: string }): React.ReactElement {
  return (
    <div className={BLOCK_CLASS}>
      <Markdown remarkPlugins={PLUGINS} components={COMPONENTS}>
        {text}
      </Markdown>
    </div>
  );
}
