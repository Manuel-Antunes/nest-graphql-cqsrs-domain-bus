import { ValidatedDto } from '@nestposts/validated-dto/mixins';
import { OrganizationSlugSchema } from '../schemas/organization-slug.schema';

export class OrganizationSlug extends ValidatedDto.Scalar(OrganizationSlugSchema) {}
