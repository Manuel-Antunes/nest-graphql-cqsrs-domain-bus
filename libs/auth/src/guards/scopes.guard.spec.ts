import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host';

import { RequireScopes } from '../decorators/require-scopes.decorator';
import type { IdentityResolver } from '../domain/auth/identity.resolver';
import { OAUTH_SCOPES } from '../domain/auth/scopes';
import { Identity } from '../domain/auth/vo/identity';
import { ScopesGuard } from './scopes.guard';

@RequireScopes('read:posts')
class PostsResolver {
  @RequireScopes('write:posts')
  createPost() {}

  posts() {}
}

class OpenResolver {
  anything() {}
}

describe('ScopesGuard', () => {
  let asked: number;

  const holding = (scopes: readonly string[]) =>
    Identity.parse({
      userId: 'ana',
      email: 'ana@example.com',
      name: 'Ana',
      roles: ['user'],
      scopes,
    });

  const verdictOf = (
    identity: Identity | null,
    host: object,
    handler: () => void,
  ) => {
    const caller = {
      identity: async () => {
        asked += 1;
        return identity;
      },
    } as IdentityResolver;
    return new ScopesGuard(caller, new Reflector()).canActivate(
      new ExecutionContextHost([{}], host as never, handler),
    );
  };

  beforeEach(() => {
    asked = 0;
  });

  it('lets a token through that was granted what the handler and its class require', async () => {
    await expect(
      verdictOf(
        holding(['read:posts', 'write:posts']),
        PostsResolver,
        PostsResolver.prototype.createPost,
      ),
    ).resolves.toBe(true);
  });

  it('refuses a token missing one of them, naming what is required', async () => {
    const refusal = verdictOf(
      holding(['openid', 'read:posts']),
      PostsResolver,
      PostsResolver.prototype.createPost,
    );

    await expect(refusal).rejects.toBeInstanceOf(ForbiddenException);
    await expect(refusal).rejects.toThrow(/write:posts/);
  });

  it('applies the class’s scopes to a handler that declares none of its own', async () => {
    await expect(
      verdictOf(
        holding(['openid']),
        PostsResolver,
        PostsResolver.prototype.posts,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      verdictOf(
        holding(['read:posts']),
        PostsResolver,
        PostsResolver.prototype.posts,
      ),
    ).resolves.toBe(true);
  });

  it('lets a cookie of this system’s own through, which holds every scope', async () => {
    await expect(
      verdictOf(
        holding(OAUTH_SCOPES),
        PostsResolver,
        PostsResolver.prototype.createPost,
      ),
    ).resolves.toBe(true);
  });

  it('leaves nobody to the global guard', async () => {
    await expect(
      verdictOf(null, PostsResolver, PostsResolver.prototype.createPost),
    ).resolves.toBe(true);
  });

  it('asks nothing of a handler that requires no scope', async () => {
    await expect(
      verdictOf(holding([]), OpenResolver, OpenResolver.prototype.anything),
    ).resolves.toBe(true);
    expect(asked).toBe(0);
  });
});
