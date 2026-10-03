import type { AgentExecutor, TaskStore } from '@a2a-js/sdk/server';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import {
  BaseCheckpointSaver,
  BaseStore,
  InMemoryStore,
} from '@langchain/langgraph';
import { Inject, Injectable } from '@nestjs/common';
import { A2aMiddleware } from '@nestposts/ai/a2a/langchain/a2a.middleware';
import { LangChainTaskStore } from '@nestposts/ai/a2a/langchain/langchain-task-store';
import { ReactAgentExecutor } from '@nestposts/ai/a2a/langchain/react-agent.executor';
import {
  A2aAgent,
  type A2aAgentCardOverrides,
} from '@nestposts/ai/a2a/server/a2a-agent.decorator';
import { SubAgentMiddleware } from '@nestposts/ai/agents/subagent-middleware';
import { SkillsBackend } from '@nestposts/ai/backends/skills.backend';
import type { Skill } from '@nestposts/ai/domain/skill.entity';
import { EmptyToolInputMiddleware } from '@nestposts/ai/middleware/empty-tool-input.middleware';
import { LongTermMemoryMiddleware } from '@nestposts/ai/middleware/long-term-memory.middleware';
import { createAgent } from 'langchain';

import type { OAuthConfig } from '../config/oauth.config';
import { oauthConfig } from '../config/oauth.config';
import { PostsMcpApps } from '../mcp/posts-mcp-apps';
import { PostsMcpTools } from '../mcp/posts-mcp-tools';
import { POSTS_MANAGER_INSTRUCTIONS } from './posts-manager.instructions';
import { BROWSE_POSTS } from './skills/browse-posts.skill';
import { CURATE_POSTS } from './skills/curate-posts.skill';
import { PUBLISH_POSTS } from './skills/publish-posts.skill';

export class PostsToolsUnavailableError extends Error {
  constructor() {
    super(
      'The posts MCP server listed no tool, so there is nothing to manage posts with yet. Try again in a moment.',
    );
    this.name = 'PostsToolsUnavailableError';
  }
}

@A2aAgent({
  id: 'posts-manager',
  name: 'Posts Manager',
  description:
    "Manages the blog's posts on behalf of whoever is talking to it: lists and reads them, publishes new ones, and edits or deletes the ones that person wrote — always with that person's own access token.",
  card: {
    version: '1.0.0',
    defaultInputModes: ['text/plain'],
    defaultOutputModes: ['text/plain'],
  },
})
@Injectable()
export class PostsManagerAgent implements A2aAgent {
  static readonly SECURITY_SCHEME = 'platform';

  static readonly SCOPES = {
    openid: 'Who you are',
    profile: 'Your name',
    email: 'Your email address',
    offline_access: 'Keep acting for you while you are away',
    'read:posts': 'Read the blog posts',
    'write:posts': 'Publish, change and delete your posts',
  } as const;

  static readonly RECALL = ['preferences', 'facts'] as const;

  static readonly SKILLS: readonly Skill[] = [
    BROWSE_POSTS,
    PUBLISH_POSTS,
    CURATE_POSTS,
  ];

  readonly taskStore: TaskStore;

  private readonly tasks = new InMemoryStore();

  constructor(
    @Inject('BASE_MODEL') private readonly model: BaseChatModel,
    private readonly tools: PostsMcpTools,
    private readonly apps: PostsMcpApps,
    private readonly checkpointer: BaseCheckpointSaver,
    private readonly memory: BaseStore,
    @Inject(oauthConfig.KEY) private readonly oauth: OAuthConfig,
  ) {
    this.taskStore = new LangChainTaskStore({
      store: this.tasks,
      checkpointer: this.checkpointer,
    });
  }

  get skills(): readonly Skill[] {
    return PostsManagerAgent.SKILLS;
  }

  get card(): A2aAgentCardOverrides {
    const { oauth } = this;
    return {
      provider: { organization: 'nestposts', url: oauth.issuer },
      securitySchemes: {
        [PostsManagerAgent.SECURITY_SCHEME]: {
          scheme: {
            $case: 'oauth2SecurityScheme',
            value: {
              description: `An access token of the platform's authorization server issued for this agent (resource ${oauth.audience}). The agent acts with it, so it must also name the posts MCP server as a resource.`,
              oauth2MetadataUrl: oauth.authorizationServerMetadataUrl,
              flows: {
                flow: {
                  $case: 'authorizationCode',
                  value: {
                    authorizationUrl: oauth.authorizationUrl,
                    tokenUrl: oauth.tokenUrl,
                    refreshUrl: oauth.tokenUrl,
                    pkceRequired: true,
                    scopes: { ...PostsManagerAgent.SCOPES },
                  },
                },
              },
            },
          },
        },
      },
      securityRequirements: [
        {
          schemes: {
            [PostsManagerAgent.SECURITY_SCHEME]: {
              list: ['read:posts', 'write:posts'],
            },
          },
        },
      ],
    };
  }

  readonly executor = async (): Promise<AgentExecutor> => {
    const tools = await this.tools.load();
    if (tools.length === 0) throw new PostsToolsUnavailableError();
    const apps = await this.apps.load();
    const agent = createAgent({
      model: this.model,
      tools: [...tools, ...apps],
      systemPrompt: POSTS_MANAGER_INSTRUCTIONS,
      middleware: [
        A2aMiddleware.create(),
        LongTermMemoryMiddleware.create({ recall: PostsManagerAgent.RECALL }),
        EmptyToolInputMiddleware.create(),
        ...SubAgentMiddleware.for({
          backend: SkillsBackend.mount(this.skills),
          skills: this.skills,
          tools: ['read_file'],
        }),
      ],
      checkpointer: this.checkpointer,
      store: this.memory,
    });
    return new ReactAgentExecutor(agent, { traceName: 'posts-manager' });
  };
}
