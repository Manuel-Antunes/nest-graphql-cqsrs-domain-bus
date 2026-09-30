import {
  ChatwootConversations,
  ChatwootGraphqlError,
} from './chatwoot-conversations';

const ENDPOINT = 'http://gateway.test/graphql';
const HEADERS = { authorization: 'Bearer bot-jwt' };

let fetch: ReturnType<typeof vi.fn>;

const answering = (body: unknown, status = 200) =>
  fetch.mockResolvedValueOnce(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  );

const sent = () => {
  const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
  return { url, headers: init.headers, body: JSON.parse(String(init.body)) };
};

beforeEach(() => {
  fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ChatwootConversations', () => {
  it('creates a message through the gateway, carrying the caller’s credential', async () => {
    answering({
      data: { createANewMessageInAConversation: { message: { id: '77' } } },
    });

    const id = await new ChatwootConversations(ENDPOINT, HEADERS).createMessage(
      {
        conversationId: 12,
        content: 'olá',
        messageType: 'outgoing',
        contentAttributes: { in_reply_to: 5 },
      },
    );

    expect(id).toBe('77');
    const request = sent();
    expect(request.url).toBe(ENDPOINT);
    expect(request.headers).toEqual({
      authorization: 'Bearer bot-jwt',
      'content-type': 'application/json',
    });
    expect(request.body.operationName).toBe('CreateANewMessageInAConversation');
    expect(request.body.query).toContain(
      'createANewMessageInAConversation(input: $input)',
    );
    expect(request.body.variables).toEqual({
      input: {
        conversationId: 12,
        content: 'olá',
        messageType: 'outgoing',
        contentAttributes: { in_reply_to: 5 },
      },
    });
  });

  it('toggles typing and marks a conversation seen with the same mutations the dashboard has', async () => {
    const conversations = new ChatwootConversations(ENDPOINT, HEADERS);
    answering({
      data: { toggleTypingStatusInConversation: { clientMutationId: null } },
    });
    answering({
      data: { updateConversationLastSeen: { clientMutationId: null } },
    });

    await conversations.toggleTyping(12, 'on');
    await conversations.markSeen(12);

    const bodies = fetch.mock.calls.map(([, init]) =>
      JSON.parse(String(init.body)),
    );
    expect(bodies.map((body) => [body.operationName, body.variables])).toEqual([
      [
        'ToggleTypingStatusInConversation',
        { input: { conversationId: 12, typingStatus: 'on', isPrivate: false } },
      ],
      ['UpdateConversationLastSeen', { input: { conversationId: 12 } }],
    ]);
  });

  it('fails with the GraphQL errors the subgraph answered', async () => {
    answering({ data: null, errors: [{ message: 'Unauthenticated.' }] });

    await expect(
      new ChatwootConversations(ENDPOINT, HEADERS).markSeen(12),
    ).rejects.toThrow(
      new ChatwootGraphqlError('UpdateConversationLastSeen', [
        { message: 'Unauthenticated.' },
      ]),
    );
  });

  it('fails on an HTTP error that carries no GraphQL answer', async () => {
    fetch.mockResolvedValueOnce(new Response('bad gateway', { status: 502 }));

    await expect(
      new ChatwootConversations(ENDPOINT, HEADERS).markSeen(12),
    ).rejects.toThrow(/HTTP 502/);
  });
});
