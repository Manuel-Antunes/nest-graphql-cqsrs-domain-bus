import { z } from 'zod';

export const DeviceIdSchema = z.uuid().brand<'DeviceId'>();
