import { randomUUID } from 'node:crypto';
import { ValidatedDto } from '@nestposts/validated-dto/mixins';
import { TagIdSchema } from '../schemas/tag-id.schema';

export class TagId extends ValidatedDto.Scalar(TagIdSchema) {
  static generate(): TagId {
    return TagId.parse(randomUUID());
  }
}
