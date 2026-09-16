import type { ErrorHandler } from "@automapper/core";
import { Logger } from "@nestjs/common";

export class MapperErrorHandler implements ErrorHandler {
  private logger = new Logger("AutoMapper");

  handle(message: string): void {
    this.logger.warn(message);
  }
}
