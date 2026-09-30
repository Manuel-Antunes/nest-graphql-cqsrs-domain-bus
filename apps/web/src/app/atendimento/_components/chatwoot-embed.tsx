'use client';

import { useRef, useState } from 'react';
import { Spinner } from '@nestposts/ui/components/ui/spinner';

import { Chatwoot } from '@/lib/chatwoot';

import { useChatwootNavigation } from '../_hooks/use-chatwoot-navigation';
import { useChatwootTheme } from '../_hooks/use-chatwoot-theme';
import { useChatwootTools } from '../_hooks/use-chatwoot-tools';

export function ChatwootEmbed({ url, path }: { url: string; path: string }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [loading, setLoading] = useState(true);
  const [source] = useState(() => Chatwoot.frameUrlOf(url, path));
  const origin = Chatwoot.originOf(url);

  useChatwootNavigation(frame, origin, path);
  useChatwootTheme(frame, origin);
  useChatwootTools(frame, origin);

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden rounded-lg border bg-background">
      {loading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background">
          <Spinner className="size-10 text-primary" />
        </div>
      )}
      <iframe
        ref={frame}
        src={source}
        className="w-full flex-1 border-0"
        allow="camera; microphone; clipboard-read; clipboard-write; geolocation; tools"
        title="Chatwoot"
        onLoad={() => setLoading(false)}
      />
    </div>
  );
}
