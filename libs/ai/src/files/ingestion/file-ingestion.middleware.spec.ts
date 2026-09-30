import {
  AIMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
} from '@langchain/core/messages';
import { type InMemoryDisk, Storage } from '@nestjs/storage';
import { TestDisks } from '@nestposts/asset/infrastructure/testing/test-disks';

import type { FileAnalysisService } from '../analysis/file-analysis.service';
import { AttachmentReferences } from '../domain/attachment-references';
import type { AttachmentSidecar } from '../domain/attachment-sidecar';
import type { FileContentPart } from '../domain/file-content-part';
import { AttachmentDrive } from '../drive/attachment-drive';
import { RunScope } from '../drive/run-scope';
import { type AttachmentBlock, AttachmentBlocks } from './attachment-blocks';
import { AttachmentIngestionService } from './attachment-ingestion.service';
import { FileIngestionMiddleware } from './file-ingestion.middleware';
import type { FileIngestionOptions } from './file-ingestion.options';
import { PrepareDocumentAssetTool } from './prepare-document-asset.tool';

type Middleware = ReturnType<FileIngestionMiddleware['create']>;
type Hook = (state: unknown, runtime: unknown) => Promise<unknown>;

const CONFIGURABLE = {
  user_id: 'u1',
  thread_id: 't1',
  attachment_scope: 'natasha',
};
const ROOT = 'agents/natasha/u1/file-analysis/t1';
const IMAGE = Buffer.from('not-really-a-png').toString('base64');
const PDF = Buffer.from('%PDF-1.7 procuração').toString('base64');

let storage: Storage;
let analysis: {
  transcribeAudio: ReturnType<typeof vi.fn>;
  analyzeImage: ReturnType<typeof vi.fn>;
  analyzeDocument: ReturnType<typeof vi.fn>;
};

const disk = () => storage.disk('private') as InMemoryDisk;

const middlewareFor = (
  options: Partial<FileIngestionOptions> = {},
): Middleware => {
  const drive = new AttachmentDrive(storage);
  const ingestion = new AttachmentIngestionService(
    drive,
    analysis as unknown as FileAnalysisService,
  );
  return new FileIngestionMiddleware(
    ingestion,
    new PrepareDocumentAssetTool(drive),
  ).create({
    attachmentPathPrefix: '/attachments',
    mode: 'lazy',
    diskName: 'private',
    ...options,
  });
};

const hookOf = (hook: unknown): Hook =>
  (typeof hook === 'function' ? hook : (hook as { hook: Hook }).hook) as Hook;

const beforeModel = (middleware: Middleware, messages: unknown[]) =>
  hookOf(middleware.beforeModel)(
    { messages },
    { configurable: CONFIGURABLE },
  ) as Promise<{ messages: HumanMessage[]; lastToolData?: string } | undefined>;

const afterModel = (middleware: Middleware, messages: unknown[]) =>
  hookOf(middleware.afterModel)({ messages }, {}) as Promise<
    { messages: (HumanMessage | ToolMessage)[] } | undefined
  >;

const wrapModelCall = async (
  middleware: Middleware,
  messages: unknown[],
  systemMessage = new SystemMessage('Você é a Natasha.'),
) => {
  let forwarded:
    | { messages: unknown[]; systemMessage: SystemMessage }
    | undefined;
  await (
    middleware.wrapModelCall as unknown as (
      request: unknown,
      handler: (request: unknown) => unknown,
    ) => Promise<unknown>
  )({ messages, systemMessage }, (request) => {
    forwarded = request as typeof forwarded;
    return 'ok';
  });
  return forwarded as { messages: unknown[]; systemMessage: SystemMessage };
};

const wrapToolCall = async (
  middleware: Middleware,
  toolCall: { name: string; args: Record<string, unknown> },
) => {
  let forwarded: { toolCall: typeof toolCall } | undefined;
  await (
    middleware.wrapToolCall as unknown as (
      request: unknown,
      handler: (request: unknown) => unknown,
    ) => Promise<unknown>
  )({ toolCall }, (request) => {
    forwarded = request as typeof forwarded;
    return 'ok';
  });
  return (forwarded as { toolCall: typeof toolCall }).toolCall;
};

const filePart = (over: Partial<FileContentPart> = {}): FileContentPart => ({
  type: 'file',
  fileKind: 'image',
  mimeType: 'image/png',
  data: IMAGE,
  fileName: 'foto.png',
  sourceId: '361',
  ...over,
});

const userMessage = (parts: unknown[], over: Record<string, unknown> = {}) =>
  new HumanMessage({ id: 'h1', content: parts as never, ...over });

const blocksOf = (message: unknown): AttachmentBlock[] =>
  AttachmentBlocks.of(message) ?? [];

const sidecarAt = async (sourceId: string): Promise<AttachmentSidecar> =>
  JSON.parse(await disk().getText(`${ROOT}/${sourceId}.meta.json`));

beforeEach(() => {
  const { default: fallback, disks } = TestDisks.options();
  storage = new Storage(new Map(Object.entries(disks)), fallback);
  analysis = {
    transcribeAudio: vi.fn(async () => 'transcrição do áudio'),
    analyzeImage: vi.fn(async () => 'uma foto de um passaporte'),
    analyzeDocument: vi.fn(async () => 'uma procuração'),
  };
  vi.spyOn(RunScope, 'configurable').mockReturnValue(CONFIGURABLE);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('FileIngestionMiddleware', () => {
  describe('beforeModel', () => {
    it('stores the bytes and the sidecar in the conversation’s folder, through the asset', async () => {
      const update = await beforeModel(middlewareFor(), [
        userMessage([{ type: 'text', text: 'segue' }, filePart()]),
      ]);

      expect(disk().keys().sort()).toEqual([
        `${ROOT}/361.meta.json`,
        `${ROOT}/361.png`,
      ]);
      const sidecar = await sidecarAt('361');
      expect(sidecar).toMatchObject({
        sourceId: '361',
        kind: 'image',
        attachmentPath: '/attachments/361.png',
        asset: {
          disk: 'private',
          path: `${ROOT}/361.png`,
          originalName: 'foto.png',
          extname: 'png',
        },
      });
      expect(sidecar.asset).not.toHaveProperty('url');

      const [message] = update?.messages ?? [];
      expect(message.id).toBe('h1');
      expect(message.content).toEqual([{ type: 'text', text: 'segue' }]);
      expect(blocksOf(message)).toEqual([
        {
          path: '/attachments/361.png',
          fileName: 'foto.png',
          kind: 'image',
          mimeType: 'image/png',
          marker:
            '[Anexo: foto.png — análise de imagem — path=/attachments/361.png]',
        },
      ]);
      expect(analysis.analyzeImage).not.toHaveBeenCalled();
    });

    it('does nothing to a conversation with no file to ingest', async () => {
      expect(
        await beforeModel(middlewareFor(), [
          new HumanMessage({ id: 'h1', content: 'oi' }),
          userMessage([{ type: 'text', text: 'sem anexo' }]),
        ]),
      ).toBeUndefined();
    });

    it('analyses eagerly, keeping the analysis out of what the user sent', async () => {
      const update = await beforeModel(middlewareFor({ mode: 'eager' }), [
        userMessage([filePart({ caption: 'meu passaporte' })]),
      ]);

      const [block] = blocksOf(update?.messages[0]);
      expect(block?.text).toBe('uma foto de um passaporte');
      expect(block?.caption).toBe('meu passaporte');
      expect(update?.messages[0].content).toEqual([]);
      expect((await sidecarAt('361')).analysis).toBe(
        'uma foto de um passaporte',
      );
      expect(update?.lastToolData).toContain('uma foto de um passaporte');
      expect(analysis.analyzeImage).toHaveBeenCalledWith(
        expect.objectContaining({
          hint: 'meu passaporte',
          mimeType: 'image/png',
        }),
      );
    });

    it('routes audio to transcription and documents to document analysis', async () => {
      await beforeModel(middlewareFor({ mode: 'eager' }), [
        userMessage([
          filePart({
            fileKind: 'audio',
            mimeType: 'audio/ogg',
            fileName: undefined,
            sourceId: 'a1',
          }),
          filePart({
            fileKind: 'document',
            mimeType: 'application/pdf',
            data: PDF,
            fileName: 'procuracao.pdf',
            sourceId: 'd1',
          }),
        ]),
      ]);

      expect((await sidecarAt('a1')).transcription).toBe(
        'transcrição do áudio',
      );
      expect((await sidecarAt('d1')).analysis).toBe('uma procuração');
    });

    it('records a failed analysis instead of failing the turn', async () => {
      analysis.analyzeImage.mockRejectedValueOnce(new Error('vision down'));

      const update = await beforeModel(middlewareFor({ mode: 'eager' }), [
        userMessage([filePart()]),
      ]);

      expect(blocksOf(update?.messages[0])[0]?.text).toBe(
        '[Falha ao analisar image: vision down]',
      );
    });

    it('inlines a small image only when the agent asks for it', async () => {
      const inlined = await beforeModel(
        middlewareFor({ inlineImageDataUri: true }),
        [userMessage([filePart()])],
      );
      const plain = await beforeModel(middlewareFor(), [
        userMessage([filePart({ sourceId: '362' })]),
      ]);

      expect(inlined?.messages[0].content).toEqual([
        {
          type: 'image_url',
          image_url: { url: `data:image/png;base64,${IMAGE}` },
        },
      ]);
      expect(plain?.messages[0].content).toEqual([]);
    });

    it('downloads a file sent by reference and stores it like an inline one', async () => {
      const fetch = vi.fn(
        async () => new Response(Buffer.from('%PDF-remote'), { status: 200 }),
      );
      vi.stubGlobal('fetch', fetch);

      await beforeModel(middlewareFor(), [
        userMessage([
          filePart({
            fileKind: 'document',
            mimeType: 'application/pdf',
            data: undefined,
            uri: 'https://cdn.example/a.pdf?X-Amz-Signature=secret',
            fileName: 'a.pdf',
            sourceId: 'r1',
          }),
        ]),
      ]);

      expect(fetch).toHaveBeenCalledOnce();
      expect(await disk().getText(`${ROOT}/r1.pdf`)).toBe('%PDF-remote');
    });

    it('asks for a resend, and advertises nothing, when the bytes cannot be read', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(
          async () =>
            new Response('nope', { status: 403, statusText: 'Forbidden' }),
        ),
      );

      const update = await beforeModel(middlewareFor(), [
        userMessage([
          filePart({
            data: undefined,
            uri: 'https://cdn.example/a.png',
            sourceId: 'r2',
          }),
        ]),
      ]);

      expect(disk().keys()).toEqual([]);
      expect(blocksOf(update?.messages[0])[0]?.marker).toContain('NÃO salvo');
    });

    it('refuses to download from anything but http(s)', async () => {
      const update = await beforeModel(middlewareFor(), [
        userMessage([
          filePart({
            data: undefined,
            uri: 'file:///etc/passwd',
            sourceId: 'r3',
          }),
        ]),
      ]);

      expect(disk().keys()).toEqual([]);
      expect(blocksOf(update?.messages[0])[0]?.marker).toContain('NÃO salvo');
    });

    it('does not advertise a file whose bytes never landed', async () => {
      vi.spyOn(disk(), 'put').mockRejectedValue(new Error('S3 down'));

      const update = await beforeModel(middlewareFor(), [
        userMessage([filePart()]),
      ]);

      expect(blocksOf(update?.messages[0])[0]?.marker).toContain('NÃO salvo');
      await expect(disk().getText(`${ROOT}/361.meta.json`)).rejects.toThrow();
    });

    it('reuses what it already ingested instead of storing and analysing it again', async () => {
      const middleware = middlewareFor({ mode: 'eager' });
      await beforeModel(middleware, [userMessage([filePart()])]);
      const put = vi.spyOn(disk(), 'put');

      const again = await beforeModel(middleware, [
        userMessage([filePart({ quoted: true })], { id: 'h2' }),
      ]);

      expect(put).not.toHaveBeenCalled();
      expect(analysis.analyzeImage).toHaveBeenCalledOnce();
      expect(blocksOf(again?.messages[0])[0]).toMatchObject({
        text: 'uma foto de um passaporte',
        quoted: true,
        marker:
          '[Anexo da mensagem citada: foto.png — análise de imagem — path=/attachments/361.png]',
      });
    });

    it('keeps who wrote the message across the rewrite', async () => {
      const update = await beforeModel(middlewareFor(), [
        userMessage([filePart()], {
          name: 'Ana Souza',
          response_metadata: { channel: 'whatsapp' },
        }),
      ]);

      expect(update?.messages[0].name).toBe('Ana Souza');
      expect(update?.messages[0].response_metadata).toEqual({
        channel: 'whatsapp',
      });
    });
  });

  describe('wrapModelCall', () => {
    it('renders the attachment into the prompt copy only', async () => {
      const middleware = middlewareFor({ mode: 'eager' });
      const update = await beforeModel(middleware, [userMessage([filePart()])]);
      const stored = update?.messages[0] as HumanMessage;

      const forwarded = await wrapModelCall(middleware, [stored]);

      const texts = (forwarded.messages[0] as HumanMessage).content as {
        text?: string;
      }[];
      expect(texts.map((part) => part.text).join('\n')).toContain(
        'path=/attachments/361.png',
      );
      expect(stored.content).toEqual([]);
    });

    it('appends the post-analysis how-to, after a blank line, only when there is a file', async () => {
      const middleware = middlewareFor({
        postAnalysisInstructions: async () => '## Como usar anexos',
      });

      const empty = await wrapModelCall(middleware, []);
      await beforeModel(middleware, [userMessage([filePart()])]);
      const withFile = await wrapModelCall(middleware, []);

      expect(empty.systemMessage.text).toBe('Você é a Natasha.');
      expect(withFile.systemMessage.text).toBe(
        'Você é a Natasha.\n\n## Como usar anexos',
      );
    });

    it('gives the model the analysis back off the sidecar once the checkpoint was pruned', async () => {
      const middleware = middlewareFor({ mode: 'eager' });
      const update = await beforeModel(middleware, [userMessage([filePart()])]);
      const pruned = await afterModel(middleware, [
        update?.messages[0],
        new AIMessage({ id: 'a1', content: 'recebido' }),
      ]);
      const stored = pruned?.messages[0];
      expect(blocksOf(stored)[0]?.text).toBeUndefined();

      const forwarded = await wrapModelCall(middleware, [stored]);

      const text = (
        (forwarded.messages[0] as HumanMessage).content as { text?: string }[]
      )
        .map((part) => part.text)
        .join('\n');
      expect(text).toContain('uma foto de um passaporte');
      expect(text).toContain('path=/attachments/361.png');
    });
  });

  describe('afterModel', () => {
    it('keeps the file and drops what the middleware wrote about it once the turn ends', async () => {
      const middleware = middlewareFor({ mode: 'eager' });
      const update = await beforeModel(middleware, [
        userMessage([filePart({ caption: 'meu passaporte' })]),
      ]);

      const pruned = await afterModel(middleware, [
        update?.messages[0],
        new AIMessage({ id: 'a1', content: 'recebido' }),
      ]);

      expect(pruned?.messages).toHaveLength(1);
      expect(pruned?.messages[0].id).toBe('h1');
      expect(blocksOf(pruned?.messages[0])).toEqual([
        {
          path: '/attachments/361.png',
          fileName: 'foto.png',
          kind: 'image',
          mimeType: 'image/png',
        },
      ]);
    });

    it('prunes nothing mid-loop, while the model is still calling tools', async () => {
      const middleware = middlewareFor({ mode: 'eager' });
      const update = await beforeModel(middleware, [userMessage([filePart()])]);

      expect(
        await afterModel(middleware, [
          update?.messages[0],
          new AIMessage({
            id: 'a1',
            content: '',
            tool_calls: [{ id: 'c1', name: 'read_file', args: {} }],
          }),
        ]),
      ).toBeUndefined();
    });

    it('is a no-op on a conversation with nothing to prune', async () => {
      expect(
        await afterModel(middlewareFor(), [
          new HumanMessage({ id: 'h1', content: 'oi' }),
          new AIMessage({ id: 'a1', content: 'olá' }),
        ]),
      ).toBeUndefined();
    });

    describe('inline binaries from read_file', () => {
      const readFileTurn = (answer: AIMessage) => [
        new HumanMessage({ id: 'h1', content: 'segue a procuração' }),
        new AIMessage({
          id: 'a1',
          content: '',
          tool_calls: [
            {
              id: 'c1',
              name: 'read_file',
              args: { file_path: '/attachments/12142.pdf' },
            },
          ],
        }),
        new ToolMessage({
          id: 't1',
          tool_call_id: 'c1',
          name: 'read_file',
          content: [
            { type: 'file', mimeType: 'application/pdf', data: PDF },
          ] as never,
        }),
        answer,
      ];

      it('evicts them from state once the turn ends, pointing back at the file', async () => {
        const result = await afterModel(
          middlewareFor(),
          readFileTurn(new AIMessage({ id: 'a2', content: 'recebido' })),
        );

        expect(result?.messages).toHaveLength(1);
        const tool = result?.messages[0] as ToolMessage;
        expect(tool.id).toBe('t1');
        expect(tool.tool_call_id).toBe('c1');
        expect(ToolMessage.isInstance(tool)).toBe(true);
        expect((tool.content as { text: string }[])[0]?.text).toContain(
          'read_file("/attachments/12142.pdf")',
        );
        expect(JSON.stringify(tool)).not.toContain(PDF);
      });

      it('keeps them mid-loop, since the next model call is the one that reads the file', async () => {
        expect(
          await afterModel(
            middlewareFor(),
            readFileTurn(
              new AIMessage({
                id: 'a2',
                content: '',
                tool_calls: [{ id: 'c2', name: 'send_private_note', args: {} }],
              }),
            ),
          ),
        ).toBeUndefined();
      });
    });
  });

  describe('wrapToolCall', () => {
    const ingested = async (middleware: Middleware) =>
      beforeModel(middleware, [userMessage([filePart()])]);

    it('hands a sub-agent the canonical asset of every file its task cites', async () => {
      const middleware = middlewareFor();
      await ingested(middleware);

      const call = await wrapToolCall(middleware, {
        name: 'task',
        args: {
          description: 'Vincule /attachments/361.png ao cliente.',
          subagent_type: 'legal',
        },
      });

      const description = call.args.description as string;
      expect(description).toContain(
        AttachmentReferences.RESOLVED_ASSETS_HEADER,
      );
      expect(description).toContain(
        JSON.stringify((await sidecarAt('361')).asset),
      );
    });

    it('never enriches a description twice', async () => {
      const middleware = middlewareFor();
      await ingested(middleware);
      const first = await wrapToolCall(middleware, {
        name: 'task',
        args: { description: 'Use /attachments/361.png' },
      });

      const second = await wrapToolCall(middleware, first);

      expect(second.args.description).toBe(first.args.description);
    });

    it('leaves other tools, and descriptions citing no file, alone', async () => {
      const middleware = middlewareFor();
      await ingested(middleware);

      expect(
        (
          await wrapToolCall(middleware, {
            name: 'read_file',
            args: { file_path: '/attachments/361.png' },
          })
        ).args,
      ).toEqual({ file_path: '/attachments/361.png' });
      expect(
        (
          await wrapToolCall(middleware, {
            name: 'task',
            args: { description: 'sem anexo' },
          })
        ).args.description,
      ).toBe('sem anexo');
    });

    it('recovers the display label the model stitched into a path', async () => {
      const middleware = middlewareFor();
      await beforeModel(middleware, [
        userMessage([filePart({ fileName: undefined })]),
      ]);

      const call = await wrapToolCall(middleware, {
        name: 'task',
        args: { description: 'Veja /attachments/image-361.png' },
      });

      expect(call.args.description).toContain('/attachments/361.png');
    });

    it('does not advertise a file whose bytes were deleted from under its sidecar', async () => {
      const middleware = middlewareFor();
      await ingested(middleware);
      await disk().delete(`${ROOT}/361.png`);

      const call = await wrapToolCall(middleware, {
        name: 'task',
        args: { description: 'Use /attachments/361.png' },
      });

      expect(call.args.description).toBe('Use /attachments/361.png');
    });
  });
});
