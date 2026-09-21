import { MikroOrmModule } from "@mikro-orm/nestjs";
import { Module } from "@nestjs/common";
import { CqsrsModule } from "@nestposts/cqsrs";
import { TRANSPORT_EVENT_BUS_PUBLISHER } from "@nestposts/transport-eventbus";
import { CompleteOnPostPreCreated } from "./application/complete-on-post-pre-created.saga";
import { CompletePostWithDefaultTagCommand } from "./application/complete-post-with-default-tag.command";
import { mikroOrmConfig } from "./infrastructure/persistence/mikro-orm.config";
import { TransportModule } from "./infrastructure/transport/transport.module";
import { PostEventsController } from "./interfaces/messaging/post-events.controller";

@Module({
  imports: [
    CqsrsModule.forRoot({ aggregatePublisher: TRANSPORT_EVENT_BUS_PUBLISHER }),
    MikroOrmModule.forRoot(mikroOrmConfig()),
    TransportModule,
  ],
  controllers: [PostEventsController],
  providers: [
    CompleteOnPostPreCreated,
    CompletePostWithDefaultTagCommand.Handler,
  ],
})
export class AppModule {}
