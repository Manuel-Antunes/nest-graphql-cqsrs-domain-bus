import { migrate, seed, seedDeployment, seedUsers, setup } from './main';

const commands: Record<string, () => Promise<void>> = {
  migrate,
  'seed': seedDeployment,
  'seed:base': () => seed(),
  'seed:users': seedUsers,
  setup,
};

const run = async (name: string): Promise<{ command: string }> => {
  const command = commands[name];
  if (!command) {
    throw new Error(
      `unknown command "${name}"; expected one of ${Object.keys(commands).join(', ')}`,
    );
  }
  await command();
  return { command: name };
};

export const handler = (event?: {
  command?: string;
}): Promise<{ command: string }> => run(event?.command ?? 'migrate');

export const seedHandler = (event?: {
  command?: string;
}): Promise<{ command: string }> => run(event?.command ?? 'seed');
