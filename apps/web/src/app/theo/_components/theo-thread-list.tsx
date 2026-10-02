'use client';

import { useCopilotChatConfiguration } from '@copilotkit/react-core/v2';
import { Button } from '@nestposts/ui/components/ui/button';
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from '@nestposts/ui/components/ui/item';
import { useSuspenseQuery } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { PlusIcon } from 'lucide-react';

import { theoChatsOptions } from '../query';

export function TheoThreadList() {
  const { data } = useSuspenseQuery(theoChatsOptions());
  const configuration = useCopilotChatConfiguration();
  const activeThreadId = configuration?.threadId;

  return (
    <nav
      aria-label="Conversations with Theo"
      className="flex max-h-64 min-h-0 flex-col gap-2 rounded-xl border bg-card p-2 md:max-h-none"
    >
      <Button variant="outline" onClick={() => configuration?.startNewThread()}>
        <PlusIcon />
        New conversation
      </Button>
      {data.chats.length === 0 ? (
        <p className="px-2 py-4 text-center text-muted-foreground text-sm">
          Your conversations with Theo will be listed here.
        </p>
      ) : (
        <ItemGroup className="min-h-0 gap-1 overflow-y-auto">
          {data.chats.map((thread) => (
            <Item
              key={thread.id}
              size="sm"
              render={<button type="button" />}
              aria-current={thread.id === activeThreadId ? 'true' : undefined}
              onClick={() => {
                if (thread.id !== activeThreadId) {
                  configuration?.setActiveThreadId(thread.id, {
                    explicit: true,
                  });
                }
              }}
              className="cursor-pointer text-left hover:bg-muted aria-[current=true]:bg-muted"
            >
              <ItemContent className="min-w-0">
                <ItemTitle className="line-clamp-1 w-full">
                  {thread.title ?? 'Untitled conversation'}
                </ItemTitle>
                <ItemDescription>
                  <time dateTime={thread.updatedAt} suppressHydrationWarning>
                    {formatDistanceToNow(new Date(thread.updatedAt), {
                      addSuffix: true,
                    })}
                  </time>
                </ItemDescription>
              </ItemContent>
            </Item>
          ))}
        </ItemGroup>
      )}
    </nav>
  );
}
