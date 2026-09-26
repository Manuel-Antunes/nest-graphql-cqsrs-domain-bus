import { z } from 'zod';

export const eventSchema = z.object({
  title: z.string().min(1, 'O título é obrigatório'),
  description: z.string().min(1, 'A descrição é obrigatória'),
  startDate: z.date({ error: 'A data de início é obrigatória' }),
  startTime: z.object(
    { hour: z.number(), minute: z.number() },
    { error: 'A hora de início é obrigatória' },
  ),
  endDate: z.date({ error: 'A data de término é obrigatória' }),
  endTime: z.object(
    { hour: z.number(), minute: z.number() },
    { error: 'A hora de término é obrigatória' },
  ),
  color: z.enum(
    ['blue', 'green', 'red', 'yellow', 'purple', 'orange', 'gray'],
    { error: 'A cor é obrigatória' },
  ),
});

export const eventDtoSchema = eventSchema
  .extend({
    user: z.string().min(1, 'O responsável é obrigatório'),
    participantIds: z.array(z.string()).optional(),
    teamId: z.string().optional(),
  })
  .refine(
    (data) => {
      const startDateTime = new Date(data.startDate);
      startDateTime.setHours(data.startTime.hour, data.startTime.minute, 0, 0);

      const endDateTime = new Date(data.endDate);
      endDateTime.setHours(data.endTime.hour, data.endTime.minute, 0, 0);

      return startDateTime < endDateTime;
    },
    {
      message: 'A data de início não pode ser depois da data de término',
      path: ['startDate'],
    },
  );

export type TEventFormData = z.infer<typeof eventDtoSchema>;
