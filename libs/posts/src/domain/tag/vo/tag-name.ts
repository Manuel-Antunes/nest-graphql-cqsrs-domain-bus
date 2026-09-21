import { ValidatedDto } from '@nestposts/validated-dto/mixins';
import { TagNameSchema } from '../schemas/tag-name.schema';

export class TagName extends ValidatedDto.Scalar(TagNameSchema) {}
