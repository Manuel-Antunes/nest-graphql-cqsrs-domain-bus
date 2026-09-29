import { CurrentIdentity } from '@nestposts/auth/decorators/current-identity.decorator';

import { IdentityNotifiablePipe } from './identity-notifiable.pipe';

export const CurrentNotifiable = () => CurrentIdentity(IdentityNotifiablePipe);
