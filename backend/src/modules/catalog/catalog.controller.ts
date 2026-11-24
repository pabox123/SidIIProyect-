import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { CatalogService } from './catalog.service';
import { ProfileQueryDto, SearchCatalogDto } from './catalog.dto';
import { ClientAuthGuard } from '../../common/auth/auth.guards';
import { CurrentClient } from '../../common/auth/auth.decorators';
import { AuthenticatedClient } from '../../common/auth/auth.types';
import { ContentIdPipe } from './content-id.pipe';

@Controller('catalog')
@UseGuards(ClientAuthGuard)
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get()
  search(@CurrentClient() client: AuthenticatedClient, @Query() dto: SearchCatalogDto) {
    return this.catalog.search(client.accountId, dto);
  }

  @Get('filters')
  filters() {
    return this.catalog.filters();
  }

  @Get(':contentId')
  detail(
    @CurrentClient() client: AuthenticatedClient,
    @Param('contentId', ContentIdPipe) contentId: string,
    @Query() { profileId }: ProfileQueryDto,
  ) {
    return this.catalog.detail(client.accountId, profileId, contentId);
  }
}
