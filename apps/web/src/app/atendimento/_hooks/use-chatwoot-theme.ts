'use client';

import type { RefObject } from 'react';
import { useEffect } from 'react';

const DARK = '(prefers-color-scheme: dark)';

export function useChatwootTheme(
  frame: RefObject<HTMLIFrameElement | null>,
  origin: string,
) {
  useEffect(() => {
    const scheme = window.matchMedia(DARK);
    const tell = () =>
      frame.current?.contentWindow?.postMessage(
        {
          type: 'CHATWOOT_SET_THEME',
          theme: scheme.matches ? 'dark' : 'light',
        },
        origin,
      );
    const onMessage = (event: MessageEvent) => {
      if (
        event.origin === origin &&
        event.data?.type === 'CHATWOOT_REQUEST_THEME'
      ) {
        tell();
      }
    };
    tell();
    scheme.addEventListener('change', tell);
    window.addEventListener('message', onMessage);
    return () => {
      scheme.removeEventListener('change', tell);
      window.removeEventListener('message', onMessage);
    };
  }, [frame, origin]);
}
