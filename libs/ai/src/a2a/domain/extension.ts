import type { AgentExtension, Message, Part, Task } from '@a2a-js/sdk';
import type {
  AgentExecutionEvent,
  RequestContext,
  ServerCallContext,
} from '@a2a-js/sdk/server';

import { A2aPart } from './a2a-part';

export interface ExtensionPayload {
  readonly type: string;
}

export type ExtensionParams = Record<string, unknown>;

export interface ExtensionClass {
  new (): BaseExtension<ExtensionPayload, readonly ExtensionClass[]>;
}

export type AnyExtension = BaseExtension<
  ExtensionPayload,
  readonly ExtensionClass[]
>;

export type OwnPayloadOf<T> =
  T extends BaseExtension<infer P, readonly ExtensionClass[]> ? P : never;

export type DecodablePayloadOf<
  TPayload extends ExtensionPayload,
  TDependencies extends readonly ExtensionClass[],
> = TPayload | OwnPayloadOf<InstanceType<TDependencies[number]>>;

export type TurnRequest = Pick<RequestContext, 'userMessage' | 'task'>;

export abstract class BaseExtension<
  TPayload extends ExtensionPayload = never,
  TDependencies extends readonly ExtensionClass[] = readonly [],
  TParams extends ExtensionParams = ExtensionParams,
> implements AgentExtension
{
  static readonly REPOSITORY_BASE_URI =
    'https://github.com/Vaz-Innovation/vaz-twin/a2a/extensions';

  abstract readonly name: string;
  abstract readonly version: string;
  abstract readonly description: string;
  readonly required: boolean = false;
  readonly params: TParams | undefined = {} as TParams;
  readonly dependencies: TDependencies =
    [] as readonly ExtensionClass[] as TDependencies;
  protected readonly baseUri: string = BaseExtension.REPOSITORY_BASE_URI;
  protected readonly payloadTypes: readonly TPayload['type'][] = [];

  private decodable?: ReadonlySet<string>;

  get uri(): string {
    return `${this.baseUri}/${this.name}/${this.version}`;
  }

  get descriptor(): AgentExtension {
    return {
      uri: this.uri,
      description: this.description,
      required: this.required,
      params: this.params,
    };
  }

  activate(context: ServerCallContext): boolean {
    if (!context.requestedExtensions?.includes(this.uri)) return false;
    context.addActivatedExtension(this.uri);
    return true;
  }

  isActivatedIn(activated: readonly string[] | undefined): boolean {
    return !!activated?.includes(this.uri);
  }

  isActivatedFor(request: Pick<RequestContext, 'context'>): boolean {
    return this.isActivatedIn(request.context?.activatedExtensions);
  }

  decorateEvent(_event: AgentExecutionEvent): void {}

  decorateMessage(_message: Message): void {}

  encode(payload: TPayload): Part {
    return A2aPart.data(payload);
  }

  decode(part: Part): DecodablePayloadOf<TPayload, TDependencies> | undefined {
    if (part.content?.$case !== 'data') return undefined;
    const value = part.content.value;
    if (!value || typeof value !== 'object') return undefined;
    const type = (value as { type?: unknown }).type;
    if (typeof type !== 'string' || !this.decodableTypes.has(type)) {
      return undefined;
    }
    return value as DecodablePayloadOf<TPayload, TDependencies>;
  }

  decodeAll<K extends DecodablePayloadOf<TPayload, TDependencies>['type']>(
    parts: readonly Part[],
    type: K,
  ): Extract<DecodablePayloadOf<TPayload, TDependencies>, { type: K }>[] {
    return parts.flatMap((part) => {
      const payload = this.decode(part);
      return payload?.type === type
        ? [
            payload as Extract<
              DecodablePayloadOf<TPayload, TDependencies>,
              { type: K }
            >,
          ]
        : [];
    });
  }

  decodeFirst<K extends DecodablePayloadOf<TPayload, TDependencies>['type']>(
    parts: readonly Part[],
    type: K,
  ):
    | Extract<DecodablePayloadOf<TPayload, TDependencies>, { type: K }>
    | undefined {
    return this.decodeAll(parts, type)[0];
  }

  protected decodeFromTurn<
    K extends DecodablePayloadOf<TPayload, TDependencies>['type'],
  >(
    request: TurnRequest,
    type: K,
  ):
    | Extract<DecodablePayloadOf<TPayload, TDependencies>, { type: K }>
    | undefined {
    return (
      this.decodeFirst(request.userMessage.parts, type) ??
      this.decodeFirst(BaseExtension.taskMessagePartsOf(request.task), type)
    );
  }

  protected carries(
    message: Message,
    accepts: (payload: DecodablePayloadOf<TPayload, TDependencies>) => boolean,
  ): boolean {
    return message.parts.some((part) => {
      const payload = this.decode(part);
      return payload !== undefined && accepts(payload);
    });
  }

  protected claim(carrier: { extensions: string[] }): void {
    if (!carrier.extensions.includes(this.uri)) {
      carrier.extensions = [...carrier.extensions, this.uri];
    }
  }

  protected messageOf(event: AgentExecutionEvent): Message | undefined {
    if (event.kind === 'statusUpdate') return event.data.status?.message;
    if (event.kind === 'message') return event.data;
    return undefined;
  }

  private get decodableTypes(): ReadonlySet<string> {
    this.decodable ??= new Set<string>([
      ...this.payloadTypes,
      ...this.dependencies.flatMap((Dependency) => [
        ...new Dependency().decodableTypes,
      ]),
    ]);
    return this.decodable;
  }

  private static taskMessagePartsOf(task: Task | undefined): readonly Part[] {
    return task?.status?.message?.parts ?? [];
  }
}
