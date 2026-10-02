import {
  Marker,
  MarkerContent,
  MarkerIcon,
} from '@nestposts/ui/components/ui/marker';
import { Spinner } from '@nestposts/ui/components/ui/spinner';
import { GlobeIcon } from 'lucide-react';

import type { WebSource } from './theo-transcript';

export function WebSearchLine({
  query,
  sources,
}: {
  query: string;
  sources?: WebSource[];
}) {
  return (
    <section
      aria-label={`Web search for ${query}`}
      className="w-full space-y-1"
    >
      <Marker>
        <MarkerIcon>{sources ? <GlobeIcon /> : <Spinner />}</MarkerIcon>
        <MarkerContent>
          Theo searched the web for “{query}”
          {sources && sources.length === 0 ? ', and found nothing' : ''}
        </MarkerContent>
      </Marker>
      {sources?.length ? (
        <ul aria-label="Sources" className="ms-7 space-y-0.5 text-xs">
          {sources.map((source) => (
            <li key={source.url}>
              <a
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground underline underline-offset-2 hover:text-foreground"
              >
                {source.title}
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
