import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

@Injectable()
export class PostRemembererCron {
  @Cron('0 0 * * *') // every day at midnight
  async handleCron() {
    // Logic to remember posts goes here
    console.log('Running Post Rememberer Cron Job');
  }
}
