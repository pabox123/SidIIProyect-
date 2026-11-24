import { Module } from '@nestjs/common';
import { PlaybackController } from './playback.controller';
import { PlaybackService } from './playback.service';
import { MyListService } from './my-list.service';

@Module({
  controllers: [PlaybackController],
  providers: [PlaybackService, MyListService],
})
export class PlaybackModule {}
