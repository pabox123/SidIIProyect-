import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AccountService } from './account.service';
import { CreateProfileDto, SubscribeDto } from './account.dto';
import { ClientAuthGuard } from '../../common/auth/auth.guards';
import { ProfileOwnershipGuard } from '../../common/auth/ownership.guards';
import { CurrentClient } from '../../common/auth/auth.decorators';
import { AuthenticatedClient } from '../../common/auth/auth.types';

@Controller()
export class AccountController {
  constructor(private readonly accountService: AccountService) {}

  @Get('plans')
  listPlans() {
    return this.accountService.listPlans();
  }

  @Get('account/subscriptions')
  @UseGuards(ClientAuthGuard)
  getSubscriptions(@CurrentClient() client: AuthenticatedClient) {
    return this.accountService.getSubscriptionsAndPayments(client.accountId);
  }

  @Get('account/payments')
  @UseGuards(ClientAuthGuard)
  getPayments(@CurrentClient() client: AuthenticatedClient) {
    return this.accountService.getPayments(client.accountId);
  }

  @Post('account/subscriptions')
  @UseGuards(ClientAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  subscribe(@CurrentClient() client: AuthenticatedClient, @Body() dto: SubscribeDto) {
    return this.accountService.subscribe(client.accountId, dto);
  }

  @Get('account/profiles')
  @UseGuards(ClientAuthGuard)
  listProfiles(@CurrentClient() client: AuthenticatedClient) {
    return this.accountService.listProfiles(client.accountId);
  }

  @Post('account/profiles')
  @UseGuards(ClientAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  createProfile(@CurrentClient() client: AuthenticatedClient, @Body() dto: CreateProfileDto) {
    return this.accountService.createProfile(client.accountId, dto);
  }

  @Patch('account/profiles/:profileId/deactivate')
  @UseGuards(ClientAuthGuard, ProfileOwnershipGuard)
  @HttpCode(HttpStatus.OK)
  deactivateProfile(
    @CurrentClient() client: AuthenticatedClient,
    @Param('profileId', ParseIntPipe) profileId: number,
  ) {
    return this.accountService.deactivateProfile(client.accountId, profileId);
  }

  @Patch('account/profiles/:profileId/activate')
  @UseGuards(ClientAuthGuard, ProfileOwnershipGuard)
  @HttpCode(HttpStatus.OK)
  activateProfile(
    @CurrentClient() client: AuthenticatedClient,
    @Param('profileId', ParseIntPipe) profileId: number,
  ) {
    return this.accountService.activateProfile(client.accountId, profileId);
  }
}
