import { Mail } from '@nestposts/mail/mail';

import type { SubscriptionChangeNotificationData } from '../domain/billing/schemas/subscription-change-notification.schema';
import { SUBSCRIPTION_CHANGE_SUBJECTS } from './subscription-change-subjects';
import { SubscriptionChangeEmail } from './templates/subscription-change.email';

export interface SubscriptionChangeMailRecipient {
  address: string;
  name: string | null;
}

export class SubscriptionChangeMail extends Mail {
  constructor(
    private readonly change: SubscriptionChangeNotificationData,
    private readonly recipient: SubscriptionChangeMailRecipient,
  ) {
    super();
  }

  prepare(): void {
    this.message
      .to(this.recipient.address, this.recipient.name ?? undefined)
      .subject(SUBSCRIPTION_CHANGE_SUBJECTS[this.change.event])
      .view(SubscriptionChangeEmail, {
        name: this.recipient.name,
        ...this.change,
      });
  }
}
