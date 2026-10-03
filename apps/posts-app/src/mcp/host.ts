import { useCallback, useEffect } from 'react';
import { useApp, useHostContext } from '@apollo/client-ai-apps/react';
import type { App } from '@modelcontextprotocol/ext-apps';

type UiMessage = Parameters<App['sendMessage']>[0];

export class Blog {
  static postUrl(id: string): string | undefined {
    const origin = Blog.platformOrigin();
    return origin ? `${origin}/posts/${encodeURIComponent(id)}` : undefined;
  }

  private static platformOrigin(): string | undefined {
    try {
      const origin = window.top?.location.origin;
      return origin && /^https?:\/\//.test(origin) ? origin : undefined;
    } catch {
      return undefined;
    }
  }
}

export function useHostTheme(): void {
  const theme = useHostContext()?.theme;
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);
}

export function useConversation(): {
  tell: (text: string) => void;
  open: (url: string) => void;
} {
  const app = useApp();
  const tell = useCallback(
    (text: string) => {
      const message = {
        role: 'user',
        content: [{ type: 'text', text }],
        _meta: { copilotkit: { followUp: false } },
      } satisfies UiMessage & { _meta: Record<string, unknown> };
      void app.sendMessage(message).catch(() => undefined);
    },
    [app],
  );
  const open = useCallback(
    (url: string) => {
      void app.openLink({ url }).catch(() => undefined);
    },
    [app],
  );
  return { tell, open };
}
