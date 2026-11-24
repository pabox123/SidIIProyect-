import { Body, Controller, Get, HttpCode, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { AdminCatalogService } from './admin-catalog.service';
import { AdminCatalogQueryDto, CatalogItemDto } from './catalog-item.dto';
import { AdminAuthGuard } from '../../common/auth/auth.guards';
import { AdminRoles } from '../../common/auth/auth.decorators';
import { ContentIdPipe } from '../catalog/content-id.pipe';

@Controller('admin/catalog')
@UseGuards(AdminAuthGuard)
@AdminRoles('catalog_admin')
export class AdminCatalogController {
  constructor(private readonly service: AdminCatalogService) {}

  @Get()
  list(@Query() dto: AdminCatalogQueryDto) {
    return this.service.list(dto);
  }

  @Get(':contentId')
  get(@Param('contentId', ContentIdPipe) contentId: string) {
    return this.service.get(contentId);
  }

  @Post()
  create(@Body() dto: CatalogItemDto) {
    return this.service.create(dto);
  }

  @Put(':contentId')
  update(@Param('contentId', ContentIdPipe) contentId: string, @Body() dto: CatalogItemDto) {
    return this.service.update(contentId, dto);
  }

  @Post(':contentId/publish')
  @HttpCode(200)
  publish(@Param('contentId', ContentIdPipe) contentId: string) {
    return this.service.publish(contentId);
  }

  @Post(':contentId/withdraw')
  @HttpCode(200)
  withdraw(@Param('contentId', ContentIdPipe) contentId: string) {
    return this.service.withdraw(contentId);
  }
}
