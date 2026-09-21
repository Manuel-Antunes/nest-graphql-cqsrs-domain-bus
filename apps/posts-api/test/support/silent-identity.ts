import { Injectable } from '@nestjs/common';
import { TransportIdentity } from '@nestposts/transport-eventbus';

@Injectable()
export class SilentIdentity extends TransportIdentity {
  readonly applicationName = 'posts-api-spec';

  override readonly publishes = false;
}
