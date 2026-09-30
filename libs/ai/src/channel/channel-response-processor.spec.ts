import { AIMessage, ToolMessage } from '@langchain/core/messages';

import type { InterruptMessageHumanizer } from '../services/interrupt-message-humanizer.service';
import type { AgentStreamOptions } from './channel-response-processor';
import { InMemoryChannelResponseProcessor } from './in-memory.channel-response-processor';

describe('ChannelResponseProcessor — delivery mechanics', () => {
  const THREAD = 'thread-1';

  const humanizer = {
    humanize: async ({ rawMessage }: { rawMessage: string }) =>
      `HUMANIZED:${rawMessage}`,
  } as unknown as InterruptMessageHumanizer;

  function makeProcessor() {
    return new InMemoryChannelResponseProcessor(humanizer);
  }

  async function* streamOf(chunks: unknown[]): AsyncIterable<unknown> {
    for (const c of chunks) yield c;
  }

  function composerChunk(messages: unknown[]): unknown {
    return [[], { agent: { messages } }];
  }

  function subagentChunk(messages: unknown[]): unknown {
    return [['LegalKnowledgeGraphAgent:xyz'], { agent: { messages } }];
  }

  function sendTextCall(content: string): AIMessage {
    return new AIMessage({
      content: '',
      tool_calls: [
        { name: 'send_text', args: { content }, id: `t-${content}` },
      ],
    });
  }

  function baseOpts(
    overrides: Partial<AgentStreamOptions>,
  ): AgentStreamOptions {
    return {
      threadId: THREAD,
      stream: streamOf([]),
      getSnapshot: async () => null,
      ...overrides,
    } as AgentStreamOptions;
  }

  it('delivers one text bubble per send_text tool-call (reject → split into MULTIPLE texts)', async () => {
    const proc = makeProcessor();
    const count = await proc.stream(
      baseOpts({
        stream: streamOf([
          composerChunk([sendTextCall('Encontrei seu processo.')]),
          composerChunk([sendTextCall('É uma ação trabalhista no TRT2.')]),
          composerChunk([sendTextCall('O valor é R$ 12.345,67.')]),
        ]),
      }),
    );

    expect(count).toBe(3);
    expect(proc.deliveries.every((d) => d.kind === 'text')).toBe(true);
    expect(proc.deliveries.map((d) => d.text)).toEqual([
      'Encontrei seu processo.',
      'É uma ação trabalhista no TRT2.',
      'O valor é R$ 12.345,67.',
    ]);
  });

  it('delivers a resolved send_audio tool-message as AUDIO (accept path)', async () => {
    const proc = makeProcessor();
    await proc.stream(
      baseOpts({
        stream: streamOf([
          composerChunk([
            new ToolMessage({
              content: '<AUDIO>Resumo do seu processo em áudio.',
              name: 'send_audio',
              tool_call_id: 'a-1',
            }),
          ]),
        ]),
      }),
    );

    expect(proc.deliveries.length).toBeGreaterThan(0);
    expect(proc.deliveries.every((d) => d.kind === 'audio')).toBe(true);
    expect(proc.deliveries.map((d) => d.text).join(' ')).toContain(
      'Resumo do seu processo',
    );
  });

  it('delivers an audio_consent interrupt VERBATIM as text (no humanizer)', async () => {
    const proc = makeProcessor();
    const consentQuestion =
      'Achei os dados do seu processo. É bastante coisa — prefere que eu te mande um áudio resumindo?';
    await proc.stream(
      baseOpts({
        getSnapshot: async () => ({
          tasks: [
            {
              interrupts: [
                { value: { kind: 'audio_consent', consentQuestion } },
              ],
            },
          ],
        }),
      }),
    );

    expect(proc.deliveries).toHaveLength(1);
    expect(proc.deliveries[0].kind).toBe('text');
    expect(proc.deliveries[0].text).toBe(consentQuestion);
  });

  it('ships a judit-polling bridge as TEXT when the user has no audio preference', async () => {
    const proc = makeProcessor();
    await proc.stream(
      baseOpts({
        lastUserQuestion:
          'quero saber do meu processo 0000001-23.4567.8.90.1234',
        getSnapshot: async () => ({
          tasks: [
            {
              interrupts: [
                {
                  value: {
                    kind: 'judit_polling_request',
                    message:
                      'Estou consultando o seu processo, só um instante…',
                  },
                },
              ],
            },
          ],
        }),
      }),
    );

    expect(proc.deliveries.every((d) => d.kind === 'text')).toBe(true);
    expect(proc.deliveries.map((d) => d.text).join(' ')).toContain(
      'HUMANIZED:',
    );
  });

  it('ships a judit-polling bridge as AUDIO on a proactive "não sei ler" turn (no consent asked)', async () => {
    const proc = makeProcessor();
    await proc.stream(
      baseOpts({
        lastUserQuestion:
          'Natasha eu não sei ler, pode me explicar tudo em áudio? quero saber do processo',
        getSnapshot: async () => ({
          tasks: [
            {
              interrupts: [
                {
                  value: {
                    kind: 'judit_polling_request',
                    message:
                      'Estou consultando o seu processo, já te trago a resposta.',
                  },
                },
              ],
            },
          ],
        }),
      }),
    );

    expect(proc.deliveries.length).toBeGreaterThan(0);
    expect(proc.deliveries.every((d) => d.kind === 'audio')).toBe(true);
    expect(
      proc.deliveries.some((d) =>
        /prefere.*[áa]udio|posso.*[áa]udio/i.test(d.text),
      ),
    ).toBe(false);
  });

  it('never ends silent — ships the composer final plain text when no send tool fired', async () => {
    const proc = makeProcessor();
    await proc.stream(
      baseOpts({
        stream: streamOf([
          composerChunk([
            new AIMessage({ content: 'Pronto, tudo certo com o seu caso.' }),
          ]),
        ]),
      }),
    );

    expect(proc.deliveries).toHaveLength(1);
    expect(proc.deliveries[0].kind).toBe('text');
    expect(proc.deliveries[0].text).toBe('Pronto, tudo certo com o seu caso.');
  });

  it('humanizes the zero-deliverable fallback — splits a LONG plain reply into multiple bubbles', async () => {
    const proc = makeProcessor();
    const longReply = [
      'Olá! Recebi os dados do seu processo.',
      'O número do seu processo é 0010668-06.2007.4.01.3400. Ele está avaliado em R$ 2.683.697,69.',
      'Encontrei as seguintes informações para você:',
      'Este processo judicial está em nome de MARISTELA PINTO DA MOTA e outros, contra o INSTITUTO NACIONAL DO SEGURO SOCIAL. A ação tramita na Justiça Federal, especificamente na 5ª Vara Federal Cível da SJDF.',
    ].join('\n\n');

    await proc.stream(
      baseOpts({
        stream: streamOf([
          composerChunk([new AIMessage({ content: longReply })]),
        ]),
      }),
    );

    expect(proc.deliveries.length).toBeGreaterThan(1);
    expect(proc.deliveries.every((d) => d.kind === 'text')).toBe(true);
    expect(
      proc.deliveries.some(
        (d) => d.text.trim() === '0010668-06.2007.4.01.3400',
      ),
    ).toBe(true);
    const joined = proc.deliveries.map((d) => d.text).join(' ');
    expect(joined).toContain('MARISTELA PINTO DA MOTA');
    expect(joined).toContain('R$ 2.683.697,69');
  });

  it('ships the zero-deliverable fallback as AUDIO when the user prefers audio', async () => {
    const proc = makeProcessor();
    await proc.stream(
      baseOpts({
        lastUserQuestion: 'não sei ler, me explica em áudio por favor',
        stream: streamOf([
          composerChunk([
            new AIMessage({ content: 'Seu processo está em andamento.' }),
          ]),
        ]),
      }),
    );

    expect(proc.deliveries.length).toBeGreaterThan(0);
    expect(proc.deliveries.every((d) => d.kind === 'audio')).toBe(true);
    expect(proc.deliveries.map((d) => d.text).join(' ')).toContain(
      'Seu processo está em andamento',
    );
  });

  it('does NOT leak a subagent (nested namespace) plain message to the user', async () => {
    const proc = makeProcessor();
    await proc.stream(
      baseOpts({
        stream: streamOf([
          subagentChunk([
            new AIMessage({ content: 'Vou consultar o tribunal pelo CNJ…' }),
          ]),
        ]),
      }),
    );

    expect(proc.deliveries).toHaveLength(0);
  });
});
