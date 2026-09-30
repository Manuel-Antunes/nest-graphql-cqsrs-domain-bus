import 'reflect-metadata';

import { Tool } from '@rekog/mcp-nest';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { ToLangchainTools } from './to-langchain-tools';

const pingSchema = z.object({ id: z.string() });
const echoSchema = z.object({ message: z.string() });

class SampleToolkit {
  @Tool({
    name: 'ping',
    description: 'Ping the server.',
    parameters: pingSchema,
  })
  async ping() {
    return 'pong';
  }

  @Tool({
    description: 'Echo the provided message.',
    parameters: echoSchema,
  })
  async echo(data: { message: string }) {
    return data.message;
  }

  notATool() {
    return 'skip';
  }
}

class EmptyToolkit {
  async foo() {
    return 'bar';
  }
}

describe('ToLangchainTools', () => {
  it('builds tools from @Tool-decorated methods', () => {
    const tools = ToLangchainTools(SampleToolkit);

    expect(tools).toHaveLength(2);
    const names = tools.map((t) => t.name);
    expect(names).toEqual(['ping', 'echo']);

    const echoTool = tools.find((t) => t.name === 'echo');
    expect(echoTool?.description).toBe('Echo the provided message.');
    expect((echoTool as { schema: unknown }).schema).toBe(echoSchema);
  });

  it('throws when the class exposes no MCP tools', () => {
    expect(() => ToLangchainTools(EmptyToolkit)).toThrow(
      /does not expose any MCP tools/i,
    );
  });

  it('binds tool execution when an instance is provided', async () => {
    class MathToolkit {
      calls: Array<{ a: number; b: number }> = [];

      @Tool({
        name: 'add',
        description: 'Add two numbers.',
        parameters: z.object({ a: z.number(), b: z.number() }),
      })
      async add(data: { a: number; b: number }) {
        this.calls.push(data);
        return data.a + data.b;
      }
    }

    const instance = new MathToolkit();
    const tools = ToLangchainTools(MathToolkit, { instance });
    const result = await tools[0]!.invoke({ a: 1, b: 2 });

    expect(result).toBe(3);
    expect(instance.calls).toEqual([{ a: 1, b: 2 }]);
  });

  it('creates the instance lazily using a thisArg factory', async () => {
    class FactoryOwner {
      readonly prefix = 'factory-';
    }

    class FactoryToolkit {
      constructor(private readonly owner: FactoryOwner) {}

      @Tool({
        name: 'make',
        description: 'Return a prefixed value.',
        parameters: z.object({ value: z.string() }),
      })
      async make(data: { value: string }) {
        return `${this.owner.prefix}${data.value}`;
      }
    }

    const owner = new FactoryOwner();
    const tools = ToLangchainTools(FactoryToolkit, {
      thisArg: owner,
      instanceFactory: (thisArg) => new FactoryToolkit(thisArg as FactoryOwner),
    });

    const result = await tools[0]!.invoke({ value: 'ok' });

    expect(result).toBe('factory-ok');
  });

  it('simulates MCP context using tool metadata, tags, and extras', async () => {
    class ContextToolkit {
      lastContext: unknown;

      @Tool({
        name: 'ctx',
        description: 'Capture context.',
        parameters: z.object({ foo: z.string() }),
        _meta: { tenantId: 'tool-tenant' },
        annotations: { title: 'Langchain' },
      })
      async ctx(_data: { foo: string }, context: unknown) {
        this.lastContext = context;
        return 'ok';
      }
    }

    const instance = new ContextToolkit();
    const tools = ToLangchainTools(ContextToolkit, { instance });

    await tools[0]!.invoke(
      { foo: 'bar' },
      {
        tags: ['tenant:runtime'],
        metadata: { tenantId: 'runtime-tenant', traceId: 't-1' },
      },
    );

    const ctx = instance.lastContext as {
      mcpRequest?: {
        method?: string;
        params?: {
          name?: string;
          arguments?: unknown;
          _meta?: Record<string, unknown>;
        };
      };
    };

    expect(ctx.mcpRequest?.method).toBe('tools/call');
    expect(ctx.mcpRequest?.params?.name).toBe('ctx');
    expect(ctx.mcpRequest?.params?.arguments).toEqual({ foo: 'bar' });
    expect(ctx.mcpRequest?.params?._meta?.tenantId).toBe('runtime-tenant');
    expect(ctx.mcpRequest?.params?._meta?.traceId).toBe('t-1');
    expect(ctx.mcpRequest?.params?._meta?.tags).toEqual(['tenant:runtime']);
    expect(ctx.mcpRequest?.params?._meta?.extras).toEqual({
      title: 'Langchain',
    });
  });
});
