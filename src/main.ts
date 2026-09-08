import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  new Logger('bootstrap').log(`GraphQL em http://localhost:${port}/graphql (GraphiQL no mesmo endereço, via browser)`);
}

void bootstrap();
