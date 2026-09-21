import { Module } from '@nestjs/common';
import { AuthModule } from '@thallesp/nestjs-better-auth';
import { IdentityProvider } from '../../domain/user/identity.provider';
import { BetterAuthIdentityProvider } from './better-auth-identity.provider';

@Module({
  imports: [AuthModule],
  providers: [{ provide: IdentityProvider, useClass: BetterAuthIdentityProvider }],
  exports: [IdentityProvider],
})
export class IdentityModule {}
