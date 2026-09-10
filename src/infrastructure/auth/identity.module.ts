import { Module } from '@nestjs/common';
import { AuthModule } from '@thallesp/nestjs-better-auth';
import { IdentityProvider } from '../../domain/user/identity.provider';
import { BetterAuthIdentityProvider } from './better-auth-identity.provider';

/**
 * A porta {@link IdentityProvider} ligada ao adapter do Better Auth — o irmão do `PersistenceModule`,
 * do outro lado da fronteira.
 *
 * Ele existe pela mesma razão: para que `src/application/` **não** conheça o provedor. Quem importa
 * este módulo recebe `IdentityProvider` sem nunca ver o nome `better-auth`, e trocar o provedor é
 * reescrever este ficheiro e o adapter ao lado — nada em `application/`.
 *
 * `imports: [AuthModule]` traz o `AuthService` da lib (é ele que dá a instância do Better Auth). O
 * `AuthModule` importado aqui é o **mesmo** que o `AppModule` configurou por `forRootAsync`: no
 * contêiner do Nest a classe é o token do módulo, então importá-la reaproveita a instância que já
 * subiu, em vez de configurar outra.
 */
@Module({
  imports: [AuthModule],
  providers: [{ provide: IdentityProvider, useClass: BetterAuthIdentityProvider }],
  exports: [IdentityProvider],
})
export class IdentityModule {}
