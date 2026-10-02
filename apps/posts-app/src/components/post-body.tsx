import { Badge } from '@nestposts/ui/components/ui/badge';
import { Separator } from '@nestposts/ui/components/ui/separator';

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
      <div className="whitespace-pre-wrap text-sm leading-relaxed">
        {content.trim() || 'Nothing written yet.'}
      </div>
    </article>
  );
}
