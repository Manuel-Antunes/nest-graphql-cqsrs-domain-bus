import { ConfigurableModuleBuilder } from '@nestjs/common';

export const {
  ConfigurableModuleClass: GraphqlResponseCacheConfigurableModule,
  MODULE_OPTIONS_TOKEN,
  OPTIONS_TYPE,
} = new ConfigurableModuleBuilder<{
  maxTtlMs?: number;
  settleMs?: number;
}>()
  .setClassMethodName('forRoot')
  .build();
