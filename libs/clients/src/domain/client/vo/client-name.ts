import { ValidatedDto } from '@nestposts/validated-dto/mixins';

import { ClientNameSchema } from '../schemas/client-name.schema';

export class ClientName extends ValidatedDto.Scalar(ClientNameSchema) {}
