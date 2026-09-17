import { Type } from '@nestjs/common';
import { ZodError, ZodType } from 'zod';

import { BaseEntity } from './base-entity';
import { ValidationError } from './validation-error';

export function ZodEntity<T extends BaseEntity, Schema extends ZodType>(
  klass: Type<T>,
  schema: Schema,
  invalid: (error: ZodError) => Error = (error) =>
    new ValidationError(`Validation failed: ${error.message}`, { cause: error }),
) {
  const originalValidate = klass.prototype.validate;
  klass.prototype.validate = function (this: T): void {
    originalValidate.call(this);
    const result = schema.safeParse(this);
    if (!result.success) {
      throw invalid(result.error);
    }
  };
  return klass as Type<T>;
}
