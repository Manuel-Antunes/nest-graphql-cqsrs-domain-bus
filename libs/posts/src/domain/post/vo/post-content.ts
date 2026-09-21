import { ValidatedDto } from '@nestposts/validated-dto/mixins';
import { PostContentSchema } from '../schemas/post-content.schema';

export class PostContent extends ValidatedDto.Scalar(PostContentSchema) {}
