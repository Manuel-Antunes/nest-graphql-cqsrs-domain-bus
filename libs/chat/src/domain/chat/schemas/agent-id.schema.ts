import { z } from 'zod';

export const AGENT_ID_MAX_LENGTH = 64;

export const AgentIdSchema = z
  .string({ error: 'agentId must not be empty' })
  .trim()
  .min(1, 'agentId must not be empty')
  .max(AGENT_ID_MAX_LENGTH, `agentId exceeds ${AGENT_ID_MAX_LENGTH} characters`)
  .regex(
    /^[a-z0-9][a-z0-9-]*$/,
    'agentId is lowercase letters, digits and dashes',
  )
  .brand<'AgentId'>();
