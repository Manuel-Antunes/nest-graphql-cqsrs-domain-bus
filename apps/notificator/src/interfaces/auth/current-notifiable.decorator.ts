import { Session } from '@thallesp/nestjs-better-auth';

import { SessionNotifiablePipe } from './session-notifiable.pipe';

export const CurrentNotifiable = () => Session(SessionNotifiablePipe);
