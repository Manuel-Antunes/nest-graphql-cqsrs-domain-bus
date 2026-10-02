import type { PostsAppOpening } from './posts-mcp-app';

/**
 * **What the model behind Theo would decide, said up front by a spec.** The stand-in runs no model, so
 * a spec tells it which question opens the posts MCP App, with which tool and input; everything after
 * that choice — the MCP server, the surface, the web — is the real thing.
 */
export class TheoScript {
  constructor(private readonly url: string) {}

  async opensThePostsApp(
    asked: string,
    opening: PostsAppOpening,
  ): Promise<void> {
    const response = await fetch(`${this.url}/openings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ asked, opening }),
    });
    if (!response.ok) {
      throw new Error(
        `Theo's stand-in refused the opening: ${response.status}`,
      );
    }
  }
}
