import { ValidatedDto } from '@nestposts/validated-dto/mixins';

import { AgentIdSchema } from '../schemas/agent-id.schema';

export class AgentId extends ValidatedDto.Scalar(AgentIdSchema) {}
