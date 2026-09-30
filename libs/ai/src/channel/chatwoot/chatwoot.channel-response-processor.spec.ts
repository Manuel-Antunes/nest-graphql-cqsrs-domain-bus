import type { AiConfig } from '../../config/ai.config';
import type { InterruptMessageHumanizer } from '../../services/interrupt-message-humanizer.service';
import type { TTSService } from '../../services/tts.service';
import { ChatwootChannelResponseProcessor } from './chatwoot.channel-response-processor';

const CONFIG = { GATEWAY_URL: 'http://gateway.test/graphql' } as AiConfig;
const humanizer = { humanize: vi.fn() } as unknown as InterruptMessageHumanizer;

let fetch: ReturnType<typeof vi.fn>;
let tts: { textToSpeechBase64: ReturnType<typeof vi.fn> };

const requestFrom = (headers: Record<string, string>) => ({ headers });

const build = (
  headers: Record<string, string> = { authorization: 'Bearer bot-jwt' },
) =>
  new ChatwootChannelResponseProcessor(
    requestFrom(headers),
    CONFIG,
    tts as unknown as TTSService,
    humanizer,
  );

const calls = () =>
  fetch.mock.calls.map(([, init]) => ({
    headers: (init as RequestInit).headers as Record<string, string>,
    body: JSON.parse(String((init as RequestInit).body)),
  }));

const inputs = () => calls().map((call) => call.body.variables.input);

beforeEach(() => {
  fetch = vi.fn(
    async () =>
      new Response(JSON.stringify({ data: { ok: { message: { id: '1' } } } }), {
        headers: { 'content-type': 'application/json' },
      }),
  );
  vi.stubGlobal('fetch', fetch);
  tts = { textToSpeechBase64: vi.fn(async () => 'bXAz') };
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('ChatwootChannelResponseProcessor', () => {
  it('refuses to be built for a request that carries no credential', () => {
    expect(() => build({})).toThrow(
      /refusing to call Chatwoot unauthenticated/,
    );
  });

  it('forwards the credential the agent bot called with, and the tenant it named', async () => {
    const processor = build({
      authorization: 'Bearer bot-jwt',
      'x-tenant': 'acme',
      'user-agent': 'Chatwoot',
    });

    await processor.sendPlainText('olá', '12');

    expect(calls()[0]?.headers).toEqual({
      authorization: 'Bearer bot-jwt',
      'x-tenant': 'acme',
      'content-type': 'application/json',
    });
    expect(inputs()[0]).toEqual({
      conversationId: 12,
      content: 'olá',
      messageType: 'outgoing',
    });
  });

  it('quotes the message it replies to', async () => {
    await build().replyMessage('sim', {
      threadId: '12',
      userId: 'u1',
      quotedMessageId: '5',
    });

    expect(calls().map((call) => call.body.operationName)).toEqual([
      'ToggleTypingStatusInConversation',
      'CreateANewMessageInAConversation',
    ]);
    expect(inputs()[1]).toMatchObject({
      contentAttributes: { in_reply_to: 5 },
    });
  });

  it('spaces consecutive bubbles so WhatsApp keeps their order', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-30T12:00:00Z'));
    const processor = build();

    await processor.sendPlainText('um', '12');
    await processor.sendPlainText('dois', '12');
    await processor.sendPlainText('três', '12');

    expect(inputs().map((input) => input.contentAttributes?.delay)).toEqual([
      undefined,
      ChatwootChannelResponseProcessor.INTER_MESSAGE_GAP_MS,
      ChatwootChannelResponseProcessor.INTER_MESSAGE_GAP_MS * 2,
    ]);
  });

  it('marks the conversation seen as the bot, and never throws doing it', async () => {
    const processor = build();

    await processor.markRead([{ remoteJid: '12', fromMe: false, id: 'm1' }]);
    fetch.mockRejectedValueOnce(new Error('gateway down'));
    await expect(
      processor.markRead([{ remoteJid: '12', fromMe: false, id: 'm2' }]),
    ).resolves.toBeUndefined();

    expect(calls()[0]?.body.operationName).toBe('UpdateConversationLastSeen');
    expect(inputs()[0]).toEqual({ conversationId: 12 });
  });

  it('sends a long spoken reply as an audio attachment', async () => {
    const speech = 'a'.repeat(150);

    await build().stream({
      threadId: '12',
      userId: 'u1',
      stream: (async function* () {
        yield [
          [],
          {
            tools: {
              messages: [
                {
                  type: 'tool',
                  name: 'send_audio',
                  content: `<AUDIO>${speech}`,
                },
              ],
            },
          },
        ];
      })(),
      getSnapshot: async () => null,
    });

    expect(tts.textToSpeechBase64).toHaveBeenCalledWith(speech);
    expect(inputs()[0]).toEqual({
      conversationId: 12,
      messageType: 'outgoing',
      attachments: [
        { data: 'bXAz', filename: 'voice.mp3', contentType: 'audio/mpeg' },
      ],
    });
  });

  it('falls back to text bubbles when no audio could be synthesized', async () => {
    tts.textToSpeechBase64.mockRejectedValueOnce(new Error('tts down'));

    await build().stream({
      threadId: '12',
      userId: 'u1',
      stream: (async function* () {
        yield [
          [],
          {
            tools: {
              messages: [
                {
                  type: 'tool',
                  name: 'send_audio',
                  content: `<AUDIO>${'b'.repeat(150)}`,
                },
              ],
            },
          },
        ];
      })(),
      getSnapshot: async () => null,
    });

    expect(inputs()[0]).toMatchObject({
      content: expect.stringMatching(/^b+/),
    });
    expect(inputs()[0]).not.toHaveProperty('attachments');
  });
});
