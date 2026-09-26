import type { UserId } from '@nestposts/users/domain/user/vo/user-id';

export interface CalendarViewer {
  readonly userId: UserId;
  readonly seesEverything: boolean;
}
