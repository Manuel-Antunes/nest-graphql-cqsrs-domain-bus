import { topicMatches } from './topic-pattern';

describe('topic matching', () => {
  it('matches an exact routing key', () => {
    expect(topicMatches('posts.PostCreated.p-1', 'posts.PostCreated.p-1')).toBe(true);
    expect(topicMatches('posts.PostCreated.p-1', 'posts.PostCreated.p-2')).toBe(false);
  });

  it('* matches exactly one segment', () => {
    expect(topicMatches('posts.PostCreated.*', 'posts.PostCreated.p-1')).toBe(true);
    expect(topicMatches('posts.PostCreated.*', 'posts.PostCreated')).toBe(false);
    expect(topicMatches('posts.PostCreated.*', 'posts.PostCreated.p-1.extra')).toBe(false);
    expect(topicMatches('posts.*.p-1', 'posts.PostCreated.p-1')).toBe(true);
  });

  it('# matches zero or more segments', () => {
    expect(topicMatches('posts.#', 'posts')).toBe(true);
    expect(topicMatches('posts.#', 'posts.PostCreated')).toBe(true);
    expect(topicMatches('posts.#', 'posts.PostCreated.p-1')).toBe(true);
    expect(topicMatches('#', 'anything.at.all')).toBe(true);
    expect(topicMatches('posts.#', 'users.UserRegistered.u-1')).toBe(false);
  });

  it('does not let a namespace prefix match by accident', () => {
    expect(topicMatches('posts.*', 'postsandmore.PostCreated')).toBe(false);
    expect(topicMatches('posts.PostCreated.*', 'posts.PostCreatedSomething.p-1')).toBe(false);
  });

  it('treats a dot in the pattern as a separator and nothing else', () => {
    expect(topicMatches('posts.PostCreated.*', 'postsXPostCreatedXp-1')).toBe(false);
  });
});
