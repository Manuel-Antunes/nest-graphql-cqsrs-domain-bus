'use client';

import { useState } from 'react';
import type { ActivityMessage } from '@ag-ui/client';
import {
  CopilotChatConfigurationProvider,
  CopilotKitProvider,
  UseAgentUpdate,
  useAgent,
  useCopilotKit,
  useRenderActivityMessage,
} from '@copilotkit/react-core/v2';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@nestposts/ui/components/ui/alert';
import { Bubble, BubbleContent } from '@nestposts/ui/components/ui/bubble';
import { ChatComposer } from '@nestposts/ui/components/ui/chat-composer';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@nestposts/ui/components/ui/empty';
import { Markdown } from '@nestposts/ui/components/ui/markdown';
import {
  Marker,
  MarkerContent,
  MarkerIcon,
} from '@nestposts/ui/components/ui/marker';
import {
  Message,
  MessageContent,
  MessageHeader,
} from '@nestposts/ui/components/ui/message';
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from '@nestposts/ui/components/ui/message-scroller';
import { Spinner } from '@nestposts/ui/components/ui/spinner';
import { BotIcon, WrenchIcon } from 'lucide-react';

import { theoCatalog } from '../_a2ui/catalog';
import { DelegationCard } from './delegation-card';
import { THEO_AGENT_ID } from './theo-agent-id';
import { TheoTranscript, type TranscriptEntry } from './theo-transcript';
import { WebSearchLine } from './web-search-line';

export function TheoChat() {
  return (
    <CopilotKitProvider
      runtimeUrl="/api/copilotkit"
      enableInspector={false}
      a2ui={{ catalog: theoCatalog }}
    >
      <CopilotChatConfigurationProvider agentId={THEO_AGENT_ID}>
        <TheoConversation />
      </CopilotChatConfigurationProvider>
    </CopilotKitProvider>
  );
}

function TheoConversation() {
  const { agent, isReady } = useAgent({
    agentId: THEO_AGENT_ID,
    updates: [
      UseAgentUpdate.OnMessagesChanged,
      UseAgentUpdate.OnRunStatusChanged,
    ],
  });
  const { copilotkit } = useCopilotKit();
  const [failure, setFailure] = useState<string>();
  const entries = TheoTranscript.of(agent.messages);

  const send = async (text: string) => {
    setFailure(undefined);
    agent.addMessage({ id: crypto.randomUUID(), role: 'user', content: text });
    try {
      await copilotkit.runAgent({ agent });
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <div className="flex h-[70vh] min-h-96 flex-col gap-3 rounded-xl border bg-card p-3">
      <MessageScrollerProvider>
        <MessageScroller>
          <MessageScrollerViewport>
            <MessageScrollerContent
              role="log"
              aria-label="Conversation with Theo"
              className="p-2"
            >
              {entries.length === 0 ? (
                <Empty>
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <BotIcon />
                    </EmptyMedia>
                    <EmptyTitle>Talk to Theo</EmptyTitle>
                    <EmptyDescription>
                      Ask about your posts — Theo hands it to the posts agent,
                      acting as you.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                entries.map((entry) => (
                  <MessageScrollerItem key={entry.id}>
                    <TranscriptLine entry={entry} />
                  </MessageScrollerItem>
                ))
              )}
              {agent.isRunning ? (
                <Marker aria-live="polite">
                  <MarkerIcon>
                    <Spinner />
                  </MarkerIcon>
                  <MarkerContent>Theo is working…</MarkerContent>
                </Marker>
              ) : null}
            </MessageScrollerContent>
          </MessageScrollerViewport>
          <MessageScrollerButton />
        </MessageScroller>
      </MessageScrollerProvider>
      {failure ? (
        <Alert variant="destructive">
          <AlertTitle>Theo could not answer</AlertTitle>
          <AlertDescription>{failure}</AlertDescription>
        </Alert>
      ) : null}
      <ChatComposer
        onSend={(text) => void send(text)}
        placeholder="Ask Theo about your posts…"
        label="Message to Theo"
        disabled={!isReady}
        isStreaming={agent.isRunning}
        onStop={() => copilotkit.stopAgent({ agent })}
      />
    </div>
  );
}

function TranscriptLine({ entry }: { entry: TranscriptEntry }) {
  switch (entry.kind) {
    case 'user':
      return (
        <Message align="end">
          <MessageContent>
            <Bubble align="end">
              <BubbleContent className="whitespace-pre-wrap">
                {entry.text}
              </BubbleContent>
            </Bubble>
          </MessageContent>
        </Message>
      );
    case 'theo':
      return (
        <Message>
          <MessageContent>
            <MessageHeader>Theo</MessageHeader>
            <Bubble variant="secondary">
              <BubbleContent>
                <Markdown>{entry.text}</Markdown>
              </BubbleContent>
            </Bubble>
          </MessageContent>
        </Message>
      );
    case 'delegation':
      return <DelegationCard {...entry} />;
    case 'activity':
      return <ActivityLine message={entry.message} />;
    case 'search':
      return <WebSearchLine query={entry.query} sources={entry.sources} />;
    case 'tool':
      return (
        <Marker>
          <MarkerIcon>
            <WrenchIcon />
          </MarkerIcon>
          <MarkerContent>
            Theo used {entry.name}
            {entry.result === undefined ? '…' : ''}
          </MarkerContent>
        </Marker>
      );
  }
}

function ActivityLine({ message }: { message: ActivityMessage }) {
  const { renderActivityMessage } = useRenderActivityMessage();
  return <div className="w-full">{renderActivityMessage(message)}</div>;
}
