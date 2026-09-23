import { ValidatedDto } from '@nestposts/validated-dto/mixins';

import { PostTitleSchema } from '../schemas/post-title.schema';

export class PostTitle extends ValidatedDto.Scalar(PostTitleSchema) {
  get length(): number {
    return this.value.length;
  }
}
