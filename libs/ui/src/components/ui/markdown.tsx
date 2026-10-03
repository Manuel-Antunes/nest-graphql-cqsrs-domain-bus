'use client';

import type * as React from 'react';
import { cn } from 'cn';
import remarkBreaks from 'remark-breaks';
import { defaultRemarkPlugins, Streamdown } from 'streamdown';

const remarkPlugins = [...Object.values(defaultRemarkPlugins), remarkBreaks];

function Markdown({
  className,
  ...props
}: React.ComponentProps<typeof Streamdown>) {
  return (
    <Streamdown
      remarkPlugins={remarkPlugins}
      className={cn(
        'min-w-0 space-y-3 text-sm leading-relaxed [&_:is(h1,h2,h3,h4,h5,h6)]:mt-4 [&_h1]:text-xl [&_h2]:text-lg [&_h3]:text-base',
        className,
      )}
      {...props}
    />
  );
}

export type { ExtraProps } from 'streamdown';

export { Markdown };
