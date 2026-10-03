import { ToolMessage } from '@langchain/core/messages';
import type {
  SearchOptions,
  WebSearchResponse,
} from 'bedrock-agentcore/web-search';
import { describe, expect, it, vi } from 'vitest';

import { type WebSearch, WebSearchTool } from './web-search.tool';

const FOUND: WebSearchResponse = {
  searchId: 'search-1',
  results: [
    {
      text: 'The new AgentCore Runtime is generally available, with elastic memory.',
      url: 'https://aws.amazon.com/about-aws/whats-new/2026/09/new-agentcore-runtime/',
      title: 'New AgentCore Runtime',
      publishedDate: '2026-09-15',
    },
    { text: 'A page the index reported without a title.' },
  ],
};

function searching(response: WebSearchResponse) {
  const search = vi.fn<
    (query: string, options?: SearchOptions) => Promise<WebSearchResponse>
  >(async () => response);
  return { client: { search } satisfies WebSearch, search };
}

const call = (args: Record<string, unknown>) => ({
  type: 'tool_call' as const,
  id: 'call-1',
  name: WebSearchTool.NAME,
  args,
});

describe('WebSearchTool', () => {
  it('searches with a bounded number of results and the date the model asked for', async () => {
    const { client, search } = searching(FOUND);

    await WebSearchTool.create(client).invoke(
      call({
        query: 'AgentCore news',
        publishedAfter: '2026-09-01T00:00:00Z',
      }),
    );

    expect(search).toHaveBeenCalledWith('AgentCore news', {
      maxResults: WebSearchTool.MAX_RESULTS,
      publishedAfter: '2026-09-01T00:00:00Z',
    });
  });

  it('answers the model with each passage under its title, URL and date, and keeps the results as the artifact', async () => {
    const { client } = searching(FOUND);

    const message = await WebSearchTool.create(client).invoke(
      call({ query: 'AgentCore news' }),
    );

    expect(ToolMessage.isInstance(message)).toBe(true);
    expect((message as ToolMessage).content).toBe(
      [
        '[1] New AgentCore Runtime',
        'https://aws.amazon.com/about-aws/whats-new/2026/09/new-agentcore-runtime/',
        'Published 2026-09-15',
        'The new AgentCore Runtime is generally available, with elastic memory.',
        '',
        '[2] Untitled',
        'A page the index reported without a title.',
      ].join('\n'),
    );
    expect((message as ToolMessage).artifact).toEqual(FOUND);
  });

  it('says so when the web has nothing', () => {
    expect(WebSearchTool.report({ results: [] })).toBe(
      'The web search found nothing for this.',
    );
  });

  it('refuses a query longer than the service accepts before searching', async () => {
    const { client, search } = searching(FOUND);

    await expect(
      WebSearchTool.create(client).invoke(call({ query: 'x'.repeat(201) })),
    ).rejects.toThrow();
    expect(search).not.toHaveBeenCalled();
  });
});
