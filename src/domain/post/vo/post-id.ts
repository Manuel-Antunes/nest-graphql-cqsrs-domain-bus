import { randomUUID } from 'node:crypto';
import { ValidatedDto } from '../../../validated-dto/mixins';
import { PostIdSchema } from '../schemas/post-id.schema';

export class PostId extends ValidatedDto.Scalar(PostIdSchema) {
  static generate(): PostId {
    return PostId.parse(randomUUID());
  }
}
