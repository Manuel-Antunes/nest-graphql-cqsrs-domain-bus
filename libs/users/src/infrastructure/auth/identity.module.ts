import { Module } from '@nestjs/common';
import { DatabaseModule } from '@nestposts/platform/infrastructure/persistence/database.module';
import { AuthModule } from '@thallesp/nestjs-better-auth';
import { IdentityProvider } from '../../domain/user/identity.provider';
import { betterAuthEntities } from './auth';
import { BetterAuthIdentityProvider } from './better-auth-identity.provider';

/**
 * Better Auth owns its tables, so this module declares them: whoever authenticates gets them, and an
 * application that only reads users does not.
 */
@Module({
  imports: [AuthModule, DatabaseModule.forFeature(betterAuthEntities)],
  providers: [{ provide: IdentityProvider, useClass: BetterAuthIdentityProvider }],
  exports: [IdentityProvider],
})
export class IdentityModule {}
