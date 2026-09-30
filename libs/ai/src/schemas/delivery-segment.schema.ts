import z from 'zod';

export const deliverySegmentSchema = z.object({
  kind: z.enum(['text', 'audio']),
  content: z.string().min(1),
  /**
   * When set, the channel processor renders this segment as a quoted reply
   * to the inbound message with this id (WhatsApp's native "↳" preview).
   * Only honored for text — audio bubbles ignore it since `sendVoice` has
   * no quoted-message variant in the Evolution SDK.
   */
  quotedSourceId: z.string().min(1).optional(),
});
export type DeliverySegment = z.infer<typeof deliverySegmentSchema>;
