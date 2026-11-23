import { cva } from 'class-variance-authority';
import { Fragment } from 'react';

import type { ValuePart } from '@/graph/widgets';

const valuePart = cva('', { variants: { bypassed: { true: 'line-through', false: '' } } });

export interface ValueTextProps {
  readonly values: readonly ValuePart[];
  readonly className?: string | undefined;
}

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
