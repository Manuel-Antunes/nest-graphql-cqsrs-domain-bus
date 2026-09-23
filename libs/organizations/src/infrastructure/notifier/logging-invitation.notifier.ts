import { Injectable, Logger } from '@nestjs/common';

import type { InvitationNotice } from '../../domain/organization/invitation.notifier';
import { InvitationNotifier } from '../../domain/organization/invitation.notifier';

@Injectable()
export class LoggingInvitationNotifier extends InvitationNotifier {
  private readonly logger = new Logger(LoggingInvitationNotifier.name);

  async invited(notice: InvitationNotice): Promise<void> {
    this.logger.log(
      `${notice.invitedBy} invited ${notice.email} to ${notice.organization}` +
        `${notice.role ? ` as ${notice.role}` : ''}: ${notice.acceptUrl}`,
    );
  }
}

export const silentInvitationNotifier: InvitationNotifier = {
  async invited(): Promise<void> {},
};
