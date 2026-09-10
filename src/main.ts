import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  /**
   * `bodyParser: false` é exigência do Better Auth: ele lê o corpo cru das rotas de `/api/auth`. Quem
   * volta a instalar os parsers é o `AuthModule`, pelas opções de `bodyParser` do `forRootAsync` —
   * então o resto da aplicação continua recebendo JSON já parseado.
   */
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  new Logger('bootstrap').log(`GraphQL em http://localhost:${port}/graphql (GraphiQL no mesmo endereço, via browser)`);
}

void bootstrap();
