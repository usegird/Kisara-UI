import { cva } from 'class-variance-authority';
import { Fragment } from 'react';

import type { ValuePart } from '@/graph/widgets';

// ─────────────────────────────
// 値の並びの表示（変数ボックス・チップで共通）。省略は CSS（親の truncate）に任せ、データ側では切らない。
// ─────────────────────────────

const valuePart = cva('', { variants: { bypassed: { true: 'line-through', false: '' } } });

/** 値の並びの表示の受け取り物 */
export interface ValueTextProps {
  readonly values: readonly ValuePart[];
  readonly className?: string | undefined;
}

/**
 * 値をカンマ区切りで並べる。バイパス中のノードが持つ値は、実行では素通しされて使われないので
 * 取り消し線を引く
 */
export function ValueText({ values, className }: ValueTextProps): React.ReactElement {
  return (
    <span className={className}>
      {values.map((part, index) => (
        <Fragment key={`${index}:${part.text}`}>
          {index > 0 ? ', ' : ''}
          <span className={valuePart({ bypassed: part.bypassed })}>{part.text}</span>
        </Fragment>
      ))}
    </span>
  );
}
