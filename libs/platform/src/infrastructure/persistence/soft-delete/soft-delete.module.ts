import { Module } from '@nestjs/common';

import { SoftDeleteSubscriber } from './soft-delete.subscriber';

@Module({ providers: [SoftDeleteSubscriber] })
export class SoftDeleteModule {}
