import { ValidatedDto } from '@nestposts/validated-dto/mixins';
import { OrganizationNameSchema } from '../schemas/organization-name.schema';

export class OrganizationName extends ValidatedDto.Scalar(OrganizationNameSchema) {}
