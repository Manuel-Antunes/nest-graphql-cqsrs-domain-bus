import { EventEmitter2 } from '@nestjs/event-emitter';

import {
  AttachmentEvent,
  VariantGenerationStarted,
} from '../../domain/events/variant-generation.events';
import { AttachmentEventService } from './attachment-event.service';

const started = () =>
  new VariantGenerationStarted({
    entity: 'Post',
    tableName: 'posts',
    attribute: 'cover',
    primaryKey: 1,
    variants: ['thumbnail'],
  });

describe('AttachmentEventService', () => {
  it('emits on the application’s event emitter', () => {
    const emitter = new EventEmitter2();
    const heard: unknown[] = [];
    emitter.on(AttachmentEvent.VARIANT_STARTED, (event) => heard.push(event));
    const event = started();

    new AttachmentEventService(emitter).emit(
      AttachmentEvent.VARIANT_STARTED,
      event,
    );

    expect(heard).toEqual([event]);
  });

  it('emits nothing, and fails at nothing, without one', () => {
    const service = new AttachmentEventService();

    expect(service.isAvailable()).toBe(false);
    expect(() =>
      service.emit(AttachmentEvent.VARIANT_STARTED, started()),
    ).not.toThrow();
  });

  it('keeps a listener that throws from failing the emitter', () => {
    const emitter = new EventEmitter2();
    emitter.on(AttachmentEvent.VARIANT_STARTED, () => {
      throw new Error('listener failed');
    });

    expect(() =>
      new AttachmentEventService(emitter).emit(
        AttachmentEvent.VARIANT_STARTED,
        started(),
      ),
    ).not.toThrow();
  });
});
