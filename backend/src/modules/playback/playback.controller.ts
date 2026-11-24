import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { PlaybackService } from './playback.service';
import { MyListService } from './my-list.service';
import { MyListItemDto, PlaybackEventDto, StartPlaybackDto } from './playback.dto';
import { ClientAuthGuard } from '../../common/auth/auth.guards';
import { CurrentClient } from '../../common/auth/auth.decorators';
import { AuthenticatedClient } from '../../common/auth/auth.types';
import { ProfileQueryDto } from '../catalog/catalog.dto';
import { ContentIdPipe } from '../catalog/content-id.pipe';

@Controller()
@UseGuards(ClientAuthGuard)
export class PlaybackController {
  constructor(
    private readonly playback: PlaybackService,
    private readonly myList: MyListService,
  ) {}

  @Post('playback/sessions')
  start(@CurrentClient() client: AuthenticatedClient, @Body() dto: StartPlaybackDto) {
    return this.playback.start(client.accountId, dto);
  }

  @Post('playback/sessions/:sessionId/events')
  event(
    @CurrentClient() client: AuthenticatedClient,
    @Param('sessionId') sessionId: string,
    @Body() dto: PlaybackEventDto,
  ) {
    return this.playback.event(client.accountId, sessionId, dto);
  }

  @Get('playback/continue-watching')
  continueWatching(@CurrentClient() client: AuthenticatedClient, @Query() { profileId }: ProfileQueryDto) {
    return this.playback.continueWatching(client.accountId, profileId);
  }

  @Get('my-list')
  list(@CurrentClient() client: AuthenticatedClient, @Query() { profileId }: ProfileQueryDto) {
    return this.myList.list(client.accountId, profileId);
  }

  @Post('my-list')
  add(@CurrentClient() client: AuthenticatedClient, @Body() dto: MyListItemDto) {
    return this.myList.add(client.accountId, dto.profileId, dto.contentId);
  }

  @Delete('my-list/:contentId')
  remove(
    @CurrentClient() client: AuthenticatedClient,
    @Param('contentId', ContentIdPipe) contentId: string,
    @Query() { profileId }: ProfileQueryDto,
  ) {
    return this.myList.remove(client.accountId, profileId, contentId);
  }
}
