import { RunningStack } from './support/running-stack';

export default function globalTeardown(): void {
  RunningStack.down();
}
