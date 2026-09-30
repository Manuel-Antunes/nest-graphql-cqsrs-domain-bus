import type { z } from 'zod';

/**
 * **One attribute a credential may carry, read typed.** An identity's `attributes` are an access
 * token's custom claims, as untyped as the token; whoever reads one declares it once, next to the code
 * that needs it, with the schema its value must satisfy:
 *
 * ```ts
 * const AgentBotId = IdentityAttribute.of('agent_bot_id', z.coerce.number().int().positive());
 * identity.attribute(AgentBotId); // number | undefined
 * ```
 *
 * A value that is missing or does not satisfy the schema reads as `undefined`, never as a failure: a
 * claim is what an issuer chose to say, and a caller that did not say it is not a broken request.
 */
export class IdentityAttribute<T> {
  private constructor(
    readonly name: string,
    private readonly schema: z.ZodType<T>,
  ) {}

  static of<T>(name: string, schema: z.ZodType<T>): IdentityAttribute<T> {
    return new IdentityAttribute(name, schema);
  }

  /** The attribute's value in `attributes`, or `undefined` when it is absent or invalid. */
  readFrom(attributes: Readonly<Record<string, unknown>>): T | undefined {
    if (!Object.hasOwn(attributes, this.name)) {
      return undefined;
    }
    const parsed = this.schema.safeParse(attributes[this.name]);
    return parsed.success ? parsed.data : undefined;
  }
}
