import { ValidatedDto } from '@nestposts/validated-dto/mixins';
import {
  ACCEPTED_INVITATION,
  CANCELED_INVITATION,
  InvitationStatusSchema,
  PENDING_INVITATION,
  REJECTED_INVITATION,
} from '../schemas/invitation-status.schema';

export class InvitationStatus extends ValidatedDto.Scalar(InvitationStatusSchema) {
  isPending(): boolean {
    return this.value === PENDING_INVITATION;
  }

  isAccepted(): boolean {
    return this.value === ACCEPTED_INVITATION;
  }

  isRefused(): boolean {
    return this.value === REJECTED_INVITATION || this.value === CANCELED_INVITATION;
  }
}
