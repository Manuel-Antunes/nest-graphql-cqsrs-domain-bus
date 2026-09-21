import { z } from 'zod';

export type DECORATOR_REGISTRY_TYPE = z.core.$ZodRegistry<
  {
    decorators: Array<ClassDecorator | PropertyDecorator>;
  },
  z.core.$ZodType<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>>
>;

export function createDecoratorRegistry(): DECORATOR_REGISTRY_TYPE {
  return z.registry<{
    decorators: Array<ClassDecorator | PropertyDecorator>;
  }>();
}

export const DECORATOR_REGISTRY = createDecoratorRegistry();
