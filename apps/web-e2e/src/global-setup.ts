import { RunningStack } from './support/running-stack';

export default async function globalSetup(): Promise<void> {
  process.stdout.write(
    '### provisionando a stack: postgres, rabbitmq, migrator, posts-api e tagging em containers; o web como processo\n',
  );
  await RunningStack.up();
}
