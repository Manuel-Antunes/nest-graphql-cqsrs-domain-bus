import { LangfuseClient } from '@langfuse/client';
import { FactoryProvider } from '@nestjs/common';

export const LangfuseFactory = {
  provide: LangfuseClient,
  useFactory() {
    return new LangfuseClient();
  },
} satisfies FactoryProvider;
