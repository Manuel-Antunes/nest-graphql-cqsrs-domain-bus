import type { ComponentProps } from 'react';
import { Badge } from '@nestposts/ui/components/ui/badge';
import {
  type ExtraProps,
  Markdown,
} from '@nestposts/ui/components/ui/markdown';
import { Separator } from '@nestposts/ui/components/ui/separator';

import { useConversation } from '@/mcp/host';

export interface PostBodyProps {
  title: string;
  content: string;
  author?: string;
  when?: string;
  tags?: readonly string[];
}

export function PostBody({
  title,
  content,
  author,
  when,
  tags,
}: PostBodyProps) {
  return (
    <article className="space-y-4">
      <header className="space-y-2">
        <h1 className="text-balance font-semibold text-xl tracking-tight">
          {title.trim() || 'Untitled'}
        </h1>
        {author || when ? (
          <p className="text-muted-foreground text-xs">
            {[author ? `by ${author}` : undefined, when]
              .filter(Boolean)
              .join(' · ')}
          </p>
        ) : null}
        {tags?.length ? (
          <ul className="flex flex-wrap gap-1.5" aria-label="Tags">
            {tags.map((tag) => (
              <li key={tag}>
                <Badge variant="secondary">{tag}</Badge>
              </li>
            ))}
          </ul>
        ) : null}
      </header>
      <Separator />
      <Markdown mode="static" controls={false} components={{ a: HostLink }}>
        {content.trim() || 'Nothing written yet.'}
      </Markdown>
    </article>
  );
}

function HostLink({ href, children }: ComponentProps<'a'> & ExtraProps) {
  const { open } = useConversation();
  return (
    <a
      href={href}
      className="wrap-anywhere font-medium text-primary underline"
      onClick={(event) => {
        event.preventDefault();
        if (href) open(href);
      }}
    >
      {children}
    </a>
  );
}
