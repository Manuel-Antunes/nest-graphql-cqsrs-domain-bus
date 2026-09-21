import { ValidatedDto } from '@nestposts/validated-dto/mixins';
import { CredentialIdSchema } from '../schemas/credential-id.schema';

export class CredentialId extends ValidatedDto.Scalar(CredentialIdSchema) {}
