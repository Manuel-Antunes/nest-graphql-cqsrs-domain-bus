'use client';

import type { RefObject } from 'react';
import { useEffect, useRef } from 'react';

import { Chatwoot } from '@/lib/chatwoot';

export function useChatwootNavigation(
  frame: RefObject<HTMLIFrameElement | null>,
  origin: string,
  path: string,
) {
  const framedPath = useRef(path);

  useEffect(() => {
    if (!path || path === framedPath.current) return;
    frame.current?.contentWindow?.postMessage(
      { type: 'NAVIGATE_CHATWOOT', path },
      origin,
    );
    framedPath.current = path;
  }, [frame, origin, path]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (
        event.origin !== origin ||
        event.data?.type !== 'CHATWOOT_URL_CHANGE' ||
        typeof event.data.path !== 'string'
      ) {
        return;
      }
      const reported: string = event.data.path;
      framedPath.current = reported.startsWith('/') ? reported : `/${reported}`;
      const supportPath = Chatwoot.supportPathOf(framedPath.current);
      if (supportPath !== window.location.pathname) {
        window.history.replaceState(null, '', supportPath);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [origin]);
}
