import Markdown, { type Components, type ExtraProps } from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';

import { splitMarkdownBlocks } from '@/chat/markdown-blocks';
import { CopyButton } from '@/components/ui/copy-button';
import { t } from '@/i18n';
import { isWebUrl } from '@/lib/web-url';

// ─────────────────────────────
// 会話の本文の Markdown。LLM の出力は信用しないデータとして描く。
// ─────────────────────────────

// 生の HTML は描かない（react-markdown は既定で文字のまま出すので、HTML を通すプラグインを足さない）
const PLUGINS = [remarkGfm, remarkBreaks];

/** 文中のコードだけに地の色を付ける（コードブロックの中の `code` は `pre` の地のまま） */
const BLOCK_CLASS = `min-w-0 [&_:not(pre)>code]:bg-muted [&_:not(pre)>code]:rounded
  [&_:not(pre)>code]:px-1 [&_:not(pre)>code]:font-mono [&_:not(pre)>code]:text-[0.85em]`;

type HastElement = NonNullable<ExtraProps['node']>;
type HastNode = HastElement | HastElement['children'][number];

/** 節の中の文字をつなげる（コードブロックの写し取り用） */
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
  // `img` を作らない（描いた時点で外へ送られるため）。代わりの文と URL をリンクにする
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

/** 会話の本文の Markdown の props */
export interface MarkdownTextProps {
  readonly text: string;
}

/**
 * 本文を塊ごとに描く。受け取り中に増えるのは最後の塊だけなので、確定した塊は描き直されない
 * （受け取り物が同じ塊は、React Compiler が前の描画を返す）
 */
export function MarkdownText({ text }: MarkdownTextProps): React.ReactElement {
  const blocks = splitMarkdownBlocks(text);
  return (
    <div className="flex flex-col gap-2">
      {blocks.map((block, index) => (
        // 塊は本文の頭からの位置で決まる（並べ替えない）。位置を鍵にして、確定した塊を作り直さない
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
