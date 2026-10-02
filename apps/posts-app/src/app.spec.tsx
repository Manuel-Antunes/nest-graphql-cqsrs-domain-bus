import { MockedProvider } from '@apollo/client/testing/react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const useToolInfo = vi.fn();
const sendMessage = vi.fn(async (_message: unknown) => ({}));
const openLink = vi.fn(async (_link: unknown) => ({}));

vi.mock('@apollo/client-ai-apps/react', () => ({
  useToolInfo: () => useToolInfo(),
  useApp: () => ({ sendMessage, openLink }),
  useHostContext: () => ({ theme: 'light' }),
  createHydrationUtils: () => ({
    useHydratedVariables: (defaults: Record<string, unknown>) => [
      defaults,
      vi.fn(),
    ],
  }),
  reactive: (value: unknown) => value,
}));

const { App } = await import('./app');
const { ChoosePostToEditDocument } = await import(
  './features/choose-post/hooks/use-my-posts'
);
const { EditPostDocument, SavePostDocument } = await import(
  './features/edit-post/hooks/use-post-editor'
);
const { PreviewPostDocument, PublishPostDocument } = await import(
  './features/preview-post/hooks/use-draft-preview'
);

const NOW = new Date().toISOString();

function post(id: string, title: string, content = `About ${title}`) {
  return {
    __typename: 'Post' as const,
    id,
    title,
    content,
    updatedAt: NOW,
    version: 3,
    author: { __typename: 'Author' as const, id: 'u1', name: 'Manuel' },
    tags: {
      __typename: 'TagConnection' as const,
      edges: [
        {
          __typename: 'TagEdge' as const,
          node: { __typename: 'Tag' as const, id: 't1', name: 'general' },
        },
      ],
    },
  };
}

function myPosts(posts: ReturnType<typeof post>[]) {
  return {
    request: { query: ChoosePostToEditDocument, variables: { first: 20 } },
    result: {
      data: {
        me: {
          __typename: 'Author',
          id: 'u1',
          name: 'Manuel',
          posts: {
            __typename: 'PostConnection',
            totalCount: posts.length,
            edges: posts.map((node) => ({ __typename: 'PostEdge', node })),
          },
        },
      },
    },
  };
}

function editing(value: ReturnType<typeof post> | null) {
  return {
    request: {
      query: EditPostDocument,
      variables: { id: value?.id ?? 'gone' },
    },
    result: { data: { post: value } },
  };
}

function author() {
  return {
    request: { query: PreviewPostDocument, variables: {} },
    result: {
      data: { me: { __typename: 'Author', id: 'u1', name: 'Manuel' } },
    },
  };
}

function mount(mocks: readonly unknown[]) {
  return render(
    <MockedProvider mocks={mocks as never}>
      <App />
    </MockedProvider>,
  );
}

beforeEach(() => {
  sendMessage.mockClear();
  openLink.mockClear();
});

describe('choosing a post to edit', () => {
  it('lists the posts the tool found, and filters them by title', async () => {
    useToolInfo.mockReturnValue({
      toolName: 'ChoosePostToEdit',
      toolInput: { first: 20 },
    });
    mount([
      myPosts([post('p1', 'Hello world'), post('p2', 'Second thoughts')]),
    ]);

    expect(await screen.findByText('Hello world')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Filter by title'), {
      target: { value: 'second' },
    });
    expect(screen.queryByText('Hello world')).toBeNull();
    expect(screen.getByText('Second thoughts')).toBeTruthy();
  });

  it('opens the picked post in the editor, the way EditPost would', async () => {
    useToolInfo.mockReturnValue({
      toolName: 'ChoosePostToEdit',
      toolInput: { first: 20 },
    });
    const picked = post('p2', 'Second thoughts');
    mount([myPosts([post('p1', 'Hello world'), picked]), editing(picked)]);

    fireEvent.click(await screen.findByText('Second thoughts'));

    expect(await screen.findByDisplayValue('Second thoughts')).toBeTruthy();
    expect(screen.getByText('All my posts')).toBeTruthy();
  });

  it('tells a reader there is nothing to edit instead of an empty list', async () => {
    useToolInfo.mockReturnValue({
      toolName: 'ChoosePostToEdit',
      toolInput: { first: 20 },
    });
    mount([
      {
        request: { query: ChoosePostToEditDocument, variables: { first: 20 } },
        result: {
          data: { me: { __typename: 'User', id: 'u2', name: 'Reader' } },
        },
      },
    ]);

    expect(await screen.findByText('You have no posts')).toBeTruthy();
  });
});

describe('editing a post', () => {
  it('saves only what changed, and tells the conversation it did', async () => {
    useToolInfo.mockReturnValue({
      toolName: 'EditPost',
      toolInput: { id: 'p1' },
    });
    const original = post('p1', 'Hello world');
    mount([
      editing(original),
      {
        request: {
          query: SavePostDocument,
          variables: { id: 'p1', title: 'Hello, world', content: null },
        },
        result: {
          data: {
            updatePost: {
              __typename: 'Post',
              id: 'p1',
              title: 'Hello, world',
              content: original.content,
              updatedAt: NOW,
              version: 4,
            },
          },
        },
      },
    ]);

    const title = await screen.findByDisplayValue('Hello world');
    fireEvent.change(title, { target: { value: 'Hello, world' } });
    fireEvent.click(screen.getByText('Save changes'));

    expect(await screen.findByText('Saved')).toBeTruthy();
    expect(screen.getByText('The post is at version 4.')).toBeTruthy();
    expect(sendMessage).toHaveBeenCalledWith({
      role: 'user',
      content: [
        {
          type: 'text',
          text: 'I saved my changes to the post “Hello, world” (id p1) in the posts app; it is now at version 4.',
        },
      ],
      _meta: { copilotkit: { followUp: false } },
    });
  });

  it('cannot save before anything changed', async () => {
    useToolInfo.mockReturnValue({
      toolName: 'EditPost',
      toolInput: { id: 'p1' },
    });
    mount([editing(post('p1', 'Hello world'))]);

    await screen.findByDisplayValue('Hello world');
    expect(
      (screen.getByText('Save changes').closest('button') as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it('says so when the post does not exist', async () => {
    useToolInfo.mockReturnValue({
      toolName: 'EditPost',
      toolInput: { id: 'gone' },
    });
    mount([editing(null)]);

    expect(await screen.findByText('Post not found')).toBeTruthy();
  });
});

describe('previewing a draft', () => {
  it('shows a new post as the blog will, and publishes it only on the button', async () => {
    useToolInfo.mockReturnValue({
      toolName: 'PreviewPost',
      toolInput: { title: 'Fresh post', content: 'Some fresh words.' },
    });
    mount([
      author(),
      {
        request: {
          query: PublishPostDocument,
          variables: { title: 'Fresh post', content: 'Some fresh words.' },
        },
        result: {
          data: {
            createPost: {
              __typename: 'Post',
              id: 'p9',
              title: 'Fresh post',
              content: 'Some fresh words.',
              createdAt: NOW,
              version: 1,
            },
          },
        },
      },
    ]);

    expect(await screen.findByText('Some fresh words.')).toBeTruthy();
    expect(screen.getByText('by Manuel · not published yet')).toBeTruthy();
    expect(sendMessage).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('Publish'));

    expect(await screen.findByText('Published')).toBeTruthy();
    expect(sendMessage).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByText('Open on the blog'));
    expect(openLink).toHaveBeenCalledWith({
      url: 'http://localhost:3000/posts/p9',
    });
  });

  it('publishes the text as the person adjusted it', async () => {
    useToolInfo.mockReturnValue({
      toolName: 'PreviewPost',
      toolInput: { title: 'Fresh post', content: 'Draft words.' },
    });
    mount([
      author(),
      {
        request: {
          query: PublishPostDocument,
          variables: { title: 'Fresh post', content: 'Better words.' },
        },
        result: {
          data: {
            createPost: {
              __typename: 'Post',
              id: 'p9',
              title: 'Fresh post',
              content: 'Better words.',
              createdAt: NOW,
              version: 1,
            },
          },
        },
      },
    ]);

    fireEvent.click(await screen.findByText('Adjust text'));
    fireEvent.change(screen.getByLabelText('Content'), {
      target: { value: 'Better words.' },
    });
    expect(screen.getByText('adjusted by you')).toBeTruthy();
    fireEvent.click(screen.getByText('Publish'));

    expect(await screen.findByText('Published')).toBeTruthy();
    expect(sendMessage.mock.calls[0]?.[0]).toMatchObject({
      content: [
        {
          text: 'I approved the preview and published the post “Fresh post” (id p9), after adjusting the text myself.',
        },
      ],
    });
  });

  it('compares a change with the post it replaces, and applies it on the button', async () => {
    useToolInfo.mockReturnValue({
      toolName: 'PreviewPost',
      toolInput: { title: 'Hello world', content: 'Rewritten.', postId: 'p1' },
    });
    mount([
      author(),
      editing(post('p1', 'Hello world', 'The original words.')),
      {
        request: {
          query: SavePostDocument,
          variables: { id: 'p1', title: 'Hello world', content: 'Rewritten.' },
        },
        result: {
          data: {
            updatePost: {
              __typename: 'Post',
              id: 'p1',
              title: 'Hello world',
              content: 'Rewritten.',
              updatedAt: NOW,
              version: 4,
            },
          },
        },
      },
    ]);

    expect(await screen.findByText('A change to “Hello world”')).toBeTruthy();
    expect(screen.getByText('Rewritten.')).toBeTruthy();
    fireEvent.click(screen.getByText('Apply change'));

    expect(await screen.findByText('Change applied')).toBeTruthy();
    expect(screen.getByText(/is now at version 4/)).toBeTruthy();
  });

  it('discards without saving, and tells the conversation nothing was published', async () => {
    useToolInfo.mockReturnValue({
      toolName: 'PreviewPost',
      toolInput: { title: 'Fresh post', content: 'Some fresh words.' },
    });
    mount([author()]);

    fireEvent.click(await screen.findByText('Discard'));

    expect(await screen.findByText('Discarded')).toBeTruthy();
    expect(sendMessage.mock.calls[0]?.[0]).toMatchObject({
      content: [
        {
          text: 'I discarded the preview of “Fresh post”: nothing was published.',
        },
      ],
    });
  });
});
