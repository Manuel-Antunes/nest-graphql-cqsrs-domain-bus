import type { StructuredToolInterface } from '@langchain/core/tools';
import {
  MAX_QUERY_LENGTH,
  type WebSearchClient,
  type WebSearchResponse,
} from 'bedrock-agentcore/web-search';
import { tool } from 'langchain';
import { z } from 'zod';

export type WebSearch = Pick<WebSearchClient, 'search'>;

export class WebSearchTool {
  static readonly NAME = 'search_the_web';
  static readonly MAX_RESULTS = 8;

  static create(client: WebSearch): StructuredToolInterface {
    return tool(
      async ({
        query,
        publishedAfter,
      }: {
        query: string;
        publishedAfter?: string;
      }) => {
        const response = await client.search(query, {
          maxResults: WebSearchTool.MAX_RESULTS,
          ...(publishedAfter ? { publishedAfter } : {}),
        });
        return [WebSearchTool.report(response), response];
      },
      {
        name: WebSearchTool.NAME,
        description:
          'Searches the web and answers with the most relevant passages it found, each with the title, URL and publication date of its page. Use it to research a subject before a post is written about it, or when the person asks about something recent. Whatever you write from it must cite those URLs.',
        schema: z.object({
          query: z
            .string()
            .max(MAX_QUERY_LENGTH)
            .describe(
              'What to search for, in a few words: one subject per search. Search again for another side of it.',
            ),
          publishedAfter: z
            .string()
            .optional()
            .describe(
              'Only pages published on or after this moment, ISO-8601 UTC (2026-09-01T00:00:00Z): for news and what changed recently.',
            ),
        }),
        responseFormat: 'content_and_artifact',
      },
    );
  }

  static report({ results }: WebSearchResponse): string {
    if (!results.length) return 'The web search found nothing for this.';
    return results
      .map((result, index) =>
        [
          `[${index + 1}] ${result.title ?? result.url ?? 'Untitled'}`,
          result.url,
          result.publishedDate ? `Published ${result.publishedDate}` : '',
          result.text,
        ]
          .filter(Boolean)
          .join('\n'),
      )
      .join('\n\n');
  }
}
