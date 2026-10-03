import { ApolloLink, InMemoryCache } from '@apollo/client';
import { ToolCallLink } from '@apollo/client-ai-apps';
import { ApolloClient } from '@apollo/client-ai-apps/mcp';

import manifest from '../../.application-manifest.json';
import { ServerToolLink } from './server-tool.link';

export class PostsClient {
  private static client: ApolloClient | undefined;

  static instance(): ApolloClient {
    PostsClient.client ??= new ApolloClient({
      cache: new InMemoryCache(),
      manifest,
      link: ApolloLink.from([new ServerToolLink(manifest), new ToolCallLink()]),
    });
    return PostsClient.client;
  }
}
