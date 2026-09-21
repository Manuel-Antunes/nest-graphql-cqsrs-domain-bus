import { Injectable } from '@nestjs/common';
import { TransportIdentity } from '@nestposts/transport-eventbus';

@Injectable()
export class SilentIdentity extends TransportIdentity {
  readonly applicationName = 'tagging-spec';

  override readonly publishes = false;
}
