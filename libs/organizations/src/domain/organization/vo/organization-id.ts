import { ValidatedDto } from '@nestposts/validated-dto/mixins';
import { OrganizationIdSchema } from '../schemas/organization-id.schema';

export class OrganizationId extends ValidatedDto.Scalar(OrganizationIdSchema) {}
